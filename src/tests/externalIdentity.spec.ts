import { expect } from "chai";
import sinon from "sinon";
import { JWTPayload } from "jose";
import mongoose from "mongoose";
import { resetExternalIdpConfig } from "../config/externalIdp";
import { mapExternalSubjectToLocal } from "../libs/jwt/externalIdentity";
import { UnauthorizedError } from "../errors/UnauthorizedError";
import Participant from "../models/Participant/Participant.model";
import User from "../models/User/User.model";

const TRUSTED_ISSUER = "https://idp.example.test";
const AUDIENCE = "consent-manager";
const USER_EMAIL = "user@example.test";
const USER_ID = "5f9d88b9c9d1c80017a1b2c3";
const OTHER_USER_ID = "5f9d88b9c9d1c80017a1b2c5";
const PARTICIPANT_ID = "5f9d88b9c9d1c80017a1b2c4";
const SUBJECT_DID = "did:example:123456789abcdefghi";

/**
 * Stubs the `find().limit().lean()` chain used by the identity mapper.
 */
const stubFind = (
  model: typeof User | typeof Participant,
  documents: { _id: mongoose.Types.ObjectId }[]
) => {
  sinon.stub(model, "find").returns({
    limit: () => ({ lean: () => Promise.resolve(documents) }),
  } as never);
};

/** Builds a lean document stub carrying only the `_id` the mapper reads. */
const doc = (id: string) => ({ _id: new mongoose.Types.ObjectId(id) });

/**
 * Runs an operation and returns whatever it threw, or `undefined` on success.
 */
const captureError = async (operation: () => Promise<unknown>) => {
  try {
    await operation();
    return undefined;
  } catch (error) {
    return error;
  }
};

describe("External subject to local identity mapping", () => {
  beforeEach(() => {
    process.env.EXTERNAL_OIDC_ISSUERS = TRUSTED_ISSUER;
    process.env.EXTERNAL_OIDC_AUDIENCE = AUDIENCE;
    process.env.EXTERNAL_OIDC_SUBJECT_CLAIM = "sub";
    resetExternalIdpConfig();
  });

  afterEach(() => {
    sinon.restore();
    delete process.env.EXTERNAL_OIDC_ISSUERS;
    delete process.env.EXTERNAL_OIDC_AUDIENCE;
    delete process.env.EXTERNAL_OIDC_SUBJECT_CLAIM;
    resetExternalIdpConfig();
  });

  it("resolves a subject matching a User email", async () => {
    stubFind(User, [doc(USER_ID)]);
    stubFind(Participant, []);

    const identity = await mapExternalSubjectToLocal({ sub: USER_EMAIL });

    expect(identity.user?.id).to.equal(USER_ID);
    expect(identity.participant).to.equal(undefined);
  });

  it("resolves a DID held in the email field, with no schema change", async () => {
    stubFind(User, [doc(USER_ID)]);
    stubFind(Participant, []);

    const identity = await mapExternalSubjectToLocal({ sub: SUBJECT_DID });

    expect(identity.user?.id).to.equal(USER_ID);
    expect(
      (User.find as sinon.SinonStub).calledWith({ email: SUBJECT_DID })
    ).to.equal(true);
  });

  it("resolves a subject matching a Participant did", async () => {
    stubFind(User, []);
    stubFind(Participant, [doc(PARTICIPANT_ID)]);

    const identity = await mapExternalSubjectToLocal({ sub: SUBJECT_DID });

    expect(identity.participant?.id).to.equal(PARTICIPANT_ID);
    expect(identity.user).to.equal(undefined);
  });

  it("never resolves through UserIdentifier", async () => {
    stubFind(User, [doc(USER_ID)]);
    stubFind(Participant, []);

    await mapExternalSubjectToLocal({ sub: USER_EMAIL });

    // The mapper must not read participant-writable identifier documents; the
    // only collections it may consult are User and Participant.
    expect((User.find as sinon.SinonStub).calledOnce).to.equal(true);
    expect((Participant.find as sinon.SinonStub).calledOnce).to.equal(true);
  });

  it("rejects a subject that resolves to nothing", async () => {
    stubFind(User, []);
    stubFind(Participant, []);

    const error = await captureError(() =>
      mapExternalSubjectToLocal({ sub: SUBJECT_DID })
    );

    expect(error).to.be.instanceOf(UnauthorizedError);
  });

  it("rejects an ambiguous subject rather than picking a match", async () => {
    stubFind(User, [doc(USER_ID), doc(OTHER_USER_ID)]);
    stubFind(Participant, []);

    const error = await captureError(() =>
      mapExternalSubjectToLocal({ sub: USER_EMAIL })
    );

    expect(error).to.be.instanceOf(UnauthorizedError);
  });

  describe("missing or unusable subject claims (parameterized)", () => {
    const badClaimCases: { name: string; claims: JWTPayload }[] = [
      { name: "an absent claim", claims: {} },
      {
        name: "a non-string claim",
        claims: { sub: 42 } as unknown as JWTPayload,
      },
      { name: "an empty string", claims: { sub: "" } },
    ];

    badClaimCases.forEach(({ name, claims }) => {
      it(`rejects ${name}`, async () => {
        stubFind(User, [doc(USER_ID)]);
        stubFind(Participant, []);

        const error = await captureError(() =>
          mapExternalSubjectToLocal(claims)
        );

        expect(error).to.be.instanceOf(UnauthorizedError);
      });
    });
  });

  describe("email subject claim", () => {
    beforeEach(() => {
      process.env.EXTERNAL_OIDC_SUBJECT_CLAIM = "email";
      resetExternalIdpConfig();
    });

    it("accepts a verified email", async () => {
      stubFind(User, [doc(USER_ID)]);
      stubFind(Participant, []);

      const identity = await mapExternalSubjectToLocal({
        email: USER_EMAIL,
        email_verified: true,
      });

      expect(identity.user?.id).to.equal(USER_ID);
    });

    const unverifiedCases = [
      { name: "email_verified absent", claims: { email: USER_EMAIL } },
      {
        name: "email_verified false",
        claims: { email: USER_EMAIL, email_verified: false },
      },
      {
        name: "email_verified as the string 'true'",
        claims: { email: USER_EMAIL, email_verified: "true" },
      },
    ];

    unverifiedCases.forEach(({ name, claims }) => {
      it(`rejects an email subject with ${name}`, async () => {
        stubFind(User, [doc(USER_ID)]);
        stubFind(Participant, []);

        const error = await captureError(() =>
          mapExternalSubjectToLocal(claims)
        );

        expect(error).to.be.instanceOf(UnauthorizedError);
      });
    });
  });
});
