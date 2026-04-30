import { Router } from "express";
import { ConfigService } from "@rta/services";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();
const configService = new ConfigService();

router.get("/", async (_req, res) => {
  res.json(await configService.getConfig());
});

router.patch("/", requireAdmin, async (req, res) => {
  res.json(await configService.patchConfig(req.body));
});

export default router;
