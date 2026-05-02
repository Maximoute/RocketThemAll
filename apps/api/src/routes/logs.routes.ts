import { Router } from "express";
import { LogsService } from "@rta/services";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();
const logsService = new LogsService();

router.get("/", requireAuth, requireAdmin, async (_req, res) => {
  const [captureLogs, adminLogs] = await logsService.getLogs();
  res.json({ captureLogs, adminLogs });
});

export default router;
