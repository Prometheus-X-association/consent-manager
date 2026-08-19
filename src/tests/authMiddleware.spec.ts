import { expect } from "chai";
import sinon from "sinon";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import { verifyUserJWT, verifyParticipantJWT } from "../middleware/auth";
import { validateAccessToken } from "../middleware/oauth";
import * as externalIdentity from "../libs/jwt/externalIdentity";
import * as externalVerifier from "../libs/jwt/externalVerifier";
import { UnauthorizedError } from "../errors/UnauthorizedError";

const LOCAL_SECRET = "local-hmac-secret";
const EXTERNAL_USER_ID = "5f9d88b9c9d1c80017a1b2c3";
const EXTERNAL_PARTICIPANT_ID = "5f9d88b9c9d1c80017a1b2c4";
const EXTERNAL_SUBJECT = "did:example:abc";
const THREE_PART_TOKEN = "header.payload.signature";

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

describe("Auth middleware external-token routing", () => {
  afterEach(() => {
    sinon.restore();
    delete process.env.OAUTH_SECRET_KEY;
  });

  describe("verifyUserJWT", () => {
    it("maps a verified external token to the local user", async () => {
      sinon.stub(externalIdentity, "resolveTokenRoute").returns("external");
      sinon
        .stub(externalVerifier, "verifyExternalToken")
        .resolves({ sub: EXTERNAL_SUBJECT });
      sinon
        .stub(externalIdentity, "mapExternalSubjectToLocal")
        .resolves({ user: { id: EXTERNAL_USER_ID } });

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await verifyUserJWT(req, res, next);

      expect(next.calledOnce).to.equal(true);
      expect(req.user?.id).to.equal(EXTERNAL_USER_ID);
    });

    it("returns 401 when the external subject is unknown", async () => {
      sinon.stub(externalIdentity, "resolveTokenRoute").returns("external");
      sinon
        .stub(externalVerifier, "verifyExternalToken")
        .resolves({ sub: EXTERNAL_SUBJECT });
      sinon
        .stub(externalIdentity, "mapExternalSubjectToLocal")
        .rejects(new UnauthorizedError("unknown"));

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await verifyUserJWT(req, res, next);

      expect(next.called).to.equal(false);
      expect(res.statusCode).to.equal(401);
    });

    it("returns 401 when the token verifies but resolves to no user", async () => {
      sinon.stub(externalIdentity, "resolveTokenRoute").returns("external");
      sinon
        .stub(externalVerifier, "verifyExternalToken")
        .resolves({ sub: EXTERNAL_SUBJECT });
      sinon
        .stub(externalIdentity, "mapExternalSubjectToLocal")
        .resolves({ participant: { id: EXTERNAL_PARTICIPANT_ID } });

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await verifyUserJWT(req, res, next);

      expect(next.called).to.equal(false);
      expect(res.statusCode).to.equal(401);
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
      sinon.stub(externalIdentity, "resolveTokenRoute").returns("external");
      sinon
        .stub(externalVerifier, "verifyExternalToken")
        .resolves({ sub: EXTERNAL_SUBJECT });
      sinon
        .stub(externalIdentity, "mapExternalSubjectToLocal")
        .resolves({ participant: { id: EXTERNAL_PARTICIPANT_ID } });

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await verifyParticipantJWT(req, res, next);

      expect(next.calledOnce).to.equal(true);
      expect(req.userParticipant?.id).to.equal(EXTERNAL_PARTICIPANT_ID);
    });

    it("returns 401 when the external subject resolves to no participant", async () => {
      sinon.stub(externalIdentity, "resolveTokenRoute").returns("external");
      sinon
        .stub(externalVerifier, "verifyExternalToken")
        .resolves({ sub: EXTERNAL_SUBJECT });
      sinon
        .stub(externalIdentity, "mapExternalSubjectToLocal")
        .resolves({ user: { id: EXTERNAL_USER_ID } });

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await verifyParticipantJWT(req, res, next);

      expect(next.called).to.equal(false);
      expect(res.statusCode).to.equal(401);
    });
  });

  describe("validateAccessToken", () => {
    it("maps a verified external token to the local user", async () => {
      sinon.stub(externalIdentity, "resolveTokenRoute").returns("external");
      sinon
        .stub(externalVerifier, "verifyExternalToken")
        .resolves({ sub: EXTERNAL_SUBJECT });
      sinon
        .stub(externalIdentity, "mapExternalSubjectToLocal")
        .resolves({ user: { id: EXTERNAL_USER_ID } });

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await validateAccessToken(req, res, next);

      expect(next.calledOnce).to.equal(true);
      expect((req.user as { id: string })?.id).to.equal(EXTERNAL_USER_ID);
    });

    it("returns 401 when the external subject is unknown", async () => {
      sinon.stub(externalIdentity, "resolveTokenRoute").returns("external");
      sinon
        .stub(externalVerifier, "verifyExternalToken")
        .resolves({ sub: EXTERNAL_SUBJECT });
      sinon
        .stub(externalIdentity, "mapExternalSubjectToLocal")
        .rejects(new UnauthorizedError("unknown"));

      const req = bearerRequest(THREE_PART_TOKEN);
      const res = mockResponse();
      const next = sinon.spy();

      await validateAccessToken(req, res, next);

      expect(next.called).to.equal(false);
      expect(res.statusCode).to.equal(401);
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
