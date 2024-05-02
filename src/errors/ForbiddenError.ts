export class ForbiddenError extends Error {
  jsonResponse() {
    return {
      code: 403,
      error: "forbidden action",
      message: this.message,
    };
  }
}
