import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  resolveTokenRoute,
  mapExternalSubjectToLocal,
} from "../libs/jwt/externalIdentity";
import { verifyExternalToken } from "../libs/jwt/externalVerifier";

/**
 * Validates the OAuth access token on a request. Tokens issued by a trusted
 * external IDP (routed by their `iss` claim) are verified via OIDC discovery +
 * JWKS and their subject mapped to a local user; all other tokens take the
 * existing local HMAC verification path unchanged.
 */
export const validateAccessToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const accessToken =
    req.headers.authorization?.split(" ")[1] || req.query.access_token;

  if (!accessToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = accessToken.toString();

  if (resolveTokenRoute(token) === "external") {
    try {
      const claims = await verifyExternalToken(token);
      const identity = await mapExternalSubjectToLocal(claims);
      if (!identity.user) {
        return res.status(401).json({ error: "Invalid access token" });
      }
      req.user = { id: identity.user.id };
      return next();
    } catch (error) {
      return res.status(401).json({ error: "Invalid access token" });
    }
  }

  jwt.verify(token, process.env.OAUTH_SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Invalid access token" });
    }

    // TODO Perform additional checks, such as token expiration and scope validation
    // Ensure the user has the required scopes to access the endpoint

    req.user = decoded as any;

    next();
  });
};
