import { NextFunction, Request, Response } from "express";

export const consentKeyCheck = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.headers["x-catalog-consent-key"]) {
      if (
        req.headers["x-catalog-consent-key"] !==
        process.env.X_CATALOG_CONSENT_KEY
      ) {
        return res.status(401).json({ message: "Invalid consent key" });
      }
      next();
    } else {
      return res.status(401).json({
        message: "x-catalog-consent-key header missing or invalid",
      });
    }
  } catch (err) {
    next(err);
  }
};
