import { expect } from "chai";
import nock from "nock";
import { generateKeyPair, exportJWK, SignJWT, KeyLike } from "jose";
import {
  getExternalIdpConfig,
  resetExternalIdpConfig,
} from "../config/externalIdp";
import {
  verifyExternalToken,
  resetExternalVerifierCaches,
  peekIssuer,
} from "../libs/jwt/externalVerifier";
import { resolveTokenRoute } from "../libs/jwt/externalIdentity";
import { UnauthorizedError } from "../errors/UnauthorizedError";
import { IdpUnavailableError } from "../errors/IdpUnavailableError";

/**
 * Test constants for the mock external IDP. Kept as named constants so the
 * discovery/JWKS wiring and expectations stay in sync.
 */
const TRUSTED_ISSUER = "https://idp.example.test";
const UNTRUSTED_ISSUER = "https://evil.example.test";
const EXPECTED_AUDIENCE = "consent-manager";
const JWKS_PATH = "/jwks";
const DISCOVERY_PATH = "/.well-known/openid-configuration";
const EXTERNAL_SUBJECT = "did:example:123456789abcdefghi";
const RS256_KID = "rsa-key-1";
const ES256_KID = "ec-key-1";
const RS256_ROTATED_KID = "rsa-key-2";
const FOREIGN_KID = "foreign-key-1";

interface TestKey {
  kid: string;
  alg: string;
  privateKey: KeyLike;
  publicJwk: Record<string, unknown>;
}

/**
 * Generates a signing keypair and its public JWK (with `kid`/`alg`/`use`) for
 * use in the mock JWKS.
 */
const makeKey = async (alg: string, kid: string): Promise<TestKey> => {
  const { privateKey, publicKey } = await generateKeyPair(alg);
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = kid;
  publicJwk.alg = alg;
  publicJwk.use = "sig";
  return { kid, alg, privateKey, publicJwk };
};

interface SignOptions {
  issuer?: string;
  audience?: string;
  subject?: string;
  expirationTime?: string | number;
  omitExpiration?: boolean;
}

/**
 * Signs a JWT with the given key and claim overrides.
 */
const signToken = (
  key: TestKey,
  options: SignOptions = {}
): Promise<string> => {
  const builder = new SignJWT({})
    .setProtectedHeader({ alg: key.alg, kid: key.kid })
    .setIssuedAt()
    .setIssuer(options.issuer ?? TRUSTED_ISSUER)
    .setAudience(options.audience ?? EXPECTED_AUDIENCE)
    .setSubject(options.subject ?? EXTERNAL_SUBJECT);

  if (!options.omitExpiration) {
    builder.setExpirationTime(options.expirationTime ?? "1h");
  }
  return builder.sign(key.privateKey);
};

/**
 * Runs an operation and returns whatever it threw, or `undefined` on success.
 */
const captureError = async (operation: () => Promise<unknown>) => {
  try {
    await operation();
    return undefined;
  } catch (error) {
    return error;
  }
};

describe("External IDP token verifier", () => {
  let rsaKey: TestKey;
  let ecKey: TestKey;
  let foreignKey: TestKey;

  before(async () => {
    rsaKey = await makeKey("RS256", RS256_KID);
    ecKey = await makeKey("ES256", ES256_KID);
    // Never published in the mock JWKS: used to forge signatures.
    foreignKey = await makeKey("RS256", FOREIGN_KID);
  });

  /**
   * Installs a persistent mock discovery + JWKS endpoint exposing the given
   * public JWKs.
   */
  const mockIssuer = (keys: TestKey[], discoveryIssuer = TRUSTED_ISSUER) => {
    nock(TRUSTED_ISSUER)
      .persist()
      .get(DISCOVERY_PATH)
      .reply(200, {
        issuer: discoveryIssuer,
        jwks_uri: `${TRUSTED_ISSUER}${JWKS_PATH}`,
      });
    nock(TRUSTED_ISSUER)
      .persist()
      .get(JWKS_PATH)
      .reply(200, { keys: keys.map((k) => k.publicJwk) });
  };

  beforeEach(() => {
    nock.cleanAll();
    resetExternalVerifierCaches();
    process.env.EXTERNAL_OIDC_ISSUERS = TRUSTED_ISSUER;
    process.env.EXTERNAL_OIDC_AUDIENCE = EXPECTED_AUDIENCE;
    process.env.EXTERNAL_OIDC_ALGS = "RS256,ES256,EdDSA";
    process.env.EXTERNAL_OIDC_SUBJECT_CLAIM = "sub";
    process.env.EXTERNAL_OIDC_DISCOVERY_TTL = "3600";
    resetExternalIdpConfig();
  });

  after(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    delete process.env.EXTERNAL_OIDC_ISSUERS;
    delete process.env.EXTERNAL_OIDC_AUDIENCE;
    delete process.env.EXTERNAL_OIDC_ALGS;
    delete process.env.EXTERNAL_OIDC_SUBJECT_CLAIM;
    delete process.env.EXTERNAL_OIDC_DISCOVERY_TTL;
    resetExternalIdpConfig();
    resetExternalVerifierCaches();
  });

  describe("valid tokens (parameterized by algorithm)", () => {
    const algorithmCases = [
      { name: "RS256", key: () => rsaKey },
      { name: "ES256", key: () => ecKey },
    ];

    algorithmCases.forEach(({ name, key }) => {
      it(`accepts a valid ${name} token and returns its claims`, async () => {
        mockIssuer([rsaKey, ecKey]);
        const token = await signToken(key());

        const payload = await verifyExternalToken(token);

        expect(payload.sub).to.equal(EXTERNAL_SUBJECT);
        expect(payload.iss).to.equal(TRUSTED_ISSUER);
        expect(payload.aud).to.equal(EXPECTED_AUDIENCE);
      });
    });

    it("accepts a token whose issuer carries a trailing slash", async () => {
      mockIssuer([rsaKey]);
      const token = await signToken(rsaKey, {
        issuer: `${TRUSTED_ISSUER}/`,
      });

      const payload = await verifyExternalToken(token);

      expect(payload.sub).to.equal(EXTERNAL_SUBJECT);
    });
  });

  describe("rejected tokens (parameterized by failure mode)", () => {
    interface RejectionCase {
      name: string;
      makeToken: () => Promise<string>;
      setup?: () => void;
    }

    const rejectionCases: RejectionCase[] = [
      {
        name: "a signature from a key outside the issuer's JWKS",
        makeToken: () => signToken(foreignKey),
      },
      {
        name: "untrusted issuer",
        makeToken: () => signToken(rsaKey, { issuer: UNTRUSTED_ISSUER }),
      },
      {
        name: "wrong audience",
        makeToken: () => signToken(rsaKey, { audience: "someone-else" }),
      },
      {
        name: "expired token",
        // 1970-01-01: safely in the past.
        makeToken: () => signToken(rsaKey, { expirationTime: 1 }),
      },
      {
        name: "no exp claim at all",
        makeToken: () => signToken(rsaKey, { omitExpiration: true }),
      },
      {
        name: "disallowed algorithm",
        setup: () => {
          process.env.EXTERNAL_OIDC_ALGS = "ES256";
          resetExternalIdpConfig();
        },
        makeToken: () => signToken(rsaKey),
      },
    ];

    rejectionCases.forEach(({ name, makeToken, setup }) => {
      it(`rejects a token with ${name}`, async () => {
        mockIssuer([rsaKey, ecKey]);
        if (setup) setup();
        const token = await makeToken();

        const error = await captureError(() => verifyExternalToken(token));

        expect(error, `expected ${name} to be rejected`).to.be.instanceOf(
          UnauthorizedError
        );
      });
    });

    it("rejects a forged token without revealing why", async () => {
      mockIssuer([rsaKey]);
      const forged = await signToken(foreignKey);

      const error = (await captureError(() =>
        verifyExternalToken(forged)
      )) as UnauthorizedError;

      expect(error.message).to.equal("Invalid or expired token");
    });
  });

  it("rejects when the feature is disabled", async () => {
    mockIssuer([rsaKey]);
    const token = await signToken(rsaKey);
    process.env.EXTERNAL_OIDC_ISSUERS = "";
    resetExternalIdpConfig();

    const error = await captureError(() => verifyExternalToken(token));

    expect(error).to.be.instanceOf(UnauthorizedError);
  });

  it("picks up a rotated signing key once the JWKS cache expires", async () => {
    mockIssuer([rsaKey]);
    const firstToken = await signToken(rsaKey);
    expect((await verifyExternalToken(firstToken)).sub).to.equal(
      EXTERNAL_SUBJECT
    );

    // The issuer rotates to a new signing key. Clearing the caches stands in
    // for the TTL elapsing in a long-lived process; within a TTL, jose refetches
    // on an unknown `kid` subject to its own cooldown, which cannot be waited
    // out in a unit test.
    const rotatedKey = await makeKey("RS256", RS256_ROTATED_KID);
    nock.cleanAll();
    resetExternalVerifierCaches();
    mockIssuer([rotatedKey]);

    const rotatedToken = await signToken(rotatedKey);
    expect((await verifyExternalToken(rotatedToken)).sub).to.equal(
      EXTERNAL_SUBJECT
    );
  });

  describe("issuer availability failures", () => {
    it("reports 503-shaped failure when discovery has no jwks_uri", async () => {
      nock(TRUSTED_ISSUER)
        .persist()
        .get(DISCOVERY_PATH)
        .reply(200, { issuer: TRUSTED_ISSUER });
      const token = await signToken(rsaKey);

      const error = await captureError(() => verifyExternalToken(token));

      expect(error).to.be.instanceOf(IdpUnavailableError);
    });

    it("rejects a discovery document describing a different issuer", async () => {
      mockIssuer([rsaKey], UNTRUSTED_ISSUER);
      const token = await signToken(rsaKey);

      const error = await captureError(() => verifyExternalToken(token));

      expect(error).to.be.instanceOf(IdpUnavailableError);
    });

    it("rejects a jwks_uri that is not served over https", async () => {
      nock(TRUSTED_ISSUER)
        .persist()
        .get(DISCOVERY_PATH)
        .reply(200, {
          issuer: TRUSTED_ISSUER,
          jwks_uri: `http://idp.example.test${JWKS_PATH}`,
        });
      const token = await signToken(rsaKey);

      const error = await captureError(() => verifyExternalToken(token));

      expect(error).to.be.instanceOf(IdpUnavailableError);
    });

    it("reports unavailability when discovery returns an error status", async () => {
      nock(TRUSTED_ISSUER).persist().get(DISCOVERY_PATH).reply(500, {});
      const token = await signToken(rsaKey);

      const error = await captureError(() => verifyExternalToken(token));

      expect(error).to.be.instanceOf(IdpUnavailableError);
    });
  });

  describe("configurable discovery path (parameterized)", () => {
    // A FIWARE VCVerifier serves discovery under a per-service path rather than
    // the spec well-known location.
    const SERVICE_DISCOVERY_PATH =
      "/services/consent-manager/.well-known/openid-configuration";

    const pathCases = [
      {
        name: "leading-slash path",
        configured: SERVICE_DISCOVERY_PATH,
        fetched: SERVICE_DISCOVERY_PATH,
      },
      {
        name: "slashless path (normalized to a leading slash)",
        configured: SERVICE_DISCOVERY_PATH.slice(1),
        fetched: SERVICE_DISCOVERY_PATH,
      },
    ];

    afterEach(() => {
      delete process.env.EXTERNAL_OIDC_DISCOVERY_PATH;
      resetExternalIdpConfig();
    });

    pathCases.forEach(({ name, configured, fetched }) => {
      it(`discovers via the configured ${name}, not the well-known default`, async () => {
        process.env.EXTERNAL_OIDC_DISCOVERY_PATH = configured;
        resetExternalIdpConfig();
        resetExternalVerifierCaches();

        // Serve ONLY the custom path; the well-known default is intentionally
        // left unmocked so a regression that ignores the override fails to
        // discover (nock rejects the unexpected request).
        nock(TRUSTED_ISSUER)
          .persist()
          .get(fetched)
          .reply(200, {
            issuer: TRUSTED_ISSUER,
            jwks_uri: `${TRUSTED_ISSUER}${JWKS_PATH}`,
          });
        nock(TRUSTED_ISSUER)
          .persist()
          .get(JWKS_PATH)
          .reply(200, { keys: [rsaKey.publicJwk] });

        const token = await signToken(rsaKey);
        const payload = await verifyExternalToken(token);

        expect(payload.sub).to.equal(EXTERNAL_SUBJECT);
        expect(payload.iss).to.equal(TRUSTED_ISSUER);
      });
    });
  });
});

describe("External IDP configuration", () => {
  const clearEnvironment = () => {
    delete process.env.EXTERNAL_OIDC_ISSUERS;
    delete process.env.EXTERNAL_OIDC_AUDIENCE;
    delete process.env.EXTERNAL_OIDC_ALGS;
    delete process.env.EXTERNAL_OIDC_SUBJECT_CLAIM;
    delete process.env.EXTERNAL_OIDC_DISCOVERY_TTL;
    delete process.env.EXTERNAL_OIDC_DISCOVERY_PATH;
    delete process.env.EXTERNAL_OIDC_HTTP_TIMEOUT;
    delete process.env.EXTERNAL_OIDC_CLOCK_TOLERANCE;
    resetExternalIdpConfig();
  };

  beforeEach(clearEnvironment);
  after(clearEnvironment);

  it("is disabled when no issuers are configured", () => {
    expect(getExternalIdpConfig().enabled).to.equal(false);
  });

  interface InvalidConfigCase {
    name: string;
    environment: Record<string, string>;
  }

  const invalidConfigCases: InvalidConfigCase[] = [
    {
      name: "issuers without an audience",
      environment: { EXTERNAL_OIDC_ISSUERS: "https://idp.example.test" },
    },
    {
      name: "a symmetric signing algorithm",
      environment: {
        EXTERNAL_OIDC_ISSUERS: "https://idp.example.test",
        EXTERNAL_OIDC_AUDIENCE: "consent-manager",
        EXTERNAL_OIDC_ALGS: "HS256",
      },
    },
    {
      name: "the 'none' signing algorithm",
      environment: {
        EXTERNAL_OIDC_ISSUERS: "https://idp.example.test",
        EXTERNAL_OIDC_AUDIENCE: "consent-manager",
        EXTERNAL_OIDC_ALGS: "none",
      },
    },
    {
      name: "a cleartext issuer URL",
      environment: {
        EXTERNAL_OIDC_ISSUERS: "http://idp.example.test",
        EXTERNAL_OIDC_AUDIENCE: "consent-manager",
      },
    },
    {
      name: "a non-numeric discovery TTL",
      environment: {
        EXTERNAL_OIDC_ISSUERS: "https://idp.example.test",
        EXTERNAL_OIDC_AUDIENCE: "consent-manager",
        EXTERNAL_OIDC_DISCOVERY_TTL: "3600s",
      },
    },
  ];

  invalidConfigCases.forEach(({ name, environment }) => {
    it(`fails fast on ${name}`, () => {
      Object.assign(process.env, environment);
      resetExternalIdpConfig();

      expect(() => getExternalIdpConfig()).to.throw();
    });
  });

  it("requires email_verified only when the subject claim is email", () => {
    process.env.EXTERNAL_OIDC_ISSUERS = "https://idp.example.test";
    process.env.EXTERNAL_OIDC_AUDIENCE = "consent-manager";
    process.env.EXTERNAL_OIDC_SUBJECT_CLAIM = "email";
    resetExternalIdpConfig();
    expect(getExternalIdpConfig().requireEmailVerified).to.equal(true);

    process.env.EXTERNAL_OIDC_SUBJECT_CLAIM = "sub";
    resetExternalIdpConfig();
    expect(getExternalIdpConfig().requireEmailVerified).to.equal(false);
  });

  it("defaults the discovery path to the well-known location", () => {
    process.env.EXTERNAL_OIDC_ISSUERS = "https://idp.example.test";
    process.env.EXTERNAL_OIDC_AUDIENCE = "consent-manager";
    resetExternalIdpConfig();

    expect(getExternalIdpConfig().discoveryPath).to.equal(
      "/.well-known/openid-configuration"
    );
  });

  it("normalises a discovery path without a leading slash", () => {
    process.env.EXTERNAL_OIDC_ISSUERS = "https://idp.example.test";
    process.env.EXTERNAL_OIDC_AUDIENCE = "consent-manager";
    process.env.EXTERNAL_OIDC_DISCOVERY_PATH =
      "services/consent-manager/.well-known/openid-configuration";
    resetExternalIdpConfig();

    expect(getExternalIdpConfig().discoveryPath).to.equal(
      "/services/consent-manager/.well-known/openid-configuration"
    );
  });

  it("normalises a trailing slash on configured issuers", () => {
    process.env.EXTERNAL_OIDC_ISSUERS = "https://idp.example.test/";
    process.env.EXTERNAL_OIDC_AUDIENCE = "consent-manager";
    resetExternalIdpConfig();

    expect(
      getExternalIdpConfig().issuers.has("https://idp.example.test")
    ).to.equal(true);
  });
});

describe("Token routing", () => {
  let rsaKey: TestKey;

  before(async () => {
    rsaKey = await makeKey("RS256", RS256_KID);
  });

  beforeEach(() => {
    process.env.EXTERNAL_OIDC_ISSUERS = TRUSTED_ISSUER;
    process.env.EXTERNAL_OIDC_AUDIENCE = EXPECTED_AUDIENCE;
    resetExternalIdpConfig();
  });

  after(() => {
    nock.cleanAll();
    delete process.env.EXTERNAL_OIDC_ISSUERS;
    delete process.env.EXTERNAL_OIDC_AUDIENCE;
    resetExternalIdpConfig();
  });

  it("routes a trusted-issuer token to the external verifier", async () => {
    const token = await signToken(rsaKey, { issuer: TRUSTED_ISSUER });
    expect(resolveTokenRoute(token)).to.equal("external");
    expect(peekIssuer(token)).to.equal(TRUSTED_ISSUER);
  });

  it("routes an untrusted-issuer token to the local path", async () => {
    const token = await signToken(rsaKey, { issuer: UNTRUSTED_ISSUER });
    expect(resolveTokenRoute(token)).to.equal("local");
  });

  it("routes a token without an issuer to the local path", async () => {
    const token = await new SignJWT({ sub: "local-user" })
      .setProtectedHeader({ alg: "RS256", kid: RS256_KID })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(rsaKey.privateKey);
    expect(peekIssuer(token)).to.equal(undefined);
    expect(resolveTokenRoute(token)).to.equal("local");
  });

  it("routes everything to the local path when the feature is disabled", async () => {
    process.env.EXTERNAL_OIDC_ISSUERS = "";
    resetExternalIdpConfig();
    const token = await signToken(rsaKey, { issuer: TRUSTED_ISSUER });
    expect(resolveTokenRoute(token)).to.equal("local");
  });
});
