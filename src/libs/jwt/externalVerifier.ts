import Axios from "axios";
import { buildMemoryStorage, setupCache } from "axios-cache-interceptor";
import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  JWTPayload,
  JWTVerifyGetKey,
} from "jose";
import { HttpsProxyAgent } from "https-proxy-agent";
import {
  getExternalIdpConfig,
  REQUIRED_URL_PROTOCOL,
} from "../../config/externalIdp";
import { IdpUnavailableError } from "../../errors/IdpUnavailableError";
import { UnauthorizedError } from "../../errors/UnauthorizedError";
import { Logger } from "../loggers";

/** Prefix for the axios cache id used to store discovery documents. */
const DISCOVERY_CACHE_ID_PREFIX = "external-oidc-discovery:";

/** Conversion factor between seconds (config) and milliseconds (axios cache). */
const MILLISECONDS_PER_SECOND = 1000;

/**
 * How long a failed discovery attempt suppresses further attempts for the same
 * issuer, in milliseconds. Without it, every inbound request re-tries a failing
 * IDP, turning an outage into self-inflicted amplification.
 */
const DISCOVERY_FAILURE_BACKOFF_MS = 10_000;

/**
 * Message returned to clients for any failure that is not attributable to their
 * token. Specific causes are logged rather than echoed, so internal issuer and
 * infrastructure naming never reaches an unauthenticated caller.
 */
const GENERIC_UNAVAILABLE_MESSAGE = "Unable to verify external token";

/**
 * Message returned to clients whose token is genuinely not acceptable. Kept
 * identical for every cause so the response is not an oracle for which check
 * failed.
 */
const GENERIC_REJECTION_MESSAGE = "Invalid or expired token";

/**
 * Minimal shape of an OpenID Connect discovery document — only the fields this
 * module consumes.
 */
interface OpenIdConfiguration {
  issuer?: string;
  jwks_uri?: string;
}

/**
 * Backing store for the discovery cache. Held explicitly rather than left
 * implicit so {@link resetExternalVerifierCaches} can empty it; otherwise a
 * document cached by one test is served to the next.
 */
const discoveryCacheStorage = buildMemoryStorage();

/**
 * Shared cached axios instance for discovery-document fetches. Reuses the same
 * `axios-cache-interceptor` pattern as the rest of the codebase; the TTL and
 * timeout are supplied per request from {@link getExternalIdpConfig}.
 */
const discoveryHttpClient = setupCache(Axios.create(), {
  storage: discoveryCacheStorage,
  methods: ["get"],
  cachePredicate: {
    statusCheck: (status) => status === 200,
  },
});

/**
 * Cached remote JWKS resolvers, keyed by issuer. Each entry remembers the
 * `jwks_uri` it was built from so a changed discovery document rebuilds the set.
 * The resolver itself (from `jose`) handles signing-key rotation transparently.
 */
const jwksByIssuer = new Map<
  string,
  { jwksUri: string; getKey: JWTVerifyGetKey }
>();

/**
 * Timestamp of the last failed discovery attempt per issuer, used for the
 * short negative-caching window.
 */
const discoveryFailedAt = new Map<string, number>();

/**
 * Removes a trailing slash so issuer URLs compare and concatenate consistently
 * with the normalised form held in the configuration.
 *
 * @param issuer - The issuer URL.
 * @returns The issuer URL without a trailing slash.
 */
const stripTrailingSlash = (issuer: string): string =>
  issuer.endsWith("/") ? issuer.slice(0, -1) : issuer;

/**
 * Validates the `jwks_uri` advertised by a discovery document.
 *
 * @param jwksUri - The advertised URI.
 * @param issuer - The issuer the document was fetched for.
 * @returns The parsed URL.
 * @throws {IdpUnavailableError} When the URI is absent, malformed, or not
 *   served over `https`.
 */
const validateJwksUri = (jwksUri: string | undefined, issuer: string): URL => {
  if (!jwksUri) {
    throw new IdpUnavailableError(
      `Discovery document for issuer '${issuer}' has no jwks_uri`
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(jwksUri);
  } catch {
    throw new IdpUnavailableError(
      `Discovery document for issuer '${issuer}' has a malformed jwks_uri`
    );
  }
  if (parsed.protocol !== REQUIRED_URL_PROTOCOL) {
    throw new IdpUnavailableError(
      `jwks_uri for issuer '${issuer}' must use ${REQUIRED_URL_PROTOCOL}//`
    );
  }
  return parsed;
};

/**
 * Fetches (and caches) the OpenID Connect discovery document for an issuer and
 * returns its `jwks_uri`.
 *
 * The document's own `issuer` value is compared against the issuer it was
 * fetched for, as required by OpenID Connect Discovery, so a substituted
 * response cannot redirect key resolution.
 *
 * @param issuer - Trusted issuer URL, already normalised.
 * @param discoveryPath - Path appended to the issuer to locate its discovery
 *   document (well-known by default; per-service for some issuers).
 * @param ttlSeconds - Discovery cache lifetime in seconds.
 * @param timeoutMs - Request timeout in milliseconds.
 * @returns The issuer's JWKS URI.
 * @throws {IdpUnavailableError} When the document cannot be fetched, does not
 *   describe this issuer, or lacks a usable `jwks_uri`.
 */
const fetchJwksUri = async (
  issuer: string,
  discoveryPath: string,
  ttlSeconds: number,
  timeoutMs: number
): Promise<URL> => {
  const lastFailure = discoveryFailedAt.get(issuer);
  if (
    lastFailure !== undefined &&
    Date.now() - lastFailure < DISCOVERY_FAILURE_BACKOFF_MS
  ) {
    throw new IdpUnavailableError(
      `Discovery for issuer '${issuer}' recently failed; backing off`
    );
  }

  const discoveryUrl = `${issuer}${discoveryPath}`;

  let response;
  try {
    response = await discoveryHttpClient.get<OpenIdConfiguration>(
      discoveryUrl,
      {
        id: `${DISCOVERY_CACHE_ID_PREFIX}${issuer}`,
        timeout: timeoutMs,
        cache: {
          ttl: ttlSeconds * MILLISECONDS_PER_SECOND,
        },
      }
    );
  } catch (error) {
    discoveryFailedAt.set(issuer, Date.now());
    throw new IdpUnavailableError(
      `Discovery request for issuer '${issuer}' failed: ${
        (error as Error)?.message ?? error
      }`
    );
  }

  const advertisedIssuer = response.data?.issuer;
  if (
    advertisedIssuer !== undefined &&
    stripTrailingSlash(advertisedIssuer) !== issuer
  ) {
    discoveryFailedAt.set(issuer, Date.now());
    throw new IdpUnavailableError(
      `Discovery document fetched for issuer '${issuer}' describes ` +
        `'${advertisedIssuer}'`
    );
  }

  try {
    const jwksUri = validateJwksUri(response.data?.jwks_uri, issuer);
    discoveryFailedAt.delete(issuer);
    return jwksUri;
  } catch (error) {
    discoveryFailedAt.set(issuer, Date.now());
    throw error;
  }
};

/**
 * Whether a host is excluded from proxying by the `NO_PROXY` environment
 * variable. Supports `*` (bypass everything) and `.suffix` / `suffix` entries
 * matched against the host and its dotted suffixes.
 *
 * @param host - The target host.
 * @returns `true` when the host must be reached directly (no proxy).
 */
const isNoProxyHost = (host: string): boolean => {
  const noProxy = (process.env.NO_PROXY ?? process.env.no_proxy ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return noProxy.some((entry) => {
    if (entry === "*") return true;
    const suffix = entry.startsWith(".") ? entry.slice(1) : entry;
    return host === suffix || host.endsWith(`.${suffix}`);
  });
};

/**
 * Builds an https proxy agent for a URL from the standard proxy environment
 * (`HTTPS_PROXY`, falling back to `HTTP_PROXY`), honouring `NO_PROXY`. Returns
 * `undefined` when no proxy applies, so the request goes out directly.
 *
 * `jose` v4 fetches the JWKS over `node:https` rather than through the axios
 * instance, so it needs its own agent to reach a verifier whose JWKS endpoint
 * is only available through a forward proxy (e.g. an in-cluster deployment
 * reaching an external ingress host). Only https targets are handled because
 * {@link validateJwksUri} rejects anything else.
 *
 * @param url - The JWKS endpoint URL.
 * @returns A proxy agent, or `undefined` for a direct connection.
 */
const proxyAgentForUrl = (url: URL): HttpsProxyAgent<string> | undefined => {
  const proxy =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy;

  if (!proxy || isNoProxyHost(url.hostname)) {
    return undefined;
  }
  return new HttpsProxyAgent(proxy);
};

/**
 * Returns a cached remote JWKS resolver for an issuer, discovering the
 * `jwks_uri` and (re)building the resolver as needed.
 *
 * @param issuer - Trusted issuer URL, already normalised.
 * @returns A `jose` key resolver bound to the issuer's JWKS endpoint.
 * @throws {IdpUnavailableError} When discovery fails.
 */
const getJwksForIssuer = async (issuer: string): Promise<JWTVerifyGetKey> => {
  const config = getExternalIdpConfig();
  const jwksUri = await fetchJwksUri(
    issuer,
    config.discoveryPath,
    config.discoveryTtlSeconds,
    config.httpTimeoutMs
  );
  const cached = jwksByIssuer.get(issuer);
  if (cached && cached.jwksUri === jwksUri.toString()) {
    return cached.getKey;
  }

  // jose refetches the key set when a token presents an unknown `kid`, rate
  // limited by its own cooldown, so a rotated signing key is picked up without
  // waiting for `cacheMaxAge` to elapse.
  const agent = proxyAgentForUrl(jwksUri);
  const getKey = createRemoteJWKSet(jwksUri, {
    timeoutDuration: config.httpTimeoutMs,
    cacheMaxAge: config.discoveryTtlSeconds * MILLISECONDS_PER_SECOND,
    ...(agent ? { agent } : {}),
  });
  jwksByIssuer.set(issuer, { jwksUri: jwksUri.toString(), getKey });
  return getKey;
};

/**
 * Reads the unverified `iss` claim from a token without validating its
 * signature. Used only to select which trusted issuer's JWKS to verify against;
 * the claim is re-checked cryptographically by {@link verifyExternalToken}.
 *
 * @param token - The raw JWT.
 * @returns The normalised `iss` claim, or `undefined` when absent or the token
 *   is malformed.
 */
export const peekIssuer = (token: string): string | undefined => {
  try {
    const issuer = decodeJwt(token).iss;
    return issuer === undefined ? undefined : stripTrailingSlash(issuer);
  } catch {
    return undefined;
  }
};

/**
 * Verifies a JWT issued by a trusted external IDP / OID4VP flow.
 *
 * Selects the JWKS for the token's (unverified) issuer, then verifies the
 * signature and enforces `iss` ∈ trusted set, `aud`, `exp`, `iat`, presence of
 * the configured subject claim, and the allowed algorithms. The `iss` claim is
 * bound by the choice of key set, so the initial peek is never trusted.
 *
 * @param token - The raw JWT to verify.
 * @returns The verified claim set.
 * @throws {UnauthorizedError} When the feature is disabled, the issuer is not
 *   trusted, or any signature/claim/algorithm check fails.
 * @throws {IdpUnavailableError} When the issuer's discovery or JWKS endpoint
 *   cannot be reached or returns something unusable.
 */
export const verifyExternalToken = async (
  token: string
): Promise<JWTPayload> => {
  const config = getExternalIdpConfig();

  if (!config.enabled) {
    throw new UnauthorizedError(GENERIC_REJECTION_MESSAGE);
  }

  const issuer = peekIssuer(token);
  if (!issuer || !config.issuers.has(issuer)) {
    throw new UnauthorizedError(GENERIC_REJECTION_MESSAGE);
  }

  let getKey: JWTVerifyGetKey;
  try {
    getKey = await getJwksForIssuer(issuer);
  } catch (error) {
    Logger.error(
      `External IDP discovery failed for issuer '${issuer}': ${
        (error as Error)?.message ?? error
      }`
    );
    throw new IdpUnavailableError(GENERIC_UNAVAILABLE_MESSAGE);
  }

  // `requiredClaims` is what makes `exp` mandatory: jose validates the claim
  // when present but does not otherwise insist on it, so an issuer omitting it
  // would yield a token that never expires.
  const requiredClaims = Array.from(
    new Set(["exp", "iat", config.subjectClaim])
  );

  try {
    const { payload } = await jwtVerify(token, getKey, {
      // Both spellings of the same issuer URL are accepted, matching the
      // normalisation applied to the configured trusted set.
      issuer: [issuer, `${issuer}/`],
      audience: config.audience,
      algorithms: [...config.algorithms],
      requiredClaims,
      clockTolerance: config.clockToleranceSeconds,
    });
    return payload;
  } catch (error) {
    Logger.error(
      `External token verification failed for issuer '${issuer}': ${
        (error as Error)?.message ?? error
      }`
    );
    throw new UnauthorizedError(GENERIC_REJECTION_MESSAGE);
  }
};

/**
 * Clears the in-memory verifier caches — JWKS resolvers, the discovery HTTP
 * cache and the failure backoff. Intended for tests, which would otherwise see
 * a discovery document cached by an earlier case.
 */
export const resetExternalVerifierCaches = (): void => {
  jwksByIssuer.clear();
  discoveryFailedAt.clear();
  for (const cacheId of Object.keys(discoveryCacheStorage.data)) {
    delete discoveryCacheStorage.data[cacheId];
  }
};
