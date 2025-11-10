import { NextFunction, Request, Response } from "express";

export const consentKeyCheck = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.headers["x-visionstrust-consent-key"]) {
      if (
        req.headers["x-visionstrust-consent-key"] !==
        process.env.X_VISIONSTRUST_CONSENT_KEY
      ) {
        return res.status(401).json({ message: "Invalid consent key" });
      }
      next();
    } else {
      return res
        .status(401)
        .json({ message: "Authorization header missing or invalid" });
    }
  } catch (err) {
    next(err);
  }
};
