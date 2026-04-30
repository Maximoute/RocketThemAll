import { Router } from "express";
import { ImageService, ImportService } from "@rta/services";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();
const imageService = new ImageService();
const importService = new ImportService();

router.post("/upload", requireAdmin, async (req, res) => {
  const { key, contentBase64 } = req.body as { key: string; contentBase64: string };
  const buffer = Buffer.from(contentBase64, "base64");
  const url = await imageService.uploadFile(buffer, key);
  res.status(201).json({ url });
});

router.post("/import-url", requireAdmin, async (req, res) => {
  const { sourceUrl, imageCredit } = req.body as { sourceUrl: string; imageCredit?: string };
  const job = await importService.createImportJob(sourceUrl, imageCredit);
  const result = await importService.processImportJob(job.id);
  res.status(201).json({ jobId: job.id, ...result });
});

export default router;
