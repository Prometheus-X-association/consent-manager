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
} as const;

/**
 * Default signing algorithms accepted for external tokens. Asymmetric only:
 * external IDPs and OID4VP wallets sign with RSA (`RS256`), NIST P-256
 * (`ES256`) or Edwards curves (`EdDSA`). Symmetric algorithms are intentionally
 * excluded so an external issuer can never be verified with a shared secret.
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
 * Default discovery + JWKS cache lifetime, in seconds.
 */
export const DEFAULT_EXTERNAL_OIDC_DISCOVERY_TTL_SECONDS = 3600;

/**
 * Default path appended to a trusted issuer URL to locate its OpenID Connect
 * discovery document. The spec-mandated well-known location; overridable via
 * {@link EXTERNAL_IDP_ENV_VARS.DISCOVERY_PATH} for issuers (e.g. FIWARE
 * VCVerifier) that serve the document under a per-service path instead.
 * @see https://openid.net/specs/openid-connect-discovery-1_0.html
 */
export const DEFAULT_EXTERNAL_OIDC_DISCOVERY_PATH =
  "/.well-known/openid-configuration";

/**
 * Separator used in the comma-separated `EXTERNAL_OIDC_ISSUERS` /
 * `EXTERNAL_OIDC_ALGS` env vars.
 */
const LIST_SEPARATOR = ",";

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
   * Set of trusted issuer URLs. A token whose `iss` is in this set is routed to
   * the external verifier.
   */
  readonly issuers: ReadonlySet<string>;
  /**
   * Expected `aud` claim. Required (non-empty) whenever `enabled` is true.
   *
   * A single value is enough even though both data subjects and participants
   * authenticate here: they present different credentials, but to the same
   * relying party. On the verifier that is one service with one credential
   * policy per scope, so every token it issues for this consent-manager carries
   * the same `aud` - the service id. Which *role* a token may act in follows
   * from the local record its subject resolves to (see
   * `mapExternalSubjectToLocal`), not from `aud`.
   */
  readonly audience: string;
  /**
   * Allowed signing algorithms for external tokens.
   */
  readonly algorithms: readonly string[];
  /**
   * Claim holding the external subject (DID / IDP subject) to map to a local
   * identity.
   */
  readonly subjectClaim: string;
  /**
   * Discovery + JWKS cache TTL in seconds.
   */
  readonly discoveryTtlSeconds: number;
  /**
   * Path appended to each trusted issuer URL to fetch its OpenID Connect
   * discovery document. Defaults to the well-known location; override for
   * issuers that expose discovery under a per-service path.
   */
  readonly discoveryPath: string;
}

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
 * Parses the environment into a validated {@link ExternalIdpConfig}.
 *
 * Fails fast when trusted issuers are configured without an audience, which
 * would otherwise let a token from a trusted issuer be accepted for any
 * relying party.
 *
 * @returns The parsed configuration.
 * @throws {Error} When issuers are set but the audience is missing.
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

  const issuers = parseList(process.env[EXTERNAL_IDP_ENV_VARS.ISSUERS]);
  const audience = (process.env[EXTERNAL_IDP_ENV_VARS.AUDIENCE] ?? "").trim();
  const enabled = issuers.length > 0;

  if (enabled && audience.length === 0) {
    throw new Error(
      `${EXTERNAL_IDP_ENV_VARS.AUDIENCE} is required when ` +
        `${EXTERNAL_IDP_ENV_VARS.ISSUERS} is set.`
    );
  }

  const algorithms = parseList(process.env[EXTERNAL_IDP_ENV_VARS.ALGS]);
  const subjectClaim = (
    process.env[EXTERNAL_IDP_ENV_VARS.SUBJECT_CLAIM] ?? ""
  ).trim();
  const rawTtl = (
    process.env[EXTERNAL_IDP_ENV_VARS.DISCOVERY_TTL] ?? ""
  ).trim();
  const parsedTtl = Number.parseInt(rawTtl, 10);
  const discoveryTtlSeconds =
    Number.isFinite(parsedTtl) && parsedTtl > 0
      ? parsedTtl
      : DEFAULT_EXTERNAL_OIDC_DISCOVERY_TTL_SECONDS;
  const discoveryPath = normalizeDiscoveryPath(
    process.env[EXTERNAL_IDP_ENV_VARS.DISCOVERY_PATH]
  );

  return {
    enabled,
    issuers: new Set(issuers),
    audience,
    algorithms:
      algorithms.length > 0 ? algorithms : [...DEFAULT_EXTERNAL_OIDC_ALGS],
    subjectClaim:
      subjectClaim.length > 0
        ? subjectClaim
        : DEFAULT_EXTERNAL_OIDC_SUBJECT_CLAIM,
    discoveryTtlSeconds,
    discoveryPath,
  };
};

let cachedConfig: ExternalIdpConfig | null = null;

/**
 * Returns the process-wide external IDP configuration, parsing and validating
 * the environment on first access and caching the result.
 *
 * @returns The cached {@link ExternalIdpConfig}.
 * @throws {Error} When issuers are set but the audience is missing.
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
