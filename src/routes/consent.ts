import { Router } from "express";
import {
  attachTokenToConsent,
  getAvailableExchanges,
  getPrivacyNoticeById,
  getPrivacyNotices,
  getUserConsentById,
  getUserConsents,
  giveConsent,
  giveConsentOnEmailValidation,
  resumeConsent,
  revokeConsent,
  triggerDataExchange,
  verifyToken,
} from "../controllers/consentsController";
import { verifyUserKey, verifyParticipantJWT } from "../middleware/auth";
import { setUserIdForParticipant } from "../middleware/participantsMiddleware";
const r: Router = Router();

r.get("/emailverification", giveConsentOnEmailValidation);
r.get("/me", verifyUserKey, getUserConsents);
r.get(
  "/me/:id",
  verifyUserKey,
  // checkIDFormatMiddleware,
  getUserConsentById
);

r.get("/exchanges/:as", verifyParticipantJWT, getAvailableExchanges);

r.get("/privacy-notices/:privacyNoticeId", verifyUserKey, getPrivacyNoticeById); //TODO jwt

r.get(
  "/participants/:userId/",
  verifyParticipantJWT,
  setUserIdForParticipant,
  getUserConsents
);

r.get(
  "/participants/:userId/:id",
  verifyParticipantJWT,
  setUserIdForParticipant,
  getUserConsentById
);

r.get("/:userId/:providerId/:consumerId", verifyUserKey, getPrivacyNotices); //TODO userID jwt

r.post(
  "/",
  verifyUserKey,
  // verifyContract,
  giveConsent
);

r.delete("/:id", verifyUserKey, revokeConsent);

r.post(
  "/:consentId/data-exchange",
  verifyUserKey,
  // verifyContract,
  triggerDataExchange
);

r.post(
  "/:consentId/resume",
  verifyParticipantJWT,
  // verifyContract,
  resumeConsent
);

r.post(
  "/:consentId/token",
  verifyParticipantJWT,
  // verifyContract,
  attachTokenToConsent
);

r.post(
  "/:consentId/validate",
  verifyParticipantJWT,
  // verifyContract,
  verifyToken
);

export default r;
