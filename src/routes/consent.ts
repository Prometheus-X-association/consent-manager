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
import { body, check, query } from "express-validator";
import { providerTriggeredDataExchange } from "../controllers/dataExchangeController";
const r: Router = Router();

r.get("/emailverification", giveConsentOnEmailValidation);
r.get("/me", verifyUserKey, getUserConsents);
r.get(
  "/me/:id",
  [check("id").isMongoId()],
  verifyUserKey,
  // checkIDFormatMiddleware,
  getUserConsentById
);

r.get(
  "/exchanges/:as",
  [check("as").isString()],
  verifyParticipantJWT,
  getAvailableExchanges
);

r.get(
  "/privacy-notices/:privacyNoticeId",
  [check("privacyNoticeId").isMongoId()],
  verifyUserKey,
  getPrivacyNoticeById
);

r.get(
  "/participants/:userId/",
  [check("userId").isMongoId()],
  verifyParticipantJWT,
  setUserIdForParticipant,
  getUserConsents
);

r.get(
  "/participants/:userId/:id",
  [check("userId").isMongoId(), check("id").isMongoId()],
  verifyParticipantJWT,
  setUserIdForParticipant,
  getUserConsentById
);

r.get(
  "/:userId/:providerId/:consumerId",
  [
    check("userId").isMongoId(),
    check("providerId").isMongoId(),
    check("consumerId").isMongoId(),
  ],
  verifyUserKey,
  getPrivacyNotices
);

r.post(
  "/",
  [
    body("privacyNoticeId").isMongoId(),
    body("email").isEmail().optional(),
    body("data").isArray().optional(),
    query("triggerDateExchange").isBoolean().optional(),
  ],
  verifyUserKey,
  // verifyContract,
  giveConsent
);

r.delete("/:id", [check("id").isMongoId()], verifyUserKey, revokeConsent);

r.post(
  "/:consentId/data-exchange",
  [check("consentId").isMongoId()],
  verifyUserKey,
  // verifyContract,
  triggerDataExchange
);

r.post(
  "/:consentId/resume",
  [check("consentId").isMongoId()],
  verifyParticipantJWT,
  // verifyContract,
  resumeConsent
);

r.post(
  "/:consentId/token",
  [
    check("consentId").isMongoId(),
    body("token").exists().isString(),
    body("providerDataExchangeId").isMongoId(),
  ],
  verifyParticipantJWT,
  // verifyContract,
  attachTokenToConsent
);

r.post(
  "/:consentId/validate",
  [check("consentId").isMongoId(), body("token").exists().isString()],
  verifyParticipantJWT,
  // verifyContract,
  verifyToken
);

export default r;
