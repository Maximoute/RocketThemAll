import "express-async-errors";
import express from "express";
import cors from "cors";
import { prisma } from "@rta/database";
import cardsRoutes from "./routes/cards.routes.js";
import usersRoutes from "./routes/users.routes.js";
import tradesRoutes from "./routes/trades.routes.js";
import logsRoutes from "./routes/logs.routes.js";
import configRoutes from "./routes/config.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { globalRateLimit } from "./middleware/rate-limit.js";
import { requestContext } from "./middleware/request-context.js";
import { logError, logInfo } from "./utils/logger.js";

const app = express();
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? "0");
if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 3) {
  throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 3");
}
app.set("trust proxy", trustProxyHops);
const allowedOrigin = process.env.FRONTEND_ORIGIN ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use(requestContext);
app.use(globalRateLimit);

app.get(["/health", "/health/live"], (_req, res) => {
  res.json({
    ok: true,
    service: "api",
    version: process.env.BUILD_SHA ?? "development"
  });
});

app.get("/health/ready", async (_req, res) => {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("readiness timeout")), 2_000))
    ]);
    res.json({ ok: true, database: "ready" });
  } catch {
    res.status(503).json({ ok: false, database: "unavailable" });
  }
});

app.use("/cards", cardsRoutes);
app.use("/users", usersRoutes);
app.use("/trades", tradesRoutes);
app.use("/logs", logsRoutes);
app.use("/config", configRoutes);

app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);

async function start() {
  app.listen(port, () => {
    logInfo("API listening", { port, trustProxyHops });
  });
}

start().catch((error) => {
  logError("API startup failed", {
    message: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
