// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useFactoryStore } from "@/store/factory-store";
import { loadBiodieselDemoProject } from "@/examples";
import { SharePlanDialog } from "./SharePlanDialog";

const client = vi.hoisted(() => ({
  listCommunityPlans: vi.fn(),
  patchCommunityPlan: vi.fn(),
  uploadCommunityPlan: vi.fn(),
  uploadPlanPreview: vi.fn(),
}));
vi.mock("@/lib/community/client", () => client);
vi.mock("@/lib/community/plan-preview-capture", () => ({ capturePlanPreviewPng: vi.fn(async () => undefined) }));
// One user object, as the auth store keeps: the dialog loads the user's posts when it changes.
const auth = vi.hoisted(() => ({ user: { username: "maker" }, isLoading: false, setUser: () => undefined }));
vi.mock("./auth", () => ({
  useCommunityUser: () => auth,
  AuthForm: () => null,
}));

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const post = { id: "post-1", name: "Steel line", isPublic: true, isMine: true };

beforeEach(() => {
  vi.clearAllMocks();
  client.listCommunityPlans.mockResolvedValue({ plans: [post] });
  client.patchCommunityPlan.mockResolvedValue({ id: "post-1" });
  client.uploadCommunityPlan.mockResolvedValue({ id: "post-2" });
  const project = loadBiodieselDemoProject();
  useFactoryStore.setState({
    project: { ...project, name: "Steel line", metadata: { ...project.metadata, communityPlanId: "post-1" } },
  });
});
afterEach(() => cleanup());

async function renderDialog(mode?: "save" | "update" | "new") {
  await act(async () => {
    render(<SharePlanDialog mode={mode} onClose={() => undefined} />);
  });
}

describe("saving to the library", () => {
  it("Update in library pushes the plan as it is now to the plan's own post, only when asked", async () => {
    await renderDialog("update");
    expect(screen.getByRole("dialog", { name: "Update in Community" })).toBeTruthy();
    expect(client.patchCommunityPlan).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByText("Update post"));
    });
    expect(client.patchCommunityPlan).toHaveBeenCalledTimes(1);
    const [id, fields] = client.patchCommunityPlan.mock.calls[0];
    expect(id).toBe("post-1");
    expect(fields.plan).toBeTruthy();
    expect(client.uploadCommunityPlan).not.toHaveBeenCalled();
    expect(screen.getByText("Your post is up to date.")).toBeTruthy();
  });

  it("Post a new copy to Community makes another post and links the plan to it, leaving the old one", async () => {
    await renderDialog("new");
    expect(screen.getByRole("dialog", { name: "Post a new copy to Community" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByText("Post a copy to Community"));
    });
    expect(client.uploadCommunityPlan).toHaveBeenCalledTimes(1);
    expect(client.patchCommunityPlan).not.toHaveBeenCalled();
    expect(useFactoryStore.getState().project.metadata?.communityPlanId).toBe("post-2");
  });

  it("from the update panel, Post a new copy to Community switches to a new post", async () => {
    await renderDialog("update");
    fireEvent.click(screen.getByText("Post a new copy to Community"));
    expect(screen.getByRole("dialog", { name: "Post a new copy to Community" })).toBeTruthy();
  });
});
