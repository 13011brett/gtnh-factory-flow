import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findModGame, localNetworkPermission, MOD_PORTS, sendPlanToMod } from "./mod-link";

/** A stand-in for the mod's listener on one port; every other port refuses, as a closed port does. */
function listenerOn(port: number, onOpen: (body: unknown) => number = () => 202) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const parsed = new URL(url);
    if (parsed.hostname !== "127.0.0.1" || Number(parsed.port) !== port) {
      throw new TypeError("Failed to fetch");
    }
    expect(init?.mode).toBe("cors");
    expect(init?.credentials).toBe("omit");
    if (parsed.pathname === "/ping") {
      return new Response(JSON.stringify({ app: "gtnhplanner", version: "0.2.0" }), { status: 200 });
    }
    if (parsed.pathname === "/open" && init?.method === "POST") {
      expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
      return new Response("{}", { status: onOpen(JSON.parse(String(init.body))) });
    }
    return new Response("", { status: 404 });
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Open in the mod", () => {
  it("tries the mod's ten ports, the same range its listener binds", () => {
    expect(MOD_PORTS).toEqual([25640, 25641, 25642, 25643, 25644, 25645, 25646, 25647, 25648, 25649]);
  });

  it("finds the game on whichever port it took", async () => {
    vi.stubGlobal("fetch", listenerOn(25643));
    expect(await findModGame()).toEqual({ port: 25643, version: "0.2.0" });
  });

  it("finds nothing when no game listens, or something else answers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await findModGame()).toBeUndefined();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ app: "other" }), { status: 200 })));
    expect(await findModGame()).toBeUndefined();
  });

  it("sends the code and the plan's name, and counts only the game's 202 as taken", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      listenerOn(25640, (body) => {
        bodies.push(body);
        return 202;
      }),
    );
    expect(await sendPlanToMod("gtnh1.abc", "Steel line")).toBe(true);
    expect(bodies).toEqual([{ code: "gtnh1.abc", name: "Steel line" }]);
    vi.stubGlobal("fetch", listenerOn(25640, () => 403));
    expect(await sendPlanToMod("gtnh1.abc", "Steel line", { port: 25640, version: "" })).toBe(false);
  });

  it("a browser that blocks the request reads as no game, never as an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("blocked"))));
    expect(await sendPlanToMod("gtnh1.abc", "x", { port: 25640, version: "" })).toBe(false);
  });

  it("reads the browser's local network permission, or unknown where there is none", async () => {
    vi.stubGlobal("navigator", { permissions: { query: vi.fn(async () => ({ state: "prompt" })) } });
    expect(await localNetworkPermission()).toBe("prompt");
    vi.stubGlobal("navigator", {
      permissions: { query: vi.fn(async () => Promise.reject(new TypeError("unknown permission"))) },
    });
    expect(await localNetworkPermission()).toBe("unknown");
    vi.stubGlobal("navigator", {});
    expect(await localNetworkPermission()).toBe("unknown");
  });
});
