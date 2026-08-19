import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import Participant from "../models/Participant/Participant.model";
import UserIdentifier from "../models/UserIdentifier/UserIdentifier.model";
import User from "../models/User/User.model";
import {
  resolveTokenRoute,
  mapExternalSubjectToLocal,
} from "../libs/jwt/externalIdentity";
import { verifyExternalToken } from "../libs/jwt/externalVerifier";
import { UnauthorizedError } from "../errors/UnauthorizedError";

/**
 * Builds the 401 response message for a failed external-token attempt, exposing
 * the specific reason for {@link UnauthorizedError} while masking unexpected
 * failures behind the generic message used by the local path.
 *
 * @param error - The caught error.
 * @returns A human-readable message safe to return to the client.
 */
const externalAuthErrorMessage = (error: unknown): string =>
  error instanceof UnauthorizedError
    ? error.message
    : "Invalid or expired token";

type DecodedServiceJWT = {
  serviceKey: string;
};
export const verifyParticipantJWT = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.session.userParticipant) {
    req.userParticipant = { id: req.session.userParticipant.id };
    return next();
  }

  if (!req.headers.authorization && req.query.participant) {
    req.headers.authorization = `Bearer ${req.query.participant}`;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ message: "Authorization header missing or invalid" });
  }

  const authorization = req.header("authorization");

  let token;

  token = authorization.split(" ")[1];

  const data = token.split(".");

  if (data.length < 3) {
    return res.status(401).json({
      message: "'" + token + "' is not a valid authorization token",
    });
  }

  if (resolveTokenRoute(token) === "external") {
    try {
      const claims = await verifyExternalToken(token);
      const identity = await mapExternalSubjectToLocal(claims);
      if (!identity.participant) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized resource" });
      }
      req.decodedToken = claims as unknown as JwtPayload;
      req.userParticipant = { id: identity.participant.id };
      req.session.userParticipant = { id: identity.participant.id };
      return next();
    } catch (error) {
      return res.status(401).json({ message: externalAuthErrorMessage(error) });
    }
  }

  const buff = Buffer.from(data[1], "base64");
  const authObject: DecodedServiceJWT = JSON.parse(buff.toString());

  if (!authObject.serviceKey) {
    token = authHeader.slice(7);
    try {
      const decodedToken = jwt.verify(
        token,
        process.env.JWT_SECRET_KEY
      ) as JwtPayload;

      req.decodedToken = decodedToken;
      req.userParticipant = {
        id: decodedToken.sub,
      };
      req.session.userParticipant = { id: decodedToken.sub };

      next();
    } catch (error) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  } else {
    const { serviceKey } = authObject;

    const participant = await Participant.findOne({
      clientID: serviceKey,
    }).lean();

    if (!participant)
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized resource" });

    try {
      const decoded = jwt.verify(token, participant.clientSecret);
      if (decoded) {
        req.session.userParticipant = { id: participant._id };
        return next();
      } else {
        return res.status(401).json({
          error: "token-decode-error",
          message: "Unauthorized resource",
        });
      }
    } catch (error) {
      return res
        .status(401)
        .json({ error: error, message: "Unauthorized resource" });
    }
  }
};

export const verifyUserKey = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.headers["x-user-key"]) {
    const userIdentifier = await UserIdentifier.findById(
      req.headers["x-user-key"]
    ).lean();

    if (!userIdentifier) {
      return res.status(401).json({
        message: "User Identifier does not exists in the consent manager.",
      });
    }

    req.userIdentifier = {
      id: userIdentifier._id,
    };
    next();
  } else {
    return res
      .status(401)
      .json({ message: "Authorization header missing or invalid" });
  }
};

export const verifyUserJWT = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.session.user) {
    req.user = {
      id: req.session.user.id,
    };
    return next();
  }

  if (req.headers["x-user-key"]) {
    const userIdentifier = await UserIdentifier.findById(
      req.headers["x-user-key"]
    ).lean();

    if (!userIdentifier) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const userExisitingIdentifier = await User.findOne({
      identifiers: {
        $in: userIdentifier._id,
      },
    });

    if (userExisitingIdentifier) {
      req.userIdentifier = {
        id: userExisitingIdentifier._id,
      };
      next();
    } else {
      const userExisitingEmail = await User.findOne({
        email: userIdentifier.email,
      });

      if (!userExisitingEmail) {
        return res
          .status(401)
          .json({ message: "User with email doesn't exist" });
      }

      if (
        userExisitingEmail &&
        !userExisitingEmail.identifiers.includes(userIdentifier?._id)
      ) {
        userExisitingEmail.identifiers.push(userIdentifier?._id);
      }

      await userExisitingEmail.save();

      req.user = {
        id: userExisitingEmail._id,
      };

      next();
    }
  } else {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Authorization header missing or invalid" });
    }

    const token = authHeader.slice(7);

    if (resolveTokenRoute(token) === "external") {
      try {
        const claims = await verifyExternalToken(token);
        const identity = await mapExternalSubjectToLocal(claims);
        if (!identity.user) {
          return res
            .status(401)
            .json({ message: "User with subject doesn't exist" });
        }
        req.decodedToken = claims as unknown as JwtPayload;
        req.user = { id: identity.user.id };
        return next();
      } catch (error) {
        return res
          .status(401)
          .json({ message: externalAuthErrorMessage(error) });
      }
    }

    try {
      const decodedToken = jwt.verify(
        token,
        process.env.OAUTH_SECRET_KEY
      ) as JwtPayload;

      req.decodedToken = decodedToken;
      req.user = {
        id: decodedToken.sub,
      };

      next();
    } catch (error) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  }
};
