import { Router } from "express";
import { verifyUserJWT } from "../middleware/auth";
import {
  verifyGuardianship,
  verifyGuardianshipForConsent,
} from "../middleware/guardianship";
import {
  completeChildAccount,
  confirmGuardianship,
  getChild,
  getChildConsentById,
  getChildConsents,
  giveChildConsent,
  inviteChildCompletion,
  listChildren,
  listMyGuardians,
  reConfirmChildConsent,
  refuseChildConsent,
  removeGuardianship,
  removeMyGuardian,
  revokeChildConsent,
  terminateChildConsent,
  validateClaimToken,
  validatePendingGuardianship,
} from "../controllers/guardianshipController";

const r: Router = Router();

// Autonomous (completed) user managing their own guardian
r.get("/guardians", verifyUserJWT, listMyGuardians);
r.delete("/guardians/:parentId", verifyUserJWT, removeMyGuardian);

// Public account completion ("claim") flow
r.get("/claim/:token", validateClaimToken);
r.post("/claim/:token", completeChildAccount);

// Public / authenticated guardianship validation flow (initiated by connector)
r.get("/validate/:token", validatePendingGuardianship);
r.post("/validate/:token", verifyUserJWT, confirmGuardianship);

// Guardian managing their managed accounts
r.get("/children", verifyUserJWT, listChildren);
r.get("/children/:childId", verifyUserJWT, verifyGuardianship, getChild);
r.delete(
  "/children/:childId",
  verifyUserJWT,
  verifyGuardianship,
  removeGuardianship
);
r.post(
  "/children/:childId/invite",
  verifyUserJWT,
  verifyGuardianship,
  inviteChildCompletion
);

// Managed account consents
r.get(
  "/children/:childId/consents",
  verifyUserJWT,
  verifyGuardianship,
  getChildConsents
);
r.get(
  "/children/:childId/consents/:id",
  verifyUserJWT,
  verifyGuardianship,
  getChildConsentById
);
r.post(
  "/children/:childId/consents",
  verifyUserJWT,
  verifyGuardianship,
  giveChildConsent
);
r.delete(
  "/children/:childId/consents/:consentId",
  verifyUserJWT,
  verifyGuardianshipForConsent,
  revokeChildConsent
);
r.post(
  "/children/:childId/consents/:consentId/refuse",
  verifyUserJWT,
  verifyGuardianshipForConsent,
  refuseChildConsent
);
r.post(
  "/children/:childId/consents/:consentId/re-confirm",
  verifyUserJWT,
  verifyGuardianshipForConsent,
  reConfirmChildConsent
);
r.post(
  "/children/:childId/consents/:consentId/terminate",
  verifyUserJWT,
  verifyGuardianshipForConsent,
  terminateChildConsent
);

export default r;
