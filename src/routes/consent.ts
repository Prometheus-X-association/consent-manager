import { Router } from "express";
import {
  attachTokenToConsent,
  getAvailableExchanges,
  getPrivacyNoticeById,
  getPrivacyNotices,
  getPrivacyNoticesByContract,
  getUserAvailableExchanges,
  getUserConsentById,
  getUserConsents,
  giveConsent,
  giveConsentOnEmailValidation,
  giveConsentUser,
  reConfirmConsent,
  redirectPDI,
  refuseConsent,
  resumeConsent,
  revokeConsent,
  terminateConsent,
  triggerDataExchange,
  verifyToken,
} from "../controllers/consentsController";
import {
  verifyUserKey,
  verifyParticipantJWT,
  verifyUserJWT,
} from "../middleware/auth";
// import { checkIDFormatMiddleware } from "../middleware/objectIdFormatCheck";
import { setUserIdForParticipant } from "../middleware/participantsMiddleware";
const r: Router = Router();

r.get("/emailverification", giveConsentOnEmailValidation);
r.get("/me", verifyUserJWT, getUserConsents);
r.get(
  "/me/:id",
  verifyUserJWT,
  // checkIDFormatMiddleware,
  getUserConsentById
);

r.get("/exchanges/user", verifyUserJWT, getUserAvailableExchanges);

r.get("/exchanges/:as", verifyParticipantJWT, getAvailableExchanges);

r.get("/privacy-notices/:privacyNoticeId", verifyUserKey, getPrivacyNoticeById); //TODO jwt

r.get(
  "/privacy-notices/:privacyNoticeId/user",
  verifyUserJWT,
  getPrivacyNoticeById
); //TODO jwt

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
r.get(
  "/:userId/:providerURI/:consumerURI/:contractURI",
  verifyUserJWT,
  getPrivacyNoticesByContract
);

r.post(
  "/",
  verifyUserKey,
  // verifyContract,
  giveConsent
);

r.post(
  "/user",
  verifyUserJWT,
  // verifyContract,
  giveConsentUser
);

r.delete("/:id", verifyUserJWT, revokeConsent);

r.post(
  "/:consentId/data-exchange",
  verifyUserJWT,
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

r.post(
  "/:consentId/refuse",
  verifyUserJWT,
  // verifyContract,
  refuseConsent
);

r.post(
  "/:consentId/re-confirm",
  verifyUserJWT,
  // verifyContract,
  reConfirmConsent
);

r.post(
  "/:consentId/terminate",
  verifyUserJWT,
  // verifyContract,
  terminateConsent
);

r.get("/pdi/iframe", verifyParticipantJWT, redirectPDI);

export default r;
