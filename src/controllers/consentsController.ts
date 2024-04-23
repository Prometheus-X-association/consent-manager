import { NextFunction, Request, Response } from "express";
import Consent from "../models/Consent/Consent.model";
import {
  getAvailableExchangesForParticipant,
  getPrivacyNoticesFromContractsBetweenParties,
} from "../utils/contracts";
import { NotFoundError } from "../errors/NotFoundError";
import { BadRequestError } from "../errors/BadRequestError";
import PrivacyNotice from "../models/PrivacyNotice/PrivacyNotice.model";
import UserIdentifier from "../models/UserIdentifier/UserIdentifier.model";
import User from "../models/User/User.model";
import { IPrivacyNotice } from "../types/models";
import Participant from "../models/Participant/Participant.model";
import { Logger } from "../libs/loggers";
import axios from "axios";
import * as CryptoJS from "crypto";
import { readFileSync } from "fs";
import path from "path";
import crypto from "crypto";
import _ from "lodash";
import { MailchimpClient } from "../libs/emails/mailchimp/MailchimpClient";
import { urlChecker } from "../utils/urlChecker";
import { checkUserIdentifier } from "../utils/UserIdentifierMatchingProcessor";
import mongoose from "mongoose";

const consentSignaturePrivateKey = readFileSync(
  path.join(__dirname, "..", "config", "keys", "consentSignature.pem")
);

const AESKey = readFileSync(
  path.join(__dirname, "..", "config", "keys", "AESKey.pem")
);

/**
 * Gets the list of given consents of a user
 */
export const getUserConsents = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { limit = "10", page = "1" } = req.query;

    const skip = (parseInt(page.toString()) - 1) * parseInt(limit.toString());

    let consents;
    if (req?.user?.id) {
      consents = await Consent.find({ user: req.user?.id })
        .skip(skip)
        .limit(parseInt(limit.toString()));
    } else if (req?.userIdentifier?.id) {
      consents = await Consent.find({
        $or: [
          { consumerUserIdentifier: req.userIdentifier?.id },
          { providerUserIdentifier: req.userIdentifier?.id },
        ],
      })
        .skip(skip)
        .limit(parseInt(limit.toString()));
    }

    const totalCount = await Consent.countDocuments();

    const totalPages = Math.ceil(totalCount / parseInt(limit.toString()));

    res.json({ consents, totalCount, totalPages });
  } catch (err) {
    next(err);
  }
};

/**
 * Gets the privacy notices for a consent based on existing
 * contracts between two participants
 */
export const getPrivacyNotices = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let { providerId, consumerId } = req.params;
    const privacyNotices = await getPrivacyNoticesFromContractsBetweenParties(
      providerId,
      consumerId
    );

    consumerId = Buffer.from(consumerId, "base64").toString();
    providerId = Buffer.from(providerId, "base64").toString();

    const existingPrivacyNotices: any = await PrivacyNotice.find({
      dataProvider: providerId,
      recipients: { $in: consumerId },
    }).lean();

    const existingPrivacyNoticesIds = existingPrivacyNotices.map(
      (element: { contract: any }) => element.contract
    );

    const privacyNoticesIds = privacyNotices.map(
      (element: { contract: any }) => element.contract
    );

    if (!privacyNotices && !existingPrivacyNotices)
      return res.status(404).json({ error: "No contracts found" });

    const filteredPrivacyNoticesComingFromContracts: IPrivacyNotice[] = [];

    if (!_.isEqual(existingPrivacyNoticesIds, privacyNoticesIds)) {
      const filteredIds = privacyNoticesIds.filter(
        (element) => !existingPrivacyNoticesIds.includes(element)
      );

      filteredPrivacyNoticesComingFromContracts.push(
        ...privacyNotices.filter((element) =>
          filteredIds.includes(element.contract)
        )
      ); // These are new and should be saved after the filtering

      // Find the privacy notices from the existing ones that are similar to the ones
      // coming from the contracts
      // If a similar one is found it should be used alongside the other existing
      // privacy notices in the final returned result.

      for (const pn of filteredPrivacyNoticesComingFromContracts) {
        const newPn = new PrivacyNotice(pn);
        await newPn.save();
      }
    }

    const finalPrivacyNotices: any = await PrivacyNotice.find({
      dataProvider: providerId,
      recipients: { $in: consumerId },
    }).lean(); // This is what will be sent back

    return res.json(finalPrivacyNotices);
  } catch (err) {
    next(err);
  }
};

/**
 * Returns the privacy notice by ID
 * @author Felix Bole
 */
export const getPrivacyNoticeById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let consumerEmail: boolean;

    const userIdentifier = await UserIdentifier.findById(
      req.userIdentifier?.id
    );
    const sameEmailUserIdentifier = await UserIdentifier.findOne({
      _id: {
        $ne: userIdentifier._id,
      },
      email: userIdentifier.email,
    });

    if (!sameEmailUserIdentifier) {
      consumerEmail = true;
    } else {
      consumerEmail = false;
    }

    const pn = await PrivacyNotice.findById(req.params.privacyNoticeId).lean();
    if (!pn) {
      return res.status(404).json({ error: "Privacy notice not found" });
    }

    return res.json({
      ...pn,
      consumerEmail,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Gets the consent of the specified ID from the user
 */
export const getUserConsentById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let consent;
    if (req?.user?.id) {
      const userId = req.user?.id;

      consent = await Consent.findOne({
        _id: req.params.id,
        user: userId,
      });
    } else if (req?.userIdentifier?.id) {
      consent = await Consent.findOne({
        _id: req.params.id,
        $or: [
          { consumerUserIdentifier: req.userIdentifier?.id },
          { providerUserIdentifier: req.userIdentifier?.id },
        ],
      });
    }

    if (!consent) throw new NotFoundError();

    res.json(consent);
  } catch (err) {
    next(err);
  }
};

const findMatchingUserIdentifier = async (
  email: string,
  participantId: string
) => {
  const userIdentifier = await UserIdentifier.findOne({
    email,
    attachedParticipant: participantId,
  });

  return userIdentifier;
};

/**
 * Gives consent on a contractualised data exchange
 * This method is initiated by a call from the User
 * he must be authenticated to perform it
 */
export const giveConsent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let userId;
    const providerUserIdentifier = await UserIdentifier.findById(
      req.userIdentifier?.id
    ).lean();
    const { privacyNoticeId, email } = req.body;
    let { data } = req.body;
    const { triggerDataExchange } = req.query;

    if (!privacyNoticeId) {
      throw new BadRequestError("Missing privacyNoticeId", [
        { field: "privacyNoticeId", message: "Mandatory field" },
      ]);
    }

    const privacyNotice = await PrivacyNotice.findById(privacyNoticeId);
    if (!privacyNotice)
      return res.status(404).json({ error: "privacy notice not found" });

    // Raccomodate the SD URL to the internal participant ID
    // ? What if it comes from another consent service ?
    const dataProviderSD = privacyNotice.dataProvider;
    const dataProvider = await Participant.findOne({
      selfDescriptionURL: dataProviderSD,
    }).lean();

    const dataConsumerSD =
      privacyNotice.recipients.length > 0 ? privacyNotice.recipients[0] : null;
    const dataConsumer = await Participant.findOne({
      selfDescriptionURL: dataConsumerSD,
    }).lean();

    if (!dataConsumerSD)
      return res
        .status(404)
        .json({ error: "Data consumer not found in privacy notice" });

    let consumerUserIdentifier = await UserIdentifier.findOne({
      attachedParticipant: dataConsumer?._id,
      email: providerUserIdentifier.email,
    }).lean();

    const consumerPurpose = privacyNotice.purposes[0].serviceOffering;
    const consumerServiceOffering = await axios.get(consumerPurpose, {
      headers: { "Content-Type": "application/json" },
    });
    const providerUserIdentifierDocument = await UserIdentifier.findById(
      providerUserIdentifier
    ).lean();

    //userInteraction case
    if (
      !consumerUserIdentifier &&
      !consumerServiceOffering.data.userInteraction
    ) {
      consumerUserIdentifier = await userInteraction({
        dataConsumer,
        providerUserIdentifierDocument,
        consumerUserIdentifier,
        email,
        userParticipantId:
          providerUserIdentifier.attachedParticipant.toString(),
      });
    }

    // If user identifier in consumer was not found it is possible it exists
    // for another email. If it's the case, the user should provide the email
    // used in the consumer app and the consent service should validate the
    // consent grant by mail with the provided email.
    if (
      !consumerUserIdentifier &&
      !email &&
      !consumerServiceOffering.data.userInteraction
    ) {
      const registerNewUserToConsumerSideResponse =
        await registerNewUserToConsumerSide({
          privacyNotice,
          req,
          providerUserIdentifier,
          dataProvider,
          dataConsumer,
          providerUserIdentifierDocument,
          data,
        });

      if (registerNewUserToConsumerSideResponse.error) {
        return res
          .status(registerNewUserToConsumerSideResponse?.status)
          .json(registerNewUserToConsumerSideResponse?.error);
      } else {
        return res
          .status(registerNewUserToConsumerSideResponse?.status)
          .json(registerNewUserToConsumerSideResponse?.consent);
      }
    }

    //email is given
    if (!consumerUserIdentifier && email) {
      const emailReattachedResponse = await emailReattached({
        email,
        dataConsumerId: dataConsumer?._id,
        dataProviderId: dataProvider?._id,
        res,
        privacyNotice,
        userId,
        providerUserIdentifier,
        data,
        triggerDataExchange,
      });

      if (emailReattachedResponse.status !== 200) {
        return res
          .status(emailReattachedResponse?.status)
          .json(emailReattachedResponse?.message);
      } else if (
        emailReattachedResponse?.case === "user-manual-registration-found" &&
        emailReattachedResponse?.userId &&
        emailReattachedResponse?.consumerUserIdentifier
      ) {
        userId = emailReattachedResponse?.userId;
        consumerUserIdentifier =
          emailReattachedResponse?.consumerUserIdentifier;
      } else if (
        emailReattachedResponse?.status === 200 &&
        emailReattachedResponse?.case !== "user-manual-registration-found"
      ) {
        return res.status(emailReattachedResponse?.status).json({
          message: emailReattachedResponse?.message,
          case: emailReattachedResponse?.case,
        });
      }
    }

    //case 3 User identifiers have the same email but no user attached to either of them
    if (providerUserIdentifier && consumerUserIdentifier && !userId) {
      const verifyUser = await User.findOne({
        identifiers: {
          $in: [providerUserIdentifier._id, consumerUserIdentifier._id],
        },
      }).lean();

      if (!verifyUser) {
        const user = new User({
          email: consumerUserIdentifier.email,
          identifiers: [providerUserIdentifier._id, consumerUserIdentifier._id],
        });
        userId = user._id;
        await user.save();
      } else {
        userId = verifyUser._id;
      }
    }

    if (userId) {
      const verification = await Consent.findOne({
        providerUserIdentifier: providerUserIdentifier._id,
        consumerUserIdentifier: consumerUserIdentifier._id,
        dataProvider: dataProvider._id,
        privacyNotice: privacyNoticeId,
        user: userId,
      }).lean();

      if (verification) {
        return res.status(200).json(verification);
      }

      if (data) {
        data = privacyNotice.data.filter((dt: any) => {
          if (data.includes(dt.resource)) {
            return dt;
          }
        });
      }

      const consent = new Consent({
        privacyNotice: privacyNotice._id,
        user: userId,
        providerUserIdentifier: providerUserIdentifier,
        consumerUserIdentifier: consumerUserIdentifier,
        dataProvider: dataProvider?._id,
        dataConsumer: dataConsumer?._id,
        recipients: privacyNotice.recipients,
        purposes: [...privacyNotice.purposes],
        data: data?.length > 0 ? data : [...privacyNotice.data],
        status: "granted",
        consented: true,
        contract: privacyNotice.contract,
      });

      const newConsent = await consent.save();

      return res.status(201).json(newConsent);
    } else {
      return res.status(404).json({ error: "No Matching user found" });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Gives consent on email validation from the user
 */
export const giveConsentOnEmailValidation = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      dataProvider,
      dataConsumer,
      privacyNotice,
      data,
      triggerDataExchange: triggerDataExchangeParams,
      providerUserIdentifier,
      consumerUserIdentifier,
      providerUser,
      consumerUser,
    } = req.query;
    const decodedDP = decodeURIComponent(dataProvider.toString());
    const decodedPN = decodeURIComponent(privacyNotice.toString());
    let decodedData;
    let selectedData;

    if (data !== undefined && data && data !== "undefined") {
      decodedData = decodeURIComponent(data.toString());
      selectedData = JSON.parse(decodedData);
    }

    const pn = await PrivacyNotice.findById(decodedPN);
    if (!pn) return res.status(404).json({ error: "privacy notice not found" });

    const dp = await Participant.findById(decodedDP);
    if (!dp) {
      return res.status(404).json({ error: "data provider not found" });
    }

    const verify = await Consent.findOne({
      privacyNotice: privacyNotice,
      user: providerUser || consumerUser,
      dataProvider: dataProvider,
      dataConsumer: dataConsumer,
      recipients: pn.recipients,
      purposes: pn.purposes,
      data: selectedData,
      status: "granted",
      consented: true,
      providerUserIdentifier: providerUserIdentifier,
      consumerUserIdentifier: consumerUserIdentifier,
      contract: pn.contract,
    }).lean();

    if (verify) {
      return res.status(200).json({
        message: "Already granted consent. You may close this tab now",
      });
    }

    let userToUpdate;

    // case 2.a && case 2.c2
    if (
      providerUser &&
      consumerUserIdentifier &&
      !consumerUser &&
      providerUserIdentifier
    ) {
      userToUpdate = await User.findById(providerUser);

      if (
        userToUpdate &&
        !userToUpdate.identifiers.includes(
          new mongoose.Types.ObjectId(consumerUserIdentifier.toString())
        )
      ) {
        userToUpdate.identifiers.push(
          new mongoose.Types.ObjectId(consumerUserIdentifier.toString())
        );
      }
    }

    // case 2.b
    if (
      !providerUser &&
      !consumerUserIdentifier &&
      consumerUser &&
      providerUserIdentifier
    ) {
      userToUpdate = await User.findById(consumerUser);

      if (
        userToUpdate &&
        !userToUpdate.identifiers.includes(
          new mongoose.Types.ObjectId(providerUserIdentifier.toString())
        )
      ) {
        userToUpdate.identifiers.push(
          new mongoose.Types.ObjectId(providerUserIdentifier.toString())
        );
      }
    }

    // case 2.c2
    if (
      !providerUser &&
      consumerUserIdentifier &&
      consumerUser &&
      providerUserIdentifier
    ) {
      userToUpdate = await User.findById(consumerUser);
      if (
        userToUpdate &&
        !userToUpdate.identifiers.includes(
          new mongoose.Types.ObjectId(providerUserIdentifier.toString())
        )
      ) {
        userToUpdate.identifiers.push(
          new mongoose.Types.ObjectId(providerUserIdentifier.toString())
        );
      }
    }

    // case 2.d
    if (
      !providerUser &&
      consumerUserIdentifier &&
      !consumerUser &&
      providerUserIdentifier
    ) {
      const consumerUserIdentifierDocument = await UserIdentifier.findById(
        consumerUserIdentifier
      ).lean();
      userToUpdate = await User.findOne({
        email: consumerUserIdentifierDocument.email,
      });

      if (!userToUpdate) {
        userToUpdate = new User({
          email: consumerUserIdentifierDocument.email,
          identifiers: [consumerUserIdentifier, providerUserIdentifier],
        });
      }
    }

    const consent = new Consent({
      privacyNotice: privacyNotice,
      user: userToUpdate._id,
      dataProvider: dataProvider,
      dataConsumer: dataConsumer,
      recipients: pn.recipients,
      purposes: pn.purposes,
      data: selectedData,
      status: "granted",
      consented: true,
      providerUserIdentifier: providerUserIdentifier,
      consumerUserIdentifier: consumerUserIdentifier,
      contract: pn.contract,
    });

    await Promise.all([userToUpdate.save(), consent.save()]);

    if (triggerDataExchangeParams) {
      try {
        const consentDocument: any = await Consent.findById(consent._id)
          .populate([{ path: "dataProvider" }])
          .lean();
        if (!consentDocument)
          return res.status(404).json({ error: "consent not found" });

        if (consentDocument.status !== "granted") {
          return res
            .status(401)
            .json({ error: "Consent has not been granted by user" });
        }

        const payload = {
          ...consentDocument,
        };

        const { signedConsent, encrypted } = encryptPayloadAndKey(payload);

        try {
          await axios.post(
            consentDocument.dataProvider.endpoints.consentExport,
            {
              signedConsent,
              encrypted,
            }
          );

          return res.status(200).json({
            message:
              "successfully sent consent to the provider's consent export endpoint to trigger the data exchange",
            consent,
          });
        } catch (err) {
          Logger.error({
            location: "consents.triggerDataExchange",
            message: err.message,
          });
          return res.status(424).json({
            error: "Failed to communicate with the data consumer connector",
            message:
              "An error occurred after calling the consent data exchange trigger endpoint of the consumer service",
          });
        }
      } catch (err) {
        next(err);
      }
    }

    return res.status(200).json({
      message: "Successfully granted consent. You may close this tab now",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Revoke consent
 */
export const revokeConsent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let consent;
    if (req?.user?.id) {
      const userId = req.user?.id;

      consent = await Consent.findOne({
        _id: req.params.id,
        user: userId,
      });
    } else if (req.userIdentifier?.id) {
      consent = await Consent.findOne({
        _id: req.params.id,
        $or: [
          { consumerUserIdentifier: req.userIdentifier?.id },
          { providerUserIdentifier: req.userIdentifier?.id },
        ],
      });
    }
    if (!consent) throw new NotFoundError("Consent not found");

    consent.consented = false;
    consent.status = "revoked";
    await consent.save();

    res.status(200).json(consent);
  } catch (err) {
    next(err);
  }
};

/**
 * Uses a given consent to trigger a data exchange
 */
export const triggerDataExchange = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { consentId } = req.params;
    const consent: any = await Consent.findById(consentId)
      .populate([
        { path: "dataConsumer", select: "-clientID -clientSecret" },
        { path: "dataProvider", select: "-clientID -clientSecret" },
      ])
      .lean();
    if (!consent) return res.status(404).json({ error: "consent not found" });

    if (consent.status !== "granted") {
      return res
        .status(401)
        .json({ error: "Consent has not been granted by user" });
    }

    const payload = {
      ...consent,
    };

    const { signedConsent, encrypted } = encryptPayloadAndKey(payload);

    try {
      const consentExportResponse = await axios.post(
        consent.dataProvider.endpoints.consentExport,
        {
          signedConsent,
          encrypted,
        }
      );

      return res.status(200).json({
        message:
          "successfully sent consent to the provider's consent export endpoint to trigger the data exchange",
        consent,
        dataExchangeId: consentExportResponse?.data?.dataExchangeId,
      });
    } catch (err) {
      Logger.error({
        location: "consents.triggerDataExchange",
        message: err.message,
      });
      return res.status(424).json({
        error: "Failed to communicate with the data consumer connector",
        message:
          "An error occurred after calling the consent data exchange trigger endpoint of the consumer service",
      });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Verifies the provider generated token and attaches it to the consent
 * to be sent to the consumer
 */
export const attachTokenToConsent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { consentId } = req.params;
    const { token, providerDataExchangeId } = req.body;
    const consent: any = await Consent.findById(consentId)
      .populate([
        { path: "dataConsumer", select: "-clientID -clientSecret" },
        { path: "dataProvider", select: "-clientID -clientSecret" },
        { path: "providerUserIdentifier" },
        { path: "consumerUserIdentifier" },
      ])
      .lean();
    if (!consent) return res.status(404).json({ error: "Consent not found" });

    const updatedConsent = await Consent.findByIdAndUpdate(
      consentId,
      {
        token: token,
      },
      { new: true }
    )
      .populate([
        { path: "dataConsumer", select: "-clientID -clientSecret" },
        { path: "dataProvider", select: "-clientID -clientSecret" },
        { path: "providerUserIdentifier" },
        { path: "consumerUserIdentifier" },
      ])
      .lean();

    const payload = {
      ...updatedConsent,
      providerDataExchangeId,
    };

    const { signedConsent, encrypted } = encryptPayloadAndKey(payload);

    try {
      await axios.post(
        consent.dataConsumer.endpoints.consentImport,
        {
          dataProviderEndpoint: consent.dataProvider.endpoints.dataExport,
          signedConsent,
          encrypted,
        },
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (err) {
      Logger.error({ location: "consents.attachToken", message: err.message });
    }

    return res
      .status(200)
      .json({ message: "successfully forwarded consent to the data consumer" });
  } catch (err) {
    Logger.error(err);
    next(err);
  }
};

/**
 * Verifies the token & consent validity
 */
export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { consentId } = req.params;
    const { token } = req.body;
    const consent = await Consent.findById(consentId);
    if (!consent) return res.status(404).json({ error: "Consent not found" });
    const consentToken = consent.token;
    if (!consentToken || token !== consentToken)
      return res
        .status(400)
        .json({ error: "token does not match consent token" });

    return res
      .status(200)
      .json({ message: "token matches consent token", verified: true });
  } catch (err) {
    next(err);
  }
};

export const encryptPayloadAndKey = (payload: object) => {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      "AES-256-GCM",
      AESKey.toString().trim(),
      iv
    );
    const signedConsent = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(payload)).toString(), "utf-8"),
      cipher.final(),
    ]);

    const privateKey = CryptoJS.createPrivateKey({
      key: consentSignaturePrivateKey.toString().trim(),
      passphrase: "",
    });
    const encrypted = CryptoJS.privateEncrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      AESKey
    );

    return {
      signedConsent: `${iv.toString("hex")}:${signedConsent.toString("hex")}`,
      encrypted,
    };
  } catch (e) {
    Logger.error(e);
  }
};

/**
 * Returns all available exchanges for a participant
 */
export const getAvailableExchanges = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userParticipant } = req.session;
    const { as } = req.params;

    const participant = await Participant.findById(userParticipant.id).lean();

    if (!participant) {
      throw new Error("Participant not found");
    }

    if (!as) {
      throw new Error("Missing parameters");
    }

    const exchanges = await getAvailableExchangesForParticipant(
      participant?.selfDescriptionURL,
      as
    );

    return res.status(200).json({
      participant: {
        selfDescription: participant.selfDescriptionURL,
        base64SelfDescription: Buffer.from(
          participant.selfDescriptionURL
        ).toString("base64"),
      },
      exchanges,
    });
  } catch (err) {
    next(err);
  }
};

const dataExchanges = async (consentId: string) => {
  const consent: any = await Consent.findById(consentId)
    .populate([
      { path: "dataConsumer", select: "-clientID -clientSecret" },
      { path: "dataProvider", select: "-clientID -clientSecret" },
    ])
    .lean();
  if (!consent) throw new Error("consent not found");

  if (consent.status !== "granted") {
    throw new Error("Consent has not been granted by user");
  }

  const payload = {
    ...consent,
  };

  const { signedConsent, encrypted } = encryptPayloadAndKey(payload);

  const consentExportResponse = await axios.post(
    consent.dataProvider.endpoints.consentExport,
    {
      signedConsent,
      encrypted,
    }
  );

  return {
    dataExchangeId: consentExportResponse?.data?.dataExchangeId,
    consent,
  };
};

/**
 * Resume a given consent
 */
export const resumeConsent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { consentId } = req.params;
    const consent: any = await Consent.findById(consentId).populate([
      { path: "dataConsumer", select: "-clientID -clientSecret" },
      { path: "dataProvider", select: "-clientID -clientSecret" },
    ]);
    if (!consent) return res.status(404).json({ error: "consent not found" });

    if (consent.status !== "pending" && consent.status !== "draft") {
      return res.status(400).json({ error: "The consent can't be resume" });
    }

    const { internalID, email } = req.body;

    //verify payload to create userIdentifier
    if (internalID && email) {
      const userIdentifier = new UserIdentifier({
        email,
        identifier: internalID,
        attachedParticipant: req.userParticipant.id,
      });

      await userIdentifier.save();

      //add missing information in consent
      consent.consumerUserIdentifier = userIdentifier._id;
      consent.consented = true;

      const user = await checkUserIdentifier(
        email,
        req.userParticipant.id,
        userIdentifier._id
      );

      // verify if data exchange can be made
      if (consent.status === "draft") {
        consent.status = "granted";
        if (!consent.user) {
          consent.user = user._id;
        }
        //save consent
        await dataExchanges(consentId);
      } else if (consent.status === "pending") {
        consent.status = "granted";
        if (!consent.user) {
          consent.user = user._id;
        }
        //save consent
        await consent.save();
      }

      //return userIdentifier and consent
      return res.status(200).json(consent);
    }
  } catch (err) {
    next(err);
  }
};

const userInteraction = async ({
  dataConsumer,
  providerUserIdentifierDocument,
  consumerUserIdentifier,
  email,
  userParticipantId,
}: {
  dataConsumer: any;
  providerUserIdentifierDocument: any;
  consumerUserIdentifier: any;
  email: string;
  userParticipantId: string;
}) => {
  // create userIdentifier for consumer
  const consumerNewUserIdentifier = new UserIdentifier({
    attachedParticipant: dataConsumer?._id.toString(),
    email: providerUserIdentifierDocument.email,
    identifier: providerUserIdentifierDocument.email,
  });

  await consumerNewUserIdentifier.save();

  // register userIdentifier into consumer DSC
  //login
  const consumerLogin = await axios.post(
    urlChecker(dataConsumer.dataspaceEndpoint, "login"),
    {
      serviceKey: dataConsumer.clientID,
      secretKey: dataConsumer.clientSecret,
    },
    {
      headers: { "Content-Type": "application/json" },
    }
  );

  const consumerRegisterUser = await axios.post(
    urlChecker(dataConsumer.dataspaceEndpoint, "private/users/register"),
    {
      email: consumerNewUserIdentifier.email,
      internalID: consumerNewUserIdentifier.identifier,
      userIdentifier: consumerNewUserIdentifier._id,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${consumerLogin.data.content.token}`,
      },
    }
  );

  if (consumerRegisterUser.data.code === 200) {
    consumerUserIdentifier = consumerNewUserIdentifier._id;
    await checkUserIdentifier(
      providerUserIdentifierDocument.email,
      dataConsumer?._id.toString(),
      consumerNewUserIdentifier._id
    );
  }

  return consumerUserIdentifier;
};

const registerNewUserToConsumerSide = async ({
  privacyNotice,
  req,
  providerUserIdentifier,
  dataProvider,
  dataConsumer,
  providerUserIdentifierDocument,
  data,
}: {
  privacyNotice: any;
  req: any;
  providerUserIdentifier: any;
  dataProvider: any;
  dataConsumer: any;
  providerUserIdentifierDocument: any;
  data: any;
}): Promise<{ consent?: any; error?: string; status: number }> => {
  {
    //draft consent
    let consent;
    const verifyDraftConsent = await Consent.findOne({
      privacyNotice: privacyNotice._id,
      providerUserIdentifier: providerUserIdentifier,
      dataProvider: dataProvider?._id,
      dataConsumer: dataConsumer?._id,
      recipients: privacyNotice.recipients,
      purposes: privacyNotice.purposes,
      data: data ?? privacyNotice.data,
      status: req.query.triggerDataExchange ? "draft" : "pending",
      consented: false,
      contract: privacyNotice.contract,
    });

    if (!verifyDraftConsent) {
      consent = new Consent({
        privacyNotice: privacyNotice._id,
        providerUserIdentifier: providerUserIdentifier,
        dataProvider: dataProvider?._id,
        dataConsumer: dataConsumer?._id,
        recipients: privacyNotice.recipients,
        purposes: privacyNotice.purposes,
        data: data.length > 0 ? data : [...privacyNotice.data],
        status: req.query.triggerDataExchange ? "draft" : "pending",
        consented: false,
        contract: privacyNotice.contract,
      });
      await consent.save();
    } else {
      consent = verifyDraftConsent;
    }

    // call new dsc endpoint
    //login
    const consumerLogin = await axios.post(
      urlChecker(dataConsumer.dataspaceEndpoint, "login"),
      {
        serviceKey: dataConsumer.clientID,
        secretKey: dataConsumer.clientSecret,
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    //post to register user app side
    try {
      const consumerRegisterUserAppSide = await axios.post(
        urlChecker(dataConsumer.dataspaceEndpoint, "private/users/app"),
        {
          email: providerUserIdentifierDocument.email,
          consentID: consent._id,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${consumerLogin.data.content.token}`,
          },
        }
      );
      if (consumerRegisterUserAppSide.status === 200) {
        return {
          status: 200,
          consent,
        };
      }
    } catch (e) {
      if (e?.response?.status === 404) {
        return {
          status: 400,
          error: "Registration Uri error.",
        };
      } else if (e?.response?.status === 500) {
        return {
          status: 400,
          error: "Registration Error.",
        };
      } else {
        return {
          status: 400,
          error:
            "User identifier not found in provider and no email was passed in the payload to look for an existing identifier with a different user email. Please provide the email",
        };
      }
    }
  }
};

const emailReattached = async ({
  email,
  dataConsumerId,
  dataProviderId,
  privacyNotice,
  userId,
  providerUserIdentifier,
  data,
  triggerDataExchange,
}: {
  email: any;
  dataConsumerId: string;
  dataProviderId: string;
  res: any;
  privacyNotice: any;
  userId: any;
  providerUserIdentifier: any;
  data: any;
  triggerDataExchange?: any;
}): Promise<{
  message: string;
  case?: string;
  status: number;
  userId?: string;
  consumerUserIdentifier?: any;
}> => {
  const existingConsumerUserIdentifier = await findMatchingUserIdentifier(
    email,
    dataConsumerId
  );

  if (!existingConsumerUserIdentifier) {
    return {
      message: "No user identifier found in the consumer for email " + email,
      status: 404,
    };
  } else {
    // User identifier found but not attached to the main user, requires user validation
    // by email to re-trigger the consent grant

    const providerUser = await User.findOne({
      identifiers: providerUserIdentifier._id,
    });
    const consumerUser = await User.findOne({
      identifiers: existingConsumerUserIdentifier._id,
    });

    // case 2.a User identifier from provider has user attached and user identifier from consumer has no user
    if (providerUser && !consumerUser) {
      return sendEmail({
        email,
        dataConsumerId,
        dataProviderId,
        privacyNotice,
        providerUser: providerUser._id,
        data,
        providerUserIdentifier,
        consumerUserIdentifier: existingConsumerUserIdentifier,
        triggerDataExchange,
      });
    }

    // case 2.b User identifier from Provider has no user attached and user identifier from consumer has a user attached
    if (!providerUser && consumerUser) {
      return sendEmail({
        email,
        dataConsumerId,
        dataProviderId,
        privacyNotice,
        consumerUser: consumerUser._id,
        providerUserIdentifier,
        data,
        triggerDataExchange,
      });
    }

    // case 2.c User identifier from Provider has a user attached and user identifier from consumer has another user attached
    if (providerUser && consumerUser) {
      if (providerUser._id !== consumerUser._id) {
        // case 2.c1: User identifier from Provider has a user attached and user identifier from consumer has another user attached
        // One of the users has the “manual registration” information (first name, last name etc.)
        if (providerUser.password && !consumerUser.password) {
          providerUser.identifiers.push(existingConsumerUserIdentifier._id);
          await providerUser.save();
          return {
            message: "Ok",
            status: 200,
            case: "user-manual-registration-found",
            userId: providerUser._id,
            consumerUserIdentifier: existingConsumerUserIdentifier,
          };
        }

        if (!providerUser.password && consumerUser.password) {
          consumerUser.identifiers.push(providerUserIdentifier._id);
          await consumerUser.save();
          return {
            message: "Ok",
            status: 200,
            case: "user-manual-registration-found",
            userId: consumerUser._id,
            consumerUserIdentifier: existingConsumerUserIdentifier,
          };
        }

        // case 2.c2: User identifier from Provider has a user attached and user identifier from consumer has another user attached
        // No user account have the “manual registration” information
        if (!providerUser.password && !consumerUser.password) {
          //delete useless user
          await providerUser.deleteOne();
          return sendEmail({
            email,
            dataConsumerId,
            dataProviderId,
            privacyNotice,
            providerUserIdentifier,
            consumerUserIdentifier: existingConsumerUserIdentifier,
            data,
            consumerUser: consumerUser._id,
            triggerDataExchange,
          });
        }
      }
    }

    // case 2.d None of the identifiers have a user attached
    if (!providerUser && !consumerUser) {
      return sendEmail({
        email,
        dataConsumerId,
        dataProviderId,
        privacyNotice,
        providerUserIdentifier,
        data,
        consumerUserIdentifier: existingConsumerUserIdentifier,
        triggerDataExchange,
      });
    }
  }
};

const sendEmail = async ({
  email,
  dataConsumerId,
  dataProviderId,
  privacyNotice,
  providerUser,
  consumerUser,
  providerUserIdentifier,
  data,
  consumerUserIdentifier,
  triggerDataExchange,
}: {
  email: any;
  dataConsumerId: string;
  dataProviderId: string;
  privacyNotice: any;
  providerUser?: any;
  consumerUser?: any;
  providerUserIdentifier?: any;
  data: any;
  consumerUserIdentifier?: any;
  triggerDataExchange?: any;
}) => {
  const validationURL = `${process.env.APP_ENDPOINT}${
    process.env.API_PREFIX
  }/consents/emailverification?privacyNotice=${privacyNotice.id}${
    providerUser ? `&providerUser=${providerUser}` : ""
  }${
    consumerUser ? `&consumerUser=${consumerUser}` : ""
  }&dataProvider=${dataProviderId}&dataConsumer=${dataConsumerId}${
    consumerUserIdentifier
      ? `&consumerUserIdentifier=${consumerUserIdentifier?._id}`
      : ""
  }${
    providerUserIdentifier
      ? `&providerUserIdentifier=${providerUserIdentifier?._id}`
      : ""
  }${
    triggerDataExchange ? `&triggerDataExchange=${triggerDataExchange}` : ""
  }&data=${JSON.stringify(data ?? privacyNotice.data)}`;

  await MailchimpClient.sendMessageFromLocalTemplate(
    {
      message: {
        to: [
          {
            email: process.env.MANDRILL_ENABLED
              ? email
              : process.env.MANDRILL_FROM_EMAIL,
          },
        ],
        from_email: process.env.MANDRILL_FROM_EMAIL,
        from_name: process.env.MANDRILL_FROM_NAME,
        subject: "Verify your consent request",
      },
    },
    "consentValidation",
    {
      url: validationURL,
    }
  );

  return {
    message:
      "User identifier in consumer was found using provided email, an email has been sent for the user's provided email to validate his consent grant",
    case: "email-validation-requested",
    status: 200,
  };
};
