import { setupEnvironment } from "./env";

/**
 * Names of the environment variables that configure verification of JWTs issued
 * by external IDPs / OID4VP login flows. Kept as named constants so the raw
 * strings are never scattered across the codebase.
 */
export const EXTERNAL_IDP_ENV_VARS = {
  ISSUERS: "EXTERNAL_OIDC_ISSUERS",
  AUDIENCE: "EXTERNAL_OIDC_AUDIENCE",
  ALGS: "EXTERNAL_OIDC_ALGS",
  SUBJECT_CLAIM: "EXTERNAL_OIDC_SUBJECT_CLAIM",
  DISCOVERY_TTL: "EXTERNAL_OIDC_DISCOVERY_TTL",
  DISCOVERY_PATH: "EXTERNAL_OIDC_DISCOVERY_PATH",
  HTTP_TIMEOUT: "EXTERNAL_OIDC_HTTP_TIMEOUT",
  CLOCK_TOLERANCE: "EXTERNAL_OIDC_CLOCK_TOLERANCE",
} as const;

/**
 * Every signing algorithm an external issuer may be configured to use.
 * Asymmetric only: external IDPs and OID4VP wallets sign with RSA, NIST curves
 * or Edwards curves. Symmetric algorithms and `none` are absent by
 * construction, so an external issuer can never be verified with a shared
 * secret or with no signature at all.
 */
export const SUPPORTED_EXTERNAL_OIDC_ALGS: readonly string[] = [
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
];

/**
 * Signing algorithms accepted when `EXTERNAL_OIDC_ALGS` is not set.
 */
export const DEFAULT_EXTERNAL_OIDC_ALGS: readonly string[] = [
  "RS256",
  "ES256",
  "EdDSA",
];

/**
 * Default claim carrying the external subject (a DID or IDP subject identifier).
 */
export const DEFAULT_EXTERNAL_OIDC_SUBJECT_CLAIM = "sub";

/**
 * Claim name that, when configured as the subject claim, additionally requires
 * the issuer to have verified the address.
 */
export const EMAIL_CLAIM = "email";

/**
 * Companion claim asserting that the issuer verified {@link EMAIL_CLAIM}.
 */
export const EMAIL_VERIFIED_CLAIM = "email_verified";

/**
 * Default discovery document cache lifetime, in seconds.
 */
export const DEFAULT_EXTERNAL_OIDC_DISCOVERY_TTL_SECONDS = 3600;

/**
 * Default path appended to a trusted issuer URL to locate its OpenID Connect
 * discovery document. The spec-mandated well-known location; overridable via
 * {@link EXTERNAL_IDP_ENV_VARS.DISCOVERY_PATH} for issuers that serve the
 * document under a per-service path instead.
 * @see https://openid.net/specs/openid-connect-discovery-1_0.html
 */
export const DEFAULT_EXTERNAL_OIDC_DISCOVERY_PATH =
  "/.well-known/openid-configuration";

/**
 * Default timeout for discovery and JWKS requests, in milliseconds. Bounds the
 * time an unresponsive IDP can hold an inbound request open.
 */
export const DEFAULT_EXTERNAL_OIDC_HTTP_TIMEOUT_MS = 5000;

/**
 * Default leeway applied to `exp` / `nbf`, in seconds, absorbing clock skew
 * between this service and the external issuer.
 */
export const DEFAULT_EXTERNAL_OIDC_CLOCK_TOLERANCE_SECONDS = 30;

/**
 * URL scheme required of issuer and JWKS URLs. Discovery and key material must
 * not be fetched over cleartext.
 */
export const REQUIRED_URL_PROTOCOL = "https:";

/**
 * Separator used in the comma-separated `EXTERNAL_OIDC_ISSUERS` /
 * `EXTERNAL_OIDC_ALGS` env vars.
 */
const LIST_SEPARATOR = ",";

/**
 * Matches a string consisting only of decimal digits, used to reject partially
 * numeric env values such as `3600s` instead of silently truncating them.
 */
const DIGITS_ONLY = /^\d+$/;

/**
 * Typed, validated configuration for external IDP JWT verification.
 */
export interface ExternalIdpConfig {
  /**
   * Whether external token verification is enabled. `false` when no trusted
   * issuers are configured — in that case every token takes the existing local
   * HMAC path unchanged.
   */
  readonly enabled: boolean;
  /**
   * Set of trusted issuer URLs, normalised without a trailing slash. A token
   * whose `iss` is in this set is routed to the external verifier.
   */
  readonly issuers: ReadonlySet<string>;
  /**
   * Expected `aud` claim. Required (non-empty) whenever `enabled` is true.
   *
   * A single value is enough even though both data subjects and participants
   * authenticate here: both send their tokens to the consent-manager as their
   * target audience.
   */
  readonly audience: string;
  /**
   * Allowed signing algorithms for external tokens, all asymmetric.
   */
  readonly algorithms: readonly string[];
  /**
   * Claim holding the external subject (DID / IDP subject) to map to a local
   * identity.
   */
  readonly subjectClaim: string;
  /**
   * Whether the token must additionally carry `email_verified: true`. Derived:
   * true exactly when the subject claim is `email`, since an unverified address
   * is self-asserted and cannot carry an account binding.
   */
  readonly requireEmailVerified: boolean;
  /**
   * Discovery document cache TTL in seconds. Also used as the JWKS cache age.
   */
  readonly discoveryTtlSeconds: number;
  /**
   * Path appended to each trusted issuer URL to fetch its OpenID Connect
   * discovery document. Defaults to the well-known location; override for
   * issuers that expose discovery under a per-service path.
   */
  readonly discoveryPath: string;
  /**
   * Timeout for discovery and JWKS requests, in milliseconds.
   */
  readonly httpTimeoutMs: number;
  /**
   * Leeway applied to time-based claims, in seconds.
   */
  readonly clockToleranceSeconds: number;
}

/**
 * Reads a comma-separated env var into a trimmed, de-duplicated list, dropping
 * empty entries.
 *
 * @param raw - Raw env var value (may be undefined).
 * @returns The parsed list, empty when the value is unset or blank.
 */
const parseList = (raw: string | undefined): string[] => {
  if (!raw) return [];
  return raw
    .split(LIST_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

/**
 * Normalizes a configured discovery path so it is always a non-empty,
 * leading-slash path that can be appended to an issuer URL. Falls back to the
 * spec default when the raw value is blank.
 *
 * @param raw - Raw env var value (may be undefined).
 * @returns The normalized discovery path (always starts with `/`).
 */
const normalizeDiscoveryPath = (raw: string | undefined): string => {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) return DEFAULT_EXTERNAL_OIDC_DISCOVERY_PATH;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

/**
 * Reads a strictly positive integer env var, falling back to a default when the
 * value is unset or blank.
 *
 * @param name - Env var name, used in the error message.
 * @param fallback - Value to use when the variable is not set.
 * @returns The parsed value.
 * @throws {Error} When the value is set but is not a positive integer.
 */
const parsePositiveInteger = (name: string, fallback: number): number => {
  const raw = (process.env[name] ?? "").trim();
  if (raw.length === 0) return fallback;
  if (!DIGITS_ONLY.test(raw) || Number.parseInt(raw, 10) === 0) {
    throw new Error(`${name} must be a positive integer, got '${raw}'`);
  }
  return Number.parseInt(raw, 10);
};

/**
 * Removes a trailing slash so issuer URLs compare and concatenate consistently.
 *
 * @param issuer - The issuer URL.
 * @returns The issuer URL without a trailing slash.
 */
const stripTrailingSlash = (issuer: string): string =>
  issuer.endsWith("/") ? issuer.slice(0, -1) : issuer;

/**
 * Validates that an issuer entry is an absolute `https` URL.
 *
 * @param issuer - Raw issuer entry from the environment.
 * @returns The normalised issuer URL.
 * @throws {Error} When the entry is not a well-formed `https` URL.
 */
const validateIssuer = (issuer: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(issuer);
  } catch {
    throw new Error(
      `${EXTERNAL_IDP_ENV_VARS.ISSUERS} entry '${issuer}' is not a valid URL`
    );
  }
  if (parsed.protocol !== REQUIRED_URL_PROTOCOL) {
    throw new Error(
      `${EXTERNAL_IDP_ENV_VARS.ISSUERS} entry '${issuer}' must use ` +
        `${REQUIRED_URL_PROTOCOL}//`
    );
  }
  return stripTrailingSlash(issuer);
};

/**
 * Validates that every configured algorithm is one this service is willing to
 * accept from an external issuer.
 *
 * @param algorithms - Raw algorithm entries from the environment.
 * @returns The validated algorithms.
 * @throws {Error} When an entry is not in {@link SUPPORTED_EXTERNAL_OIDC_ALGS}.
 */
const validateAlgorithms = (algorithms: string[]): string[] => {
  const unsupported = algorithms.filter(
    (algorithm) => !SUPPORTED_EXTERNAL_OIDC_ALGS.includes(algorithm)
  );
  if (unsupported.length > 0) {
    throw new Error(
      `${EXTERNAL_IDP_ENV_VARS.ALGS} contains unsupported algorithm(s) ` +
        `${unsupported.join(LIST_SEPARATOR)}; allowed: ` +
        `${SUPPORTED_EXTERNAL_OIDC_ALGS.join(LIST_SEPARATOR)}`
    );
  }
  return algorithms;
};

/**
 * Parses the environment into a validated {@link ExternalIdpConfig}.
 *
 * Fails fast when trusted issuers are configured without an audience, which
 * would otherwise let a token from a trusted issuer be accepted for any
 * relying party, and when any other entry is malformed.
 *
 * @returns The parsed configuration.
 * @throws {Error} When the configuration is incomplete or invalid.
 */
const parseExternalIdpConfig = (): ExternalIdpConfig => {
  // Load a .env file when present, but tolerate its absence so the config also
  // works in environments where variables are injected directly (containers,
  // tests).
  try {
    setupEnvironment();
  } catch {
    // Variables are expected to already be present on process.env.
  }

  const issuers = parseList(process.env[EXTERNAL_IDP_ENV_VARS.ISSUERS]).map(
    validateIssuer
  );
  const audience = (process.env[EXTERNAL_IDP_ENV_VARS.AUDIENCE] ?? "").trim();
  const enabled = issuers.length > 0;

  if (enabled && audience.length === 0) {
    throw new Error(
      `${EXTERNAL_IDP_ENV_VARS.AUDIENCE} is required when ` +
        `${EXTERNAL_IDP_ENV_VARS.ISSUERS} is set.`
    );
  }

  const algorithms = validateAlgorithms(
    parseList(process.env[EXTERNAL_IDP_ENV_VARS.ALGS])
  );
  const subjectClaim = (
    process.env[EXTERNAL_IDP_ENV_VARS.SUBJECT_CLAIM] ?? ""
  ).trim();

  const resolvedSubjectClaim =
    subjectClaim.length > 0
      ? subjectClaim
      : DEFAULT_EXTERNAL_OIDC_SUBJECT_CLAIM;

  return {
    enabled,
    issuers: new Set(issuers),
    audience,
    algorithms:
      algorithms.length > 0 ? algorithms : [...DEFAULT_EXTERNAL_OIDC_ALGS],
    subjectClaim: resolvedSubjectClaim,
    requireEmailVerified: resolvedSubjectClaim === EMAIL_CLAIM,
    discoveryTtlSeconds: parsePositiveInteger(
      EXTERNAL_IDP_ENV_VARS.DISCOVERY_TTL,
      DEFAULT_EXTERNAL_OIDC_DISCOVERY_TTL_SECONDS
    ),
    discoveryPath: normalizeDiscoveryPath(
      process.env[EXTERNAL_IDP_ENV_VARS.DISCOVERY_PATH]
    ),
    httpTimeoutMs: parsePositiveInteger(
      EXTERNAL_IDP_ENV_VARS.HTTP_TIMEOUT,
      DEFAULT_EXTERNAL_OIDC_HTTP_TIMEOUT_MS
    ),
    clockToleranceSeconds: parsePositiveInteger(
      EXTERNAL_IDP_ENV_VARS.CLOCK_TOLERANCE,
      DEFAULT_EXTERNAL_OIDC_CLOCK_TOLERANCE_SECONDS
    ),
  };
};

let cachedConfig: ExternalIdpConfig | null = null;

/**
 * Returns the process-wide external IDP configuration, parsing and validating
 * the environment on first access and caching the result.
 *
 * @returns The cached {@link ExternalIdpConfig}.
 * @throws {Error} When the configuration is incomplete or invalid.
 */
export const getExternalIdpConfig = (): ExternalIdpConfig => {
  if (cachedConfig === null) {
    cachedConfig = parseExternalIdpConfig();
  }
  return cachedConfig;
};

/**
 * Clears the cached configuration so the next {@link getExternalIdpConfig} call
 * re-reads the environment. Intended for tests that mutate `process.env`.
 */
export const resetExternalIdpConfig = (): void => {
  cachedConfig = null;
};
