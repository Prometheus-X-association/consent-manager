import { expect } from "chai";
import supertest from "supertest";
import { Application } from "express";
import { startServer } from "../server";
import { IncomingMessage, ServerResponse } from "http";
import * as http from "http";
import crypto from "crypto";
import nock from "nock";
import { setupnockMocks } from "./fixtures/mock";
import {
  testProvider1,
  testConsumer1,
  testConsumer2,
  testUser1,
} from "./fixtures/testAccount";
import { random } from "lodash";
import mongoose from "mongoose";

let serverInstance: {
  app: Application;
  server: http.Server<typeof IncomingMessage, typeof ServerResponse>;
};
let userId: string;
let userJwt: string;
let providerId: string;
let consumerId: string;
let selfDesc_consumerId: string;
let selfDesc_consumer2Id: string;
let selfDesc_providerId: string;
let providerUserIdentifier: string;
let consumerUserIdentifier: string;
let providerJWT: string;
let consumerJWT: string;
let providerBase64: string;
let consumerBase64: string;
let consumer2Base64: string;
let contractbase64: string;
let contract2base64: string;
let privacyNoticeId: string;
let dataProcessingId: string;
let consentId: string;
const token = crypto.randomUUID();

describe("Consent Routes Tests", function () {
  before(async () => {
    nock.cleanAll();

    try {
      await mongoose.connect(process.env.MONGO_URI_TEST);
      await mongoose.connection.dropDatabase();
      await mongoose.connection.db.dropDatabase();
    } catch (error) {
      console.error("Error connecting to MongoDB:", error);
      throw error;
    }

    serverInstance = await startServer(9090);
    // Create Provider
    const providerData = testProvider1;
    const providerResponse = await supertest(serverInstance.app)
      .post(`/v1/participants/`)
      .send(providerData);
    providerId = providerResponse.body._id;
    selfDesc_providerId = providerData.selfDescriptionURL;

    // Login provider
    const providerAuthResponse = await supertest(serverInstance.app)
      .post(`/v1/participants/login`)
      .send({
        clientID: testProvider1.clientID,
        clientSecret: testProvider1.clientSecret,
      });
    providerJWT = `Bearer ${providerAuthResponse.body.jwt}`;
    providerBase64 = Buffer.from(providerData.selfDescriptionURL).toString(
      "base64"
    );

    // Create Consumer
    const consumerData = testConsumer1;
    const consumerResponse = await supertest(serverInstance.app)
      .post(`/v1/participants/`)
      .send(consumerData);
    consumerId = consumerResponse.body._id;
    selfDesc_consumerId = consumerData.selfDescriptionURL;

    // Create Consumer 2
    const consumer2Data = testConsumer2;
    const consumer2Response = await supertest(serverInstance.app)
      .post(`/v1/participants/`)
      .send(consumer2Data);
    selfDesc_consumer2Id = consumer2Data.selfDescriptionURL;
    consumer2Base64 = Buffer.from(consumer2Data.selfDescriptionURL).toString(
      "base64"
    );

    // Login consumer
    const consumerAuthResponse = await supertest(serverInstance.app)
      .post(`/v1/participants/login`)
      .send({
        clientID: testConsumer1.clientID,
        clientSecret: testConsumer1.clientSecret,
      });
    consumerJWT = `Bearer ${consumerAuthResponse.body.jwt}`;
    consumerBase64 = Buffer.from(consumerData.selfDescriptionURL).toString(
      "base64"
    );

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
    // Create UserIdentifier Provider
    const providerUserIdentifierResponse = await supertest(serverInstance.app)
      .post(`/v1/users/register`)
      .set("Authorization", providerJWT)
      .send({
        email: testUser1.email,
        identifier: "providerUserIdentifier1",
      });
    providerUserIdentifier = providerUserIdentifierResponse.body._id;

    // Create UserIdentifier Consumer
    const consumerUserIdentifierResponse = await supertest(serverInstance.app)
      .post(`/v1/users/register`)
      .set("Authorization", consumerJWT)
      .send({
        email: testUser1.email,
        identifier: "consumerUserIdentifier1",
      });
    consumerUserIdentifier = consumerUserIdentifierResponse.body._id;
  });

  after(async () => {
    serverInstance.server.close();
  });

  // getAvailableExchanges
  it("should get available exchanges", async () => {
    setupnockMocks(providerBase64);
    const response = await supertest(serverInstance.app)
      .get(`/v1/consents/exchanges/as?as=provider`)
      .set("Authorization", providerJWT)
      .expect(200);
    expect(response.body).to.have.property("participant");
    expect(response.body).to.have.property("exchanges");
    expect(response.body.participant).to.have.property("selfDescription");
    expect(response.body.participant).to.have.property("base64SelfDescription");
  });

  // getPrivacyNotices
  it("should get the privacy notices", async () => {
    setupnockMocks(providerBase64);
    const response = await supertest(serverInstance.app)
      .get(`/v1/consents/${userId}/${providerBase64}/${consumerBase64}`)
      .set("x-user-key", providerUserIdentifier)
      .expect(200);
    privacyNoticeId = response.body[0]?._id;
    expect(response.body).to.not.be.empty;
    expect(response.body[0]).to.have.property("_id");
    expect(response.body[0]).to.have.property(
      "dataProvider",
      "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2b"
    );
    expect(response.body[0]).to.have.property(
      "contract",
      "http://localhost:8888/contracts/65e5d715c99e484e4685a964"
    );
    //tests dataprocessings from contract
    expect(response.body[0]).to.have.property("dataProcessings").to.be.not
      .empty;
    expect(response.body[0].dataProcessings[0]).to.have.property("catalogId");

    dataProcessingId = response.body[0].dataProcessings[0].catalogId;
  });

  // getPrivacyNoticeById
  it("should get a privacy notice by id", async () => {
    setupnockMocks(providerBase64);
    const response = await supertest(serverInstance.app)
      .get(`/v1/consents/privacy-notices/${privacyNoticeId}`)
      .set("x-user-key", providerUserIdentifier)
      .expect(200);
    expect(response.body).to.not.be.empty;
    expect(response.body).to.have.property("_id").and.to.equal(privacyNoticeId);
    expect(response.body).to.have.property("contract");
    expect(response.body.dataProvider._id).to.equal(testProvider1.identifier);

    //tests dataprocessings from contract
    expect(response.body).to.have.property("dataProcessings").to.be.not.empty;
    expect(response.body.dataProcessings[0]).to.have.property(
      "catalogId",
      dataProcessingId
    );
  });

  // giveConsent
  it("should give consent", async () => {
    setupnockMocks(providerBase64);
    const response = await supertest(serverInstance.app)
      .post(`/v1/consents`)
      .set("x-user-key", providerUserIdentifier)
      .send({
        privacyNoticeId: privacyNoticeId,
        dataProcessingId: dataProcessingId,
        event: "given",
      })
      .expect(201);

    consentId = response.body.record.recordId;
    expect(response.body.event[0].eventState).to.equal("consent given");
    expect(response.body.piiProcessing.privacyNotice).to.equal(privacyNoticeId);
    //tests dataprocessings from contract
    // expect(response.body).to.have.property(
    //     'recipient',
    // ).to.be.not.empty;
  });

  // // resume consent
  it("resumeConsent", async () => {
    setupnockMocks(providerBase64);
    const response = await supertest(serverInstance.app)
      .post(`/v1/consents/${consentId}/resume`)
      .send({
        internalID: providerUserIdentifier,
        email: testUser1.email,
      })
      .set("Authorization", providerJWT)
      .expect(400);
  });

  // trigger data exchange
  it("should triggerDataExchange", async () => {
    // mocking export consent
    nock("https://test.consent").post("/consent/export").reply(200, {
      message: "ok",
      token,
      dataExchangeId: "5f6dd4e3495aebd3aca59529",
    });
    setupnockMocks(providerBase64);
    const response = await supertest(serverInstance.app)
      .post(`/v1/consents/${consentId}/data-exchange`)
      .set("x-user-key", providerUserIdentifier)
      .expect(200);
    expect(response.body).to.have.property(
      "message",
      "Successfully sent consent to the provider's consent export endpoint to trigger the data exchange"
    );
  });

  // revoke consent
  it("should revoke consent", async () => {
    setupnockMocks(providerBase64);
    const response = await supertest(serverInstance.app)
      .delete(`/v1/consents/${consentId}`)
      .set("Authorization", userJwt)
      .expect(200);
    expect(
      response.body.event[response.body.event.length - 1].eventState
    ).to.equal("consent revoked");
  });

  // generate pdi-iframe
  it("generate pdi-iframe", async () => {
    setupnockMocks(providerBase64);
    //TODO //nock PDI_ENDPOINT
    const response = await supertest(serverInstance.app)
      .get(`/v1/consents/pdi/iframe`)
      .set("Authorization", providerJWT)
      .expect(302);
  });

  // generate pdi-iframe by privacy notice Id
  it("generate pdi-iframe by privacy notice Id", async () => {
    setupnockMocks(providerBase64);
    const response = await supertest(serverInstance.app)
      .get(`/v1/consents/pdi/iframe`)
      .set("Authorization", providerJWT)
      .query({
        userIdentifier: providerUserIdentifier,
        privacyNoticeId: privacyNoticeId,
      })
      .expect(302);
  });

  // // user endpoints
  // getUserAvailableExchanges
  it("getUserAvailableExchanges", async () => {
    setupnockMocks(providerBase64);
    const response = await supertest(serverInstance.app)
      .get(`/v1/consents/exchanges/user`)
      .set("Authorization", userJwt)
      .query({ participantId: providerId })
      .expect(200);

    contractbase64 = response.body.exchanges[0].base64Contract;
    expect(response.body.participant.selfDescription).to.equal(
      selfDesc_providerId
    );
    expect(response.body.exchanges).to.not.be.empty;
    expect(response.body.exchanges[0].participantSelfDescription).to.equal(
      selfDesc_consumerId
    );
  });

  // getUserPrivacyNoticesByContract
  it("getUserPrivacyNoticesByContract", async () => {
    setupnockMocks(providerBase64);
    const response = await supertest(serverInstance.app)
      .get(
        `/v1/consents/${providerUserIdentifier}/${providerBase64}/${consumerBase64}/${contractbase64}`
      )
      .set("Authorization", userJwt)
      .expect(200);
    expect(response.body[0].dataProvider).to.equal(selfDesc_providerId);
    expect(response.body[0].recipients).to.deep.include(selfDesc_consumerId);
  });

  // getUserPrivacyNoticeById
  it("getUserPrivacyNoticeById", async () => {
    const response = await supertest(serverInstance.app)
      .get(`/v1/consents/privacy-notices/${privacyNoticeId}/user`)
      .set("Authorization", userJwt)
      .expect(200);
    expect(response.body).to.have.property("_id");
    expect(response.body.contract.orchestrator).to.equal(testProvider1.did);
    expect(response.body.contract.status).to.equal("pending");
    expect(response.body.dataProvider._id).to.equal(testProvider1.identifier);
    expect(response.body.purposes[0].providedBy).to.equal(
      testConsumer1.identifier
    );
    expect(response.body.data[0].providedBy).to.equal(testProvider1.identifier);
  });

  // giveConsentUser
  it("giveConsentUser", async () => {
    setupnockMocks(providerBase64);
    const response = await supertest(serverInstance.app)
      .post(`/v1/consents/user`)
      .send({ privacyNoticeId: privacyNoticeId, event: "given" })
      .set("Authorization", userJwt)
      .expect(201);
    expect(response.body.event[0].eventState).to.equal("consent given");
    expect(response.body.piiProcessing.privacyNotice).to.equal(privacyNoticeId);
  });

  // getUserConsents
  it("should getUserConsents - by user", async () => {
    const response = await supertest(serverInstance.app)
      .get(`/v1/consents/me`)
      .set("Authorization", userJwt)
      .expect(200);

    expect(response.body).to.have.property("consents");
    expect(response.body.consents[0].record.recordId).to.equal(consentId);
    expect(response.body.consents[0].piiProcessing.privacyNotice).to.equal(
      privacyNoticeId
    );
  });

  it("should getUserConsents - by participant", async () => {
    const response = await supertest(serverInstance.app)
      .get(`/v1/consents/participants/${providerUserIdentifier}/`)
      .set("Authorization", providerJWT)
      .expect(200);
    expect(response.body).to.have.property("consents");
  });

  // // getUserConsentById by user
  // it("should getUserConsentById - by user", async () => {
  //   const response = await supertest(serverInstance.app)
  //     .get(`/v1/consents/me/${consentId}`)
  //     .set("x-user-key", providerUserIdentifier)
  //     .expect(200);
  //   expect(response.body._id).to.equal(consentId);
  //   expect(response.body.providerUserIdentifier).to.equal(
  //     providerUserIdentifier
  //   );
  //   expect(response.body.consumerUserIdentifier).to.equal(
  //     consumerUserIdentifier
  //   );
  //   expect(response.body.consented).to.equal(true);
  //   expect(response.body.dataProvider).to.equal(providerId);
  //   expect(response.body.dataConsumer).to.equal(consumerId);
  //   expect(response.body.status).to.equal("granted");
  //   expect(response.body.privacyNotice).to.equal(privacyNoticeId);
  // });

  // // getUserConsentById by participant
  // it("should getUserConsentById - by participant", async () => {
  //   const response = await supertest(serverInstance.app)
  //     .get(`/v1/consents/participants/${providerUserIdentifier}/${consentId}`)
  //     .set("Authorization", providerJWT)
  //     .expect(200);
  //   expect(response.body._id).to.equal(consentId);
  //   expect(response.body.providerUserIdentifier).to.equal(
  //     providerUserIdentifier
  //   );
  //   expect(response.body.consumerUserIdentifier).to.equal(
  //     consumerUserIdentifier
  //   );
  //   expect(response.body.consented).to.equal(true);
  //   expect(response.body.dataProvider).to.equal(providerId);
  //   expect(response.body.dataConsumer).to.equal(consumerId);
  //   expect(response.body.status).to.equal("granted");
  //   expect(response.body.privacyNotice).to.equal(privacyNoticeId);
  // });

  // attachTokenToConsent
  it("should attachTokenToConsent", async () => {
    //Mocking import consent
    nock("https://test.consent").post("/consent/import").reply(200, {
      message: "ok",
      token,
      dataExchangeId: "5f6dd4e3495aebd3aca59529",
    });
    const response = await supertest(serverInstance.app)
      .post(`/v1/consents/${consentId}/token`)
      .set("Authorization", providerJWT)
      .send({
        token,
        providerDataExchangeId: "5f6dd4e3495aebd3aca59529",
      })
      .expect(200);
    expect(response.body).to.have.property(
      "message",
      "successfully forwarded consent to the data consumer"
    );
  });

  // verifyToken
  it("should validate the consent", async () => {
    //mocking export consent
    nock("https://test.consent").post("/consent/export").reply(200, {
      message: "ok",
      token,
      dataExchangeId: "5f6dd4e3495aebd3aca59529",
    });
    setupnockMocks(providerBase64);
    const response = await supertest(serverInstance.app)
      .post(`/v1/consents/${consentId}/validate`)
      .set("Authorization", providerJWT)
      .send({
        token,
      })
      .expect(200);
    expect(response.body).to.have.property(
      "message",
      "token matches consent token"
    );
    expect(response.body).to.have.property("verified", true);
  });

  ///**********************//
  // Test Error
  describe("Test error", () => {
    const nonExistentId = "65d624e8ce9bcded716692f8";
    it("should not getUserConsents with no authorization", async () => {
      const response = await supertest(serverInstance.app)
        .get(`/v1/consents/me`)
        .expect(401);
      expect(response.body).to.have.property(
        "message",
        "Authorization header missing or invalid"
      );
    });

    //     // getUserConsentById by user //error:  -- Error:
    // it("should not getUserConsent by a non-existent Id", async () => {
    //   const response = await supertest(serverInstance.app)
    //     .get(`/v1/consents/me/${nonExistentId}`)
    //     .set("x-user-key", providerUserIdentifier)
    //     .expect(404);
    //     console.log('response getUserConsent',response.body)
    //     // expect(response.body.Error).to.equal("Consent not found");
    // });

    // getAvailableExchanges
    it("should not get available exchanges with no authorization", async () => {
      setupnockMocks(providerBase64);
      const response = await supertest(serverInstance.app)
        .get(`/v1/consents/exchanges/as?as=provider`)
        .expect(401);
    });

    //FAIL: 200
    // it("should not get available exchanges with no as parameter", async () => {
    //   setupnockMocks(providerBase64);
    //   const response = await supertest(serverInstance.app)
    //     .get(`/v1/consents/exchanges/as`)
    //     .set("Authorization", providerJWT)
    //     .expect(400);
    //     expect(response.body.error).to.equal("Missing parameters");
    // });

    //FAIL: 500

    // getUserAvailableExchanges
    it("should not getUserAvailableExchanges for a non-existent participant", async () => {
      await supertest(serverInstance.app)
        .get(`/v1/consents/exchanges/user`)
        .set("Authorization", userJwt)
        .query({ participantId: nonExistentId })
        .expect(500);
    });

    // getPrivacyNotices
    it("should not get privacy notices by participant with no authorization", async () => {
      setupnockMocks(providerBase64);
      const response = await supertest(serverInstance.app)
        .get(
          `/v1/consents/${providerUserIdentifier}/${providerBase64}/${consumerBase64}`
        )
        .expect(401);
      expect(response.body).to.have.property(
        "message",
        "Authorization header missing or invalid"
      );
    });

    //FAIL: 200
    // it("should not get privacy notices by participant with an invalid UserIdentifierId", async () => {
    //   setupnockMocks(providerBase64);
    //   const response = await supertest(serverInstance.app)
    //     .get(`/v1/consents/${nonExistentId}/${providerBase64}/${consumerBase64}`)
    //     .set("x-user-key", providerUserIdentifier)
    //     .expect(404);
    //   console.log(response.body)
    //   expect(response.body.error).to.equal("User identifier not found");
    // });

    //FAIL: 200
    // it("should not get privacy notices for a consent based on non existing contracts between two participant", async () => {
    //   setupnockMocks(providerBase64);
    //   const response = await supertest(serverInstance.app)
    //     .get(`/v1/consents/${providerUserIdentifier}/${providerBase64}/${consumer2Base64}`)
    //     .set("x-user-key", providerUserIdentifier)
    //     .expect(404);
    //   console.log(response.body)
    //   expect(response.body.error).to.equal("No contracts found");
    // });

    // getUserPrivacyNoticesByContract
    it("should not getUserPrivacyNotices with no authorization", async () => {
      setupnockMocks(providerBase64);
      const response = await supertest(serverInstance.app)
        .get(
          `/v1/consents/${providerUserIdentifier}/${providerBase64}/${consumerBase64}/${consumerBase64}`
        )
        .expect(401);
      expect(response.body).to.have.property(
        "message",
        "Authorization header missing or invalid"
      );
    });

    //FAIL: 500
    it("should not getUserPrivacyNotices By a non-existent contract", async () => {
      setupnockMocks(providerBase64);
      const contract2 =
        "http://localhost:8888/contracts/65d624e80e4afe01b8906e14";
      contract2base64 = Buffer.from(contract2).toString("base64");
      const response = await supertest(serverInstance.app)
        .get(
          `/v1/consents/${providerUserIdentifier}/${providerBase64}/${consumerBase64}/${contract2base64}`
        )
        .set("Authorization", userJwt)
        .expect(500);
    });

    // getPrivacyNoticeById
    it("should not get privacy notice by a non-existent id -by participant", async () => {
      setupnockMocks(providerBase64);
      const response = await supertest(serverInstance.app)
        .get(`/v1/consents/privacy-notices/${nonExistentId}`)
        .set("x-user-key", providerUserIdentifier)
        .expect(404);
      expect(response.body.error).to.equal("Privacy notice not found");
    });

    it("should not get privacy notice by a non-existent id -by user", async () => {
      setupnockMocks(providerBase64);
      const response = await supertest(serverInstance.app)
        .get(`/v1/consents/privacy-notices/${nonExistentId}/user`)
        .set("Authorization", userJwt);
      expect(response.status).to.be.equal(404);
      expect(response.body.error).to.equal("Privacy notice not found");
    });

    // giveConsent
    it("should not give consent with no authorization", async () => {
      setupnockMocks(providerBase64);
      const response = await supertest(serverInstance.app)
        .post(`/v1/consents`)
        .send({
          privacyNoticeId: privacyNoticeId,
        })
        .expect(401);
      expect(response.body).to.have.property(
        "message",
        "Authorization header missing or invalid"
      );
    });

    //FAIL: Refused
    // // giveConsentUser
    // it("should not giveConsentUser with no authorization", async () => {
    //   setupnockMocks(providerBase64);
    //   const response = await supertest(serverInstance.app)
    //     .post(`v1/consents/user`)
    //     .send({ privacyNoticeId: privacyNoticeId })
    //     .set("Authorization", null)
    //     .expect(401);
    //     expect(response.body.message).to.equal("user unauthenticated");
    // });

    // it("should not giveConsentUser with no privacyNoticeId in body", async () => {
    //   setupnockMocks(providerBase64);
    //   const response = await supertest(serverInstance.app)
    //     .post(`v1/consents/user`)
    //     .set("Authorization", userJwt)
    //     .expect(400);
    //     expect(response.body.error).to.equal("Missing privacyNoticeId");
    //   });

    // it("should not giveConsentUser with non-existent privacyNoticeId", async () => {
    //   setupnockMocks(providerBase64);
    //   const response = await supertest(serverInstance.app)
    //     .post(`v1/consents/user`)
    //     .send({ privacyNoticeId: nonExistentId })
    //     .set("Authorization", userJwt)
    //     .expect(404);
    //     expect(response.body.error).to.equal("privacy notice not found");
    //   });

    //FAIL: Refused
    // resume consent
    // it("should not resume a non-existent consent", async () => {
    //   setupnockMocks(providerBase64);
    //   const response = await supertest(serverInstance.app)
    //     .post(`v1/consents/${nonExistentId}/resume`)
    //     .send({
    //       internalID: userId,
    //       email: testUser1.email,
    //     })
    //     .set("Authorization", providerJWT)
    //     .expect(404);
    //     expect(response.body.Error).to.equal("consent not found");
    // });

    //TODO: consent on status draft et pending
    // it("resumeConsent", async () => {
    //   setupnockMocks(providerBase64);
    //   const response = await supertest(serverInstance.app)
    //     .post(`v1/consents/${consentId}/resume`)
    //     .send({
    //       internalID: providerUserIdentifier,
    //       email: testUser1.email,
    //     })
    //     .set("Authorization", providerJWT)
    //     .expect(400);
    //     expect(response.body.error).to.equal("The consent can't be resume");
    // });

    //FAIL:  error: Consent not found -- Error: Consent not found

    // revokeConsent
    // it("should fail to revoke non existent consent", async () => {
    //   setupnockMocks(providerBase64);
    //   const response = await supertest(serverInstance.app)
    //     .delete(`/v1/consents/${nonExistentId}`)
    //     .set("x-user-key", providerUserIdentifier)
    //     .expect(404);
    //     console.log(response.body)
    //   expect(response.body.error).to.equal("consent not found");
    // });

    // trigger dataExchange
    it("should not trigger data exchange for a non-existent consent", async () => {
      nock("https://test.consent").post("/consent/export").reply(200, {
        message: "ok",
        token,
        dataExchangeId: "5f6dd4e3495aebd3aca59529",
      });
      setupnockMocks(providerBase64);
      const response = await supertest(serverInstance.app)
        .post(`/v1/consents/6601a6265cbdad603e4e9a8c/data-exchange`)
        .set("x-user-key", providerUserIdentifier)
        .send({ privacyNoticeId: privacyNoticeId })
        .expect(404);
      expect(response.body).to.have.property("error", "Consent not found");
    });
    //TODO
    // .status(401)
    // .json({ error: "Consent has not been granted by user" });

    // attachTokenToConsent
    it("should not attach token to a non-existent consent", async () => {
      //Mocking import consent
      nock("https://test.consent").post("/consent/import").reply(200, {
        message: "ok",
        token,
        dataExchangeId: "5f6dd4e3495aebd3aca59529",
      });
      const response = await supertest(serverInstance.app)
        .post(`/v1/consents/${nonExistentId}/token`)
        .set("Authorization", providerJWT)
        .send({
          token,
          providerDataExchangeId: "5f6dd4e3495aebd3aca59529",
        })
        .expect(404);
      expect(response.body.error).to.equal("Consent not found");
    });

    // verifyToken
    it("should not validate the consent with a token not attached to consent", async () => {
      const notAttachedToken = crypto.randomUUID();
      //mocking export consent
      nock("https://test.consent").post("/consent/export").reply(200, {
        message: "ok",
        token,
        dataExchangeId: "5f6dd4e3495aebd3aca59529",
      });
      setupnockMocks(providerBase64);
      const response = await supertest(serverInstance.app)
        .post(`/v1/consents/${consentId}/validate`)
        .set("Authorization", providerJWT)
        .send({
          notAttachedToken,
        })
        .expect(400);
      expect(response.body).to.have.property(
        "error",
        "token does not match consent token"
      );
    });

    // // generate iframe
    //     it("should respond with JSON message if no PDI endpoint setup", async () => {
    //       const response = await supertest(serverInstance.app)
    //         .get(`v1/consents/pdi/iframe`)
    //         .set("Authorization", providerJWT)
    //         .query({
    //           userIdentifier: providerUserIdentifier,
    //           privacyNoticeId: privacyNoticeId,
    //         })
    //         .expect("302"); // à vérifier
    //       expect(response.body.message).to.equal("No PDI endpoint setup.");
    //     });
  });
});
