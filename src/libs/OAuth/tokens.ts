import jwt from "jsonwebtoken";
import { OAUTH_SCOPES } from "./scopes";
import { IUser } from "../../types/models";
import { randomBytes } from "crypto";

export const validateScopes = (requestedScopes: string[]): string[] | null => {
  const validScopes = Object.keys(OAUTH_SCOPES);
  const validRequestedScopes = requestedScopes.filter((scope) =>
    validScopes.includes(scope)
  );
  if (validRequestedScopes.length === 0) return null;
  return validRequestedScopes;
};

export const generateAccessToken = (user: IUser, scopes: string[]): string => {
  const payload = {
    sub: user.id,
    email: user.email,
    scopes: scopes,
  };

  //TODO temporary solution to resolves docker error (expiresIn)
  return jwt.sign(payload, process.env.OAUTH_SECRET_KEY, {
    expiresIn: "1h",
  });
};

export const generateRefreshToken = async (
  user: IUser,
  options: { save: boolean } = { save: true }
): Promise<string> => {
  const refreshToken = randomBytes(32).toString("hex");

  user.oauth.refreshToken = refreshToken;

  if (options.save) await user.save();

  return refreshToken;
};

export const generateNewAccessToken = (
  user: IUser,
  scopes: string[]
): string => {
  const payload = {
    sub: user.id,
    email: user.email,
    scopes: scopes,
  };

  //TODO temporary solution to resolves docker error (expiresIn)
  return jwt.sign(payload, process.env.OAUTH_SECRET_KEY, {
    expiresIn: "1h",
  });
};
