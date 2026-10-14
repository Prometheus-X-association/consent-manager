import { expect } from "chai";
import supertest from "supertest";
import { Application } from "express";
import { startServer } from "../server";
import { IncomingMessage, ServerResponse } from "http";
import * as http from "http";
import * as crypto from "crypto";
import mongoose from "mongoose";
import { testUser1, testUser2, testProvider1 } from "./fixtures/testAccount";

/**
 * Guardianship feature tests — v2 (guardian field on User, no GuardianRelationship).
 *
 * Covers:
 *  - POST /users/register with legalGuardian → 202 + PendingGuardianship created
 *  - POST /users/register with invalid legalGuardian → 400
 *  - GET  /guardianship/validate/:token (public) → email or 400
 *  - POST /guardianship/validate/:token (authenticated parent) → 200, 403
 *  - listChildren / getChild
 *  - removeGuardianship (block while managed, allow after completion)
 *  - auth guards (non-guardian cannot access child routes)
 *  - account completion flow: inviteChildCompletion → validateClaimToken → completeChildAccount
 *  - login guards: managed accounts are refused (403)
 *  - listMyGuardians / removeMyGuardian (autonomous child)
 */

const GUARDIANSHIP_PREFIX = "/v1/guardianship";

const hashToken = (raw: string) =>
  crypto.createHash("sha256").update(raw).digest("hex");

describe("Guardianship Routes Tests", function () {
  let serverInstance: {
    app: Application;
    server: http.Server<typeof IncomingMessage, typeof ServerResponse>;
  };

  // Parent A
  let parentAJwt: string;
  let parentAId: string;
  // Parent B (second autonomous user — should not access Parent A's children)
  let parentBJwt: string;

  let childId: string;
  const childEmail = "child.one@guardianship.test";

  // Participant + JWT (for /users/register tests)
  let participantJwt: string;
  let participantId: string;

  before(async () => {
    try {
      await mongoose.connect(process.env.MONGO_URI_TEST);
      await mongoose.connection.dropDatabase();
    } catch (err) {
      console.error("MongoDB connection error:", err);
      throw err;
    }

    serverInstance = await startServer(9093);

    // Ensure PDI_ENDPOINT is set for email URL generation
    process.env.PDI_ENDPOINT =
      process.env.PDI_ENDPOINT || "http://localhost:3000";

    // Sign up parent A
    await supertest(serverInstance.app)
      .post("/v1/users/signup")
      .send({ ...testUser1, email: "parent.a@guardianship.test" });

    const loginA = await supertest(serverInstance.app)
      .post("/v1/users/login")
      .send({
        email: "parent.a@guardianship.test",
        password: testUser1.password,
      });
    parentAJwt = `Bearer ${loginA.body.accessToken}`;
    parentAId = loginA.body._id ?? loginA.body.user?._id ?? loginA.body.id;

    // Resolve parentAId from DB if not in login response
    if (!parentAId) {
      const User = mongoose.model("User");
      const u = await User.findOne({
        email: "parent.a@guardianship.test",
      }).select("_id");
      parentAId = (u as any)._id.toString();
    }

    // Sign up parent B
    await supertest(serverInstance.app)
      .post("/v1/users/signup")
      .send({ ...testUser2, email: "parent.b@guardianship.test" });

    const loginB = await supertest(serverInstance.app)
      .post("/v1/users/login")
      .send({
        email: "parent.b@guardianship.test",
        password: testUser2.password,
      });
    parentBJwt = `Bearer ${loginB.body.accessToken}`;

    // Register a participant (acts as the connector)
    const regRes = await supertest(serverInstance.app)
      .post("/v1/participants")
      .send(testProvider1);
    participantId = regRes.body._id ?? regRes.body.id;

    const partLogin = await supertest(serverInstance.app)
      .post("/v1/participants/login")
      .send({
        clientID: testProvider1.clientID,
        clientSecret: testProvider1.clientSecret,
      });
    participantJwt = `Bearer ${
      partLogin.body.token ?? partLogin.body.accessToken
    }`;

    // Inject child directly into DB (creating child via connector flow, not API)
    const User = mongoose.model("User");
    const child = await (User as any).create({
      firstName: "Alice",
      lastName: "Smith",
      email: childEmail,
      guardian: new mongoose.Types.ObjectId(parentAId),
      schema_version: "v0.1.0",
    });
    childId = child._id.toString();
  });

  after(async () => {
    serverInstance.server.close();
    await mongoose.connection.close();
  });

  // ---------------------------------------------------------------------------
  // POST /v1/users/register with legalGuardian — new connector flow
  // ---------------------------------------------------------------------------
  describe("POST /v1/users/register with legalGuardian", () => {
    it("should return 202 and create a PendingGuardianship when legalGuardian is valid", async () => {
      const res = await supertest(serverInstance.app)
        .post("/v1/users/register")
        .set("Authorization", participantJwt)
        .send({
          email: "new-child@guardianship.test",
          identifier: "new-child-001",
          url: "http://connector.test/users/new-child-001",
          legalGuardian: parentAId,
          callbackUrl: "http://connector.test/webhook/user-identifier",
        })
        .expect(202);

      expect(res.body).to.have.property("status", "pending");

      // PendingGuardianship must exist in DB
      const PendingGuardianship = mongoose.model("PendingGuardianship");
      const pending = await PendingGuardianship.findOne({
        email: "new-child@guardianship.test",
      });
      expect(pending).to.not.be.null;
      expect(pending).to.have.property(
        "callbackUrl",
        "http://connector.test/webhook/user-identifier"
      );
    });

    it("should return 400 when legalGuardian is not a valid ObjectId", async () => {
      await supertest(serverInstance.app)
        .post("/v1/users/register")
        .set("Authorization", participantJwt)
        .send({
          email: "another-child@guardianship.test",
          identifier: "another-001",
          legalGuardian: "not-an-objectid",
          callbackUrl: "http://connector.test/webhook/user-identifier",
        })
        .expect(400);
    });

    it("should return 400 when legalGuardian references a non-existent user", async () => {
      await supertest(serverInstance.app)
        .post("/v1/users/register")
        .set("Authorization", participantJwt)
        .send({
          email: "yet-another@guardianship.test",
          identifier: "yet-001",
          legalGuardian: new mongoose.Types.ObjectId().toString(),
          callbackUrl: "http://connector.test/webhook/user-identifier",
        })
        .expect(400);
    });

    it("should return 400 when legalGuardian is present but callbackUrl is missing", async () => {
      await supertest(serverInstance.app)
        .post("/v1/users/register")
        .set("Authorization", participantJwt)
        .send({
          email: "missing-callback@guardianship.test",
          identifier: "missing-001",
          legalGuardian: parentAId,
        })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /guardianship/validate/:token (public)
  // ---------------------------------------------------------------------------
  describe("GET /guardianship/validate/:token", () => {
    let rawToken: string;

    before(async () => {
      // Manually insert a PendingGuardianship for these tests
      rawToken = crypto.randomBytes(32).toString("hex");
      const PendingGuardianship = mongoose.model("PendingGuardianship");
      await (PendingGuardianship as any).create({
        participantId: new mongoose.Types.ObjectId(participantId),
        email: "validate-test-child@guardianship.test",
        identifier: "validate-child-001",
        parentId: new mongoose.Types.ObjectId(parentAId),
        callbackUrl: "http://connector.test/webhook/user-identifier",
        token: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
    });

    it("should return email for a valid token", async () => {
      const res = await supertest(serverInstance.app)
        .get(`${GUARDIANSHIP_PREFIX}/validate/${rawToken}`)
        .expect(200);

      expect(res.body).to.have.property(
        "email",
        "validate-test-child@guardianship.test"
      );
      expect(res.body).to.have.property("parentId");
    });

    it("should return 400 for an invalid token", async () => {
      await supertest(serverInstance.app)
        .get(`${GUARDIANSHIP_PREFIX}/validate/not-a-real-token-xyz`)
        .expect(400);
    });

    it("should return 400 for an expired token", async () => {
      const expiredRaw = crypto.randomBytes(32).toString("hex");
      const PendingGuardianship = mongoose.model("PendingGuardianship");
      await (PendingGuardianship as any).create({
        participantId: new mongoose.Types.ObjectId(participantId),
        email: "expired@guardianship.test",
        parentId: new mongoose.Types.ObjectId(parentAId),
        callbackUrl: "http://connector.test/webhook/user-identifier",
        token: hashToken(expiredRaw),
        expiresAt: new Date(Date.now() - 1000), // already expired
      });

      await supertest(serverInstance.app)
        .get(`${GUARDIANSHIP_PREFIX}/validate/${expiredRaw}`)
        .expect(400);
    });

    // ---------------------------------------------------------------------------
    // POST /guardianship/validate/:token (authenticated parent)
    // ---------------------------------------------------------------------------
    describe("POST /guardianship/validate/:token", () => {
      let confirmRawToken: string;

      before(async () => {
        confirmRawToken = crypto.randomBytes(32).toString("hex");
        const PendingGuardianship = mongoose.model("PendingGuardianship");
        await (PendingGuardianship as any).create({
          participantId: new mongoose.Types.ObjectId(participantId),
          email: "confirm-child@guardianship.test",
          identifier: "confirm-child-001",
          url: "http://connector.test/users/confirm-child-001",
          parentId: new mongoose.Types.ObjectId(parentAId),
          callbackUrl: "http://connector.test/webhook/user-identifier",
          token: hashToken(confirmRawToken),
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        });
      });

      it("should return 403 when a different parent tries to confirm", async () => {
        await supertest(serverInstance.app)
          .post(`${GUARDIANSHIP_PREFIX}/validate/${confirmRawToken}`)
          .set("Authorization", parentBJwt)
          .expect(403);
      });

      it("should return 200 and create UserIdentifier + child User for the correct parent", async () => {
        const res = await supertest(serverInstance.app)
          .post(`${GUARDIANSHIP_PREFIX}/validate/${confirmRawToken}`)
          .set("Authorization", parentAJwt)
          .expect(200);

        expect(res.body).to.have.property("message");

        // Child User must exist in DB with guardian = parentAId
        const User = mongoose.model("User");
        const newChild = await User.findOne({
          email: "confirm-child@guardianship.test",
        });
        expect(newChild).to.not.be.null;
        expect(newChild?.guardian?.toString()).to.equal(parentAId);

        // UserIdentifier must exist and be linked to the child
        const UserIdentifier = mongoose.model("UserIdentifier");
        const uid = await UserIdentifier.findOne({
          email: "confirm-child@guardianship.test",
        });
        expect(uid).to.not.be.null;
        expect(uid?.user?.toString()).to.equal(newChild?._id.toString());

        // PendingGuardianship must be cleaned up
        const PendingGuardianship = mongoose.model("PendingGuardianship");
        const removed = await PendingGuardianship.findOne({
          token: hashToken(confirmRawToken),
        });
        expect(removed).to.be.null;
      });

      it("should return 400 for an invalid token", async () => {
        await supertest(serverInstance.app)
          .post(`${GUARDIANSHIP_PREFIX}/validate/not-a-real-token-xyz`)
          .set("Authorization", parentAJwt)
          .expect(400);
      });

      it("should require authentication", async () => {
        await supertest(serverInstance.app)
          .post(`${GUARDIANSHIP_PREFIX}/validate/${confirmRawToken}`)
          .expect(401);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // listChildren / getChild
  // ---------------------------------------------------------------------------
  describe("GET /children", () => {
    it("should list the children of the authenticated guardian", async () => {
      const res = await supertest(serverInstance.app)
        .get(`${GUARDIANSHIP_PREFIX}/children`)
        .set("Authorization", parentAJwt)
        .expect(200);

      expect(res.body).to.have.property("children").that.is.an("array");
      expect(res.body.children).to.have.length.greaterThan(0);
      const ids = res.body.children.map((c: any) => c._id);
      expect(ids).to.include(childId);
    });

    it("should return an empty list for a user with no children", async () => {
      const res = await supertest(serverInstance.app)
        .get(`${GUARDIANSHIP_PREFIX}/children`)
        .set("Authorization", parentBJwt)
        .expect(200);

      expect(res.body.children).to.be.an("array").that.is.empty;
    });
  });

  describe("GET /children/:childId", () => {
    it("should return the child for the correct guardian", async () => {
      const res = await supertest(serverInstance.app)
        .get(`${GUARDIANSHIP_PREFIX}/children/${childId}`)
        .set("Authorization", parentAJwt)
        .expect(200);

      expect(res.body).to.have.property("_id", childId);
    });

    it("should deny access to a non-guardian", async () => {
      await supertest(serverInstance.app)
        .get(`${GUARDIANSHIP_PREFIX}/children/${childId}`)
        .set("Authorization", parentBJwt)
        .expect(403);
    });

    it("should return 403 for a non-existent child", async () => {
      await supertest(serverInstance.app)
        .get(`${GUARDIANSHIP_PREFIX}/children/000000000000000000000001`)
        .set("Authorization", parentAJwt)
        .expect(403); // middleware returns 403 (no guardian field match) before 404
    });
  });

  // ---------------------------------------------------------------------------
  // removeGuardianship — block while managed
  // ---------------------------------------------------------------------------
  describe("DELETE /children/:childId", () => {
    it("should block removal while the account is still managed", async () => {
      const res = await supertest(serverInstance.app)
        .delete(`${GUARDIANSHIP_PREFIX}/children/${childId}`)
        .set("Authorization", parentAJwt)
        .expect(409);

      expect(res.body).to.have.property("message").that.includes("managed");
    });
  });

  // ---------------------------------------------------------------------------
  // Child consent list (empty at this stage)
  // ---------------------------------------------------------------------------
  describe("GET /children/:childId/consents", () => {
    it("should return an empty consent list", async () => {
      const res = await supertest(serverInstance.app)
        .get(`${GUARDIANSHIP_PREFIX}/children/${childId}/consents`)
        .set("Authorization", parentAJwt)
        .expect(200);

      expect(res.body).to.have.property("consents").that.is.an("array");
      expect(res.body.consents).to.be.empty;
    });

    it("should block a non-guardian from accessing child consents", async () => {
      await supertest(serverInstance.app)
        .get(`${GUARDIANSHIP_PREFIX}/children/${childId}/consents`)
        .set("Authorization", parentBJwt)
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Account completion flow
  // ---------------------------------------------------------------------------
  describe("Account completion flow", () => {
    it("should block login for a managed account", async () => {
      const res = await supertest(serverInstance.app)
        .post("/v1/users/login")
        .send({ email: childEmail, password: "any" })
        .expect(403);

      expect(res.body).to.have.property("message");
    });

    it("POST /children/:childId/invite — should send an invitation", async () => {
      const res = await supertest(serverInstance.app)
        .post(`${GUARDIANSHIP_PREFIX}/children/${childId}/invite`)
        .set("Authorization", parentAJwt)
        .expect(200);

      expect(res.body).to.have.property("message", "Invitation sent");
    });

    it("GET /claim/:token — should reject an invalid token", async () => {
      const res = await supertest(serverInstance.app)
        .get(`${GUARDIANSHIP_PREFIX}/claim/not-a-real-token`)
        .expect(400);

      expect(res.body).to.have.property("message");
    });

    it("GET /claim/:token — should confirm the claimToken field is set in DB", async () => {
      const User = mongoose.model("User");
      const child = await User.findById(childId).select("+claimToken");
      expect((child as any)?.claimToken).to.exist;
    });

    it("POST /claim/:token — should reject an invalid token", async () => {
      const res = await supertest(serverInstance.app)
        .post(`${GUARDIANSHIP_PREFIX}/claim/not-a-real-token`)
        .send({ password: "NewPass123!" })
        .expect(400);

      expect(res.body).to.have.property("message");
    });

    it("POST /claim/:token — should complete the account with a valid token", async () => {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashed = hashToken(rawToken);

      const User = mongoose.model("User");
      await User.findByIdAndUpdate(childId, {
        claimToken: hashed,
        claimTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      const res = await supertest(serverInstance.app)
        .post(`${GUARDIANSHIP_PREFIX}/claim/${rawToken}`)
        .send({ password: "NewPass123!" })
        .expect(200);

      expect(res.body).to.have.property("message", "Account activated");
    });

    it("child should now be able to log in after completion", async () => {
      const res = await supertest(serverInstance.app)
        .post("/v1/users/login")
        .send({ email: childEmail, password: "NewPass123!" })
        .expect(200);

      expect(res.body).to.have.property("accessToken");
    });
  });

  // ---------------------------------------------------------------------------
  // Post-completion: removeGuardianship should now succeed
  // ---------------------------------------------------------------------------
  describe("DELETE /children/:childId (after completion)", () => {
    it("should allow removal once the account is autonomous", async () => {
      const res = await supertest(serverInstance.app)
        .delete(`${GUARDIANSHIP_PREFIX}/children/${childId}`)
        .set("Authorization", parentAJwt)
        .expect(200);

      expect(res.body).to.have.property("message", "Guardianship removed");
    });

    it("should no longer list the child after removal", async () => {
      const res = await supertest(serverInstance.app)
        .get(`${GUARDIANSHIP_PREFIX}/children`)
        .set("Authorization", parentAJwt)
        .expect(200);

      const ids = res.body.children.map((c: any) => c._id);
      expect(ids).to.not.include(childId);
    });
  });

  // ---------------------------------------------------------------------------
  // Autonomous user: listMyGuardians / removeMyGuardian
  // ---------------------------------------------------------------------------
  describe("Autonomous child guardian management", () => {
    let autonomousChildJwt: string;
    let autonomousChildId: string;
    const autonomousChildEmail = "autonomous.child@guardianship.test";

    before(async () => {
      // Inject child directly (connector flow) then complete the account
      const User = mongoose.model("User");
      const autonomousChild = await (User as any).create({
        firstName: "Bob",
        lastName: "Auto",
        email: autonomousChildEmail,
        guardian: new mongoose.Types.ObjectId(parentAId),
        schema_version: "v0.1.0",
      });
      autonomousChildId = autonomousChild._id.toString();

      // Complete the account via claim token
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashed = hashToken(rawToken);
      await User.findByIdAndUpdate(autonomousChildId, {
        claimToken: hashed,
        claimTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      await supertest(serverInstance.app)
        .post(`${GUARDIANSHIP_PREFIX}/claim/${rawToken}`)
        .send({ password: "ChildPass456!" })
        .expect(200);

      const loginRes = await supertest(serverInstance.app)
        .post("/v1/users/login")
        .send({ email: autonomousChildEmail, password: "ChildPass456!" })
        .expect(200);

      autonomousChildJwt = `Bearer ${loginRes.body.accessToken}`;
    });

    it("GET /guardians — autonomous child sees their guardian", async () => {
      const res = await supertest(serverInstance.app)
        .get(`${GUARDIANSHIP_PREFIX}/guardians`)
        .set("Authorization", autonomousChildJwt)
        .expect(200);

      expect(res.body).to.have.property("guardians").that.is.an("array");
      expect(res.body.guardians).to.have.length(1);
    });

    it("DELETE /guardians/:parentId — autonomous child can remove their guardian", async () => {
      const guardiansRes = await supertest(serverInstance.app)
        .get(`${GUARDIANSHIP_PREFIX}/guardians`)
        .set("Authorization", autonomousChildJwt)
        .expect(200);

      const parentId = guardiansRes.body.guardians[0]._id;

      const res = await supertest(serverInstance.app)
        .delete(`${GUARDIANSHIP_PREFIX}/guardians/${parentId}`)
        .set("Authorization", autonomousChildJwt)
        .expect(200);

      expect(res.body).to.have.property("message", "Guardian removed");
    });

    it("GET /guardians — no guardians after removal", async () => {
      const res = await supertest(serverInstance.app)
        .get(`${GUARDIANSHIP_PREFIX}/guardians`)
        .set("Authorization", autonomousChildJwt)
        .expect(200);

      expect(res.body.guardians).to.be.empty;
    });
  });
});
