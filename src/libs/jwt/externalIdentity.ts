import { JWTPayload } from "jose";
import { getExternalIdpConfig } from "../../config/externalIdp";
import { UnauthorizedError } from "../../errors/UnauthorizedError";
import Participant from "../../models/Participant/Participant.model";
import User from "../../models/User/User.model";
import UserIdentifier from "../../models/UserIdentifier/UserIdentifier.model";
import { peekIssuer } from "./externalVerifier";

/**
 * Where a token should be verified: the existing local HMAC path, or the
 * external IDP verifier.
 */
export type TokenRoute = "local" | "external";

/**
 * Local records an external subject was resolved to. Each field is present only
 * when a matching record exists; middlewares enforce which field they require.
 */
export interface LocalIdentity {
  /** Matching local {@link User}. */
  user?: { id: string };
  /** Matching {@link UserIdentifier} (matched on its DID `identifier`). */
  userIdentifier?: { id: string };
  /** Matching {@link Participant} (matched on its `did`). */
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
 * Extracts the external subject (DID / IDP subject) from a verified claim set
 * using the configured subject claim.
 *
 * @param claims - The verified claim set.
 * @returns The subject string.
 * @throws {UnauthorizedError} When the configured subject claim is missing or
 *   not a non-empty string.
 */
const getExternalSubject = (claims: JWTPayload): string => {
  const { subjectClaim } = getExternalIdpConfig();
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
 * Resolves the configured subject claim against a {@link UserIdentifier} (by its
 * DID `identifier`) and its owning {@link User}, and against a
 * {@link Participant} (by its `did`). No just-in-time provisioning is performed:
 * a valid external token whose subject matches nothing local is rejected.
 *
 * @param claims - The verified claim set.
 * @returns The resolved local identity.
 * @throws {UnauthorizedError} When the subject claim is missing or resolves to
 *   no local record at all.
 */
export const mapExternalSubjectToLocal = async (
  claims: JWTPayload
): Promise<LocalIdentity> => {
  const subject = getExternalSubject(claims);

  const userIdentifier = await UserIdentifier.findOne({
    identifier: subject,
  }).lean();

  let user: LocalIdentity["user"];
  if (userIdentifier) {
    const owner = userIdentifier.user
      ? await User.findById(userIdentifier.user).lean()
      : await User.findOne({
          identifiers: { $in: [userIdentifier._id] },
        }).lean();
    if (owner) {
      user = { id: owner._id.toString() };
    }
  }

  const participant = await Participant.findOne({ did: subject }).lean();

  const identity: LocalIdentity = {
    user,
    userIdentifier: userIdentifier
      ? { id: userIdentifier._id.toString() }
      : undefined,
    participant: participant ? { id: participant._id.toString() } : undefined,
  };

  if (!identity.user && !identity.userIdentifier && !identity.participant) {
    throw new UnauthorizedError(
      "External token subject does not resolve to a known identity"
    );
  }

  return identity;
};
