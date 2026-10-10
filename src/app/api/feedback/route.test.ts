import { afterEach, describe, expect, it, vi } from "vitest";
import { PROJECT_SCHEMA_VERSION } from "@/lib/model/types";

vi.mock("@/lib/server/community", () => ({
  isCommunityConfigured: () => true,
  makeActorKey: () => "actor",
  checkRateLimit: vi.fn(async () => true),
}));
vi.mock("@/lib/server/feedback-files", () => ({
  storeFeedbackFile: vi.fn(
    async (origin: string, id: string, file: string) => `${origin}/api/feedback/files/${id}/${file}`,
  ),
}));
vi.mock("@/lib/server/feedback", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/feedback")>();
  return {
    ...actual,
    openIssue: vi.fn(async () => ({ number: 12, url: "https://github.com/jackwrichards/gtnh-planner-mod/issues/12" })),
  };
});

import { checkRateLimit } from "@/lib/server/community";
import { openIssue } from "@/lib/server/feedback";
import { POST } from "./route";

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

function send(body: unknown): Promise<Response> {
  return POST(new Request("http://localhost/api/feedback", { method: "POST", body: JSON.stringify(body) }));
}

const report = {
  kind: "idea",
  mood: "happy",
  title: "Copy a card",
  description: "Let me copy a card",
  deviceId: "device",
  plans: [{ name: "Steel line", plan }],
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the feedback route", () => {
  it("is closed until the server has a GitHub token", async () => {
    vi.stubEnv("GITHUB_FEEDBACK_TOKEN", "");
    const response = await send(report);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Reports can't be sent yet." });
  });

  it("opens an issue with the plan linked and answers its page", async () => {
    vi.stubEnv("GITHUB_FEEDBACK_TOKEN", "token");
    const response = await send(report);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      number: 12,
      url: "https://github.com/jackwrichards/gtnh-planner-mod/issues/12",
    });
    const [token, repo, issue] = vi.mocked(openIssue).mock.calls[0]!;
    expect(token).toBe("token");
    expect(repo).toBe("jackwrichards/gtnh-planner-mod");
    expect(issue.title).toBe("Idea: Copy a card");
    expect(issue.labels).toEqual(["from game", "enhancement"]);
    expect(issue.body).toContain("[open in the planner](https://gtnhplanner.com/#p=gtnh1.");
    expect(issue.body).toMatch(/\[plan file\]\(https:\/\/gtnhplanner\.com\/api\/feedback\/files\/[0-9a-f-]{36}\/plan-1\.json\)/);
  });

  it("refuses a bad report and a busy player", async () => {
    vi.stubEnv("GITHUB_FEEDBACK_TOKEN", "token");
    expect((await send({ ...report, title: "" })).status).toBe(400);
    vi.mocked(checkRateLimit).mockResolvedValueOnce(false);
    const busy = await send(report);
    expect(busy.status).toBe(429);
  });
});
