import { expect } from "chai";
import supertest from "supertest";
import { Application } from "express";
import { startServer } from "../server";
import { IncomingMessage, ServerResponse } from "http";
import * as http from "http";

let serverInstance: {
  app: Application;
  server: http.Server<typeof IncomingMessage, typeof ServerResponse>;
};
let participantJWT: string;

before(async () => {
  serverInstance = startServer(9092);

  await supertest(serverInstance.app)
    .post(`/v1/participants`)
    .send({
      legalName: "consumer",
      identifier: "656dfb3e282d47cfa6b66b2a",
      did: "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2a",
      selfDescriptionURL:
        "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2a",
      email: "provider@email.com",
      endpoints: {
        dataExport: "https://test.consent/data/export",
        dataImport: "https://test.consent/data/import",
        consentImport: "https://test.consent/consent/import",
        consentExport: "https://test.consent/consent/export",
      },
      clientID:
        "EAUh5wKsNzV2jhpxXYys6S6GyqtmTL05SN4JKxy6txuwKWzX1EWCMAA6hljz9kLBxHz5zkEdwWFFDE35bbKX6bqLVv75o7mMMAnw",
      clientSecret:
        "5bBtpV9bH0CkTr92bLar4zrWS6tAXZ6dUNSCNyRK7QtzA9hvX8n8nGyQSXY6hyhiochOrHFAN4KHSY0RPYhxWvW2Ao5TDE70ZmzJ",
    });

  const authResponse = await supertest(serverInstance.app)
    .post(`/v1/participants/login`)
    .send({
      clientID:
        "EAUh5wKsNzV2jhpxXYys6S6GyqtmTL05SN4JKxy6txuwKWzX1EWCMAA6hljz9kLBxHz5zkEdwWFFDE35bbKX6bqLVv75o7mMMAnw",
      clientSecret:
        "5bBtpV9bH0CkTr92bLar4zrWS6tAXZ6dUNSCNyRK7QtzA9hvX8n8nGyQSXY6hyhiochOrHFAN4KHSY0RPYhxWvW2Ao5TDE70ZmzJ",
    });

  participantJWT = `Bearer ${authResponse.body.jwt}`;
});

after(async () => {
  serverInstance.server.close();
});

describe("Users Routes Tests", () => {
  let userId: string;

  describe("signup", () => {
    it("should create a new user", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/signup`)
        .send({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          password: "password",
        });
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

  describe("login", () => {
    it("should login an existing user", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/login`)
        .send({
          email: "john@example.com",
          password: "password",
        });
      expect(response.status).to.be.equal(200);
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
        });
      expect(response.status).to.be.equal(400);
      expect(response.body).to.have.property("message", "invalid credentials");
    });

    it("should fail to login with non-existing user", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/login`)
        .send({
          email: "nonexisting@example.com",
          password: "password",
        });
      expect(response.status).to.be.equal(404);
      expect(response.body).to.have.property("message", "User not found");
    });
  });

  describe("getUserById", () => {
    it("should get user by ID", async () => {
      // Assuming there's a user with ID 'userId123' in the database
      const response = await supertest(serverInstance.app).get(
        `/v1/users/${userId}`
      );
      expect(response.status).to.be.equal(200);
      expect(response.body).to.not.be.empty;
      // Assert other properties if needed
    });

    it("should fail to get non-existing user", async () => {
      const response = await supertest(serverInstance.app).get(
        `/v1/users/65eed1cd59f9242b784f2494`
      );
      expect(response.status).to.be.equal(404);
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
        });

      expect(response.status).to.be.equal(200);
      expect(response.body).to.not.be.empty;
    });

    it("should fail to register user identifier with missing fields", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/register`)
        .set("Authorization", participantJWT)
        .send({});
      expect(response.status).to.be.equal(400);
      expect(response.body).to.have.property("errors");
    });

    it("should fail to register existing user identifier", async () => {
      // Assuming the identifier already exists in the database
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/register`)
        .set("Authorization", participantJWT)
        .send({
          email: "newuser@example.com",
          identifier: "newidentifier",
        });
      expect(response.status).to.be.equal(409);
      expect(response.body).to.have.property("error");
    });
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
        });
      expect(response.status).to.be.equal(200);
      expect(response.body).to.not.be.empty;
      // Assert other properties if needed
    });

    it("should fail to register user identifiers with missing fields", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/registers`)
        .set("Authorization", participantJWT)
        .send({
          users: [{ internalID: "id1" }, { email: "user2@example.com" }],
        });
      expect(response.status).to.be.equal(400);
      expect(response.body).to.have.property("errors");
    });

    it("should not register existing user identifiers", async () => {
      // Assuming the identifiers already exist in the database
      const response = await supertest(serverInstance.app)
        .post(`/v1/users/registers`)
        .set("Authorization", participantJWT)
        .send({
          users: [
            { email: "existinguser1@example.com", internalID: "existingid1" },
            { email: "existinguser2@example.com", internalID: "existingid2" },
          ],
        });
      expect(response.status).to.be.equal(200);
      expect(response.body).to.not.be.empty;
    });
  });
});
