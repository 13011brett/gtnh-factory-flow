import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createPostgrestHandler, type PostgrestHandler, type SqlDatabase } from "./postgrest";

/**
 * The local development database: real Postgres in this process (PGlite),
 * loaded from `supabase/schema.sql` and every file in `supabase/migrations/`
 * on each open (both are idempotent, as they are for the hosted project),
 * answering supabase-js through the PostgREST stand-in. Never imported by
 * Next.js: the dev server reaches it over HTTP (`tools/local-db/serve.ts`),
 * tests and the live service's tests open it in-process.
 */

export interface LocalDatabase {
  db: PGlite;
  /** Answers supabase-js's requests: `/rest/v1/...` and `/storage/v1/...`. */
  handle: PostgrestHandler;
  close(): Promise<void>;
}

export interface OpenLocalDatabaseOptions {
  /** Where the data lives; absent, in memory (gone when the process ends). */
  dir?: string;
  /** The folder holding schema.sql and migrations/; default `<cwd>/supabase`. */
  supabaseDir?: string;
}

/** The SQL that sets a database up, in order: the schema, then each migration by name. */
export function schemaFiles(supabaseDir: string): string[] {
  const files = [path.join(supabaseDir, "schema.sql")];
  const migrations = path.join(supabaseDir, "migrations");
  try {
    for (const name of readdirSync(migrations).filter((file) => file.endsWith(".sql")).sort()) {
      files.push(path.join(migrations, name));
    }
  } catch {
    // No migrations folder: the schema alone.
  }
  return files;
}

/** Local stand-in for Supabase Storage: buckets and objects as rows, outside the API's schema. */
const STORAGE_SQL = `
create schema if not exists local_storage;
create table if not exists local_storage.buckets (
  id text primary key,
  public boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists local_storage.objects (
  bucket text not null references local_storage.buckets (id) on delete cascade,
  path text not null,
  content_type text not null default 'application/octet-stream',
  cache_control text,
  bytes bytea not null,
  updated_at timestamptz not null default now(),
  primary key (bucket, path)
);
`;

export async function openLocalDatabase(options: OpenLocalDatabaseOptions = {}): Promise<LocalDatabase> {
  if (options.dir) {
    mkdirSync(options.dir, { recursive: true });
  }
  const db = options.dir ? new PGlite(options.dir) : new PGlite();
  await db.exec("set time zone 'UTC'");
  for (const file of schemaFiles(options.supabaseDir ?? path.join(process.cwd(), "supabase"))) {
    await db.exec(readFileSync(file, "utf8"));
  }
  await db.exec(STORAGE_SQL);
  const sql: SqlDatabase = {
    query: (text, params) => db.query<Record<string, unknown>>(text, params),
    exec: (text) => db.exec(text),
  };
  const handle = createPostgrestHandler(sql, { storage: (request, rest) => storage(db, request, rest) });
  await handle.reloadSchema();
  return {
    db,
    handle,
    close: () => db.close(),
  };
}

function storageJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function storageError(status: number, error: string, message: string): Response {
  return storageJson(status, { statusCode: String(status), error, message });
}

/** The bytes and type of an upload: a raw body, or the multipart form supabase-js sends for a Blob. */
async function uploadBody(request: Request): Promise<{ bytes: Uint8Array; contentType: string; cacheControl?: string }> {
  const type = request.headers.get("content-type") ?? "application/octet-stream";
  if (type.startsWith("multipart/form-data")) {
    const form = await request.formData();
    let file: Blob | undefined;
    for (const [, value] of form) {
      if (typeof value !== "string") {
        file = value;
      }
    }
    const cacheControl = form.get("cacheControl");
    return {
      bytes: new Uint8Array(await (file ?? new Blob()).arrayBuffer()),
      contentType: file?.type || "application/octet-stream",
      cacheControl: typeof cacheControl === "string" ? `max-age=${cacheControl}` : undefined,
    };
  }
  return {
    bytes: new Uint8Array(await request.arrayBuffer()),
    contentType: type,
    cacheControl: request.headers.get("cache-control") ?? undefined,
  };
}

async function storage(db: PGlite, request: Request, rest: string): Promise<Response> {
  const method = request.method.toUpperCase();
  const parts = rest.split("/").filter(Boolean).map(decodeURIComponent);

  if (parts[0] === "bucket") {
    if (method === "GET" && parts.length === 2) {
      const { rows } = await db.query<{ id: string; public: boolean; created_at: Date }>(
        "select id, public, created_at from local_storage.buckets where id = $1",
        [parts[1]],
      );
      const bucket = rows[0];
      return bucket
        ? storageJson(200, { id: bucket.id, name: bucket.id, public: bucket.public, created_at: bucket.created_at })
        : storageError(404, "Bucket not found", "Bucket not found");
    }
    if (method === "POST" && parts.length === 1) {
      const body = (await request.json()) as { id?: string; name?: string; public?: boolean };
      const id = body.id ?? body.name;
      if (!id) {
        return storageError(400, "Invalid request", "A bucket needs a name");
      }
      const { rows } = await db.query("insert into local_storage.buckets (id, public) values ($1, $2) on conflict do nothing returning id", [
        id,
        body.public === true,
      ]);
      return rows.length > 0
        ? storageJson(200, { name: id })
        : storageError(409, "Duplicate", "The resource already exists");
    }
    return storageError(400, "Invalid request", "Not supported by the local database");
  }

  if (parts[0] !== "object") {
    return storageError(404, "not_found", "Not supported by the local database");
  }

  // GET /object/public/<bucket>/<path> and /object/<bucket>/<path>
  if (method === "GET" || method === "HEAD") {
    const publicOnly = parts[1] === "public";
    const authenticated = parts[1] === "authenticated";
    const [bucket, ...objectPath] = parts.slice(publicOnly || authenticated ? 2 : 1);
    const { rows } = await db.query<{ bytes: Uint8Array; content_type: string; cache_control: string | null; public: boolean }>(
      `select o.bytes, o.content_type, o.cache_control, b.public
         from local_storage.objects o join local_storage.buckets b on b.id = o.bucket
        where o.bucket = $1 and o.path = $2`,
      [bucket, objectPath.join("/")],
    );
    const found = rows[0];
    if (!found || (publicOnly && !found.public)) {
      return storageError(404, "not_found", "Object not found");
    }
    return new Response(method === "HEAD" ? null : new Uint8Array(found.bytes), {
      status: 200,
      headers: {
        "content-type": found.content_type,
        ...(found.cache_control ? { "cache-control": found.cache_control } : {}),
      },
    });
  }

  if (method === "DELETE" && parts.length === 2) {
    const body = (await request.json().catch(() => ({}))) as { prefixes?: string[] };
    const prefixes = Array.isArray(body.prefixes) ? body.prefixes.map(String) : [];
    const { rows } = await db.query<{ path: string }>(
      "delete from local_storage.objects where bucket = $1 and path = any($2::text[]) returning path",
      [parts[1], prefixes],
    );
    return storageJson(
      200,
      rows.map((row) => ({ name: row.path, bucket_id: parts[1] })),
    );
  }

  if ((method === "POST" || method === "PUT") && parts.length >= 3) {
    const [, bucket, ...objectPath] = parts;
    const key = objectPath.join("/");
    const upsert = method === "PUT" || request.headers.get("x-upsert") === "true";
    const buckets = await db.query("select 1 from local_storage.buckets where id = $1", [bucket]);
    if (buckets.rows.length === 0) {
      return storageError(404, "Bucket not found", "Bucket not found");
    }
    const { bytes, contentType, cacheControl } = await uploadBody(request);
    const { rows } = await db.query(
      `insert into local_storage.objects (bucket, path, content_type, cache_control, bytes)
       values ($1, $2, $3, $4, $5)
       on conflict (bucket, path) do ${
         upsert
           ? "update set content_type = excluded.content_type, cache_control = excluded.cache_control, bytes = excluded.bytes, updated_at = now()"
           : "nothing"
       }
       returning path`,
      [bucket, key, contentType, cacheControl ?? null, bytes],
    );
    if (rows.length === 0) {
      return storageError(409, "Duplicate", "The resource already exists");
    }
    return storageJson(200, { Key: `${bucket}/${key}`, Id: `${bucket}/${key}` });
  }

  return storageError(400, "Invalid request", "Not supported by the local database");
}
