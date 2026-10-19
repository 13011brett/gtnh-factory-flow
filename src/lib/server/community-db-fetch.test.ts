import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMMUNITY_DB_DOWN_MESSAGE, fetchWithDbTimeout } from "./community";

// Cloudflare's answer when the Supabase instance behind it does not respond:
// an HTML page, sent as text/plain.
const CLOUDFLARE_522 =
  "<!DOCTYPE html><html><head><title>supabase.co | 522: Connection timed out</title></head><body></body></html>";

function dbWith(timeoutMs = 20_000) {
  return createClient("https://example.supabase.co", "service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetchWithDbTimeout(input, init, timeoutMs) },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWithDbTimeout", () => {
  it("turns Cloudflare's HTML error page into the plain message, once", async () => {
    const fetchMock = vi.fn(
      async () => new Response(CLOUDFLARE_522, { status: 522, headers: { "content-type": "text/plain" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { error, status } = await dbWith().from("community_plans").select("id");
    expect(error?.message).toBe(COMMUNITY_DB_DOWN_MESSAGE);
    expect(status).toBe(522);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says the same when PostgREST answers but its database does not", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            code: "PGRST002",
            message: "Could not query the database for the schema cache. Retrying.",
            details: null,
            hint: null,
          },
          { status: 504 },
        ),
      ),
    );
    const { error } = await dbWith().from("community_plans").select("id");
    expect(error?.message).toBe(COMMUNITY_DB_DOWN_MESSAGE);
  });

  it("leaves a 4xx alone: an empty 404 still reads as no rows", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const { error, status } = await dbWith().from("community_plans").select("id");
    expect(error).toBeNull();
    expect(status).toBe(204);
  });

  it("answers a stalled request with the plain message, not a retried rejection", async () => {
    const fetchMock = vi.fn(
      (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("This operation was aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { error, status } = await dbWith(20).from("community_plans").select("id");
    expect(error?.message).toBe(COMMUNITY_DB_DOWN_MESSAGE);
    expect(status).toBe(504);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes the database's own JSON errors through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ code: "42703", message: "column community_plans.x does not exist" }, { status: 400 }),
      ),
    );
    const { error } = await dbWith().from("community_plans").select("x");
    expect(error?.code).toBe("42703");
    expect(error?.message).toBe("column community_plans.x does not exist");
  });

  it("still rejects when the caller cancels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")));
          }),
      ),
    );
    const caller = new AbortController();
    const pending = fetchWithDbTimeout("https://example.supabase.co/rest/v1/x", { signal: caller.signal });
    caller.abort();
    await expect(pending).rejects.toThrow("Cancelled");
  });
});
