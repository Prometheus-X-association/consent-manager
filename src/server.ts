import express, { json as expressJson } from "express";
import cors from "cors";
import { loadRoutes } from "./routes";
import { loadMongoose } from "./config/database";
import path from "path";
import fs from "fs";

// Simulation
import contractsSimulatedRouter from "./simulated/contract/router";
import { initSession } from "./middleware/session";
import { Agent, ConsentAgent } from "contract-agent";
import { morganLogs } from "./libs/loggers";

export const startServer = async (
  testPort?: number,
  agentConfigPath?: string
) => {
  if (!testPort) loadMongoose();

  const app = express();
  const port = testPort || process.env.PORT || 3000;

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  app.use(cors({ origin: true, credentials: true }));
  app.use(expressJson());

  app.set("trust proxy", true);

  app.use(initSession());

  app.use(morganLogs);

  //Consent Agent setup
  const configFilePath = path.resolve(
    __dirname,
    agentConfigPath ?? "../consent-agent.config.json"
  );
  if (fs.existsSync(configFilePath)) {
    Agent.setConfigPath(
      agentConfigPath ?? "../consent-agent.config.json",
      __filename
    );
    Agent.setProfilesHost("profiles");
    await ConsentAgent.retrieveService();
  }

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
