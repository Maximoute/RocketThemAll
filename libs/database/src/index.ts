import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const engineCandidates = [
	"/workspace/packages/database/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node",
	"/workspace/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node",
	"/workspace/apps/web/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node"
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
