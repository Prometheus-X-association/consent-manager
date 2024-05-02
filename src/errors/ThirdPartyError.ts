export class ThirdPartyError extends Error {
  jsonResponse() {
    return {
      code: 400,
      error: "Third party service failed to provide results",
      message: this.message,
    };
  }
}
