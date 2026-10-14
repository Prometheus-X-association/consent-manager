import { NextFunction, Request, Response } from "express";
import User from "../models/User/User.model";
import Consent from "../models/Consent/Consent.model";
import { USER_SELECTION } from "../utils/schemaSelection";

/**
 * Authorizes a guardian (req.user) to act on the managed account identified by
 * req.params.childId. Checks User.guardian rather than a separate collection.
 */
export const verifyGuardianship = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parentId = req.user?.id;
    const { childId } = req.params;

    if (!parentId) {
      return res.status(401).json({ message: "user unauthenticated" });
    }
    if (!childId) {
      return res.status(400).json({ message: "Missing childId" });
    }

    const child = await User.findOne({
      _id: childId,
      guardian: parentId,
    }).select("+password");

    if (!child) {
      return res
        .status(403)
        .json({ message: "You are not a guardian of this account" });
    }

    req.child = {
      id: child._id.toString(),
      hasPassword: !!child.password,
      populated: child,
    };

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Variant for routes that reference a consent by id: resolves the consent's
 * owner (the managed account) and verifies the acting user is its guardian.
 */
export const verifyGuardianshipForConsent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parentId = req.user?.id;
    const { childId, consentId } = req.params;

    if (!parentId) {
      return res.status(401).json({ message: "user unauthenticated" });
    }

    const consent = await Consent.findById(consentId).lean();
    if (!consent) {
      return res.status(404).json({ message: "Consent not found" });
    }
    if (!consent.user) {
      return res
        .status(403)
        .json({ message: "Consent is not owned by a managed account" });
    }

    if (childId && consent.user.toString() !== childId.toString()) {
      return res
        .status(403)
        .json({ message: "Consent does not belong to this account" });
    }

    const child = await User.findOne({
      _id: consent.user,
      guardian: parentId,
    }).select("+password");

    if (!child) {
      return res
        .status(403)
        .json({ message: "You are not a guardian of this account" });
    }

    req.child = {
      id: consent.user.toString(),
      hasPassword: !!child.password,
      populated: child,
    };

    next();
  } catch (err) {
    next(err);
  }
};
