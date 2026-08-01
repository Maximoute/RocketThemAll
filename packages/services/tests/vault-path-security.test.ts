import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWithinVault } from "../src/vault-media.service.js";

describe("Vault media path containment", () => {
  it("keeps legitimate media paths under the configured Vault", () => {
    const root = path.resolve("C:/safe/Vault-RTA");
    expect(resolveWithinVault(root, "20-Cards", "Deck", "Card.png"))
      .toBe(path.resolve(root, "20-Cards", "Deck", "Card.png"));
  });

  it("rejects traversal and absolute paths from imported CSV data", () => {
    const root = path.resolve("C:/safe/Vault-RTA");
    expect(() => resolveWithinVault(root, "..", "secret.txt")).toThrow(/Vault/);
    expect(() => resolveWithinVault(root, "C:/Windows/win.ini")).toThrow(/Vault/);
    expect(() => resolveWithinVault(root, "/etc/passwd")).toThrow(/Vault/);
    expect(() => resolveWithinVault(root, "\\\\server\\share\\secret.txt")).toThrow(/Vault/);
    expect(() => resolveWithinVault(root, "image\0.png")).toThrow(/Vault/);
  });
});
