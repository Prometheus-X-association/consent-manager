/**
 * Error representing a trusted external IDP that could not be reached or that
 * answered with something unusable — a network failure, a timeout, a non-2xx
 * response, or a discovery document that does not describe the issuer it was
 * fetched for.
 *
 * Kept distinct from {@link UnauthorizedError} on purpose: the caller's
 * credential may be perfectly valid, so answering `401` would tell them to
 * discard a good token and re-run a login flow that cannot currently succeed.
 * This maps to `503` instead.
 */
export class IdpUnavailableError extends Error {
  constructor(message?: string) {
    super(message ?? "Identity provider unavailable");
    this.name = "IdpUnavailableError";
  }

  jsonResponse() {
    return {
      code: 503,
      error: "identity provider unavailable",
      message: this.message,
    };
  }
}
