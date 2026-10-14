// @vitest-environment jsdom
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  onScale,
  playSfx,
  recentSfx,
  resetSfxForTests,
  setSoundLevel,
  sfxClick,
  sfxConnect,
  SFX_BASE,
  SFX_NAMES,
  SFX_TAKES,
  sfxUrl,
} from "./sfx";

/** The player's rules, as the mod's Sfx has them. */

let clock = 1000;
beforeEach(() => {
  clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  window.localStorage.clear();
  resetSfxForTests(() => 0.5);
});
afterEach(() => vi.restoreAllMocks());

describe("sfx", () => {
  it("has every take of every sound on disk", () => {
    for (const name of SFX_NAMES) {
      for (let take = 1; take <= SFX_TAKES; take++) {
        expect(existsSync(join(process.cwd(), "public", sfxUrl(name, take)))).toBe(true);
      }
    }
  });

  it("plays at the mod's level times the Sounds setting, and not at all when Off", () => {
    expect(playSfx("board.place")?.volume).toBeCloseTo(SFX_BASE, 5);
    clock += 500;
    setSoundLevel(3);
    expect(playSfx("board.place")?.volume).toBeCloseTo(Math.min(1, SFX_BASE * 1.7), 5);
    clock += 500;
    setSoundLevel(0);
    expect(playSfx("board.place")).toBeUndefined();
  });

  it("is on at Normal by default", () => {
    expect(playSfx("ui.open")).toBeDefined();
  });

  it("lands every pitch on the pentatonic scale", () => {
    expect(onScale(1.12)).toBeCloseTo(Math.pow(2, 2 / 12), 6);
    expect(onScale(0.9)).toBeCloseTo(Math.pow(2, -3 / 12), 6);
    expect(onScale(1)).toBe(1);
  });

  it("deals the takes like a shuffled deck, never the same twice running", () => {
    resetSfxForTests(Math.random);
    const takes: number[] = [];
    for (let i = 0; i < 40; i++) {
      clock += 200;
      takes.push(playSfx("ui.page")!.take);
    }
    for (let i = 1; i < takes.length; i++) expect(takes[i]).not.toBe(takes[i - 1]);
    for (let round = 0; round < 8; round++) expect(new Set(takes.slice(round * 5, round * 5 + 5)).size).toBe(5);
  });

  it("drops a repeat inside 30 ms and ducks repeats inside 120 ms", () => {
    const first = playSfx("ui.tick")!;
    clock += 10;
    expect(playSfx("ui.tick")).toBeUndefined();
    clock += 50;
    const second = playSfx("ui.tick")!;
    expect(second.volume / first.volume).toBeCloseTo(0.6, 5);
  });

  it("lets the click give way to a sound that says more", () => {
    sfxClick();
    clock += 5;
    sfxConnect("fluid");
    clock += 5;
    // A click right after a specific sound is part of the same action.
    sfxClick();
    expect(recentSfx().map((p) => p.name)).toEqual(["ui.click", "wire.fluid"]);
  });
});
