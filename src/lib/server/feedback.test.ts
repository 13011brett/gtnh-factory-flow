import { describe, expect, it, vi } from "vitest";
import { PROJECT_SCHEMA_VERSION } from "@/lib/model/types";
import {
  FROM_GAME_LABEL,
  issueBody,
  issueLabels,
  issueTitle,
  openIssue,
  parseFeedback,
  type FeedbackReport,
} from "./feedback";

const plan = {
  schemaVersion: PROJECT_SCHEMA_VERSION,
  id: "project-1",
  name: "Steel line",
  recipes: [],
  nodes: [],
  storages: [],
  edges: [],
  fuelProfiles: [],
};

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]).toString("base64");

function report(overrides: Record<string, unknown> = {}): unknown {
  return {
    kind: "bug",
    title: "Wires vanish",
    description: "After Arrange the wires vanish.",
    deviceId: "gtnhplanner-device",
    versions: { mod: "0.2.0-alpha.2", pack: "2.9.0-RC-2", java: "21", os: "Windows 11" },
    ...overrides,
  };
}

function parsed(overrides: Record<string, unknown> = {}): FeedbackReport {
  const r = parseFeedback(report(overrides));
  if ("error" in r) throw new Error(r.error);
  return r;
}

describe("feedback reports from the game", () => {
  it("reads a report with its plans and picture", () => {
    const r = parsed({ mood: "sad", plans: [{ name: "Steel line", plan }], picture: PNG, log: " a log \n" });
    expect(r.kind).toBe("bug");
    expect(r.mood).toBe("sad");
    expect(r.plans).toHaveLength(1);
    expect(r.plans[0]!.plan.name).toBe("Steel line");
    expect(r.picture?.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(r.log).toBe("a log");
  });

  it("refuses what it cannot use, saying why", () => {
    expect(parseFeedback(report({ title: "  " }))).toEqual({ error: "Give it a title." });
    expect(parseFeedback(report({ kind: "rant" }))).toHaveProperty("error");
    expect(parseFeedback(report({ plans: [{ name: "Broken", plan: { nodes: 3 } }] }))).toEqual({
      error: 'The plan "Broken" could not be read.',
    });
    expect(parseFeedback(report({ picture: Buffer.from("GIF89a").toString("base64") }))).toEqual({
      error: "The picture is not a PNG the site can take.",
    });
    expect(parseFeedback(report({ plans: Array.from({ length: 6 }, () => ({ name: "x", plan })) }))).toHaveProperty(
      "error",
    );
  });

  it("titles and labels the issue by its kind", () => {
    expect(issueTitle(parsed())).toBe("Bug: Wires vanish");
    expect(issueLabels(parsed({ kind: "idea" }))).toEqual([FROM_GAME_LABEL, "enhancement"]);
    expect(issueLabels(parsed({ kind: "help" }))).toEqual([FROM_GAME_LABEL, "question"]);
  });

  it("writes the body: words that ping no one, plans, picture, folded log and versions", () => {
    const r = parsed({ description: "Ask @someone about #12", log: "line ~~~~ end", crash: "boom" });
    const { body, plansComment } = issueBody(r, {
      plans: [{ name: "Steel line", cards: 3, link: "https://gtnhplanner.com/#p=gtnh1.abc", file: "https://x/plan-1.json" }],
      picture: "https://x/picture.png",
    });
    expect(plansComment).toBeUndefined();
    expect(body).toContain("@​someone");
    expect(body).toContain("#​12");
    expect(body).toContain("**Steel line** (3 cards) · [open in the planner](https://gtnhplanner.com/#p=gtnh1.abc)");
    expect(body).toContain("![The open plan](https://x/picture.png)");
    expect(body).toContain("<summary>The end of the game log</summary>");
    expect(body).not.toContain("line ~~~~ end");
    expect(body).toContain("<summary>The crash report</summary>");
    expect(body).toContain("GTNH Planner 0.2.0-alpha.2 · GTNH 2.9.0-RC-2 · Java 21 · Windows 11");
  });

  it("moves the plans to a comment when the body would be too long", () => {
    const r = parsed({ crash: "x".repeat(59_000) });
    const { body, plansComment } = issueBody(r, {
      plans: [{ name: "Big", cards: 40, link: "https://gtnhplanner.com/#p=" + "y".repeat(7000) }],
    });
    expect(body.length).toBeLessThanOrEqual(60_000);
    expect(body).toContain("The plans are in the first comment.");
    expect(plansComment).toContain("**Big** (40 cards)");
  });

  it("opens the issue with the token, and the plans' comment after it", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ number: 7, html_url: "https://github.com/o/r/issues/7" }), {
        status: 201,
      });
    });
    const issue = await openIssue(
      "secret",
      "o/r",
      { title: "Bug: x", body: "b", labels: ["from game", "bug"], plansComment: "plans" },
      fake as unknown as typeof fetch,
    );
    expect(issue).toEqual({ number: 7, url: "https://github.com/o/r/issues/7" });
    expect(calls[0]!.url).toBe("https://api.github.com/repos/o/r/issues");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ title: "Bug: x", body: "b", labels: ["from game", "bug"] });
    expect(calls[1]!.url).toBe("https://api.github.com/repos/o/r/issues/7/comments");
  });

  it("says when GitHub refuses", async () => {
    const fake = vi.fn(async () => new Response("{}", { status: 401 }));
    await expect(
      openIssue("bad", "o/r", { title: "t", body: "b", labels: [] }, fake as unknown as typeof fetch),
    ).rejects.toThrow("GitHub answered 401");
  });
});
