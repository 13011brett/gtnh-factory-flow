/**
 * How the server's Supabase client reaches the local development database.
 * `LOCAL_DB=1` turns it on; unset, nothing here runs and the hosted project is
 * used as before. Safe to import anywhere on the server: it never loads the
 * database itself.
 *
 * - In a process that opened the database (tests, `tools/local-db/serve.ts`),
 *   requests go straight to it (`useInProcessLocalDb`).
 * - Anywhere else (the Next.js dev server, the live service in development),
 *   they go over HTTP to the process holding it, at `LOCAL_DB_URL`.
 */

/** Where `tools/local-db/serve.ts` listens unless told otherwise. */
export const LOCAL_DB_DEFAULT_URL = "http://127.0.0.1:54329";

/** supabase-js wants a key; the local database checks none. */
export const LOCAL_DB_SERVICE_KEY = "local-development-only";

type LocalHandler = (request: Request) => Promise<Response>;

const IN_PROCESS = Symbol.for("gtnh.localDb.inProcess");

type WithHandler = typeof globalThis & { [IN_PROCESS]?: LocalHandler };

export function isLocalDb(): boolean {
  return process.env.LOCAL_DB === "1";
}

export function localDbUrl(): string {
  return (process.env.LOCAL_DB_URL || LOCAL_DB_DEFAULT_URL).replace(/\/+$/, "");
}

/** Sends this process's local database requests to `handler` (undefined: back to HTTP). */
export function useInProcessLocalDb(handler: LocalHandler | undefined): void {
  (globalThis as WithHandler)[IN_PROCESS] = handler;
}

/** supabase-js's fetch in local mode: the in-process database, else `send` (HTTP to LOCAL_DB_URL). */
export function localDbFetch(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  send: typeof fetch,
): Promise<Response> {
  const handler = (globalThis as WithHandler)[IN_PROCESS];
  if (handler) {
    return handler(new Request(input, init));
  }
  return send(input, init);
}
