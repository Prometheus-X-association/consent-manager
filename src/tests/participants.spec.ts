import { expect } from "chai";
import supertest from "supertest";
import { Application } from "express";
import { startServer } from "../server";
import { IncomingMessage, ServerResponse } from "http";
import * as http from "http";
import {
  testParticipant2,
  testExistingPrticipant,
  testupdatedPrticipant,
} from "./fixtures/testAccount";

describe("Participant Routes Tests", () => {
  let participantId: string;
  let participantJwt: string;

  let serverInstance: {
    app: Application;
    server: http.Server<typeof IncomingMessage, typeof ServerResponse>;
  };

  before(async () => {
    serverInstance = await startServer(9090);
  });

  after(async () => {
    serverInstance.server.close();
  });

  describe("registerParticipant", () => {
    it("should register a new participant", async () => {
      const participantData = testParticipant2;
      const response = await supertest(serverInstance.app)
        .post(`/v1/participants/`)
        .send(participantData);
      participantId = response.body._id;
      expect(response.status).to.be.equal(201);
      expect(response.body).to.not.be.empty;
    });

    it("should fail to register existing participant", async () => {
      // Assuming the participant with client ID 'existingClient' already exists in the database
      const existingParticipantData = testExistingPrticipant;
      const response = await supertest(serverInstance.app)
        .post(`/v1/participants`)
        .send(existingParticipantData)
        .expect(409);
      expect(response.body).to.have.property(
        "error",
        "Participant already exists"
      );
    });
  });
  describe("getParticipantById", () => {
    it("should get participant by ID", async () => {
      const response = await supertest(serverInstance.app).get(
        `/v1/participants/${participantId}`
      );
      expect(response.status).to.be.equal(200);
      expect(response.body).to.not.be.empty;
      // Assert other properties if needed
    });

    it("should fail to get non-existing participant", async () => {
      const response = await supertest(serverInstance.app).get(
        `/v1/participants/65eed1cd59f9242b784f2494`
      );
      expect(response.status).to.be.equal(404);
      expect(response.body).to.have.property("error", "participant not found");
    });
  });

  describe("getParticipantByClientId", () => {
    it("should get participant by client ID", async () => {
      // Assuming there's a participant with client ID 'client123' in the database
      const response = await supertest(serverInstance.app).get(
        `/v1/participants/clientId/bI8fbrUoT4th4zMXRqCV6YVxpPknLDHttLVLG6Pgtm4JQlMInSJscxZnEDZxQBQBv2BP2M6QFYbDAQrD3ibnsWpYySIFr4w27DKQ`
      );
      expect(response.status).to.be.equal(200);
      expect(response.body).to.not.be.empty;
      // Assert other properties if needed
    });

    it("should fail to get participant with non-existing client ID", async () => {
      const response = await supertest(serverInstance.app).get(
        `/v1/participants/clientId/nonExistingClientId`
      );
      expect(response.status).to.be.equal(404);
      expect(response.body).to.have.property("error", "participant not found");
    });
  });

  describe("loginParticipant", () => {
    it("should login participant with valid credentials", async () => {
      const providerAuthResponse = await supertest(serverInstance.app)
        .post(`/v1/participants/login`)
        .send({
          clientID: testParticipant2.clientID,
          clientSecret: testParticipant2.clientSecret,
        });
      expect(providerAuthResponse.status).to.be.equal(200);
      participantJwt = `Bearer ${providerAuthResponse.body.jwt}`;
      expect(providerAuthResponse.body).to.have.property("success", true);
      expect(providerAuthResponse.body).to.have.property("jwt");
      expect(providerAuthResponse.body).to.have.property("message");
    });

    it("should fail to login participant with invalid credentials", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/participants/login`)
        .send({
          clientID: "nonExistingClient",
          clientSecret: "invalidSecret",
        })
        .expect(404);
      expect(response.body).to.have.property("error", "participant not found");
    });
  });

  describe("updateParticipantByClientId", () => {
    it("should update participant by client ID", async () => {
      const updatedParticipantData = testupdatedPrticipant;

      const response = await supertest(serverInstance.app)
        .put(
          `/v1/participants/clientId/bI8fbrUoT4th4zMXRqCV6YVxpPknLDHttLVLG6Pgtm4JQlMInSJscxZnEDZxQBQBv2BP2M6QFYbDAQrD3ibnsWpYySIFr4w27DKQ`
        )
        .send(updatedParticipantData)
        .set("Authorization", participantJwt)
        .expect(200);
      expect(response.body).to.not.be.empty;
      // Assert other properties if needed
    });

    it("should fail to update participant with non-existing client ID", async () => {
      const response = await supertest(serverInstance.app).get(
        `/v1/participants/clientId/nonExistingClientId`
      );
      expect(response.status).to.be.equal(404);
      expect(response.body).to.have.property("error", "participant not found");
    });
  });

  describe("getAllParticipants", () => {
    it("should get all participants", async () => {
      const response = await supertest(serverInstance.app).get(
        `/v1/participants/`
      );
      expect(response.status).to.be.equal(200);
      expect(response.body).to.not.be.empty;
      // Assert other properties if needed
    });
  });

  describe("getMyParticipant", () => {
    it("should getMyParticipant", async () => {
      const response = await supertest(serverInstance.app)
        .get(`/v1/participants/me`)
        .set("Authorization", participantJwt)
        .expect(200);
      expect(response.body).to.not.be.empty;
      // Assert other properties if needed
    });

    // it("should fail to getMyParticipant with non-existing  ID", async () => {
    //   expect(response.body).to.have.property("error", "participant not found");
    // });
  });

  describe("deleteParticipant", () => {
    it("should delete participant", async () => {
      const response = await supertest(serverInstance.app)
        .delete(`/v1/participants/me`)
        .set("Authorization", participantJwt)
        .expect(200);
      expect(response.body).to.have.property(
        "message",
        "Participant deleted successfully"
      );
    });

    // it("should fail to delete participant with invalid id", async () => {
    // });
  });
});
