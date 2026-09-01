import { NextFunction, Response } from "express";
import { JWTPayload } from "jose";
import { IdpUnavailableError } from "../errors/IdpUnavailableError";
import { UnauthorizedError } from "../errors/UnauthorizedError";
import {
  LocalIdentity,
  mapExternalSubjectToLocal,
} from "../libs/jwt/externalIdentity";
import { verifyExternalToken } from "../libs/jwt/externalVerifier";
import { Logger } from "../libs/loggers";

/** HTTP status returned when a token is not acceptable. */
export const HTTP_UNAUTHORIZED = 401;

/** HTTP status returned when a trusted issuer cannot be reached. */
export const HTTP_SERVICE_UNAVAILABLE = 503;

/**
 * Message returned for every rejected external token, regardless of which check
 * failed, so the response does not reveal whether a subject is enrolled.
 */
export const INVALID_TOKEN_MESSAGE = "Invalid or expired token";

/**
 * Message returned when the caller's token may well be valid but the issuer
 * could not be consulted.
 */
export const IDP_UNAVAILABLE_MESSAGE =
  "Identity provider temporarily unavailable";

/**
 * A verified external token together with the local records its subject maps
 * to.
 */
export interface ExternalAuthResult {
  /** The verified claim set. */
  claims: JWTPayload;
  /** The local identity the verified subject resolves to. */
  identity: LocalIdentity;
}

/**
 * Verifies an external token and resolves its subject to a local identity.
 *
 * Shared by the three auth middlewares so the verification and mapping steps
 * cannot drift apart between them; each middleware then applies its own
 * requirement (a `User`, or a `Participant`) to the result.
 *
 * @param token - The raw JWT, already routed to the external path.
 * @returns The verified claims and the resolved local identity.
 * @throws {UnauthorizedError} When the token or its subject is not acceptable.
 * @throws {IdpUnavailableError} When the issuer cannot be reached.
 */
export const authenticateExternalToken = async (
  token: string
): Promise<ExternalAuthResult> => {
  const claims = await verifyExternalToken(token);
  const identity = await mapExternalSubjectToLocal(claims);
  return { claims, identity };
};

/**
 * Translates a failure from {@link authenticateExternalToken} into a response.
 *
 * The specific reason is logged but never returned: the verifier's messages
 * name internal issuers, and distinguishing "valid token, unknown subject" from
 * "invalid token" would be an enrolment oracle. Anything that is neither an
 * authentication nor an availability failure is forwarded to the global error
 * handler rather than being reported as a bad credential.
 *
 * @param error - The caught error.
 * @param res - The Express response.
 * @param next - The Express next function, used for unexpected errors.
 * @param format - Builds the endpoint's response body from a message, so each
 *   middleware keeps the body shape its local path already uses.
 * @returns The Express response, or the result of `next` for unexpected errors.
 */
export const sendExternalAuthError = (
  error: unknown,
  res: Response,
  next: NextFunction,
  format: (message: string) => Record<string, unknown>
) => {
  if (error instanceof IdpUnavailableError) {
    Logger.error(`External authentication unavailable: ${error.message}`);
    return res
      .status(HTTP_SERVICE_UNAVAILABLE)
      .json(format(IDP_UNAVAILABLE_MESSAGE));
  }
  if (error instanceof UnauthorizedError) {
    Logger.error(`External authentication rejected: ${error.message}`);
    return res.status(HTTP_UNAUTHORIZED).json(format(INVALID_TOKEN_MESSAGE));
  }
  return next(error);
};
