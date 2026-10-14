/**
 * Regression tests for the "consent flow dead-ends when only one participant
 * has registered the user" fix.
 *
 * Scenario under test: a user is known to the PROVIDER only. The consumer has
 * no UserIdentifier for that email and no linked User exists yet.
 *
 * These tests lock in:
 *  - PRIMARY: giveConsent routes the consumer-unknown user into
 *    registerNewUserToConsumerSide (consumer DSC -> registrationUri) instead of
 *    dead-ending with 404. (consentsController.ts: emailReattached fall-through)
 *  - Orphan cleanup: a failed consumer-side registration leaves no orphan
 *    draft/pending consent behind. (registerNewUserToConsumerSide)
 *  - Auth pass-through: verifyUserJWT no longer 401s a userIdentifier with no
 *    linked User. (middleware/auth.ts)
 *  - Receipt safety: consentToConsentReceipt does not crash on a user-less
 *    consent. (utils/consentReceipt.ts)
 *  - redirectPDI only surfaces a *granted* consent as an editable consentId,
 *    so a brand-new user sees "Accepter" rather than a spurious "Reconfirmer".
 */
import { expect } from "chai";
import supertest from "supertest";
import { Application } from "express";
import { startServer } from "../server";
import { IncomingMessage, ServerResponse } from "http";
import * as http from "http";
import nock from "nock";
import mongoose from "mongoose";
import { setupnockMocks } from "./fixtures/mock";
import { testProvider1, testConsumer1 } from "./fixtures/testAccount";
import Consent from "../models/Consent/Consent.model";
import Participant from "../models/Participant/Participant.model";
import User from "../models/User/User.model";
import { consentToConsentReceipt } from "../utils/consentReceipt";

const CONSUMER_DSC = "https://consumer-dsc.test";
const CONTRACT_URI = "http://localhost:8888/contracts/65e5d715c99e484e4685a964";

describe("Consent registration fix (single-side registered user)", function () {
  let serverInstance: {
    app: Application;
    server: http.Server<typeof IncomingMessage, typeof ServerResponse>;
  };
  let app: Application;

  let providerId: string;
  let consumerId: string;
  let providerJWT: string;
  let providerBase64: string;
  let consumerBase64: string;
  let selfDescConsumer: string;

  // Provider-only userIdentifiers (unique emails => no consumer side, no User)
  let lonerPrimary: string; // PRIMARY happy-path
  let lonerCleanup: string; // orphan-cleanup
  let lonerAuth: string; // auth pass-through
  let lonerPdiPending: string; // redirectPDI pending
  let grantedIdentifier: string; // redirectPDI granted

  let privacyNoticeId: string;
  let noticeData: any[];

  const EMAIL_PRIMARY = "loner.primary@example.com";
  const EMAIL_CLEANUP = "loner.cleanup@example.com";
  const EMAIL_AUTH = "loner.auth@example.com";
  const EMAIL_PDI_PENDING = "loner.pdi@example.com";
  const EMAIL_GRANTED = "loner.granted@example.com";

  // The nock fixtures in ./fixtures/mock.ts intercept the contract service at
  // http://localhost:8888. Point the app at that host while this suite runs.
  let originalContractBaseUrl: string | undefined;

  const registerProviderIdentifier = async (email: string) => {
    const res = await supertest(app)
      .post(`/v1/users/register`)
      .set("Authorization", providerJWT)
      .send({ email, identifier: email });
    return res.body._id as string;
  };

  before(async () => {
    nock.cleanAll();

    originalContractBaseUrl = process.env.CONTRACT_SERVICE_BASE_URL;
    process.env.CONTRACT_SERVICE_BASE_URL = "http://localhost:8888";

    await mongoose.connect(process.env.MONGO_URI_TEST);
    await mongoose.connection.dropDatabase();

    serverInstance = await startServer(9091);
    app = serverInstance.app;

    // Provider
    const providerResponse = await supertest(app)
      .post(`/v1/participants/`)
      .send(testProvider1);
    providerId = providerResponse.body._id;
    providerBase64 = Buffer.from(testProvider1.selfDescriptionURL).toString(
      "base64"
    );

    const providerAuthResponse = await supertest(app)
      .post(`/v1/participants/login`)
      .send({
        clientID: testProvider1.clientID,
        clientSecret: testProvider1.clientSecret,
      });
    providerJWT = `Bearer ${providerAuthResponse.body.jwt}`;

    // Consumer (deliberately WITHOUT a user identifier for our loner emails)
    const consumerResponse = await supertest(app)
      .post(`/v1/participants/`)
      .send(testConsumer1);
    consumerId = consumerResponse.body._id;
    selfDescConsumer = testConsumer1.selfDescriptionURL;
    consumerBase64 = Buffer.from(testConsumer1.selfDescriptionURL).toString(
      "base64"
    );

    // Give the consumer a reachable dataspace endpoint so
    // registerNewUserToConsumerSide can contact it (we nock it below).
    await Participant.findByIdAndUpdate(consumerId, {
      dataspaceEndpoint: CONSUMER_DSC,
    });

    // Provider-only identifiers (unique emails => checkUserIdentifier creates
    // no User because there is no matching identifier on another participant).
    lonerPrimary = await registerProviderIdentifier(EMAIL_PRIMARY);
    lonerCleanup = await registerProviderIdentifier(EMAIL_CLEANUP);
    lonerAuth = await registerProviderIdentifier(EMAIL_AUTH);
    lonerPdiPending = await registerProviderIdentifier(EMAIL_PDI_PENDING);
    grantedIdentifier = await registerProviderIdentifier(EMAIL_GRANTED);

    // Generate the privacy notice from the contract and capture its id + data.
    setupnockMocks(providerBase64);
    const noticeResponse = await supertest(app)
      .get(`/v1/consents/${lonerPrimary}/${providerBase64}/${consumerBase64}`)
      .set("x-user-key", lonerPrimary)
      .expect(200);
    privacyNoticeId = noticeResponse.body[0]?._id;
    noticeData =
      noticeResponse.body?.[0]?.data?.length > 0
        ? noticeResponse.body[0].data
        : [{ resource: "test-resource" }];
  });

  after(async () => {
    process.env.CONTRACT_SERVICE_BASE_URL = originalContractBaseUrl;
    serverInstance?.server.close();
  });

  // PRIMARY fix
  it("auto-registers the user on the consumer side instead of returning 404", async () => {
    setupnockMocks(providerBase64);
    const loginScope = nock(CONSUMER_DSC)
      .post("/login")
      .reply(200, { content: { token: "consumer-dsc-token" } });
    const registrationScope = nock(CONSUMER_DSC)
      .post("/private/users/app")
      .reply(200, { ok: true });

    const response = await supertest(app)
      .post(`/v1/consents`)
      .set("x-user-key", lonerPrimary)
      .send({
        privacyNoticeId,
        email: EMAIL_PRIMARY,
        data: noticeData,
        event: "given",
      });

    expect(
      loginScope.isDone(),
      "consumer DSC /login should be called"
    ).to.equal(true);
    expect(
      registrationScope.isDone(),
      "consumer DSC /private/users/app (the registrationUri proxy) should be reached"
    ).to.equal(true);
    expect(response.status).to.equal(200);

    const pending = await Consent.findOne({
      providerUserIdentifier: lonerPrimary,
      privacyNotice: privacyNoticeId,
    });
    expect(pending, "a pending consent should be created").to.not.be.null;
    expect(pending?.status).to.equal("pending");
  });

  // Orphan cleanup
  it("leaves no orphan consent when the consumer DSC registration fails", async () => {
    setupnockMocks(providerBase64);
    nock(CONSUMER_DSC)
      .post("/login")
      .reply(200, { content: { token: "consumer-dsc-token" } });
    nock(CONSUMER_DSC)
      .post("/private/users/app")
      .reply(404, { error: "no registration uri configured" });

    const response = await supertest(app)
      .post(`/v1/consents`)
      .set("x-user-key", lonerCleanup)
      .send({
        privacyNoticeId,
        email: EMAIL_CLEANUP,
        data: noticeData,
        event: "given",
      });

    expect(response.status).to.equal(400);

    const orphan = await Consent.findOne({
      providerUserIdentifier: lonerCleanup,
      privacyNotice: privacyNoticeId,
    });
    expect(
      orphan,
      "the draft/pending consent must be cleaned up after a consumer-side failure"
    ).to.be.null;
  });

  // Auth pass-through
  it("does not 401 a userIdentifier that has no linked User", async () => {
    setupnockMocks(providerBase64);
    const contractBase64 = Buffer.from(CONTRACT_URI).toString("base64");

    const response = await supertest(app)
      .get(
        `/v1/consents/${lonerAuth}/${providerBase64}/${consumerBase64}/${contractBase64}`
      )
      .set("x-user-key", lonerAuth);

    expect(
      response.status,
      "verifyUserJWT must pass through instead of returning 401"
    ).to.not.equal(401);
    expect(response.status).to.equal(200);
    expect(response.body).to.be.an("array");
  });

  // Receipt null-safety
  it("builds a consent receipt without crashing when the consent has no user", async () => {
    setupnockMocks(providerBase64);

    const receipt = await consentToConsentReceipt({
      _id: new mongoose.Types.ObjectId(),
      user: null,
      dataConsumer: consumerId,
      dataProvider: providerId,
      privacyNotice: privacyNoticeId,
      schema_version: "0.2.0",
      purposes: [],
      event: [],
    } as any);

    expect(receipt.record.piiPrincipalId).to.equal(null);
  });

  // redirectPDI: pending consent must NOT be surfaced as an editable consentId
  it("does not surface a pending consent as an editable consentId", async () => {
    setupnockMocks(providerBase64);
    await Consent.create({
      contract: CONTRACT_URI,
      providerUserIdentifier: lonerPdiPending,
      consented: false,
      dataProvider: providerId,
      dataConsumer: consumerId,
      recipients: [selfDescConsumer],
      privacyNotice: privacyNoticeId,
      status: "pending",
    });

    const response = await supertest(app)
      .get(`/v1/consents/pdi/iframe`)
      .set("Authorization", providerJWT)
      .query({ userIdentifier: lonerPdiPending, privacyNoticeId })
      .expect(302);

    expect(
      response.headers.location,
      "a pending consent must not flip the iframe into re-confirm mode"
    ).to.not.include("consentId=");
  });

  // redirectPDI: granted consent IS surfaced as an editable consentId
  it("surfaces a granted consent as an editable consentId", async () => {
    setupnockMocks(providerBase64);
    const grantedUser = await User.create({
      email: EMAIL_GRANTED,
      identifiers: [grantedIdentifier],
    });
    await Consent.create({
      contract: CONTRACT_URI,
      providerUserIdentifier: grantedIdentifier,
      consented: true,
      user: grantedUser._id,
      dataProvider: providerId,
      dataConsumer: consumerId,
      recipients: [selfDescConsumer],
      privacyNotice: privacyNoticeId,
      status: "granted",
    });

    const response = await supertest(app)
      .get(`/v1/consents/pdi/iframe`)
      .set("Authorization", providerJWT)
      .query({ userIdentifier: grantedIdentifier, privacyNoticeId })
      .expect(302);

    expect(response.headers.location).to.include("consentId=");
  });
});
