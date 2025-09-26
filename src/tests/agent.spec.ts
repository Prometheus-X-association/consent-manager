import { expect } from "chai";
import supertest from "supertest";
import { Application } from "express";
import { startServer } from "../server";
import { IncomingMessage, ServerResponse } from "http";
import * as http from "http";
import { testUser1 } from "./fixtures/testAccount";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";

let userId: string;
let userJwt: string;
let preferenceId: string;
let participant = "65eb2661a50cb6465d41865c";
let serverInstance: {
  app: Application;
  server: http.Server<typeof IncomingMessage, typeof ServerResponse>;
};

describe("Consent Agent Routes Tests", function () {
  before(async () => {
    try {
      await mongoose.connect(process.env.MONGO_URI_TEST);
      await mongoose.connection.dropDatabase();
    } catch (error) {
      console.error("Error connecting to MongoDB:", error);
      throw error;
    }

    //Consent Agent setup
    const configFilePath = path.resolve(
      __dirname,
      "./mocks/consent-agent.config.json"
    );
    if (!fs.existsSync(configFilePath)) {
      throw new Error(`Config file not found at path: ${configFilePath}`);
    }

    const configContent = fs.readFileSync(configFilePath, "utf8");
    const config = JSON.parse(configContent);

    config.dataProviderConfig.forEach((configItem: { url: string }) => {
      configItem.url = process.env.MONGO_URI_TEST;
    });

    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));

    serverInstance = await startServer(
      9090,
      "./tests/mocks/consent-agent.config.json"
    );
  });

  after(async () => {
    await mongoose.connection.close();
    serverInstance.server.close();
  });

  it("should get 401 unauthorized", async function () {
    const response = await supertest(serverInstance.app)
      .get(`/v1/profile/1/configurations`)
      .timeout(100)
      .expect(401);
    expect(response.body).to.be.an("object");
    expect(response.body).to.have.property(
      "message",
      "Authorization header missing or invalid"
    );
  });

  it("should not get a configuration from non existent profile", async function () {
    // Create User
    const userData = testUser1;
    const userResponse = await supertest(serverInstance.app)
      .post(`/v1/users/signup`)
      .send(userData);
    userId = userResponse.body.user._id;
    // Login user
    const userAuthresponse = await supertest(serverInstance.app)
      .post(`/v1/users/login`)
      .send({
        email: testUser1.email,
        password: testUser1.password,
      });
    userJwt = `Bearer ${userAuthresponse.body.accessToken}`;
    await new Promise((resolve) => setTimeout(resolve, 100));
    const response = await supertest(serverInstance.app)
      .get(`/v1/profile/1/configurations`)
      .set("Authorization", userJwt)
      .timeout(100);
    expect(response.body).to.be.an("object");
    expect(response.body).to.have.property("error", "Profile not found");
  });

  it("should get a configuration from profile", async function () {
    const response = await supertest(serverInstance.app)
      .get(`/v1/profile/${userId}/configurations`)
      .set("Authorization", userJwt)
      .timeout(100);
    expect(response.body).to.be.an("object");
    expect(response.body).to.have.property("allowRecommendations", true);
  });

  it("should update a configuration from profile", async function () {
    const response = await supertest(serverInstance.app)
      .put(`/v1/profile/${userId}/configurations`)
      .set("Authorization", userJwt)
      .timeout(100)
      .send({
        configurations: {
          allowRecommendations: true,
        },
      })
      .expect(200);
    expect(response.body).to.be.an("object");
    expect(response.body).to.have.property("configurations");
    expect(response.body.configurations).to.have.property(
      "allowRecommendations",
      true
    );
  });

  it("should get recommendations from profile", async function () {
    const response = await supertest(serverInstance.app)
      .get(`/v1/profile/${userId}/recommendations/consent`)
      .set("Authorization", userJwt)
      .timeout(100)
      .expect(200);

    expect(response.body).to.be.an("array");
  });

  it("should get data exchanges recommendations from profile", async function () {
    const response = await supertest(serverInstance.app)
      .get(`/v1/profile/${userId}/recommendations/dataexchanges`)
      .set("Authorization", userJwt)
      .timeout(100)
      .expect(200);
    expect(response.body).to.be.an("array");
  });

  it("should get preferences from profile", async function () {
    const response = await supertest(serverInstance.app)
      .get(`/v1/profile/${userId}/preferences`)
      .set("Authorization", userJwt)
      .timeout(100)
      .expect(200);
    expect(response.body).to.be.an("array");
  });

  it("should handle adding preference to profile", async function () {
    const preference = [
      {
        participant: participant,
        asDataProvider: {
          authorizationLevel: "never",
          conditions: [
            {
              time: {
                dayOfWeek: ["0"],
                startTime: "2024-03-27T14:08:19.986Z",
                endTime: "2025-03-27T14:08:19.986Z",
              },
            },
          ],
        },
        asServiceProvider: {
          authorizationLevel: "always",
          conditions: [
            {
              time: {
                dayOfWeek: ["0"],
                startTime: "2024-03-27T14:08:19.986Z",
                endTime: "2025-03-27T14:08:19.986Z",
              },
              location: {
                countryCode: "US",
              },
            },
          ],
        },
      },
    ];
    const response = await supertest(serverInstance.app)
      .post(`/v1/profile/${userId}/preferences`)
      .set("Authorization", userJwt)
      .timeout(100)
      .send({ preference })
      .expect(201);
    expect(response.body).to.be.an("array");
    expect(response.body[0]).to.be.an("object");
    expect(response.body[0]).to.have.property("_id");
    preferenceId = response.body[0]._id;
  });

  it("should get preference by id for profile", async function () {
    const response = await supertest(serverInstance.app)
      .get(`/v1/profile/${userId}/preferences/${preferenceId}`)
      .set("Authorization", userJwt)
      .timeout(100)
      .expect(200);
    expect(response.body).to.be.an("array");
    expect(response.body[0]).to.be.an("object");
    expect(response.body[0]).to.have.property("_id");
  });

  it("should handle updating a preference from profile", async function () {
    const preference = {
      asDataProvider: {
        authorizationLevel: "always",
      },
    };
    const response = await supertest(serverInstance.app)
      .put(`/v1/profile/${userId}/preferences/${preferenceId}`)
      .set("Authorization", userJwt)
      .timeout(100)
      .send(preference)
      .expect(200);
    expect(response.body).to.be.an("array");
    expect(response.body[0]).to.be.an("object");
    expect(response.body[0]).to.have.property("_id");
    expect(response.body[0]).to.have.property("asDataProvider");
    expect(response.body[0].asDataProvider).to.have.property(
      "authorizationLevel",
      "always"
    );
  });

  it("should handle delete a preference from profile", async function () {
    const response = await supertest(serverInstance.app)
      .delete(`/v1/profile/${userId}/preferences/${preferenceId}`)
      .set("Authorization", userJwt)
      .timeout(100)
      .expect(200);
    expect(response.body).to.be.an("array");
  });

  it("should get a profile from URI", async function () {
    const response = await supertest(serverInstance.app)
      .get(`/v1/profile/${userId}`)
      .set("Authorization", userJwt)
      .timeout(100)
      .expect(200);
    expect(response.body).to.be.an("object");
    expect(response.body).to.have.property("_id");
    expect(response.body).to.have.property("uri", userId);
  });

  it("should get all profiles", async function () {
    const response = await supertest(serverInstance.app)
      .get(`/v1/profile/`)
      .set("Authorization", userJwt)
      .timeout(100)
      .expect(200);
    expect(response.body).to.be.an("array");
  });

  it("should get a match for a profile", async function () {
    const response = await supertest(serverInstance.app)
      .get(
        `/v1/profile/${userId}/preferences/match?participant=${participant}&asDataProvider=true`
      )
      .set("Authorization", userJwt)
      .timeout(100)
      .expect(200);
    expect(response.body).to.be.equal(false);
  });
});
