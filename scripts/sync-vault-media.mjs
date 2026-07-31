import { prisma } from "@rta/database";
import { syncVaultMedia } from "@rta/services";

try {
  const result = await syncVaultMedia();
  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}
