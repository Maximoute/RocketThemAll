import express from "express";
import cors from "cors";
import cardsRoutes from "./routes/cards.routes.js";
import usersRoutes from "./routes/users.routes.js";
import tradesRoutes from "./routes/trades.routes.js";
import imagesRoutes from "./routes/images.routes.js";
import logsRoutes from "./routes/logs.routes.js";
import configRoutes from "./routes/config.routes.js";
import importRoutes from "./routes/import/index.js";
import adminRoutes from "./routes/admin.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { actionRateLimit, globalRateLimit } from "./middleware/rate-limit.js";
import { initializeDataIfNeeded } from "./bootstrap/initialize-data.js";

const app = express();
const allowedOrigin = process.env.FRONTEND_ORIGIN ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use(globalRateLimit);
app.use(["/capture", "/spawn", "/images/upload", "/import"], actionRateLimit);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/cards", cardsRoutes);
app.use("/users", usersRoutes);
app.use("/trades", tradesRoutes);
app.use("/images", imagesRoutes);
app.use("/logs", logsRoutes);
app.use("/config", configRoutes);
app.use("/import", importRoutes);
app.use("/admin", adminRoutes);

app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);

// Initialize database before starting server
initializeDataIfNeeded().then(() => {
  app.listen(port, () => {
    console.log(`API listening on ${port}`);
  });
}).catch(error => {
  console.error("Failed to initialize:", error);
  process.exit(1);
});
