import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const isWindows = process.platform === "win32";
const engineFile = isWindows
	? "query_engine-windows.dll.node"
	: "libquery_engine-debian-openssl-3.0.x.so.node";

// Resolve this package's own node_modules/.prisma/client (works in any cwd / worktree)
const here = path.dirname(fileURLToPath(import.meta.url));
const localEngine = path.resolve(here, "../node_modules/.prisma/client", engineFile);

const engineCandidates = [
	localEngine,
	`/workspace/packages/database/node_modules/.prisma/client/${engineFile}`,
	`/workspace/node_modules/.prisma/client/${engineFile}`,
	`/workspace/apps/web/node_modules/.prisma/client/${engineFile}`
];

if (!process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
	for (const candidate of engineCandidates) {
		if (fs.existsSync(candidate)) {
			process.env.PRISMA_QUERY_ENGINE_LIBRARY = candidate;
			break;
		}
	}
}

export const prisma = new PrismaClient();
export * from "@prisma/client";
