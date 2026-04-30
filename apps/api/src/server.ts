import express from "express";
import cors from "cors";
import cardsRoutes from "./routes/cards.routes.js";
import usersRoutes from "./routes/users.routes.js";
import tradesRoutes from "./routes/trades.routes.js";
import imagesRoutes from "./routes/images.routes.js";
import logsRoutes from "./routes/logs.routes.js";
import configRoutes from "./routes/config.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { mockAuth } from "./middleware/auth.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(mockAuth);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/cards", cardsRoutes);
app.use("/users", usersRoutes);
app.use("/trades", tradesRoutes);
app.use("/images", imagesRoutes);
app.use("/logs", logsRoutes);
app.use("/config", configRoutes);

app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`API listening on ${port}`);
});
