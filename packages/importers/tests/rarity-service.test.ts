import { describe, it, expect, vi } from "vitest";
import { getXpReward, getDropRate, generateMovieRarity, generatePokemonRarity, getRarityIdByName } from "../src/rarityService.js";

vi.mock("@rta/database", () => ({
  prisma: {
    rarity: {
      findUnique: vi.fn(),
    },
  },
}));

describe("getXpReward", () => {
  it("returns 10 for Common", () => expect(getXpReward("Common")).toBe(10));
  it("returns 20 for Uncommon", () => expect(getXpReward("Uncommon")).toBe(20));
  it("returns 40 for Rare", () => expect(getXpReward("Rare")).toBe(40));
  it("returns 70 for Very Rare", () => expect(getXpReward("Very Rare")).toBe(70));
  it("returns 110 for Import", () => expect(getXpReward("Import")).toBe(110));
  it("returns 160 for Exotic", () => expect(getXpReward("Exotic")).toBe(160));
  it("returns 250 for Black Market", () => expect(getXpReward("Black Market")).toBe(250));
  it("returns 300 for Limited", () => expect(getXpReward("Limited")).toBe(300));

  it("returns default 10 for unknown rarity", () => {
    expect(getXpReward("Unknown")).toBe(10);
  });
});

describe("getDropRate", () => {
  it("returns 0.5 for Common", () => expect(getDropRate("Common")).toBe(0.5));
  it("returns 0.22 for Uncommon", () => expect(getDropRate("Uncommon")).toBe(0.22));
  it("returns 0.12 for Rare", () => expect(getDropRate("Rare")).toBe(0.12));
  it("returns 0.07 for Very Rare", () => expect(getDropRate("Very Rare")).toBe(0.07));
  it("returns 0.04 for Import", () => expect(getDropRate("Import")).toBe(0.04));
  it("returns 0.03 for Exotic", () => expect(getDropRate("Exotic")).toBe(0.03));
  it("returns 0.01 for Black Market", () => expect(getDropRate("Black Market")).toBe(0.01));
  it("returns 0.01 for Limited", () => expect(getDropRate("Limited")).toBe(0.01));

  it("returns default 0.5 for unknown rarity", () => {
    expect(getDropRate("Unknown")).toBe(0.5);
  });
});

describe("generateMovieRarity", () => {
  it("returns Exotic for popularity > 100", () => {
    expect(generateMovieRarity({ popularity: 150 })).toBe("Exotic");
  });

  it("returns Rare for popularity > 50", () => {
    expect(generateMovieRarity({ popularity: 75 })).toBe("Rare");
  });

  it("returns Uncommon for popularity > 20", () => {
    expect(generateMovieRarity({ popularity: 30 })).toBe("Uncommon");
  });

  it("returns Common for popularity <= 20", () => {
    expect(generateMovieRarity({ popularity: 10 })).toBe("Common");
  });

  it("returns Common for missing popularity", () => {
    expect(generateMovieRarity({})).toBe("Common");
  });
});

describe("generatePokemonRarity", () => {
  const LEGENDARY_IDS = [144, 145, 146, 149, 150, 151, 243, 244, 245, 249, 250];

  for (const id of LEGENDARY_IDS) {
    it(`returns Black Market for legendary Pokémon #${id}`, () => {
      expect(generatePokemonRarity({ id })).toBe("Black Market");
    });
  }

  for (const id of [1, 4, 7]) {
    it(`returns Rare for starter Pokémon #${id}`, () => {
      expect(generatePokemonRarity({ id })).toBe("Rare");
    });
  }

  it("returns Very Rare for Pikachu (#25)", () => {
    expect(generatePokemonRarity({ id: 25 })).toBe("Very Rare");
  });

  it("returns Uncommon when Math.random() > 0.7", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.8);
    expect(generatePokemonRarity({ id: 10 })).toBe("Uncommon");
    vi.restoreAllMocks();
  });

  it("returns Common when Math.random() <= 0.7", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(generatePokemonRarity({ id: 10 })).toBe("Common");
    vi.restoreAllMocks();
  });
});

describe("getRarityIdByName", () => {
  it("returns the rarity id when found", async () => {
    const { prisma } = await import("@rta/database");
    vi.mocked(prisma.rarity.findUnique).mockResolvedValue({ id: "rare-001", name: "Rare" });

    const id = await getRarityIdByName("Rare");
    expect(id).toBe("rare-001");
  });

  it("throws when rarity is not found", async () => {
    const { prisma } = await import("@rta/database");
    vi.mocked(prisma.rarity.findUnique).mockResolvedValue(null);

    await expect(getRarityIdByName("NonExistent")).rejects.toThrow('Rarity "NonExistent" not found in database');
  });
});
