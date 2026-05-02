import { Router } from "express";
import { z } from "zod";
import { ImageService, ImportService } from "@rta/services";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { uploadRateLimit, importRateLimit } from "../middleware/rate-limit.js";
import { validateBody } from "../utils/validate.js";
import { logError } from "../utils/logger.js";

const router = Router();
const imageService = new ImageService();
const importService = new ImportService();

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg"]);

const uploadSchema = z.object({
  key: z.string().min(1).max(200),
  contentBase64: z.string().min(1),
  contentType: z.enum(["image/png", "image/jpeg"]).optional()
}).strict();

const importUrlSchema = z.object({
  sourceUrl: z.string().url(),
  imageCredit: z.string().max(300).optional()
}).strict();

function detectMime(buffer: Buffer): "image/png" | "image/jpeg" | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) {
    return "image/png";
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9) {
    return "image/jpeg";
  }

  return null;
}

function safeBase64Decode(value: string): Buffer {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(normalized)) {
    throw new Error("Invalid base64 payload");
  }

  const buffer = Buffer.from(normalized, "base64");
  if (buffer.length === 0) {
    throw new Error("Empty upload payload");
  }

  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error("Upload exceeds 5MB");
  }

  return buffer;
}

router.post("/upload", requireAuth, requireAdmin, uploadRateLimit, async (req, res) => {
  const payload = validateBody(uploadSchema, req);

  try {
    const buffer = safeBase64Decode(payload.contentBase64);
    const sniffedMime = detectMime(buffer);
    const requestedMime = payload.contentType ?? sniffedMime;

    if (!sniffedMime || !requestedMime || !ALLOWED_MIME.has(requestedMime) || sniffedMime !== requestedMime) {
      return res.status(400).json({ error: "Only PNG and JPEG image uploads are allowed" });
    }

    const url = await imageService.uploadFile(buffer, payload.key, requestedMime);
    return res.status(201).json({ url });
  } catch (error) {
    logError("Image upload rejected", {
      path: req.path,
      message: error instanceof Error ? error.message : String(error)
    });
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid upload payload" });
  }
});

router.post("/import-url", requireAuth, requireAdmin, importRateLimit, async (req, res) => {
  const payload = validateBody(importUrlSchema, req);
  const job = await importService.createImportJob(payload.sourceUrl, payload.imageCredit);
  const result = await importService.processImportJob(job.id);
  res.status(201).json({ jobId: job.id, ...result });
});

export default router;
