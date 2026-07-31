import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
const result = spawnSync(
  process.execPath,
  [prismaCli, "validate", "--schema", "packages/database/prisma/schema.prisma"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://schema_validation:unused@127.0.0.1:5432/schema_validation"
    }
  }
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
