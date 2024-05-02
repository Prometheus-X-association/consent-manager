import express, { Application } from "express";
import cors from "cors";
import { loadRoutes } from "./routes";
import { loadMongoose } from "./config/database";
import path from "path";
import mongoSanitize from "express-mongo-sanitize";

// Simulation
import contractsSimulatedRouter from "./simulated/contract/router";
import { initSession } from "./middleware/session";

export const startServer = (testPort?: number) => {
  if (!testPort) loadMongoose();

  const app: Application = express();
  const port = testPort || process.env.PORT || 3000;

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  app.use(express.json());
  const corsOptions = {
    origin: process.env.ORIGIN, // Compliant
  };

  app.use(cors(corsOptions));

  app.use(initSession());

  app.use(mongoSanitize());

  loadRoutes(app);

  // SIMULATING CONTRACT
  app.use("/contracts", contractsSimulatedRouter);

  // Start the server
  const server = app.listen(port, () => {
    //eslint-disable-next-line
    console.log(`Consent manager running on: http://localhost:${port}`);
  });

  return { server, app }; // For tests
};
