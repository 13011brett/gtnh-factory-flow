import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The account session token: `<userId>.<expiresMs>.<hmac>`, HMAC-SHA256 over
 * `<userId>.<expiresMs>` with COMMUNITY_HASH_SALT. The website keeps it in the
 * `gtnh_session` cookie; the game sends the same cookie, the live socket's
 * upgrade included. Shared by the Next.js routes (community.ts) and the live
 * service, so both accept exactly the same tokens. No database here.
 */

export const SESSION_COOKIE = "gtnh_session";
export const SESSION_DAYS = 180;

const SESSION_USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sessionSecret(): string {
  return process.env.COMMUNITY_HASH_SALT ?? "gtnh-factory-hub";
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

export function makeSessionToken(userId: string, now = Date.now()): string {
  const expires = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

/** The session token in a Cookie header, if there is one. */
export function readSessionCookie(cookieHeader: string | null | undefined): string | undefined {
  const match = (cookieHeader ?? "").match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match?.[1];
}

/**
 * The account a token names, when its signature holds (compared in constant
 * time) and it has not expired; otherwise undefined. Says nothing about
 * whether the account still exists.
 */
export function verifySessionToken(
  token: string,
  now = Date.now(),
): { userId: string; expires: number } | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return undefined;
  }
  const [userId, expiresText, signature] = parts as [string, string, string];
  if (
    !SESSION_USER_ID.test(userId) ||
    !/^\d{1,16}$/.test(expiresText) ||
    !/^[0-9a-f]{64}$/.test(signature)
  ) {
    return undefined;
  }
  const expected = Buffer.from(sign(`${userId}.${expiresText}`), "hex");
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return undefined;
  }
  const expires = Number(expiresText);
  if (expires < now) {
    return undefined;
  }
  return { userId, expires };
}
