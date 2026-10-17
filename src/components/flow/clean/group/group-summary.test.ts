import { describe, expect, it } from "vitest";
import { mockUnneeded } from "@/lib/solver/plan/__fixtures__/mock-extras";
import { computeGroupSummaries } from "./group-summary";

describe("a group summary's machines", () => {
  const withPocket = () => {
    const project = structuredClone(mockUnneeded.project);
    project.pockets = [{ id: "g", name: "G" }] as typeof project.pockets;
    project.nodes.find((n) => n.id === "comp")!.pocketId = "g";
    return project;
  };

  it("counts what an Up to card runs, rounded up", () => {
    const plan = {
      ...mockUnneeded.result.plan!,
      upTo: { comp: { capacity: 6, reached: 4.5, reason: null } },
    };
    const sum = computeGroupSummaries(withPocket(), { ...mockUnneeded.result, plan }, ["g"], true);
    expect(sum.get("g")!.machines).toBe(5);
  });

  it("counts an Exactly card at its set count", () => {
    const project = withPocket();
    project.nodes.find((n) => n.id === "comp")!.solvePinExact = true;
    const plan = {
      ...mockUnneeded.result.plan!,
      upTo: { comp: { capacity: 6, reached: 4.5, reason: null } },
    };
    const sum = computeGroupSummaries(project, { ...mockUnneeded.result, plan }, ["g"], true);
    expect(sum.get("g")!.machines).toBe(6);
  });
});
