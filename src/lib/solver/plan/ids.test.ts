import { describe, expect, it } from "vitest";
import { compareIds, comparePortRef } from "./ids";

describe("compareIds", () => {
  it("orders UUIDs as signed Java longs: 8..f before 0..7", () => {
    const ids = [
      "7d98aaaa-0000-0000-0000-000000000001",
      "0456aaaa-0000-0000-0000-000000000001",
      "f9c2aaaa-0000-0000-0000-000000000001",
      "938aaaaa-0000-0000-0000-000000000001",
      "0424aaaa-0000-0000-0000-000000000001",
      "945aaaaa-0000-0000-0000-000000000001",
    ];
    expect([...ids].sort(compareIds).map((id) => id.slice(0, 4))).toEqual([
      "938a",
      "945a",
      "f9c2",
      "0424",
      "0456",
      "7d98",
    ]);
  });

  it("falls to the least significant long, signed", () => {
    const a = "00000000-0000-0000-8000-000000000000";
    const b = "00000000-0000-0000-0000-000000000001";
    expect(compareIds(a, b)).toBeLessThan(0);
  });

  it("puts other ids after UUIDs, by code units, and is a total order", () => {
    const uuid = "f9c2aaaa-0000-0000-0000-000000000001";
    expect(compareIds(uuid, "a")).toBeLessThan(0);
    expect(compareIds("a", uuid)).toBeGreaterThan(0);
    expect(compareIds("a", "b")).toBeLessThan(0);
    expect(compareIds("a", "a")).toBe(0);
  });

  it("orders port refs by node, input false first, then port", () => {
    expect(comparePortRef({ node: "a", input: true, port: 0 }, { node: "a", input: false, port: 5 })).toBeGreaterThan(0);
    expect(comparePortRef({ node: "a", input: false, port: 1 }, { node: "a", input: false, port: 2 })).toBeLessThan(0);
  });
});
