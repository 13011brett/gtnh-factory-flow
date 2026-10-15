import type { LiveOp, LivePlan } from "./ops";
import { LIVE_PROTOCOL_VERSION } from "./ops";

/**
 * The live wire protocol (version 1): JSON text frames over one WebSocket at
 * `/live`. The game speaks the same frames; see the contract's protocol table.
 * Shared by the live service, the website and the headless test client.
 */

export { LIVE_PROTOCOL_VERSION };

/** Where the live service listens for sockets, behind Caddy's `/live` route. */
export const LIVE_PATH = "/live";

/** The limits the service holds every connection to. */
export const LIVE_LIMITS = {
  /** One `ops` frame's size. */
  batchBytes: 256 * 1024,
  /** Any other frame's size (hello, presence, join). */
  frameBytes: 16 * 1024,
  /** Batches a second from one connection. */
  batchesPerSecond: 30,
  /** Presence frames relayed a second from one connection; more are dropped. */
  presencePerSecond: 20,
  /** Ops in one batch. */
  opsPerBatch: 5000,
  /** Rooms one connection may have open at once. */
  roomsPerConnection: 8,
  /** Selected ids carried in one presence frame. */
  selectionIds: 500,
} as const;

/** Clients ping this often; Cloudflare drops a socket idle for 100 s. */
export const LIVE_PING_INTERVAL_MS = 25_000;

// ---------------------------------------------------------------------------
// Doc keys: a cloud plan is `<ownerId>:<designId>`

const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DESIGN_ID = /^[A-Za-z0-9-]{8,64}$/;

export function isAccountId(value: unknown): value is string {
  return typeof value === "string" && ACCOUNT_ID.test(value);
}

export function docKey(ownerId: string, designId: string): string {
  return `${ownerId}:${designId}`;
}

export function parseDocKey(doc: unknown): { ownerId: string; designId: string } | undefined {
  if (typeof doc !== "string") {
    return undefined;
  }
  const colon = doc.indexOf(":");
  const ownerId = doc.slice(0, colon);
  const designId = doc.slice(colon + 1);
  return colon > 0 && ACCOUNT_ID.test(ownerId) && DESIGN_ID.test(designId)
    ? { ownerId: ownerId.toLowerCase(), designId }
    : undefined;
}

// ---------------------------------------------------------------------------
// Colours: one per account, the same everywhere

/** Readable on the board's light and dark papers alike. */
export const LIVE_COLORS = [
  "#e5484d",
  "#f76b15",
  "#ffc53d",
  "#46a758",
  "#12a594",
  "#00a2c7",
  "#0090ff",
  "#3e63dd",
  "#8e4ec6",
  "#d6409f",
  "#a18072",
  "#868e2b",
] as const;

/** An account's colour: FNV-1a over its id, so it never changes. */
export function colorFor(accountId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < accountId.length; i += 1) {
    hash ^= accountId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return LIVE_COLORS[hash % LIVE_COLORS.length]!;
}

// ---------------------------------------------------------------------------
// Frames

export type LiveClientKind = "game" | "web";

export interface LiveMember {
  id: string;
  username: string;
}

export interface LivePerson extends LiveMember {
  color: string;
  client: LiveClientKind;
}

export interface LiveCursor {
  x: number;
  y: number;
}

export interface LiveView {
  x: number;
  y: number;
  zoom: number;
}

export type LiveErrorCode =
  | "auth"
  | "forbidden"
  | "not_found"
  | "too_big"
  | "rate"
  | "bad_op"
  | "version";

export type ClientFrame =
  | {
      t: "hello";
      v: number;
      client: LiveClientKind;
      clientVersion?: string;
      game?: { server: string; mcName?: string };
    }
  | { t: "join"; doc: string }
  | { t: "leave"; doc: string }
  | { t: "ops"; doc: string; base: number; cid: string; ops: LiveOp[] }
  | { t: "presence"; doc: string; cursor: LiveCursor | null; sel: string[]; view?: LiveView }
  | { t: "ping" };

export type ServerFrame =
  | { t: "welcome"; v: number; you: { id: string; username: string; color: string } }
  | {
      t: "snapshot";
      doc: string;
      seq: number;
      plan: LivePlan;
      role: "owner" | "editor";
      members: LiveMember[];
      present: LivePerson[];
    }
  | { t: "ops"; doc: string; seq: number; by: string; cid: string; ops: LiveOp[] }
  | {
      t: "presence";
      doc: string;
      who: string;
      cursor: LiveCursor | null;
      sel: string[];
      view?: LiveView;
    }
  | { t: "present"; doc: string; present: LivePerson[] }
  | { t: "members"; doc: string; members: LiveMember[] }
  | { t: "kicked"; doc: string; reason: "unshared" | "deleted" }
  | { t: "error"; doc?: string; code: LiveErrorCode; msg: string }
  | { t: "pong" };
