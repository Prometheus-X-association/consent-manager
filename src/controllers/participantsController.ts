import { Request, Response, NextFunction } from "express";
import Participant from "../models/Participant/Participant.model";
import { NotFoundError } from "../errors/NotFoundError";
import { PARTICIPANT_SELECTION } from "../utils/schemaSelection";
import { issueJwt } from "../libs/jwt";
import axios from "axios";
import * as fs from "fs";
import path from "path";
import UserIdentifier from "../models/UserIdentifier/UserIdentifier.model";

/**
 * Retrieves a participant by id
 */
export const getParticipantById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const participantId = req.params.id;
    const participant = await Participant.findById(participantId).select(
      PARTICIPANT_SELECTION
    );

    if (!participant)
      return res.status(404).json({ error: "participant not found" });
    res.json(participant);
  } catch (err) {
    next(err);
  }
};

/**
 * Finds a participant using its service key (clientID)
 */
export const getParticipantByClientId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { clientId } = req.params;

    const participant = await Participant.findOne({
      clientID: clientId,
    }).select(PARTICIPANT_SELECTION);
    if (!participant)
      return res.status(404).json({ error: "participant not found" });

    return res.status(200).json(participant);
  } catch (err) {
    next(err);
  }
};

/**
 * Registers a new participant from a catalog
 * this should usually not be called by a individual participant
 * ? Should there be extra api key in here to only allow catalog instances ?
 */
export const registerParticipant = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const participantData = req.body;

    const exists = await Participant.findOne({
      clientID: participantData.clientID,
    }).lean();

    if (exists)
      return res.status(409).json({ error: "Participant already exists" });

    const newParticipant = new Participant(participantData);

    // TODO
    newParticipant.jsonld = "";

    newParticipant.selfDescriptionURL =
      participantData.selfDescriptionURL || "";

    if (newParticipant.jsonld !== "") {
      const selfDescriptionData = JSON.parse(newParticipant.jsonld);
      if (selfDescriptionData.endpoints) {
        const { dataExport, dataImport, consentImport, consentExport } =
          selfDescriptionData.endpoints;
        newParticipant.endpoints.dataExport = dataExport || "";
        newParticipant.endpoints.dataImport = dataImport || "";
        newParticipant.endpoints.consentImport = consentImport || "";
        newParticipant.endpoints.consentExport = consentExport || "";
      }
    }

    newParticipant.clientID = participantData.clientID;
    newParticipant.clientSecret = participantData.clientSecret;

    if (participantData.dataspaceEndpoint) {
      const sdData = await axios.get(participantData.dataspaceEndpoint);

      const base64Key = fs.readFileSync(
        path.join(__dirname, "..", "./config/keys/consentSignaturePublic.pem"),
        { encoding: "base64" }
      );

      const login = await axios.post(sdData.data.content._links.login.href, {
        serviceKey: participantData.clientID,
        secretKey: participantData.clientSecret,
      });

      await axios.put(
        sdData.data.content._links.consentConfiguration.href,
        {
          publicKey: base64Key,
          uri:
            process.env.NODE_ENV === "development"
              ? `${process.env.URL}:${process.env.PORT}${process.env.API_PREFIX}/`
              : `${process.env.URL}${process.env.API_PREFIX}/`,
        },
        {
          headers: {
            Authorization: `Bearer ${login.data.content.token}`,
          },
        }
      );
    }

    const createdParticipant = await newParticipant.save();

    res.status(201).json(createdParticipant);
  } catch (err) {
    next(err);
  }
};

/**
 * Logs in the participant
 */
export const loginParticipant = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { clientID, clientSecret } = req.body;
    const participant = await Participant.findOne({ clientID, clientSecret });

    if (!participant)
      return res.status(404).json({ error: "participant not found" });

    const jwt = issueJwt(participant);

    return res.json({
      success: true,
      jwt,
      message:
        "Successfully retrieved JWT for authenticating requests to the API",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Retrieves Participants. Uses pagination
 */
export const getAllParticipants = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { limit = "10", page = "1" } = req.query;

    const skip =
      (parseInt(page.toString()) - 1 >= 0 ? parseInt(page.toString()) - 1 : 0) *
      parseInt(limit.toString());

    const participants = await Participant.find()
      .skip(skip)
      .limit(parseInt(limit.toString()))
      .select(PARTICIPANT_SELECTION);

    const totalCount = await Participant.countDocuments();
    const totalPages = Math.ceil(totalCount / parseInt(limit.toString()));

    res.json({ participants, totalCount, totalPages });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns the information of the logged in user
 * @author Felix Bole
 */
export const getMyParticipant = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const participant = await Participant.findById(req.userParticipant?.id);
    if (!participant) throw new NotFoundError("Participant not found");
    return res.json(participant);
  } catch (err) {
    next(err);
  }
};

/**
 * Deletes the logged in participant
 * We are not handling the deletion of associated ecosystems and such
 * as we are only removing the local reference of the participant from
 * the consent manager pdi. The actual participant data resides still in
 * the catalog component
 */
export const deleteParticipant = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.userParticipant;
    const deletedParticipant = await Participant.findByIdAndDelete(id);
    if (!deletedParticipant) throw new NotFoundError("Participant not found");

    res.json({ message: "Participant deleted successfully" });
  } catch (err) {
    next(err);
  }
};

/*
  Allow to post to all participants the public key
  deprecated
 */
export const exportPublicKeyToParticipants = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const base64Key = fs.readFileSync(
      path.join(__dirname, "..", "./config/keys/consentSignaturePublic.pem"),
      { encoding: "base64" }
    );

    const participants = await Participant.find().lean();

    for (const participant of participants) {
      const sd = await axios.get(participant.selfDescriptionURL);
      const sdData = await axios.get(sd.data.dataspaceEndpoint);
      const participantLogin = await axios.post(
        sdData.data.content._links.login.href,
        {
          serviceKey: participant.clientID,
          secretKey: participant.clientSecret,
        }
      );

      await axios.put(
        sdData.data.content._links.consentConfiguration.href,
        {
          publicKey: base64Key,
          uri:
            process.env.NODE_ENV === "development"
              ? `${process.env.URL}:${process.env.PORT}${process.env.API_PREFIX}/`
              : `${process.env.URL}${process.env.API_PREFIX}/`,
        },
        {
          headers: {
            //TODO CHANGE
            Authorization: `Bearer ${participantLogin.data.data.token.token}`,
          },
        }
      );
    }

    res.json(participants);
  } catch (err) {
    next(err);
  }
};

/*
  Allow to post to all participants the public key
 */
export const getPublicKey = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const base64Key = fs.readFileSync(
      path.join(__dirname, "..", "./config/keys/consentSignaturePublic.pem"),
      { encoding: "base64" }
    );

    res.json({ key: base64Key });
  } catch (err) {
    next(err);
  }
};
