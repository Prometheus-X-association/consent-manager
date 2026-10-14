import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import axios from "axios";
import User from "../models/User/User.model";
import Consent from "../models/Consent/Consent.model";
import UserIdentifier from "../models/UserIdentifier/UserIdentifier.model";
import PendingGuardianship from "../models/PendingGuardianship/PendingGuardianship.model";
import Participant from "../models/Participant/Participant.model";
import { BadRequestError } from "../errors/BadRequestError";
import { NotFoundError } from "../errors/NotFoundError";
import { Logger } from "../libs/loggers";
import { USER_SELECTION } from "../utils/schemaSelection";
import { userToSelfDescription } from "../libs/jsonld/selfDescriptions";
import { consentEvent } from "../utils/consentEvent";
import { consentToConsentReceipt } from "../utils/consentReceipt";
import { checkUserIdentifier } from "../utils/UserIdentifierMatchingProcessor";
import {
  giveConsentUser,
  GiveConsentOnBehalf,
  triggerDataExchangeByConsentId,
} from "./consentsController";
import {
  notifyGuardianAction,
  sendGuardianInvite,
} from "../libs/emails/guardianship/notifyChild";

const CLAIM_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const fullName = (user?: { firstName?: string; lastName?: string }): string =>
  `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();

const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

// ---------------------------------------------------------------------------
// Guardianship validation flow (initiated by dataspace connector)
// ---------------------------------------------------------------------------

/**
 * Public: returns minimal info about a pending guardianship token so PDI can
 * display the confirmation prompt before the parent logs in and confirms.
 */
export const validatePendingGuardianship = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token } = req.params;
    const pending = await PendingGuardianship.findOne({
      token: hashToken(token),
      expiresAt: { $gt: new Date() },
    }).lean();

    if (!pending) {
      return res
        .status(400)
        .json({ message: "Invalid or expired guardianship token" });
    }

    return res.status(200).json({
      firstName: pending.firstName,
      lastName: pending.lastName,
      email: pending.email,
      identifier: pending.identifier,
      parentId: pending.parentId,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Authenticated (parent): confirms the guardianship. Creates the UserIdentifier
 * and child User, then calls the connector webhook with the resulting userIdentifier.
 */
export const confirmGuardianship = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token } = req.params;
    const parentId = req.user?.id;

    const pending = await PendingGuardianship.findOne({
      token: hashToken(token),
      expiresAt: { $gt: new Date() },
    });

    if (!pending) {
      return res
        .status(400)
        .json({ message: "Invalid or expired guardianship token" });
    }

    if (pending.parentId.toString() !== parentId) {
      return res.status(403).json({
        message: "You are not the intended guardian for this request",
      });
    }

    // Create the UserIdentifier for the child
    const userIdentifier = new UserIdentifier({
      attachedParticipant: pending.participantId,
      email: pending.email,
      identifier: pending.identifier,
      url: pending.url,
    });
    await userIdentifier.save();

    // Reuse the existing User if any, otherwise create the child User
    let child = await User.findOne({
      firstName: pending.firstName,
      lastName: pending.lastName,
      guardian: parentId,
      ...(pending.email ? { email: pending.email } : {}),
    });

    if (child) {
      const alreadyLinked = (child.identifiers ?? []).some(
        (id) => id.toString() === userIdentifier._id.toString()
      );
      if (!alreadyLinked) {
        child.identifiers = [...(child.identifiers ?? []), userIdentifier._id];
        await child.save();
      }
    } else {
      child = new User({
        firstName: pending.firstName,
        lastName: pending.lastName,
        ...(pending.email ? { email: pending.email } : {}),
        guardian: parentId,
        identifiers: [userIdentifier._id],
      });
      child.jsonld = userToSelfDescription(child);
      await child.save();
      // Back-link the userIdentifier to the child user
      userIdentifier.user = child._id;
      await userIdentifier.save();
    }

    // Link any existing cross-participant identifiers (only if email is present)
    if (pending.email) {
      await checkUserIdentifier(
        pending.email,
        pending.participantId.toString(),
        userIdentifier._id.toString(),
        child
      );
    }

    // Fire webhook — best-effort
    try {
      const participant = await Participant.findById(
        pending.participantId
      ).lean();
      await axios.post(
        pending.callbackUrl,
        {
          event: "userIdentifierCreated",
          userIdentifier: {
            _id: userIdentifier._id,
            email: userIdentifier.email,
            identifier: userIdentifier.identifier,
            url: userIdentifier.url,
            attachedParticipant: userIdentifier.attachedParticipant,
          },
        },
        {
          headers: {
            "X-Webhook-Secret": participant?.clientSecret ?? "",
          },
          timeout: 5000,
        }
      );
    } catch (webhookErr) {
      Logger.error({
        location: "confirmGuardianship.webhook",
        message: `Webhook delivery failed: ${webhookErr}`,
      });
    }

    // Cleanup
    await PendingGuardianship.deleteOne({ _id: pending._id });

    return res.status(200).json({ message: "Guardianship confirmed" });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Guardian child management
// ---------------------------------------------------------------------------

/**
 * Lists the managed accounts of the acting guardian.
 */
export const listChildren = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parentId = req.user?.id;
    const children = await User.find({ guardian: parentId })
      .select("+password")
      .lean();

    // Add hasPassword flag without exposing the actual hash
    const enriched = children.map((child: any) => ({
      ...child,
      hasPassword: !!child.password,
      password: undefined, // Remove password hash from response
    }));

    return res.status(200).json({ children: enriched });
  } catch (err) {
    next(err);
  }
};

/**
 * Returns a single managed account (authorization already done by middleware).
 */
export const getChild = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const child: any = req.child?.populated?.toObject() ?? req.child?.populated;
    if (child) {
      child.hasPassword = !!child.password;
      delete child.password; // Remove password hash from response
    }
    return res.status(200).json(child);
  } catch (err) {
    next(err);
  }
};

/**
 * Removes the guardianship link. Blocked while the account is still managed
 * (no password set → child would have no way to regain access).
 */
export const removeGuardianship = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { childId } = req.params;

    if (!req.child?.hasPassword) {
      return res.status(409).json({
        message:
          "Cannot remove the guardian until the child completes their account.",
      });
    }

    await User.findByIdAndUpdate(childId, { $unset: { guardian: "" } });

    return res.status(200).json({ message: "Guardianship removed" });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Child consent management
// ---------------------------------------------------------------------------

/**
 * Lists the given consents of a managed account, for its guardian.
 */
export const getChildConsents = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const childId = req.child?.id;
    const {
      limit = "10",
      page = "1",
      receipt = false,
      all = false,
    } = req.query;

    console.log(
      "[getChildConsents] childId:",
      childId,
      "receipt:",
      receipt,
      "limit:",
      limit
    );

    const skip = (parseInt(page.toString()) - 1) * parseInt(limit.toString());

    const consents = await Consent.find({ user: childId })
      .skip(skip)
      .limit(parseInt(limit.toString()));

    console.log("[getChildConsents] Found consents:", consents.length);

    const totalCount = await Consent.countDocuments({ user: childId });
    const totalPages = Math.ceil(totalCount / parseInt(limit.toString()));

    const consentReceipts = [];
    for (const consent of consents) {
      consentReceipts.push(await consentToConsentReceipt(consent));
    }

    console.log(
      "[getChildConsents] Generated receipts:",
      consentReceipts.length,
      "returning receipt?",
      receipt
    );
    if (consentReceipts.length > 0) {
      Logger.debug(
        `[getChildConsents] First receipt structure: ${JSON.stringify(
          consentReceipts[0],
          null,
          2
        ).substring(0, 500)}`
      );
    }

    return res.status(200).json({
      consents: receipt ? consents : consentReceipts,
      totalCount,
      totalPages,
    });
  } catch (err) {
    console.error("[getChildConsents] Error:", err);
    next(err);
  }
};

/**
 * Returns a single consent of a managed account, for its guardian.
 */
export const getChildConsentById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const childId = req.child?.id;
    const consent = await Consent.findOne({
      _id: req.params.id,
      user: childId,
    });

    if (!consent) throw new NotFoundError("Consent not found");

    return res.status(200).json(await consentToConsentReceipt(consent));
  } catch (err) {
    next(err);
  }
};

/**
 * Builds the on-behalf context shared by the guardian consent actions.
 */
const buildOnBehalf = async (
  req: Request,
  action: string
): Promise<GiveConsentOnBehalf> => {
  const parent = await User.findById(req.user?.id).lean();
  const parentName = fullName(parent);
  const child = req.child?.populated;
  const childName = fullName(child);

  return {
    actingUserId: req.child?.id,
    eventMeta: {
      performedBy: req.user?.id,
      performedByName: parentName,
      onBehalf: true,
    },
    onGranted: async () => {
      await notifyGuardianAction({
        childEmail: child?.email,
        childName,
        parentName,
        action,
      });
    },
  };
};

/**
 * Gives (or refuses) a consent on behalf of a managed account.
 */
export const giveChildConsent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const action =
      req.body.event === "refused" ? "consent refused" : "consent given";
    const onBehalf = await buildOnBehalf(req, action);
    return giveConsentUser(req, res, next, onBehalf);
  } catch (err) {
    next(err);
  }
};

/**
 * Internal helper: applies a lifecycle change to a child's consent.
 */
const applyChildConsentLifecycle = async (
  req: Request,
  res: Response,
  changes: {
    status?: string;
    consented?: boolean;
    baseEvent: { eventState: string; [key: string]: any };
    action: string;
  }
) => {
  const { consentId } = req.params;
  const { triggerDataExchange } = req.query;
  const consent = await Consent.findOne({
    _id: consentId,
    status: { $nin: ["terminated", "revoked", "refused"] },
  });
  if (!consent) {
    return res.status(404).json({ error: "consent not found" });
  }

  const parent = await User.findById(req.user?.id).lean();
  const parentName = fullName(parent);
  const child = req.child?.populated;

  if (changes.status) consent.status = changes.status as any;
  if (typeof changes.consented === "boolean")
    consent.consented = changes.consented;

  consent.event.push({
    ...changes.baseEvent,
    performedBy: req.user?.id,
    performedByName: parentName,
    onBehalf: true,
  } as any);

  await consent.save();

  await notifyGuardianAction({
    childEmail: child?.email,
    childName: fullName(child),
    parentName,
    action: changes.action,
  });

  if (triggerDataExchange) {
    return await triggerDataExchangeByConsentId(consent._id, res);
  } else {
    return res.status(200).json(await consentToConsentReceipt(consent));
  }
};

export const revokeChildConsent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    return await applyChildConsentLifecycle(req, res, {
      status: "revoked",
      consented: false,
      baseEvent: consentEvent.revoked,
      action: "consent revoked",
    });
  } catch (err) {
    Logger.error(err);
    next(err);
  }
};

export const refuseChildConsent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    return await applyChildConsentLifecycle(req, res, {
      status: "refused",
      baseEvent: consentEvent.refused,
      action: "consent refused",
    });
  } catch (err) {
    Logger.error(err);
    next(err);
  }
};

export const reConfirmChildConsent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    return await applyChildConsentLifecycle(req, res, {
      baseEvent: consentEvent.reConfirmed,
      action: "consent re-confirmed",
    });
  } catch (err) {
    Logger.error(err);
    next(err);
  }
};

export const terminateChildConsent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    return await applyChildConsentLifecycle(req, res, {
      status: "terminated",
      baseEvent: consentEvent.terminated,
      action: "consent terminated",
    });
  } catch (err) {
    Logger.error(err);
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Account completion flow
// ---------------------------------------------------------------------------

/**
 * Sends the account completion invitation to a managed account.
 */
export const inviteChildCompletion = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const child = req.child?.populated;
    if (!child) throw new NotFoundError("Managed account not found");

    if (child.password) {
      return res
        .status(409)
        .json({ message: "This account is already activated" });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");

    await User.findByIdAndUpdate(child._id, {
      claimToken: hashToken(rawToken),
      claimTokenExpiresAt: new Date(Date.now() + CLAIM_TOKEN_TTL_MS),
    });

    const parent = await User.findById(req.user?.id).lean();
    const claimUrl = `${process.env.PDI_ENDPOINT}/claim-account?token=${rawToken}`;

    await sendGuardianInvite({
      childEmail: child.email,
      childName: fullName(child),
      parentName: fullName(parent),
      claimUrl,
    });

    return res.status(200).json({ message: "Invitation sent" });
  } catch (err) {
    next(err);
  }
};

/**
 * Public: validates a claim token and returns minimal info to bootstrap the
 * set-password page.
 */
export const validateClaimToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      claimToken: hashToken(token),
      claimTokenExpiresAt: { $gt: new Date() },
    }).select("firstName lastName email");

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    return res.status(200).json({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Public: completes a managed account by setting its password and flipping it
 * to autonomous. The guardian link is intentionally kept until either party
 * explicitly removes it.
 */
export const completeChildAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      throw new BadRequestError("Missing or invalid fields", [
        { field: "password", message: "Password is required" },
      ]);
    }

    const user = await User.findOne({
      claimToken: hashToken(token),
      claimTokenExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.password = password;
    user.claimToken = undefined;
    user.claimTokenExpiresAt = undefined;
    await user.save();

    return res.status(200).json({ message: "Account activated" });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Autonomous user: managing their own guardian
// ---------------------------------------------------------------------------

/**
 * Returns the guardian of the acting (now autonomous) user.
 */
export const listMyGuardians = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await User.findById(req.user?.id)
      .populate("guardian", USER_SELECTION)
      .lean();

    const guardians = user?.guardian ? [user.guardian] : [];
    return res.status(200).json({ guardians });
  } catch (err) {
    next(err);
  }
};

/**
 * Lets an autonomous user remove their guardian.
 */
export const removeMyGuardian = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await User.findById(req.user?.id).lean();

    if (!user?.guardian) {
      throw new NotFoundError("No guardian found");
    }

    const { parentId } = req.params;
    if (user.guardian.toString() !== parentId) {
      return res
        .status(403)
        .json({ message: "This user is not your guardian" });
    }

    await User.findByIdAndUpdate(req.user?.id, { $unset: { guardian: "" } });

    return res.status(200).json({ message: "Guardian removed" });
  } catch (err) {
    next(err);
  }
};
