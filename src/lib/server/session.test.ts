import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSessionToken, readSessionCookie, verifySessionToken } from "./session";

const userId = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("session tokens", () => {
  it("verify what they sign, and read from a cookie header", () => {
    vi.stubEnv("COMMUNITY_HASH_SALT", "salt-a");
    const token = makeSessionToken(userId);
    expect(verifySessionToken(token)?.userId).toBe(userId);
    expect(readSessionCookie(`theme=dark; gtnh_session=${token}; other=1`)).toBe(token);
    expect(readSessionCookie("theme=dark")).toBeUndefined();
  });

  it("accept tokens made before the shared module (same format, same secret)", () => {
    vi.stubEnv("COMMUNITY_HASH_SALT", "salt-a");
    const payload = `${userId}.${Date.now() + 60_000}`;
    const legacy = `${payload}.${createHmac("sha256", "salt-a").update(payload).digest("hex")}`;
    expect(verifySessionToken(legacy)?.userId).toBe(userId);
  });

  it("refuse a changed token, another secret's token, and an expired one", () => {
    vi.stubEnv("COMMUNITY_HASH_SALT", "salt-a");
    const token = makeSessionToken(userId);
    const [, expires, signature] = token.split(".");
    expect(
      verifySessionToken(`22222222-2222-4222-8222-222222222222.${expires}.${signature}`),
    ).toBeUndefined();
    expect(
      verifySessionToken(`${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`),
    ).toBeUndefined();
    expect(verifySessionToken("not-a-token")).toBeUndefined();
    vi.stubEnv("COMMUNITY_HASH_SALT", "salt-b");
    expect(verifySessionToken(token)).toBeUndefined();
    vi.stubEnv("COMMUNITY_HASH_SALT", "salt-a");
    const old = makeSessionToken(userId, Date.now() - 200 * 24 * 60 * 60 * 1000);
    expect(verifySessionToken(old)).toBeUndefined();
  });
});
