import { Router } from "express";
import {
  registerUserIdentifier,
  signup,
  login,
  getUserById,
  registerUserIdentifiers,
} from "../controllers/usersController";
import { verifyParticipantJWT } from "../middleware/auth";
const r: Router = Router();

r.post("/signup", signup);
r.post("/login", login);

// Used by Participants / Data Space Connectors to register a end user from their platform
// This might change when using more decentralized identifiers for end users
r.post("/register", verifyParticipantJWT, registerUserIdentifier);
r.post("/registers", verifyParticipantJWT, registerUserIdentifiers);
r.get("/:userId/", getUserById);
r.get("/:userId/:consentId");

export default r;
