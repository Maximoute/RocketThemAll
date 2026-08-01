import { describe, expect, it } from "vitest";
import {
  lockedWorldAccessMessage,
  worldMasteryProgressBar
} from "../src/explore.service.js";

describe("locked world progression feedback", () => {
  it("renders the current world mastery gauge", () => {
    expect(worldMasteryProgressBar(155, 250)).toBe("███████░░░░░ 62 %");

    const message = lockedWorldAccessMessage({
      currentWorldName: "Monde 1 - Découverte & Culture Web",
      mastery: 155,
      masteryTarget: 250
    });

    expect(message).toContain("Ce monde n’est pas encore débloqué.");
    expect(message).toContain(
      "🌍 **Progression du monde actuel · Monde 1 - Découverte & Culture Web**"
    );
    expect(message).toContain("███████░░░░░ 62 %");
    expect(message).toContain("**155/250** points de maîtrise · encore **95** avant le gardien");
  });

  it("indicates when the guardian threshold has been reached", () => {
    const message = lockedWorldAccessMessage({
      currentWorldName: "Monde 2",
      mastery: 300,
      masteryTarget: 250
    });

    expect(message).toContain("████████████ 100 %");
    expect(message).toContain("**gardien prêt à être affronté**");
  });

  it("handles a progression that is not initialized yet", () => {
    const message = lockedWorldAccessMessage({
      currentWorldName: "Monde 1",
      mastery: 0,
      masteryTarget: 0
    });

    expect(message).toContain("░░░░░░░░░░░░ 0 %");
    expect(message).toContain("La progression de ce monde n’est pas encore initialisée.");
  });
});
