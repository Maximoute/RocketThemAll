import { describe, it, expect } from "vitest";
import { calculateMovieRarity } from "../pop/cinemaFilmsImporter.js";

const defaultBounds = {
  popularity: { min: 0, max: 500 },
  voteCount: { min: 0, max: 10000 },
  voteAverage: { min: 0, max: 10 },
  age: { min: 0, max: 100 },
};

describe("calculateMovieRarity", () => {
  it("returns a valid MovieRarityResult structure", () => {
    const movie = { id: 1, title: "Test", popularity: 50, vote_count: 500, vote_average: 6, releaseYear: 2020 };
    const result = calculateMovieRarity(movie, defaultBounds, ["test"]);

    expect(result).toHaveProperty("rarityScore");
    expect(result).toHaveProperty("rarityFactors");
    expect(result.rarityFactors).toHaveProperty("age");
    expect(result.rarityFactors).toHaveProperty("known_score");
    expect(result.rarityFactors).toHaveProperty("mainstream_score");
    expect(result.rarityFactors).toHaveProperty("classic_score");
    expect(result.rarityFactors).toHaveProperty("acronym_boost");
    expect(result.rarityFactors).toHaveProperty("classic_boost");
    expect(result.rarityFactors).toHaveProperty("masterpiece_boost");
    expect(result.rarityFactors).toHaveProperty("cult_boost");
    expect(result.rarityFactors).toHaveProperty("recent_penalty");
    expect(result.rarityFactors).toHaveProperty("obscure_old_penalty");
    expect(result.rarityScore).toBeGreaterThanOrEqual(0);
    expect(result.rarityScore).toBeLessThanOrEqual(100);
  });

  it("gives higher score for high popularity and vote stats", () => {
    const high = calculateMovieRarity(
      { id: 2, title: "Blockbuster", popularity: 450, vote_count: 9000, vote_average: 8.5, releaseYear: 2023 },
      defaultBounds,
      []
    );

    const low = calculateMovieRarity(
      { id: 3, title: "Flop", popularity: 0.5, vote_count: 50, vote_average: 3, releaseYear: 2010 },
      defaultBounds,
      []
    );

    expect(high.rarityScore).toBeGreaterThan(low.rarityScore);
  });

  it("applies acronym boost for known franchise", () => {
    const result = calculateMovieRarity(
      { id: 4, title: "Star Wars", popularity: 300, vote_count: 5000, vote_average: 8.0, releaseYear: 1977 },
      defaultBounds,
      ["sw"]
    );

    expect(result.rarityFactors.acronym_boost).toBe(8);
  });

  it("applies classic boost for age >= 20 and high knownScore", () => {
    const result = calculateMovieRarity(
      { id: 5, title: "Classic", popularity: 200, vote_count: 4000, vote_average: 7.5, releaseYear: 2000 },
      defaultBounds,
      []
    );

    expect(result.rarityFactors.classic_boost).toBe(12);
  });

  it("applies masterpiece boost for high vote_average and vote_count", () => {
    const result = calculateMovieRarity(
      { id: 6, title: "Masterpiece", popularity: 200, vote_count: 3000, vote_average: 8.5, releaseYear: 2010 },
      defaultBounds,
      []
    );

    expect(result.rarityFactors.masterpiece_boost).toBe(15);
  });

  it("applies cult boost for age >= 30 and high vote average", () => {
    const result = calculateMovieRarity(
      { id: 7, title: "Cult Classic", popularity: 100, vote_count: 2000, vote_average: 8.0, releaseYear: 1990 },
      defaultBounds,
      []
    );

    expect(result.rarityFactors.cult_boost).toBe(10);
  });

  it("applies recent penalty for recent high-mainstream movies", () => {
    const result = calculateMovieRarity(
      { id: 8, title: "Recent Hit", popularity: 480, vote_count: 9000, vote_average: 7.0, releaseYear: 2025 },
      defaultBounds,
      []
    );

    expect(result.rarityFactors.recent_penalty).toBe(-12);
  });

  it("applies obscure old penalty for old low-known movies", () => {
    const result = calculateMovieRarity(
      { id: 9, title: "Forgotten", popularity: 0.1, vote_count: 5, vote_average: 4.0, releaseYear: 1980 },
      defaultBounds,
      []
    );

    expect(result.rarityFactors.obscure_old_penalty).toBe(-20);
  });

  it("handles zero values gracefully", () => {
    const result = calculateMovieRarity(
      { id: 10, title: "Zero", popularity: 0, vote_count: 0, vote_average: 0, releaseYear: 2000 },
      defaultBounds,
      []
    );

    expect(result.rarityScore).toBe(0);
  });

  it("handles extreme high values gracefully", () => {
    const result = calculateMovieRarity(
      { id: 11, title: "Max", popularity: 9999, vote_count: 999999, vote_average: 10, releaseYear: 2020 },
      defaultBounds,
      []
    );

    expect(result.rarityScore).toBeGreaterThanOrEqual(0);
    expect(result.rarityScore).toBeLessThanOrEqual(100);
  });

  it("rounds rarity score to an integer", () => {
    const result = calculateMovieRarity(
      { id: 12, title: "Round", popularity: 100, vote_count: 1000, vote_average: 6.5, releaseYear: 2015 },
      defaultBounds,
      []
    );

    expect(Number.isInteger(result.rarityScore)).toBe(true);
  });
});
