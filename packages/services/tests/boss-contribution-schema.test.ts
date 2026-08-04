import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("boss support contribution schema", () => {
  it("accepts zero-point support actions without weakening negative-value protection", () => {
    const migration = readFileSync(
      new URL(
        "../../database/prisma/migrations/20260804010000_allow_zero_value_boss_support_contributions/migration.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(migration).toContain('CHECK ("amount" >= 0)');
    expect(migration).not.toContain('CHECK ("amount" > 0)');
  });
});
