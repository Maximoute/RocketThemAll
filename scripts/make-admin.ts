import { loadEnv } from "./loadEnv";
import { prisma } from "@rta/database";

function parseArgs() {
  const args = process.argv.slice(2);
  const options: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        options[key] = true;
      } else {
        options[key] = next;
        i += 1;
      }
    }
  }

  return options;
}

function printUsage() {
  console.log(`Usage: npm run make-admin -- --id <userId> | --discordId <discordId> | --username <username>`);
  console.log(`Example: npm run make-admin -- --discordId 123456789012345678`);
}

async function main() {
  await loadEnv();
  const options = parseArgs();
  const id = typeof options.id === "string" ? options.id : undefined;
  const discordId = typeof options.discordId === "string" ? options.discordId : undefined;
  const username = typeof options.username === "string" ? options.username : undefined;
  const identifiers = [id, discordId, username].filter(Boolean);

  if (identifiers.length !== 1) {
    console.error("Error: exactly one identifier is required.");
    printUsage();
    process.exit(1);
  }

  let user = null;

  if (id) {
    user = await prisma.user.findUnique({ where: { id } });
  } else if (discordId) {
    user = await prisma.user.findUnique({ where: { discordId } });
  } else if (username) {
    user = await prisma.user.findFirst({ where: { username } });
  }

  if (!user) {
    console.error("User not found. Make sure the user already exists in the database.");
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isAdmin: true }
  });

  console.log(`User ${updated.username} (${updated.id}) is now an admin.`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Failed to update user:", error);
  process.exit(1);
});
