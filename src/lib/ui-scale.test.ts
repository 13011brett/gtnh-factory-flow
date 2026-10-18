// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stubMatchMedia(answer: (media: string) => boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (media: string) =>
      ({
        matches: answer(media),
        media,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

describe("interface size", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-compact");
    document.documentElement.removeAttribute("data-snug");
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("renders 100% at 1.17 on a desktop window", async () => {
    stubMatchMedia(() => false);
    const { getUiScale, getUiScalePercent } = await import("./ui-scale");
    expect(getUiScalePercent()).toBe(100);
    expect(getUiScale()).toBe(1.17);
  });

  it("renders 100% at 0.9 on a phone", async () => {
    stubMatchMedia((media) => media.includes("899.98px"));
    const { getUiScale } = await import("./ui-scale");
    expect(getUiScale()).toBe(0.9);
  });

  it("is 1 where there is no matchMedia to ask", async () => {
    const { getUiScale } = await import("./ui-scale");
    expect(getUiScale()).toBe(1);
  });

  it("steps in tens, clamps, persists and stamps the document", async () => {
    stubMatchMedia(() => false);
    const { setUiScalePercent, getUiScale, getUiScalePercent, clampUiScalePercent } = await import(
      "./ui-scale"
    );
    expect(clampUiScalePercent(125)).toBe(130);
    expect(clampUiScalePercent(10)).toBe(60);
    expect(clampUiScalePercent(999)).toBe(200);
    expect(clampUiScalePercent(Number.NaN)).toBe(100);

    setUiScalePercent(120);
    expect(getUiScalePercent()).toBe(120);
    expect(getUiScale()).toBe(1.404);
    expect(window.localStorage.getItem("gtnh-factory-flow.ui-scale.v1")).toBe("120");
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("1.404");
    // The exact reciprocal as a calc(), so the board's inverse zoom cancels
    // the shell's to exactly 1 (a rounded decimal left sub-pixel geometry
    // that doubled the compositor's per-frame work).
    expect(document.documentElement.style.getPropertyValue("--ui-scale-inverse")).toBe(
      "calc(1 / 1.404)",
    );
  });

  it("reads a stored percent back", async () => {
    stubMatchMedia(() => false);
    window.localStorage.setItem("gtnh-factory-flow.ui-scale.v1", "80");
    const { getUiScale } = await import("./ui-scale");
    expect(getUiScale()).toBe(0.936);
  });

  it("builds the breakpoint queries from the factor and stamps the attributes", async () => {
    // 1400px window at 1.3: 1077 shell px, so snug (under 1280) but not compact.
    stubMatchMedia((media) => {
      const width = Number(/max-width: ([\d.]+)px/.exec(media)?.[1] ?? 0);
      return media.includes("899.98px") ? false : 1400 <= width;
    });
    const { compactMediaQuery, snugMediaQuery, stampViewportAttributes, isCompactViewport } =
      await import("./compact-view");
    // The size never raises the phone cutoff (real px); it scales the shell floor (shell px).
    expect(compactMediaQuery(1.3)).toBe(
      "(max-width: 899.98px), (max-height: 559.98px), (max-width: 1039.98px), (max-height: 571.98px)",
    );
    expect(compactMediaQuery(0.9)).toBe(
      "(max-width: 809.98px), (max-height: 503.98px), (max-width: 719.98px), (max-height: 395.98px)",
    );
    expect(snugMediaQuery(1.3)).toBe("(max-width: 1663.98px)");
    stampViewportAttributes();
    expect(isCompactViewport()).toBe(false);
    expect(document.documentElement.hasAttribute("data-compact")).toBe(false);
    expect(document.documentElement.hasAttribute("data-snug")).toBe(true);
  });

  it("writes a boot script that repeats the same numbers", async () => {
    const { uiScaleBootScript } = await import("./ui-scale-boot");
    const script = uiScaleBootScript({
      phoneMaxWidth: 900,
      phoneMaxHeight: 560,
      compactMaxWidth: 800,
      compactMaxHeight: 440,
      snugMaxWidth: 1280,
    });
    expect(script).toContain("gtnh-factory-flow.ui-scale.v1");
    expect(script).toContain("899.98px");
    expect(script).toContain("900*k-0.02");
    expect(script).toContain("800*s-0.02");
    expect(script).toContain("1280*s-0.02");
    expect(script).toContain('"--ui-scale"');
    // It must be plain script: no template literal or module syntax survives.
    expect(script).not.toContain("import ");
    expect(() => new Function(script)).not.toThrow();
  });
});

/** A window of this real size answers a media query (comma-separated max-width / max-height clauses, OR-ed). */
function windowAnswers(width: number, height: number) {
  return (media: string) =>
    media.split(",").some((clause) => {
      const limit = Number(/([\d.]+)px/.exec(clause)?.[1] ?? Number.NaN);
      if (clause.includes("max-width")) return width <= limit;
      if (clause.includes("max-height")) return height <= limit;
      return false;
    });
}

describe("compact mode follows the window, not the interface size", () => {
  const SIZES = { Tiny: 70, Small: 90, Normal: 100, Large: 130 } as const;

  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-compact");
    document.documentElement.removeAttribute("data-snug");
  });
  afterEach(() => {
    Reflect.deleteProperty(window, "matchMedia");
  });

  /** What the app decides once it runs, and what the boot script stamped before it did. */
  async function decide(width: number, height: number, percent: number) {
    stubMatchMedia(windowAnswers(width, height));
    window.localStorage.setItem("gtnh-factory-flow.ui-scale.v1", String(percent));
    const { uiScaleBootScript } = await import("./ui-scale-boot");
    const { COMPACT_MAX_HEIGHT, COMPACT_MAX_WIDTH, PHONE_MAX_HEIGHT, PHONE_MAX_WIDTH, SNUG_MAX_WIDTH } = await import(
      "./viewport-breakpoints"
    );
    new Function(
      uiScaleBootScript({
        phoneMaxWidth: PHONE_MAX_WIDTH,
        phoneMaxHeight: PHONE_MAX_HEIGHT,
        compactMaxWidth: COMPACT_MAX_WIDTH,
        compactMaxHeight: COMPACT_MAX_HEIGHT,
        snugMaxWidth: SNUG_MAX_WIDTH,
      }),
    )();
    const booted = document.documentElement.hasAttribute("data-compact");
    const { isCompactViewport } = await import("./compact-view");
    return { booted, running: isCompactViewport() };
  }

  it("a desktop window of 1280 x 720 or more keeps the three columns at every size", async () => {
    for (const [name, percent] of Object.entries(SIZES)) {
      for (const [width, height] of [
        [1280, 720],
        [1366, 768],
        [1440, 900],
        [1920, 1080],
        [2560, 1440],
      ]) {
        const answer = await decide(width, height, percent);
        expect(answer, `${name} ${width}x${height}`).toEqual({ booted: false, running: false });
        vi.resetModules();
        document.documentElement.removeAttribute("data-compact");
      }
    }
  });

  it("a phone stays compact at Normal and Large, held either way (Tiny and Small shrink the shell to a desktop's room)", async () => {
    for (const [name, percent] of Object.entries(SIZES).filter(([size]) => size === "Normal" || size === "Large")) {
      for (const [width, height] of [
        [390, 844],
        [844, 390],
        [932, 430],
        [768, 1024],
        [1024, 480],
      ]) {
        const answer = await decide(width, height, percent);
        expect(answer, `${name} ${width}x${height}`).toEqual({ booted: true, running: true });
        vi.resetModules();
        document.documentElement.removeAttribute("data-compact");
      }
    }
  });

  it("a window too small for the columns at its size is compact, and the boot script agrees with the app", async () => {
    // Large (1.52): 1100 wide is 723 shell px, under the 800 the columns need.
    expect(await decide(1100, 800, SIZES.Large)).toEqual({ booted: true, running: true });
    vi.resetModules();
    document.documentElement.removeAttribute("data-compact");
    // Tiny (0.82) fits the same window easily.
    expect(await decide(1100, 800, SIZES.Tiny)).toEqual({ booted: false, running: false });
  });

  it("boot script and app agree across every size and a grid of windows", async () => {
    for (const percent of Object.values(SIZES)) {
      for (const width of [360, 600, 840, 900, 1000, 1100, 1216, 1280, 1500, 1920]) {
        for (const height of [380, 500, 560, 660, 720, 900]) {
          const answer = await decide(width, height, percent);
          expect(answer.booted, `${percent}% ${width}x${height}`).toBe(answer.running);
          vi.resetModules();
          document.documentElement.removeAttribute("data-compact");
        }
      }
    }
  });
});
