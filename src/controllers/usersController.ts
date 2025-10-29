import { NextFunction, Request, Response } from "express";
import { BadRequestError } from "../errors/BadRequestError";
import User from "../models/User/User.model";
import UserIdentifier from "../models/UserIdentifier/UserIdentifier.model";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../libs/OAuth/tokens";
import { OAUTH_SCOPES } from "../libs/OAuth/scopes";
import { userToSelfDescription } from "../libs/jsonld/selfDescriptions";
import { USER_SELECTION } from "../utils/schemaSelection";
import { checkUserIdentifier } from "../utils/UserIdentifierMatchingProcessor";
import Participant from "../models/Participant/Participant.model";
import mongoose from "mongoose";

/**
 * Registers a new user in the PDI
 */
export const signup = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    const verify = await User.findOne({
      email,
    }).lean();

    if (verify) {
      return res
        .status(409)
        .json({ message: "User with this email address already exists" });
    }

    const user = new User({ firstName, lastName, email, password });

    const scopes = [OAUTH_SCOPES.userRead, OAUTH_SCOPES.userWrite];
    const accessToken = generateAccessToken(user, scopes);
    const refreshToken = await generateRefreshToken(user, { save: false });

    user.oauth = {
      scopes: scopes,
      refreshToken: refreshToken,
    };

    user.jsonld = userToSelfDescription(user);

    await user.save();

    return res.json({ user, accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
};

/**
 * Logs in a user in the PDI
 */
export const me = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.user;
    const user = await User.findById(id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const scopes = [OAUTH_SCOPES.userRead, OAUTH_SCOPES.userWrite];
    const accessToken = generateAccessToken(user, scopes);
    const refreshToken = await generateRefreshToken(user);

    req.session.user = {
      id: user.id,
      oath: {
        accessToken,
        refreshToken,
      },
    };

    user.oauth.refreshToken = refreshToken;
    await user.save();

    const publicUser = await User.findById(user.id).select(USER_SELECTION);

    return res.json({ user: publicUser, accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
};

/**
 * Logs in a user in the PDI
 */
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isPasswordValid = await user.validatePassword(password);

    if (!isPasswordValid) {
      return res.status(400).json({ message: "invalid credentials" });
    }

    const scopes = [OAUTH_SCOPES.userRead, OAUTH_SCOPES.userWrite];
    const accessToken = generateAccessToken(user, scopes);
    const refreshToken = await generateRefreshToken(user);

    req.session.user = {
      id: user.id,
      oath: {
        accessToken,
        refreshToken,
      },
    };

    user.oauth.refreshToken = refreshToken;
    await user.save();

    const publicUser = await User.findById(user.id).select(USER_SELECTION);

    return res.json({ user: publicUser, accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
};

/**
 * Finds a user by ID and update it
 */
export const updateUserById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await UserIdentifier.findByIdAndUpdate(req.params.id, {
      url: req.body.url,
      identifier: req.body.internalID,
      email: req.body.email,
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json(user);
  } catch (err) {
    next(err);
  }
};

/**
 * Finds a user by ID and delete it
 */
export const deleteUserById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await UserIdentifier.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json(user);
  } catch (err) {
    next(err);
  }
};

/**
 * Finds a user by ID and returns it
 */
export const getUserById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await User.findById(req.params.userId).select(USER_SELECTION);
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json(user);
  } catch (err) {
    next(err);
  }
};

/**
 * Registers a new user identifier in the PDI
 * Used by Participants to declare users from their platform
 * @author Felix Bole
 */
export const registerUserIdentifier = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, identifier, url } = req.body;
    if (!email && !identifier)
      throw new BadRequestError("Missing or invalid fields", [
        { field: "email", message: "Email must exist if identifier does not" },
        {
          field: "identifier",
          message: "identifier must exist if email does not",
        },
      ]);

    const exists = await UserIdentifier.findOne({
      attachedParticipant: req.userParticipant.id,
      email,
    });
    if (exists) return res.status(409).json({ error: "User already exists" });

    const newId = new UserIdentifier({
      attachedParticipant: req.userParticipant.id,
      email,
      identifier,
      url,
    });

    await newId.save();

    // check if another userIdentifier exist from another participant
    await checkUserIdentifier(email, req.userParticipant.id, newId._id);

    return res.json(newId);
  } catch (err) {
    next(err);
  }
};

/**
 * Registers new users identifier in the PDI
 * Used by Participants to declare users from their platform by uploading a csv file
 */
export const registerUserIdentifiers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { users } = req.body;
    const usersResponse = [];

    for (const user of users) {
      const exists = await UserIdentifier.findOne({
        attachedParticipant: req.userParticipant.id,
        email: user.email,
      }).lean();

      if (!user.email && !user.identifier)
        throw new BadRequestError("Missing or invalid fields", [
          {
            field: "email",
            message: "Email must exist if identifier does not",
          },
          {
            field: "identifier",
            message: "identifier must exist if email does not",
          },
        ]);

      if (!exists) {
        const newId = new UserIdentifier({
          attachedParticipant: req.userParticipant.id,
          email: user.email,
          identifier: user.internalID,
          url: user.url,
        });

        await newId.save();

        usersResponse.push(newId);
      }
    }

    return res.json(usersResponse);
  } catch (err) {
    next(err);
  }
};

/**
 * Finds a user identifier by email
 * @param req
 * @param res
 * @returns
 */
export const getUserIdentifierByEmail = async (req: Request, res: Response) => {
  const { selfDescription } = req.body;
  const results = {
    userIdentifierExists: false,
    userIdentifier: "",
    userExists: false,
  };

  const participant = await Participant.findOne({
    selfDescriptionURL: selfDescription,
  });

  if (!participant)
    return res.status(404).json({ message: "Participant not found" });

  const userIdentifier = await UserIdentifier.findOne({
    attachedParticipant: new mongoose.Types.ObjectId(participant._id),
  }).lean();

  if (!userIdentifier) {
    return res.status(404).json({ message: "User identifier not found" });
  } else {
    results.userIdentifierExists = true;
    results.userIdentifier = userIdentifier._id;
    const user = await User.findOne({
      email: userIdentifier.email,
      identifiers: {
        $in: [userIdentifier._id],
      },
    }).lean();

    if (user) {
      results.userExists = true;
    }
  }

  return res.status(200).json(results);
};

export const getUserByEmail = async (req: Request, res: Response) => {
  const { email } = req.body;
  const user = await User.findOne({
    email: email,
  })
    .select("-oauth -password")
    .lean();

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  } else {
    return res.status(200).json(user);
  }
};

export const injectUserIdentifier = async (req: Request, res: Response) => {
  const { userId, userIdentifiers } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  } else {
    userIdentifiers.map(async (userIdentifier: string) => {
      const currentUserIdentifier = await UserIdentifier.findById(
        userIdentifier
      ).lean();

      if (!currentUserIdentifier) {
        return res.status(404).json({ message: "User Identifier not found" });
      }

      user.identifiers.push(new mongoose.Types.ObjectId(userIdentifier));
    });
  }

  await user.save();
  return res.status(200).json(user);
};
