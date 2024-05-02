import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export const validateAccessToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const accessToken =
    req.headers.authorization?.split(" ")[1] || req.query.access_token;

  if (!accessToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  jwt.verify(
    accessToken.toString(),
    process.env.OAUTH_SECRET_KEY,
    (err, decoded) => {
      if (err) {
        return res.status(401).json({ error: "Invalid access token" });
      }

      // Ensure the user has the required scopes to access the endpoint

      req.user = decoded as any;

      next();
    }
  );
};
