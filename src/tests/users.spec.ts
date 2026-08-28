import { expect } from "chai";
import supertest from "supertest";
import { Application } from "express";
import { startServer } from "../server";
import { IncomingMessage, ServerResponse } from "http";
import * as http from "http";
import {
  testParticipant2,
  testParticipant3,
  testUser1,
  testUser2,
} from "./fixtures/testAccount";
import mongoose from "mongoose";

describe("Users Routes Tests", () => {
  let serverInstance: {
    app: Application;
    server: http.Server<typeof IncomingMessage, typeof ServerResponse>;
  };
  let participantJWT: string;
  let participantUserIdentifierId: string;
  let secondParticipantJWT: string;
  let secondParticipantUserIdentifierId: string;
  let userId: string;

  before(async () => {
    serverInstance = await startServer(9090);

    process.env.X_CATALOG_CONSENT_KEY = "test-consent-key";

    try {
      await mongoose.connect(process.env.MONGO_URI_TEST);
      await mongoose.connection.dropDatabase();
    } catch (error) {
      console.error("Error connecting to MongoDB:", error);
      throw error;
    }

    //create new participant
    const participantData = testParticipant3;
    const secondParticipantData = testParticipant2;

    const user1 = testUser1;

    await supertest(serverInstance.app)
      .post(`/v1/participants`)
      .send(participantData);

    await supertest(serverInstance.app)
      .post(`/v1/participants`)
      .send(secondParticipantData);
    //login the participant
    const authResponse = await supertest(serverInstance.app)
      .post(`/v1/participants/login`)
      .send({
        clientID: testParticipant3.clientID,
        clientSecret: testParticipant3.clientSecret,
      });
    participantJWT = `Bearer ${authResponse.body.jwt}`;

    const authResponseSecondParticipant = await supertest(serverInstance.app)
      .post(`/v1/participants/login`)
      .send({
        clientID: testParticipant2.clientID,
        clientSecret: testParticipant2.clientSecret,
      });
    secondParticipantJWT = `Bearer ${authResponseSecondParticipant.body.jwt}`;

    //create a user
    //login the participant
    const firstUserSignup = await supertest(serverInstance.app)
      .post(`/v1/users/signup`)
      .send(user1);

    userId = firstUserSignup.body.user._id;

    //create user identifier for the two participants
    const participantUserIdentifierResponse = await supertest(
      serverInstance.app
    )
      .post(`/v1/users/register`)
      .set("Authorization", participantJWT)
      .send({
        email: testUser1.email,
        identifier: "newidentifier",
      });
    participantUserIdentifierId = participantUserIdentifierResponse.body._id;

    const secondParticipantUserIdentifierResponse = await supertest(
      serverInstance.app
    )
      .post(`/v1/users/register`)
      .set("Authorization", secondParticipantJWT)
      .send({
        email: testUser1.email,
        identifier: "newidentifier",
      });
    secondParticipantUserIdentifierId =
      secondParticipantUserIdentifierResponse.body._id;
  });

  after(async () => {
    serverInstance.server.close();
  });
  describe("signup", () => {
    it("should create a new user", async () => {
      const userData = testUser2;
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/signup`)
        .send(userData);
      userId = response.body.user._id;
      expect(response.status).to.be.equal(200);
      expect(response.body).to.have.property("user");
      expect(response.body.user).to.have.property("firstName", "John");
      expect(response.body.user).to.have.property("lastName", "Doe");
      expect(response.body.user).to.have.property("email", "john@example.com");
      expect(response.body).to.have.property("accessToken");
      expect(response.body).to.have.property("refreshToken");
    });
  });

  describe("login user", () => {
    it("should login an existing user", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/login`)
        .send({
          email: testUser2.email,
          password: testUser2.password,
        })
        .expect(200);
      expect(response.body).to.have.property("user");
      expect(response.body.user).to.have.property("firstName", "John");
      expect(response.body.user).to.have.property("lastName", "Doe");
      expect(response.body.user).to.have.property("email", "john@example.com");
      expect(response.body).to.have.property("accessToken");
      expect(response.body).to.have.property("refreshToken");
    });

    it("should fail to login with invalid credentials", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/login`)
        .send({
          email: "john@example.com",
          password: "wrongpassword",
        })
        .expect(400);
      expect(response.body).to.have.property("message", "invalid credentials");
    });

    it("should fail to login with non-existing user", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/login`)
        .send({
          email: "nonexisting@example.com",
          password: "password",
        })
        .expect(404);
      expect(response.body).to.have.property("message", "User not found");
    });
  });

  describe("getUserById", () => {
    it("should get user by ID", async () => {
      const response = await supertest(serverInstance.app)
        .get(`/v1/users/${userId}`)
        .expect(200);
      expect(response.body).to.not.be.empty;
      // Assert other properties if needed
    });

    it("should fail to get non-existing user", async () => {
      const response = await supertest(serverInstance.app)
        .get(`/v1/users/65eed1cd59f9242b784f2494`)
        .expect(404);
      expect(response.body).to.have.property("message", "User not found");
    });
  });

  describe("registerUserIdentifier", () => {
    it("should register a new user identifier", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/register`)
        .set("Authorization", participantJWT)
        .send({
          email: "newuser@example.com",
          identifier: "newidentifier",
        })
        .expect(200);
      expect(response.body).to.not.be.empty;
    });

    it("should fail to register existing user identifier", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/register`)
        .set("Authorization", participantJWT)
        .send({
          email: "newuser@example.com",
          identifier: "newidentifier",
        })
        .expect(409);
      expect(response.body).to.have.property("error", "User already exists");
    });

    it("should fail to register user identifier with missing fields", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/register`)
        .set("Authorization", participantJWT)
        .send({})
        .expect(400);
      expect(response).to.throws;
      expect(response.body).to.have.property("errors");
    });

    it("should fail to register user without email and identifier", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/register`)
        .set("Authorization", participantJWT)
        .send({
          users: [{}],
        })
        .expect(400);
      expect(response.body).to.have.property("errors");
      expect(response.body.errors[0]).to.deep.include({
        field: "email",
        message: "Email must exist if identifier does not",
      });
      expect(response.body.errors[1]).to.deep.include({
        field: "identifier",
        message: "identifier must exist if email does not",
      });
    });

    // it("should fail to register user identifier with invalid email format", async () => {
    //   const response = await supertest(serverInstance.app)
    //     .post(`/v1/users/register`)
    //     .set("Authorization", participantJWT)
    //     .send({
    //       email: "invalid-email",
    //       identifier: "newidentifier",
    //     })
    //     .expect(400);
    //   expect(response).to.throws;
    //   expect(response.body).to.have.property("error", "Invalid email format");
    // });
  });

  describe("registerUserIdentifiers", () => {
    it("should register new user identifiers from CSV", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/registers`)
        .set("Authorization", participantJWT)
        .send({
          users: [
            { email: "user1@example.com", internalID: "id1" },
            { email: "user2@example.com", internalID: "id2" },
          ],
        })
        .expect(200);
      expect(response.body).to.not.be.empty;
      // Assert other properties if needed
    });

    it("should not register existing user identifiers", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/registers`)
        .set("Authorization", participantJWT)
        .send({
          users: [
            { email: "user1@example.com", internalID: "id1" },
            { email: "user2@example.com", internalID: "id2" },
          ],
        });
      expect(response.status).to.equal(200);
      expect(response.body).to.be.an("array").that.is.empty;
    });

    it("should fail to register user identifiers with missing fields", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/register`)
        .set("Authorization", participantJWT)
        .send({})
        .expect(400);
      expect(response).to.throws;
      expect(response.body).to.have.property(
        "error",
        "Missing or invalid fields"
      );
      expect(response.body).to.have.property("errors").that.is.an("array");
      expect(response.body.errors).to.deep.include({
        field: "email",
        message: "Email must exist if identifier does not",
      });
      expect(response.body.errors).to.deep.include({
        field: "identifier",
        message: "identifier must exist if email does not",
      });
    });
    it("should fail to register user without email and identifier", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/registers`)
        .set("Authorization", participantJWT)
        .send({
          users: [{}],
        })
        .expect(400);
      expect(response.body).to.have.property("errors");
      expect(response.body.errors[0]).to.deep.include({
        field: "email",
        message: "Email must exist if identifier does not",
      });
      expect(response.body.errors[1]).to.deep.include({
        field: "identifier",
        message: "identifier must exist if email does not",
      });
    });
  });

  describe("search user identifier and user by email", () => {
    it("should get a all to false", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/identifier/search`)
        .set("x-catalog-consent-key", "test-consent-key")
        .send({
          email: testUser1.email,
          selfDescription: "test",
        })
        .expect(200);
      expect(response.body).to.not.be.empty;
      expect(response.body).to.have.property("participantExists", false);
      expect(response.body).to.have.property("userIdentifierExists", false);
      expect(response.body).to.have.property("userIdentifier");
      expect(response.body).to.have.property("userExists", false);
    });

    it("should get a participant exist but no userIdentifier and user", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/identifier/search`)
        .set("x-catalog-consent-key", "test-consent-key")
        .send({
          email: "test",
          selfDescription: testParticipant3.selfDescriptionURL,
        })
        .expect(200);
      expect(response.body).to.have.property("participantExists", true);
      expect(response.body).to.have.property("userIdentifierExists", false);
      expect(response.body).to.have.property("userIdentifier");
      expect(response.body).to.have.property("userExists", false);
    });

    it("should get user identifier by email", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/identifier/search`)
        .set("x-catalog-consent-key", "test-consent-key")
        .send({
          email: testUser1.email,
          selfDescription: testParticipant3.selfDescriptionURL,
        })
        .expect(200);
      expect(response.body).to.not.be.empty;
      expect(response.body).to.have.property("participantExists", true);
      expect(response.body).to.have.property("userIdentifierExists", true);
      expect(response.body).to.have.property("userIdentifier");
      expect(response.body).to.have.property("userExists", true);
    });
  });

  describe("search user by email", () => {
    it("should get user by email", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/search`)
        .set("x-catalog-consent-key", process.env.X_CATALOG_CONSENT_KEY)
        .send({
          email: testUser1.email,
        })
        .expect(200);
      expect(response.body).to.not.be.empty;
      expect(response.body).to.have.property("email", testUser1.email);
    });

    it("should not get user by email", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/search`)
        .set("x-catalog-consent-key", process.env.X_CATALOG_CONSENT_KEY)
        .send({
          email: "test@test.com",
        })
        .expect(404);
      expect(response.body).to.not.be.empty;
      expect(response.body).to.have.property("message", "User not found");
    });
  });

  describe("inject user identifier", () => {
    it("should inject user identifier", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/identifier`)
        .set("x-catalog-consent-key", process.env.X_CATALOG_CONSENT_KEY)
        .send({
          userId: userId,
          userIdentifiers: [
            participantUserIdentifierId,
            secondParticipantUserIdentifierId,
          ],
        })
        .expect(200);

      expect(response.body).to.not.be.empty;
      expect(response.body)
        .to.have.property("identifiers")
        .that.is.an("array")
        .with.lengthOf(2);
    });
  });
});
