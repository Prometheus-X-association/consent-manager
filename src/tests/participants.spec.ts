import { expect } from "chai";
import supertest from "supertest";
import { Application } from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import { startServer } from "../server";
import { IncomingMessage, ServerResponse } from "http";
import * as http from "http";

let serverInstance: {
  app: Application;
  server: http.Server<typeof IncomingMessage, typeof ServerResponse>;
};

before(async () => {
  serverInstance = startServer(9091);
});

after(async () => {
  serverInstance.server.close();
});

describe("Participant Routes Tests", () => {
  let participantId: string;

  describe("registerParticipant", () => {
    it("should register a new participant", async () => {
      const participantData = {
        legalName: "consumer",
        identifier: "656dfb3e282d47cfa6b66b2c",
        did: "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2c",
        selfDescriptionURL:
          "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2c",
        email: "provider@email.com",
        endpoints: {
          dataExport: "https://test.consent/data/export",
          dataImport: "https://test.consent/data/import",
          consentImport: "https://test.consent/consent/import",
          consentExport: "https://test.consent/consent/export",
        },
        clientID:
          "bI8fbrUoT4th4zMXRqCV6YVxpPknLDHttLVLG6Pgtm4JQlMInSJscxZnEDZxQBQBv2BP2M6QFYbDAQrD3ibnsWpYySIFr4w27DKQ",
        clientSecret:
          "LAADVtd1vGHiiPpFGqdBtZVOZUItLT0eUpr1zsGrYYdcg5rduHSgWJ6q063uuPJJeFk1Lytn9ZwSAodtBXSo2Vu32gLjrxh4WIfq",
      };
      const response = await supertest(serverInstance.app)
        .post(`/v1/participants/`)
        .send(participantData);
      participantId = response.body._id;
      expect(response.status).to.be.equal(201);
      expect(response.body).to.not.be.empty;
    });

    it("should fail to register existing participant", async () => {
      // Assuming the participant with client ID 'existingClient' already exists in the database
      const participantData = {
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
          "bI8fbrUoT4th4zMXRqCV6YVxpPknLDHttLVLG6Pgtm4JQlMInSJscxZnEDZxQBQBv2BP2M6QFYbDAQrD3ibnsWpYySIFr4w27DKQ",
        clientSecret:
          "LAADVtd1vGHiiPpFGqdBtZVOZUItLT0eUpr1zsGrYYdcg5rduHSgWJ6q063uuPJJeFk1Lytn9ZwSAodtBXSo2Vu32gLjrxh4WIfq",
      };
      const response = await supertest(serverInstance.app)
        .post(`/v1/participants`)
        .send(participantData);
      expect(response.status).to.be.equal(409);
      expect(response.body).to.have.property(
        "error",
        "Participant already exists"
      );
    });
  });
  describe("getParticipantById", () => {
    it("should get participant by ID", async () => {
      // Assuming there's a participant with ID 'participantId123' in the database
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
      expect(response.body).to.have.property("error");
    });
  });

  describe("loginParticipant", () => {
    it("should login participant with valid credentials", async () => {
      // Assuming there's a participant with clientID and clientSecret
      const response = await supertest(serverInstance.app)
        .post(`/v1/participants/login`)
        .send({
          clientID:
            "bI8fbrUoT4th4zMXRqCV6YVxpPknLDHttLVLG6Pgtm4JQlMInSJscxZnEDZxQBQBv2BP2M6QFYbDAQrD3ibnsWpYySIFr4w27DKQ",
          clientSecret:
            "LAADVtd1vGHiiPpFGqdBtZVOZUItLT0eUpr1zsGrYYdcg5rduHSgWJ6q063uuPJJeFk1Lytn9ZwSAodtBXSo2Vu32gLjrxh4WIfq",
        });
      expect(response.status).to.be.equal(200);
      expect(response.body).to.have.property("success", true);
      expect(response.body).to.have.property("jwt");
      expect(response.body).to.have.property("message");
    });

    it("should fail to login participant with invalid credentials", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/participants/login`)
        .send({
          clientID: "nonExistingClient",
          clientSecret: "invalidSecret",
        });
      expect(response.status).to.be.equal(404);
      expect(response.body).to.have.property("error");
    });
  });
});
