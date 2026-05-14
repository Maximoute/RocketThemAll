import { describe, it, expect, vi } from "vitest";
import { transformPokemonToCard, transformMovieToCard } from "../src/transformService.js";

vi.mock("@rta/database", () => ({
  prisma: {
    rarity: {
      findUnique: vi.fn().mockResolvedValue({ id: "test-rarity-id" }),
    },
  },
}));

describe("determinePokemonRarity (via transformPokemonToCard)", () => {
  function makePokemon(baseExp: number, id = 1, name = "test"): any {
    return { id, name, base_experience: baseExp, types: [{ type: { name: "normal" } }] };
  }

  it("returns Common for base_experience < 50 (e.g. 30)", async () => {
    const card = await transformPokemonToCard(makePokemon(30), "img.jpg");
    expect(card.xpReward).toBe(10);
    expect(card.dropRate).toBe(0.5);
  });

  it("returns Uncommon for base_experience >= 50 (e.g. 60)", async () => {
    const card = await transformPokemonToCard(makePokemon(60), "img.jpg");
    expect(card.xpReward).toBe(20);
    expect(card.dropRate).toBe(0.22);
  });

  it("returns Rare for base_experience >= 90 (e.g. 100)", async () => {
    const card = await transformPokemonToCard(makePokemon(100), "img.jpg");
    expect(card.xpReward).toBe(40);
    expect(card.dropRate).toBe(0.12);
  });

  it("returns Very Rare for base_experience >= 128 (e.g. 140)", async () => {
    const card = await transformPokemonToCard(makePokemon(140), "img.jpg");
    expect(card.xpReward).toBe(70);
    expect(card.dropRate).toBe(0.07);
  });

  it("returns Import for base_experience >= 178 (e.g. 200)", async () => {
    const card = await transformPokemonToCard(makePokemon(200), "img.jpg");
    expect(card.xpReward).toBe(110);
    expect(card.dropRate).toBe(0.04);
  });

  it("returns Exotic for base_experience >= 240 (e.g. 260)", async () => {
    const card = await transformPokemonToCard(makePokemon(260), "img.jpg");
    expect(card.xpReward).toBe(160);
    expect(card.dropRate).toBe(0.03);
  });

  it("returns Black Market for base_experience >= 300 (e.g. 300)", async () => {
    const card = await transformPokemonToCard(makePokemon(300), "img.jpg");
    expect(card.xpReward).toBe(250);
    expect(card.dropRate).toBe(0.01);
  });

  it("returns Common for missing base_experience", async () => {
    const pokemon = { id: 1, name: "missing", types: [{ type: { name: "normal" } }] };
    const card = await transformPokemonToCard(pokemon, "img.jpg");
    expect(card.xpReward).toBe(10);
  });
});

describe("shiny pokemon rarity (via transformPokemonToCard)", () => {
  function makePokemon(baseExp: number): any {
    return { id: 1, name: "test", base_experience: baseExp, types: [{ type: { name: "normal" } }] };
  }

  it("shiny with low base_experience is at least Rare", async () => {
    const card = await transformPokemonToCard(makePokemon(30), "img.jpg", true);
    expect(card.xpReward).toBe(40);
  });

  it("shiny base_exp >= 100 is Very Rare", async () => {
    const card = await transformPokemonToCard(makePokemon(100), "img.jpg", true);
    expect(card.xpReward).toBe(70);
  });

  it("shiny base_exp >= 155 is Import", async () => {
    const card = await transformPokemonToCard(makePokemon(180), "img.jpg", true);
    expect(card.xpReward).toBe(110);
  });

  it("shiny base_exp >= 220 is Exotic", async () => {
    const card = await transformPokemonToCard(makePokemon(240), "img.jpg", true);
    expect(card.xpReward).toBe(160);
  });

  it("shiny base_exp >= 280 is Black Market", async () => {
    const card = await transformPokemonToCard(makePokemon(300), "img.jpg", true);
    expect(card.xpReward).toBe(250);
  });
});

describe("determineMovieRarity (via transformMovieToCard)", () => {
  function makeMovie(title: string, popularity: number): any {
    return { id: 1, title, popularity, poster_path: "/poster.jpg" };
  }

  it("returns Exotic for popularity > 100", async () => {
    const card = await transformMovieToCard(makeMovie("Epic", 150));
    expect(card.xpReward).toBe(160);
    expect(card.dropRate).toBe(0.03);
  });

  it("returns Rare for popularity > 50", async () => {
    const card = await transformMovieToCard(makeMovie("Popular", 75));
    expect(card.xpReward).toBe(40);
    expect(card.dropRate).toBe(0.12);
  });

  it("returns Uncommon for popularity > 20", async () => {
    const card = await transformMovieToCard(makeMovie("Indie", 30));
    expect(card.xpReward).toBe(20);
    expect(card.dropRate).toBe(0.22);
  });

  it("returns Common for popularity <= 20", async () => {
    const card = await transformMovieToCard(makeMovie("Obscure", 10));
    expect(card.xpReward).toBe(10);
    expect(card.dropRate).toBe(0.5);
  });

  it("returns Common for missing popularity", async () => {
    const movie = { id: 1, title: "No Stats", poster_path: "/poster.jpg" };
    const card = await transformMovieToCard(movie);
    expect(card.xpReward).toBe(10);
  });
});
