import Axios from "axios";
import { setupCache } from "axios-cache-interceptor";
import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  JWTPayload,
  JWTVerifyGetKey,
} from "jose";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { getExternalIdpConfig } from "../../config/externalIdp";
import { UnauthorizedError } from "../../errors/UnauthorizedError";
import { Logger } from "../loggers";

/** Prefix for the axios cache id used to store discovery documents. */
const DISCOVERY_CACHE_ID_PREFIX = "external-oidc-discovery:";

/** Conversion factor between seconds (config) and milliseconds (axios cache). */
const MILLISECONDS_PER_SECOND = 1000;

/**
 * Minimal shape of an OpenID Connect discovery document — only the fields this
 * module consumes.
 */
interface OpenIdConfiguration {
  jwks_uri?: string;
}

/**
 * Shared cached axios instance for discovery-document fetches. Reuses the same
 * `axios-cache-interceptor` pattern as the rest of the codebase; the TTL is
 * supplied per request from {@link getExternalIdpConfig}.
 */
const discoveryHttpClient = setupCache(Axios.create(), {
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
 * Removes a trailing slash from an issuer URL so discovery paths are appended
 * without producing a double slash.
 *
 * @param issuer - The issuer URL.
 * @returns The issuer URL without a trailing slash.
 */
const stripTrailingSlash = (issuer: string): string =>
  issuer.endsWith("/") ? issuer.slice(0, -1) : issuer;

/**
 * Fetches (and caches) the OpenID Connect discovery document for an issuer and
 * returns its `jwks_uri`.
 *
 * @param issuer - Trusted issuer URL.
 * @param discoveryPath - Path appended to the issuer to locate its discovery
 *   document (well-known by default; per-service for some issuers).
 * @param ttlSeconds - Discovery cache lifetime in seconds.
 * @returns The issuer's JWKS URI.
 * @throws {UnauthorizedError} When the document cannot be fetched or lacks a
 *   `jwks_uri`.
 */
const fetchJwksUri = async (
  issuer: string,
  discoveryPath: string,
  ttlSeconds: number
): Promise<string> => {
  const discoveryUrl = `${stripTrailingSlash(issuer)}${discoveryPath}`;

  try {
    const response = await discoveryHttpClient.get<OpenIdConfiguration>(
      discoveryUrl,
      {
        id: `${DISCOVERY_CACHE_ID_PREFIX}${issuer}`,
        cache: {
          ttl: ttlSeconds * MILLISECONDS_PER_SECOND,
        },
      }
    );

    const jwksUri = response.data?.jwks_uri;
    if (!jwksUri) {
      throw new UnauthorizedError(
        `Discovery document for issuer '${issuer}' has no jwks_uri`
      );
    }
    return jwksUri;
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    Logger.error(
      `External IDP discovery failed for issuer '${issuer}': ${
        (error as Error)?.message ?? error
      }`
    );
    throw new UnauthorizedError("Unable to verify external token");
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
 * Builds an http(s) proxy agent for a URL from the standard proxy environment
 * (`HTTPS_PROXY`/`HTTP_PROXY`), honouring `NO_PROXY`. Returns `undefined` when
 * no proxy applies, so the request goes out directly.
 *
 * `jose` v4 fetches the JWKS over `node:https`, so a proxy agent is the way to
 * reach a verifier whose JWKS endpoint is only reachable through a forward
 * proxy (e.g. an in-cluster deployment reaching an external ingress host).
 *
 * @param url - The JWKS endpoint URL.
 * @returns A proxy agent, or `undefined` for a direct connection.
 */
const proxyAgentForUrl = (
  url: URL
): HttpsProxyAgent<string> | HttpProxyAgent<string> | undefined => {
  const isHttps = url.protocol === "https:";
  const proxy = isHttps
    ? process.env.HTTPS_PROXY ??
      process.env.https_proxy ??
      process.env.HTTP_PROXY ??
      process.env.http_proxy
    : process.env.HTTP_PROXY ?? process.env.http_proxy;

  if (!proxy || isNoProxyHost(url.hostname)) {
    return undefined;
  }
  return isHttps ? new HttpsProxyAgent(proxy) : new HttpProxyAgent(proxy);
};

/**
 * Returns a cached remote JWKS resolver for an issuer, discovering the
 * `jwks_uri` and (re)building the resolver as needed.
 *
 * @param issuer - Trusted issuer URL.
 * @param discoveryPath - Path appended to the issuer to locate its discovery
 *   document.
 * @param ttlSeconds - Discovery cache lifetime in seconds.
 * @returns A `jose` key resolver bound to the issuer's JWKS endpoint.
 */
const getJwksForIssuer = async (
  issuer: string,
  discoveryPath: string,
  ttlSeconds: number
): Promise<JWTVerifyGetKey> => {
  const jwksUri = await fetchJwksUri(issuer, discoveryPath, ttlSeconds);
  const cached = jwksByIssuer.get(issuer);
  if (cached && cached.jwksUri === jwksUri) {
    return cached.getKey;
  }

  const jwksUrl = new URL(jwksUri);
  const agent = proxyAgentForUrl(jwksUrl);
  const getKey = createRemoteJWKSet(jwksUrl, agent ? { agent } : undefined);
  jwksByIssuer.set(issuer, { jwksUri, getKey });
  return getKey;
};

/**
 * Reads the unverified `iss` claim from a token without validating its
 * signature. Used only to select which trusted issuer's JWKS to verify against;
 * the claim is re-checked cryptographically by {@link verifyExternalToken}.
 *
 * @param token - The raw JWT.
 * @returns The `iss` claim, or `undefined` when absent or the token is
 *   malformed.
 */
export const peekIssuer = (token: string): string | undefined => {
  try {
    return decodeJwt(token).iss;
  } catch {
    return undefined;
  }
};

/**
 * Verifies a JWT issued by a trusted external IDP / OID4VP flow.
 *
 * Selects the JWKS for the token's (unverified) issuer, then verifies the
 * signature and enforces `iss` ∈ trusted set, `aud`, `exp`, and the configured
 * allowed algorithms. The `iss` claim is bound cryptographically by the
 * verification step, so the initial peek is never trusted.
 *
 * @param token - The raw JWT to verify.
 * @returns The verified claim set.
 * @throws {UnauthorizedError} When the feature is disabled, the issuer is not
 *   trusted, or any signature/claim/algorithm check fails.
 */
export const verifyExternalToken = async (
  token: string
): Promise<JWTPayload> => {
  const config = getExternalIdpConfig();

  if (!config.enabled) {
    throw new UnauthorizedError("External token verification is disabled");
  }

  const issuer = peekIssuer(token);
  if (!issuer || !config.issuers.has(issuer)) {
    throw new UnauthorizedError("Untrusted token issuer");
  }

  try {
    const getKey = await getJwksForIssuer(
      issuer,
      config.discoveryPath,
      config.discoveryTtlSeconds
    );
    const { payload } = await jwtVerify(token, getKey, {
      issuer,
      audience: config.audience,
      algorithms: [...config.algorithms],
    });
    return payload;
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    Logger.error(
      `External token verification failed for issuer '${issuer}': ${
        (error as Error)?.message ?? error
      }`
    );
    throw new UnauthorizedError("Invalid or expired token");
  }
};

/**
 * Clears the in-memory JWKS resolver cache. Intended for tests; the discovery
 * HTTP cache is keyed per issuer and expires by TTL.
 */
export const resetExternalVerifierCaches = (): void => {
  jwksByIssuer.clear();
};
