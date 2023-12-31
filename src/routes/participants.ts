import { Router } from "express";
import {
  setJoiValidationSchema,
  validatePayload,
} from "../middleware/joiValidation";
import {
  deleteParticipant,
  getAllParticipants,
  getMyParticipant,
  getParticipantById,
  loginParticipant,
  registerParticipant,
} from "../controllers/participantsController";
import { verifyParticipantJWT } from "../middleware/auth";
const r: Router = Router();

r.get("/", getAllParticipants);
r.get("/me", verifyParticipantJWT, getMyParticipant);
r.get("/:id", getParticipantById);

// Registering a participant should be a request sent from a catalog registry
// since a participant can come from any existing catalog
// ? Still TBD: matching of participant information in different PDIs
r.post("/", setJoiValidationSchema, validatePayload, registerParticipant);
r.post("/login", loginParticipant);

r.use(verifyParticipantJWT);
r.delete("/me", deleteParticipant);

export default r;
