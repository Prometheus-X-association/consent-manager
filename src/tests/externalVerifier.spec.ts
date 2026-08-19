import { expect } from "chai";
import nock from "nock";
import { generateKeyPair, exportJWK, SignJWT, KeyLike } from "jose";
import { resetExternalIdpConfig } from "../config/externalIdp";
import {
  verifyExternalToken,
  resetExternalVerifierCaches,
  peekIssuer,
} from "../libs/jwt/externalVerifier";
import { resolveTokenRoute } from "../libs/jwt/externalIdentity";
import { UnauthorizedError } from "../errors/UnauthorizedError";

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
}

/**
 * Signs a JWT with the given key and claim overrides.
 */
const signToken = (key: TestKey, options: SignOptions = {}): Promise<string> =>
  new SignJWT({})
    .setProtectedHeader({ alg: key.alg, kid: key.kid })
    .setIssuedAt()
    .setIssuer(options.issuer ?? TRUSTED_ISSUER)
    .setAudience(options.audience ?? EXPECTED_AUDIENCE)
    .setSubject(options.subject ?? EXTERNAL_SUBJECT)
    .setExpirationTime(options.expirationTime ?? "1h")
    .sign(key.privateKey);

describe("External IDP token verifier", () => {
  let rsaKey: TestKey;
  let ecKey: TestKey;

  before(async () => {
    rsaKey = await makeKey("RS256", RS256_KID);
    ecKey = await makeKey("ES256", ES256_KID);
  });

  /**
   * Installs a persistent mock discovery + JWKS endpoint exposing the given
   * public JWKs.
   */
  const mockIssuer = (keys: TestKey[]) => {
    nock(TRUSTED_ISSUER)
      .persist()
      .get(DISCOVERY_PATH)
      .reply(200, { jwks_uri: `${TRUSTED_ISSUER}${JWKS_PATH}` });
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
  });

  describe("rejected tokens (parameterized by failure mode)", () => {
    interface RejectionCase {
      name: string;
      makeToken: () => Promise<string>;
      setup?: () => void;
    }

    const rejectionCases: RejectionCase[] = [
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

        let error: unknown;
        try {
          await verifyExternalToken(token);
        } catch (caught) {
          error = caught;
        }

        expect(error, `expected ${name} to be rejected`).to.be.instanceOf(
          UnauthorizedError
        );
      });
    });
  });

  it("rejects when the feature is disabled", async () => {
    mockIssuer([rsaKey]);
    const token = await signToken(rsaKey);
    process.env.EXTERNAL_OIDC_ISSUERS = "";
    resetExternalIdpConfig();

    let error: unknown;
    try {
      await verifyExternalToken(token);
    } catch (caught) {
      error = caught;
    }
    expect(error).to.be.instanceOf(UnauthorizedError);
  });

  it("picks up rotated signing keys after the cache refreshes", async () => {
    // Initial key set contains only the original RSA key.
    mockIssuer([rsaKey]);
    const firstToken = await signToken(rsaKey);
    expect((await verifyExternalToken(firstToken)).sub).to.equal(
      EXTERNAL_SUBJECT
    );

    // Issuer rotates to a new signing key and the cache is refreshed.
    const rotatedKey = await makeKey("RS256", RS256_ROTATED_KID);
    nock.cleanAll();
    resetExternalVerifierCaches();
    mockIssuer([rotatedKey]);

    const rotatedToken = await signToken(rotatedKey);
    expect((await verifyExternalToken(rotatedToken)).sub).to.equal(
      EXTERNAL_SUBJECT
    );
  });

  it("fails closed when discovery has no jwks_uri", async () => {
    nock(TRUSTED_ISSUER).persist().get(DISCOVERY_PATH).reply(200, {});
    const token = await signToken(rsaKey);

    let error: unknown;
    try {
      await verifyExternalToken(token);
    } catch (caught) {
      error = caught;
    }
    expect(error).to.be.instanceOf(UnauthorizedError);
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
