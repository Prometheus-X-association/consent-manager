import { Application, Request, Response } from "express";

// Routes
import { globalErrorHandler } from "../middleware/globalErrorHandler";

import swaggerUI from "swagger-ui-express";
import swaggerSpec from "../../docs/swagger.json";

import consentRouter from "./consent";
import usersRouter from "./users";
import participantsRouter from "./participants";
import dataExchangeRouter from "./dataExchange";
import guardianshipRouter from "./guardianship";
import { verifyUserJWT } from "../middleware/auth";
import { ConsentAgentRouter } from "contract-agent";

const API_PREFIX = process.env.API_PREFIX;

export const loadRoutes = (app: Application) => {
  app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "OK" });
  });

  app.use(API_PREFIX + "/consents", consentRouter);
  app.use(API_PREFIX + "/users", usersRouter);
  app.use(API_PREFIX + "/participants", participantsRouter);
  app.use(API_PREFIX + "/data-exchange", dataExchangeRouter);
  app.use(API_PREFIX + "/guardianship", guardianshipRouter);

  app.use(API_PREFIX + "/", verifyUserJWT, ConsentAgentRouter);

  app.use("/docs", swaggerUI.serve, swaggerUI.setup(swaggerSpec));
  app.use(globalErrorHandler);
};
