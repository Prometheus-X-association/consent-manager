import { JWTPayload } from "jose";
import {
  EMAIL_VERIFIED_CLAIM,
  getExternalIdpConfig,
} from "../../config/externalIdp";
import { UnauthorizedError } from "../../errors/UnauthorizedError";
import Participant from "../../models/Participant/Participant.model";
import User from "../../models/User/User.model";
import { peekIssuer } from "./externalVerifier";

/**
 * Where a token should be verified: the existing local HMAC path, or the
 * external IDP verifier.
 */
export type TokenRoute = "local" | "external";

/**
 * Number of documents fetched when resolving a subject. Two is enough to detect
 * an ambiguous match without reading an unbounded result set.
 */
const AMBIGUITY_PROBE_LIMIT = 2;

/**
 * Local records an external subject was resolved to. Each field is present only
 * when a matching record exists; middlewares enforce which field they require.
 */
export interface LocalIdentity {
  /** Matching local {@link User}, resolved on its `email`. */
  user?: { id: string };
  /** Matching {@link Participant}, resolved on its `did`. */
  participant?: { id: string };
}

/**
 * Decides how a token should be verified, based only on its unverified `iss`
 * claim. Absent `iss`, a self-issued `iss`, or an untrusted `iss` all route to
 * the local path (unchanged behavior); an `iss` in the configured trusted set
 * routes to the external verifier.
 *
 * The unverified `iss` is used solely to select a verifier — never to trust a
 * claim; the external verifier re-checks `iss` cryptographically.
 *
 * @param token - The raw JWT.
 * @returns `"external"` when the issuer is trusted and the feature is enabled,
 *   otherwise `"local"`.
 */
export const resolveTokenRoute = (token: string): TokenRoute => {
  const config = getExternalIdpConfig();
  if (!config.enabled) return "local";

  const issuer = peekIssuer(token);
  if (issuer && config.issuers.has(issuer)) return "external";
  return "local";
};

/**
 * Extracts the external subject from a verified claim set using the configured
 * subject claim.
 *
 * When the subject claim is `email`, the issuer must also have asserted
 * `email_verified: true`. An unverified address is self-asserted by the token
 * holder and therefore cannot carry an account binding.
 *
 * @param claims - The verified claim set.
 * @returns The subject string.
 * @throws {UnauthorizedError} When the subject claim is missing, is not a
 *   non-empty string, or an email subject is unverified.
 */
const getExternalSubject = (claims: JWTPayload): string => {
  const { subjectClaim, requireEmailVerified } = getExternalIdpConfig();

  if (requireEmailVerified && claims[EMAIL_VERIFIED_CLAIM] !== true) {
    throw new UnauthorizedError(
      `External token does not assert ${EMAIL_VERIFIED_CLAIM}`
    );
  }

  const raw = claims[subjectClaim];
  if (typeof raw !== "string" || raw.length === 0) {
    throw new UnauthorizedError(
      `External token missing subject claim '${subjectClaim}'`
    );
  }
  return raw;
};

/**
 * Maps a verified external subject to the local records it corresponds to.
 *
 * The subject is resolved against `User.email` and `Participant.did`. `email`
 * is the key the consent manager already uses for natural persons, and the
 * field is only ever written when a `User` is created — no route updates it —
 * so a participant cannot repoint an existing account at a subject it controls.
 * Deliberately *not* resolved against `UserIdentifier`: those documents are
 * participant-scoped and participant-writable, so matching them would let the
 * party that supplies the value also choose whose account it resolves to. The
 * field may equally hold a DID, which needs no schema change.
 *
 * No just-in-time provisioning is performed: a valid external token whose
 * subject matches nothing local is rejected. An ambiguous match — more than one
 * record carrying the same value, which the schema does not currently prevent —
 * is also rejected rather than resolved arbitrarily.
 *
 * @param claims - The verified claim set.
 * @returns The resolved local identity.
 * @throws {UnauthorizedError} When the subject claim is missing or unusable,
 *   resolves to no local record, or resolves ambiguously.
 */
export const mapExternalSubjectToLocal = async (
  claims: JWTPayload
): Promise<LocalIdentity> => {
  const subject = getExternalSubject(claims);

  const [users, participants] = await Promise.all([
    User.find({ email: subject }).limit(AMBIGUITY_PROBE_LIMIT).lean(),
    Participant.find({ did: subject }).limit(AMBIGUITY_PROBE_LIMIT).lean(),
  ]);

  if (users.length > 1 || participants.length > 1) {
    throw new UnauthorizedError(
      "External token subject resolves to more than one local identity"
    );
  }

  const identity: LocalIdentity = {
    user: users[0] ? { id: users[0]._id.toString() } : undefined,
    participant: participants[0]
      ? { id: participants[0]._id.toString() }
      : undefined,
  };

  if (!identity.user && !identity.participant) {
    throw new UnauthorizedError(
      "External token subject does not resolve to a known identity"
    );
  }

  return identity;
};
