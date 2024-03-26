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
import { IPrivacyNotice, IUserIdentifier } from "../types/models";
import Participant from "../models/Participant/Participant.model";
import { NodemailerClient } from "../libs/emails/nodemailer";
import { Logger } from "../libs/loggers";
import axios from "axios";
import * as CryptoJS from "crypto";
import { readFileSync } from "fs";
import path from "path";
import crypto from "crypto";
import _ from "lodash";
import { MailchimpClient } from "../libs/emails/mailchimp/MailchimpClient";

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
    const userId = req.user.id;

    const { limit = "10", page = "1" } = req.query;

    const skip = (parseInt(page.toString()) - 1) * parseInt(limit.toString());

    const consents = await Consent.find({ user: userId })
      .skip(skip)
      .limit(parseInt(limit.toString()));

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

    const existingPrivacyNoticesIds = existingPrivacyNotices
      .map((element: { contract: any }) => element.contract)
      .sort();

    const privacyNoticesIds = privacyNotices
      .map((element: { contract: any }) => element.contract)
      .sort();

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
    const pn = await PrivacyNotice.findById(req.params.privacyNoticeId);
    if (!pn) {
      return res.status(404).json({ error: "Privacy notice not found" });
    }

    return res.json(pn);
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
    const userId = req.user.id;

    const consent = await Consent.findOne({
      user: userId,
    });
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

  // if (!userIdentifier) {
  //   throw new Error("User identifier not found");
  // }

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
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "user unauthenticated" });

    const user = await User.findById(userId).populate<{
      identifiers: IUserIdentifier[];
    }>([{ path: "identifiers" }]);
    if (!user) return res.status(404).json({ error: "user not found" });

    const { privacyNoticeId, email, data } = req.body;
    const { triggerDataExchange } = req.query;
    if (!privacyNoticeId)
      throw new BadRequestError("Missing privacyNoticeId", [
        { field: "privacyNoticeId", message: "Mandatory field" },
      ]);

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

    // Find user identifiers
    let providerUserIdentifier = user.identifiers.find(
      (id) =>
        id.attachedParticipant?.toString() === dataProvider?._id.toString()
    );

    let consumerUserIdentifier = user.identifiers.find(
      (id) =>
        id.attachedParticipant?.toString() === dataConsumer?._id.toString()
    );

    if (!providerUserIdentifier) {
      //if not foung in attached participants
      // search in userIdentifier to rattached it

      const userIdentifiers = await UserIdentifier.findOne({
        attachedParticipant: dataProvider?._id,
        email: user.email,
      }).lean();

      if (!userIdentifiers) {
        return res
          .status(400)
          .json({ error: "User identifier does not exist in data provider" });
      }
      if (!user.identifiers.includes(userIdentifiers._id)) {
        user.identifiers.push(userIdentifiers._id);
        await user.save();
      }

      providerUserIdentifier = userIdentifiers._id;
    } else {
      providerUserIdentifier = providerUserIdentifier._id;
    }

    if (!consumerUserIdentifier) {
      //if not foung in attached consumer participants
      // search in userIdentifier to rattached it

      const userIdentifiers = await UserIdentifier.findOne({
        attachedParticipant: dataConsumer?._id,
        email: user.email,
      }).lean();

      // if (!userIdentifiers && !email) {
      //   console.log("User identifier does not exist in data Consumer")
      //   return res
      //     .status(400)
      //     .json({ error: "User identifier does not exist in data Consumer" });
      // }

      if (userIdentifiers && !user.identifiers.includes(userIdentifiers?._id)) {
        user.identifiers.push(userIdentifiers._id);
        await user.save();
      }

      if (userIdentifiers) consumerUserIdentifier = userIdentifiers._id;
    }

    // If user identifier in consumer was not found it is possible it exists
    // for another email. If it's the case, the user should provide the email
    // used in the consumer app and the consent service should validate the
    // consent grant by mail with the provided email.
    if (!consumerUserIdentifier) {
      if (!email)
        return res.status(400).json({
          error:
            "User identifier not found in provider and no email was passed in the payload to look for an existing identifier with a different user email. Please provide the email",
        });

      const existingUserIdentifier = await findMatchingUserIdentifier(
        email,
        dataConsumer?._id
      );

      if (!existingUserIdentifier) {
        return res.status(404).json({
          error: "No user identifier found in the consumer for email " + email,
        });
      } else {
        // User identifier found but not attached to the main user, requires user validation
        // by email to re-trigger the consent grant

        const validationURL = `${process.env.APP_ENDPOINT}${
          process.env.API_PREFIX
        }/consents/emailverification?privacyNotice=${privacyNotice.id}&user=${
          req.user?.id
        }&dataProvider=${dataProvider._id}&dataConsumer=${
          dataConsumer._id
        }&consumerUserIdentifier=${
          existingUserIdentifier?._id
        }&providerUserIdentifier=${providerUserIdentifier}${
          triggerDataExchange
            ? `&triggerDataExchange=${triggerDataExchange}`
            : ""
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

        return res.status(200).json({
          message:
            "User identifier in consumer was found using provided email, an email has been sent for the user's provided email to validate his consent grant",
          case: "email-validation-requested",
        });
      }
    }

    const consent = new Consent({
      privacyNotice: privacyNotice._id,
      user: req.user?.id,
      providerUserIdentifier: providerUserIdentifier,
      consumerUserIdentifier: consumerUserIdentifier,
      dataProvider: dataProvider?._id,
      dataConsumer: dataConsumer?._id,
      recipients: privacyNotice.recipients,
      purposes: privacyNotice.purposes,
      data: privacyNotice.data,
      status: "granted",
      consented: true,
      contract: privacyNotice.contract,
    });

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

    const newConsent = await consent.save();

    res.status(201).json(newConsent);
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
      user,
    } = req.query;
    const decodedDP = decodeURIComponent(dataProvider.toString());
    const decodedDC = decodeURIComponent(dataConsumer.toString());
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
      user: user,
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

    const consent = new Consent({
      privacyNotice: privacyNotice,
      user: user,
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

    const userToUpdate = await User.findById(user);
    const userIdentifierConsumer = await UserIdentifier.findById(
      consumerUserIdentifier
    ).lean();

    if (
      userToUpdate &&
      !userToUpdate.identifiers.includes(userIdentifierConsumer?._id)
    ) {
      userToUpdate.identifiers.push(userIdentifierConsumer?._id);
    }

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
              "An error occured after calling the consent data exchange trigger endpoint of the consumer service",
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
    const { id } = req.params;

    const consent = await Consent.findOne({
      user: req.user.id,
      identifier: id,
    });
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
          "An error occured after calling the consent data exchange trigger endpoint of the consumer service",
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
      // return res.status(424).json({
      //   message: `an error occured after calling the data consumer's /consent/import endpoint`,
      //   data: {
      //     details: {
      //       errorMessage: err.message,
      //     },
      //   },
      // });
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
      "aes-256-cbc",
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
