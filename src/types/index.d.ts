import "express";
import "express-session";
import { JwtPayload } from "jsonwebtoken";
import { IParticipant, IUser } from "./models";

import Joi from "joi";

declare module "express" {
  interface Request {
    decodedToken?: JwtPayload;
    user?: {
      id: string;

      /**
       * Only available on handlers that come
       * after usePopulatedUser
       */
      populated?: IUser;
    };

    userParticipant?: {
      id: string;

      /**
       * Only available on handlers that come
       * after usePopulatedParticipant
       */
      populated?: IParticipant;
    };

    userIdentifier?: {
      id: string;
    };

    /**
     * The targeted account with a guardian, set by the guardianship
     * authorization middlewares once the acting user is confirmed as a
     * guardian of this account.
     */
    child?: {
      id: string;
      hasPassword: boolean;
      populated?: IUser;
    };

    validationSchema?: Joi.ObjectSchema;
  }
}

declare module "express-session" {
  interface Session {
    authorizationCode?: string;
    user?: {
      id: string;

      /**
       * The consent-manager acts as both auth provider server
       * & a client backend so it's managing the session of the
       * user as well. We need tokens to handle user session auth
       * from the parts of the app that are acting as app client backend
       */
      oath: {
        accessToken: string;
        refreshToken: string;
      };
    };

    userParticipant?: {
      id: string;
    };
  }
}
