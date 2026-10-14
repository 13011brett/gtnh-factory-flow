import { describe, expect, it } from "vitest";
import { looksLikePlanJson } from "./open-plan-file";

describe("open-plan-file", () => {
  it("tells a plan file's JSON from a link or a code", () => {
    expect(looksLikePlanJson('{"schemaVersion":1}')).toBe(true);
    expect(looksLikePlanJson('  \n {"name":"x"}')).toBe(true);
    expect(looksLikePlanJson("gtnh1.abc")).toBe(false);
    expect(looksLikePlanJson("https://gtnhplanner.com/#p=gtnh1.abc")).toBe(false);
  });
});
