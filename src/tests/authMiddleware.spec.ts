import { expect } from "chai";
import sinon from "sinon";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import { verifyUserJWT, verifyParticipantJWT } from "../middleware/auth";
import { validateAccessToken } from "../middleware/oauth";
import * as externalIdentity from "../libs/jwt/externalIdentity";
import * as externalAuth from "../middleware/externalAuth";
import { UnauthorizedError } from "../errors/UnauthorizedError";
import { IdpUnavailableError } from "../errors/IdpUnavailableError";

const LOCAL_SECRET = "local-hmac-secret";
const EXTERNAL_USER_ID = "5f9d88b9c9d1c80017a1b2c3";
const EXTERNAL_PARTICIPANT_ID = "5f9d88b9c9d1c80017a1b2c4";
const EXTERNAL_SUBJECT = "did:example:abc";
const THREE_PART_TOKEN = "header.payload.signature";
const HTTP_UNAUTHORIZED = 401;
const HTTP_SERVICE_UNAVAILABLE = 503;

/**
 * Minimal mock of the Express response, capturing status code and JSON body.
 */
const mockResponse = () => {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = function (code: number) {
    res.statusCode = code;
    return res as Response;
  };
  res.json = function (payload: unknown) {
    res.body = payload;
    return res as Response;
  };
  return res as Response & { statusCode?: number; body?: unknown };
};

/**
 * Builds a mock request carrying a bearer token and an empty session.
 */
const bearerRequest = (token: string): Request => {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
  };
  return {
    headers,
    query: {},
    session: {},
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
};

/**
 * Routes the token externally and makes the shared external authentication
 * helper resolve to the given local identity.
 */
const stubExternalSuccess = (identity: externalIdentity.LocalIdentity) => {
  sinon.stub(externalIdentity, "resolveTokenRoute").returns("external");
  sinon.stub(externalAuth, "authenticateExternalToken").resolves({
    claims: { sub: EXTERNAL_SUBJECT },
    identity,
  });
};

/**
 * Routes the token externally and makes the shared external authentication
 * helper fail with the given error.
 */
const stubExternalFailure = (error: Error) => {
  sinon.stub(externalIdentity, "resolveTokenRoute").returns("external");
  sinon.stub(externalAuth, "authenticateExternalToken").rejects(error);
};

describe("Auth middleware external-token routing", () => {
  afterEach(() => {
    sinon.restore();
    delete process.env.OAUTH_SECRET_KEY;
  });

  describe("verifyUserJWT", () => {
    it("maps a verified external token to the local user", async () => {
      stubExternalSuccess({ user: { id: EXTERNAL_USER_ID } });

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await verifyUserJWT(req, res, next);

      expect(next.calledOnce).to.equal(true);
      expect(req.user?.id).to.equal(EXTERNAL_USER_ID);
    });

    it("returns 401 when the external subject is unknown", async () => {
      stubExternalFailure(new UnauthorizedError("unknown"));

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await verifyUserJWT(req, res, next);

      expect(next.called).to.equal(false);
      expect(res.statusCode).to.equal(HTTP_UNAUTHORIZED);
    });

    it("returns 503 when the issuer cannot be reached", async () => {
      stubExternalFailure(new IdpUnavailableError("discovery timed out"));

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await verifyUserJWT(req, res, next);

      expect(next.called).to.equal(false);
      expect(res.statusCode).to.equal(HTTP_SERVICE_UNAVAILABLE);
    });

    it("returns 401 when the token verifies but resolves to no user", async () => {
      stubExternalSuccess({ participant: { id: EXTERNAL_PARTICIPANT_ID } });

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await verifyUserJWT(req, res, next);

      expect(next.called).to.equal(false);
      expect(res.statusCode).to.equal(HTTP_UNAUTHORIZED);
    });

    it("does not fall back to the local HMAC path when external verification fails", async () => {
      // The token would satisfy the local verifier, so reaching it would turn a
      // rejected external token into a successful login.
      process.env.OAUTH_SECRET_KEY = LOCAL_SECRET;
      const localToken = jwt.sign({ sub: "local-user-id" }, LOCAL_SECRET);
      stubExternalFailure(new UnauthorizedError("bad signature"));

      const req = bearerRequest(localToken);
      const res = mockResponse();
      const next = sinon.spy();

      await verifyUserJWT(req, res, next);

      expect(next.called).to.equal(false);
      expect(req.user).to.equal(undefined);
      expect(res.statusCode).to.equal(HTTP_UNAUTHORIZED);
    });

    it("does not reveal why an external token was rejected", async () => {
      stubExternalFailure(
        new UnauthorizedError(
          "External token subject does not resolve to a known identity"
        )
      );

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await verifyUserJWT(req, res, next);

      expect(res.body).to.deep.equal({ message: "Invalid or expired token" });
    });

    it("leaves the local HMAC path unchanged for local tokens", async () => {
      sinon.stub(externalIdentity, "resolveTokenRoute").returns("local");
      process.env.OAUTH_SECRET_KEY = LOCAL_SECRET;
      const localToken = jwt.sign({ sub: "local-user-id" }, LOCAL_SECRET);

      const req = bearerRequest(localToken);
      const res = mockResponse();
      const next = sinon.spy();

      await verifyUserJWT(req, res, next);

      expect(next.calledOnce).to.equal(true);
      expect(req.user?.id).to.equal("local-user-id");
    });
  });

  describe("verifyParticipantJWT", () => {
    it("maps a verified external token to the local participant", async () => {
      stubExternalSuccess({ participant: { id: EXTERNAL_PARTICIPANT_ID } });

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await verifyParticipantJWT(req, res, next);

      expect(next.calledOnce).to.equal(true);
      expect(req.userParticipant?.id).to.equal(EXTERNAL_PARTICIPANT_ID);
    });

    it("does not cache the external identity in the session", async () => {
      stubExternalSuccess({ participant: { id: EXTERNAL_PARTICIPANT_ID } });

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await verifyParticipantJWT(req, res, next);

      // Caching would let the session outlive the token, so the issuer's expiry
      // and revocation would stop applying.
      expect(req.session.userParticipant).to.equal(undefined);
    });

    it("returns 401 when the external subject resolves to no participant", async () => {
      stubExternalSuccess({ user: { id: EXTERNAL_USER_ID } });

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await verifyParticipantJWT(req, res, next);

      expect(next.called).to.equal(false);
      expect(res.statusCode).to.equal(HTTP_UNAUTHORIZED);
    });

    it("returns 503 when the issuer cannot be reached", async () => {
      stubExternalFailure(new IdpUnavailableError("discovery timed out"));

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await verifyParticipantJWT(req, res, next);

      expect(res.statusCode).to.equal(HTTP_SERVICE_UNAVAILABLE);
    });
  });

  describe("validateAccessToken", () => {
    it("maps a verified external token to the local user", async () => {
      stubExternalSuccess({ user: { id: EXTERNAL_USER_ID } });

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await validateAccessToken(req, res, next);

      expect(next.calledOnce).to.equal(true);
      expect((req.user as { id: string })?.id).to.equal(EXTERNAL_USER_ID);
    });

    it("returns 401 when the external subject is unknown", async () => {
      stubExternalFailure(new UnauthorizedError("unknown"));

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await validateAccessToken(req, res, next);

      expect(next.called).to.equal(false);
      expect(res.statusCode).to.equal(HTTP_UNAUTHORIZED);
    });

    it("does not fall back to the local HMAC path when external verification fails", async () => {
      process.env.OAUTH_SECRET_KEY = LOCAL_SECRET;
      const localToken = jwt.sign({ sub: "local-user-id" }, LOCAL_SECRET);
      stubExternalFailure(new UnauthorizedError("bad signature"));

      const req = bearerRequest(localToken);
      const res = mockResponse();
      const next = sinon.spy();

      await validateAccessToken(req, res, next);

      expect(next.called).to.equal(false);
      expect(res.statusCode).to.equal(HTTP_UNAUTHORIZED);
    });

    it("leaves the local HMAC path unchanged for local tokens", async () => {
      sinon.stub(externalIdentity, "resolveTokenRoute").returns("local");
      process.env.OAUTH_SECRET_KEY = LOCAL_SECRET;
      const localToken = jwt.sign({ sub: "local-user-id" }, LOCAL_SECRET);

      const req = bearerRequest(localToken);
      const res = mockResponse();
      const next = sinon.spy();

      await validateAccessToken(req, res, next);

      expect(next.calledOnce).to.equal(true);
      expect((req.user as unknown as { sub: string })?.sub).to.equal(
        "local-user-id"
      );
    });
  });
});
