import { Router } from "express";
import { LogsService } from "@rta/services";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();
const logsService = new LogsService();

router.get("/", requireAdmin, async (_req, res) => {
  const [captureLogs, adminLogs] = await logsService.getLogs();
  res.json({ captureLogs, adminLogs });
});

export default router;
