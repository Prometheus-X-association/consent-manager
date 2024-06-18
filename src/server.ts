import express, { json as expressJson } from "express";
import cors from "cors";
import { loadRoutes } from "./routes";
import { loadMongoose } from "./config/database";
import path from "path";
import client from "prom-client";

// Simulation
import contractsSimulatedRouter from "./simulated/contract/router";
import { initSession } from "./middleware/session";

export const startServer = (testPort?: number) => {
  if (!testPort) loadMongoose();

  const app = express();
  const port = testPort || process.env.PORT || 3000;

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  app.use(cors({ origin: true, credentials: true }));
  app.use(expressJson());

  app.set("trust proxy", true);

  app.use(initSession());

  loadRoutes(app);

  if (!testPort) {
    // SIMULATING CONTRACT
    app.use("/contracts", contractsSimulatedRouter);

    // Create a custom counter metric
    const counter = new client.Counter({
      name: "node_request_count",
      help: "The total number of processed requests",
    });

    // Increment the counter on each request
    app.use((req, res, next) => {
      counter.inc();
      next();
    });
    app.get("/metrics", async (req, res) => {
      res.set("Content-Type", client.register.contentType);
      res.end(await client.register.metrics());
    });
  }

  // Start the server
  const server = app.listen(port, () => {
    //eslint-disable-next-line
    console.log(`Consent manager running on: http://localhost:${port}`);
  });

  return { server, app }; // For tests
};
