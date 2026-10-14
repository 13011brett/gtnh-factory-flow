import { beforeEach, describe, expect, it } from "vitest";
import { agoText, lastOpenOf, resetLastOpenForTests, stampOpened } from "./last-open";

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  };
  resetLastOpenForTests();
});

describe("last open", () => {
  it("says it the mod's way", () => {
    const now = 10_000_000_000;
    expect(agoText(now - 20_000, now)).toBe("just now");
    expect(agoText(now - 6 * 60_000, now)).toBe("6m ago");
    expect(agoText(now - 19 * 60_000 - 5_000, now)).toBe("19m ago");
    expect(agoText(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(agoText(now - 5 * 86_400_000, now)).toBe("5d ago");
  });

  it("a plan last opened after it was last edited reads as opened", () => {
    const edited = "2026-10-01T00:00:00.000Z";
    expect(lastOpenOf("a", edited)).toBe(Date.parse(edited));
    stampOpened("a", Date.parse(edited) + 5000);
    expect(lastOpenOf("a", edited)).toBe(Date.parse(edited) + 5000);
    // A stamp older than the last edit does not move it back.
    stampOpened("b", Date.parse(edited) - 5000);
    expect(lastOpenOf("b", edited)).toBe(Date.parse(edited));
  });
});
