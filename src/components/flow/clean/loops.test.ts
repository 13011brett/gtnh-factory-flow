import { describe, expect, it } from "vitest";
import { mockLoops } from "@/lib/solver/plan/__fixtures__/mock-extras";
import { makePortKey } from "@/lib/solver/plan/port-key";
import { buildNotices } from "./rail/notices";
import { cardLoop, loopEdges, loopSentence, loopTone } from "./loops";

const loops = mockLoops.result.plan!.loops!;

describe("a ring on the board", () => {
  it("tones a dead loop as STARVED's and a clog lock as CLOGGED's", () => {
    expect(loops.map(loopTone)).toEqual(["dead", "clog"]);
    expect(cardLoop(loops, "rb")).toBe("dead");
    expect(cardLoop(loops, "make")).toBe("clog");
    expect(cardLoop(loops, "nobody")).toBeUndefined();
    expect(cardLoop(undefined, "rb")).toBeUndefined();
  });

  it("lights the wires that join its cards along its rows, and no others", () => {
    const lit = loopEdges(mockLoops.project.edges, loops);
    expect(Object.fromEntries(lit)).toEqual({
      "w-ab": "dead",
      "w-bc": "dead",
      "w-ca": "dead",
      // The clog lock is stuck on hydrogen: its hydrogen wire, not its oxygen or water.
      "w-h": "clog",
    });
    expect(loopEdges(mockLoops.project.edges, undefined).size).toBe(0);
  });

  it("finds a shared machine's recipe row by its section", () => {
    const edges = [
      {
        id: "e",
        source: "a",
        target: "b",
        sourceHandle: "output:item:x",
        targetHandle: "r1:input:item:x",
      },
    ];
    const ring = [
      {
        kind: "DEAD_LOOP" as const,
        cards: ["a", "b"],
        portKeys: [makePortKey("b#r1", "i", "input:item:x")],
        resourceKeys: ["item:x"],
      },
    ];
    expect(loopEdges(edges, ring).get("e")).toBe("dead");
  });
});

describe("a ring's notice", () => {
  it("says it in plain short sentences", () => {
    const dead = { kind: "DEAD_LOOP" as const };
    const clog = { kind: "CLOG_LOCK" as const };
    expect(loopSentence(dead, ["Electrolyzer", "Chemical Reactor", "Mixer"], [])).toBe(
      "The Electrolyzer, Chemical Reactor and Mixer wait on each other. Nothing feeds the loop.",
    );
    expect(loopSentence(clog, ["Electrolyzer", "Mixer"], ["Hydrogen"])).toBe(
      "The Electrolyzer and Mixer are stuck on Hydrogen. A drawer for it frees them.",
    );
    expect(loopSentence(clog, ["Electrolyzer", "Mixer"], ["Hydrogen", "Water"])).toBe(
      "The Electrolyzer and Mixer are stuck on Hydrogen and Water. A drawer for each frees them.",
    );
    expect(loopSentence(dead, ["Mixer"], [])).toBe(
      "The Mixer waits on itself. Nothing feeds the loop.",
    );
    expect(loopSentence(clog, ["Mixer"], ["Hydrogen"])).toBe(
      "The Mixer is stuck on Hydrogen. A drawer for it frees it.",
    );
    expect(loopSentence(dead, ["Mixer", "Mixer"], [])).toBe(
      "The 2 Mixer cards wait on each other. Nothing feeds the loop.",
    );
  });

  it("is in the notice bar once per ring, with Show me on its cards", () => {
    const notices = buildNotices(mockLoops.project, mockLoops.result).filter((n) =>
      n.id.startsWith("loop:"),
    );
    expect(notices.map((n) => [n.severity, n.text, n.focus])).toEqual([
      [
        "warn",
        "The Electrolyzer, Chemical Reactor and Mixer wait on each other. Nothing feeds the loop.",
        ["ra", "rb", "rc"],
      ],
      [
        "warn",
        "The Electrolyzer and Mixer are stuck on Hydrogen. A drawer for it frees them.",
        ["split", "make"],
      ],
    ]);
  });
});
