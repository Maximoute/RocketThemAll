import { importVaultCatalog } from "./import-vault.js";

importVaultCatalog().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
