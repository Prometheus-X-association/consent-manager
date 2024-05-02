export class NotFoundError extends Error {
  jsonResponse() {
    return {
      code: 404,
      error: "resource not found",
      message: this.message,
    };
  }
}
