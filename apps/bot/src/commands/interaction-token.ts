import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "./service-instances.js";

const PREFIX = "rta";
const VERSION = "1";
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

function secret() {
  return process.env.NEXTAUTH_SECRET || process.env.DISCORD_TOKEN || "rta-local-development";
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url").slice(0, 10);
}

export function createInteractionToken(action: string, ...parts: Array<string | number>) {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = [PREFIX, VERSION, action, expiresAt.toString(36), ...parts.map(String)].join("|");
  const token = `${payload}|${signature(payload)}`;
  if (token.length > 100) {
    throw new Error(`Discord custom ID is too long (${token.length} characters)`);
  }
  return token;
}

export function parseInteractionToken(customId: string) {
  const parts = customId.split("|");
  if (parts.length < 5 || parts[0] !== PREFIX || parts[1] !== VERSION) {
    throw new AppError("Interaction RTA invalide.", 400);
  }

  const supplied = parts.pop()!;
  const payload = parts.join("|");
  const expected = signature(payload);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw new AppError("Cette interaction RTA n'est pas authentique.", 403);
  }
  const expiresAt = Number.parseInt(parts[3]!, 36);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new AppError("Cette interaction RTA a expiré. Relance /explore.", 409);
  }

  return {
    action: parts[2]!,
    parts: parts.slice(4)
  };
}
