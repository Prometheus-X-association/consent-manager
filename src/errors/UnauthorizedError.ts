/**
 * Error representing a failed authentication / authorization attempt, mapped to
 * an HTTP `401` response. Used by the external IDP JWT verifier and the identity
 * mapping helper so callers can distinguish an unverifiable/unknown token from
 * other failures.
 */
export class UnauthorizedError extends Error {
  constructor(message?: string) {
    super(message ?? "Unauthorized");
  }

  jsonResponse() {
    return {
      code: 401,
      error: "unauthorized",
      message: this.message,
    };
  }
}
