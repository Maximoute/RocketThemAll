import { describe, expect, it } from "vitest";
import { recycleFragmentRange } from "../src/recycle.service.js";

describe("recycling fragment ranges", () => {
  it("scales normal, shiny and holo recycling rewards", () => {
    expect(recycleFragmentRange("normal")).toEqual({ min: 3, max: 5 });
    expect(recycleFragmentRange("shiny")).toEqual({ min: 50, max: 100 });
    expect(recycleFragmentRange("holo")).toEqual({ min: 400, max: 700 });
  });
});

