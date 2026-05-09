import { readFile } from "fs/promises";
import { existsSync } from "fs";

export async function loadEnv(envPath = ".env"): Promise<void> {
  if (!existsSync(envPath)) {
    console.warn(`⚠️  No ${envPath} file found. Set required environment variables in your shell or create a ${envPath} from .env.example.`);
    return;
  }

  const raw = await readFile(envPath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1);

    if (value.startsWith("\"") && value.endsWith("\"")) {
      value = value.slice(1, -1);
    } else if (value.startsWith("'" ) && value.endsWith("'")) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
