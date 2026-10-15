# Server and API (src/lib/server, src/app/api)

## Recipe queries (dataset-query.ts)

- A query is clauses (`role:kind:id`, `src/lib/datasets/recipe-query.ts`) plus
  `takesOp` / `makesOp` (any / all / only) and the map selection. The server does set
  algebra over the lookup index (`getClauseLookupRecipesByMap`): any = union,
  all = intersection, sides intersect. Every clause gets the concrete-context rewrite
  (`applyClauseResourceContexts`).
- ONLY is verified against recipe bodies (`recipeIsOnlyMatch`) up to `ONLY_VERIFY_LIMIT`
  candidates, then degrades to ALL. Non-consumed inputs never count against takes-ONLY.
- All-maps answers page through `recipeMaps` in chip order, best match first inside each
  map (`orderByRecipeMap`).
- The catalog mixes in server output, so its cache key includes `APP_VERSION`. A new
  catalog field must be added to `getDatasetCatalog`'s explicit field list (and
  `RecipeDataset` in types.ts) or it never reaches the client.
- Dataset files other than textures may be replaced in place; textures are
  cache-immutable, so a changed icon needs a new name.
- Every server cache is bounded or index-sized (the Node heap is capped at 3 GB). A slow
  site: check the heap first.
- The OG card route reads fonts through `process.cwd()` (non-standalone build).

## Supabase (community.ts, resource-popularity.ts)

The instance is small and has gone down under load. Rules:
- Every request goes through `fetchWithDbTimeout` (20 s) and aborts with a plain
  AbortError; postgrest-js retries other failures three more times.
- Nothing a page needs to render may await a community sweep. `getResourcePopularity`
  answers at once with the last good map (sweep every 6 h, retry after 30 min on failure).
- The design PUT refuses what it can without the database (size, JSON, name, stamps)
  before the rate limit's two queries; the plan schema check follows.
- Read community plan jsonb about 10 rows per statement, or it hits the statement timeout.
- The dashboard (restarts, disk IO, memory) needs the repo owner; there is no management
  token here.

## Feedback from the game (feedback.ts, app/api/feedback)

- The in-game planner's Feedback box posts to `/api/feedback`; each report becomes an issue on
  `jackwrichards/gtnh-planner-mod` through `GITHUB_FEEDBACK_TOKEN` (in `/opt/shared/env.local`; without it the route
  answers 503).
- It was flooded on 2026-10-12 (450 spam issues from about 5,000 residential addresses, the mod's user agent, made-up
  versions), so `feedback-guard.ts` stands in front: the mod's shapes (device id, versions), an in-memory gate (30
  a minute; 60 refusals in 10 minutes pause reports for 6 hours), 3 an hour and 10 a day per address and per device,
  the same words once a month, and at most 10 issues an hour and 40 a day for the whole site. Player text is escaped
  (no pictures, links or HTML in the issue).
- The client address is Caddy's `X-Client-Ip` (Cloudflare's CF-Connecting-IP, trusted only from Cloudflare's
  ranges), then CF-Connecting-IP; X-Forwarded-For names a Cloudflare edge (`clientAddress` in community.ts).
- Emergency stop without a deploy: a Caddy rule answering 503 to `POST /api/feedback` (`/etc/caddy/Caddyfile`, then
  `systemctl reload caddy`).
- Plans and the picture go to the private `feedback-files` bucket, served by `/api/feedback/files/<id>/<file>`, only
  once every check has passed. The mod strips names, paths and addresses from logs and crash reports before sending.

## Local database (local-db/, `npm run dev:local`)

- `LOCAL_DB=1` points the server's Supabase client at a real Postgres on this machine (PGlite, loaded from
  `supabase/schema.sql` and `supabase/migrations/*.sql` on every open) through a PostgREST stand-in
  (`local-db/postgrest.ts`). Unset, nothing changes. Never copy `.env.local` into a worktree: local work needs no
  Supabase credentials.
- Next.js never loads PGlite: it reaches the database over HTTP at `LOCAL_DB_URL` (`tools/local-db/serve.ts`, data in
  `scratch/local-db/pgdata`). Tests open it in memory and register it in-process (`useInProcessLocalDb`).
- The stand-in covers the query shapes this code sends (filters, or-trees, counts, single, upserts, storage buckets).
  A new shape (an embed, an rpc) needs it added there and a case in `postgrest.test.ts`.
