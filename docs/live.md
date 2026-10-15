# Cloud plans and live editing

Plans kept in the player's account, shared with other accounts as editors and edited together live, with everyone's
cursor on the board. The game (the in-game planner) and this website edit the same plans the same way. The contract
both sides build against is `docs/design/cloud-live.md` in the game's repository (`jackwrichards/gtnh-planner-mod`);
this file is the website's side of it.

## The parts

| Part | Where | What it does |
|---|---|---|
| Plan additions | `src/lib/model/schemas.ts`, `types.ts` | `gtnhplanner` (the game's own data, opaque, 64 KB a thing), `primaryView`, `tasks`, `taskItems`, `taskComments` |
| Op engine | `src/lib/live/ops.ts` | put / patch / del / meta, apply, diff, invert, JSON equality; `live-vectors.json` pins every rule and the game runs the same file |
| Client engine | `src/lib/live/client-state.ts` | confirmed + pending, echoes, resync after a reconnect, undo by inverse |
| Protocol | `src/lib/live/protocol.ts` | frame types, doc keys, limits, colours, `liveSocketUrl` |
| Batch checks | `src/lib/live/validate.ts` | each thing a batch puts or patches must pass its collection's schema; plan fields their field's |
| REST | `src/app/api/library/...`, `src/app/api/accounts/search` | members, `?owner=`, the lease refusal, notices to the live service (`src/lib/server/cloud-plans.ts`) |
| Live service | `src/live/` | the WebSocket server: rooms, journal, flushes, leases |
| Local database | `src/lib/server/local-db/`, `tools/local-db/serve.ts` | Postgres in-process (PGlite) behind a PostgREST stand-in |
| Test client | `tools/live/test-client.mjs` | a headless client for all of the above |

A cloud plan is a `library_designs` row, addressed everywhere as `<ownerId>:<designId>` (the doc key). The schema
additions are `supabase/migrations/2026-10-14-cloud-live.sql`: `seq` (edit batches applied), `live_lease_until`, and
`library_design_members`.

## How an edit travels

1. A client (browser or game) diffs its plan before and after the edit (`diffPlans`), keeps the batch in `pending`
   with its inverse for undo, and sends `{ t: "ops", doc, base, cid, ops }`.
2. The live service runs the room's batches one at a time, in arrival order. It applies the batch to a copy of the
   plan, checks every thing it touched against the plan schema and the size limit, stamps comments (author and server
   time), and gives it the next `seq`.
3. The batch is appended to the room's journal file and synced to disk, then broadcast to everyone in the room, the
   sender included (its echo is its ack: the same `cid`).
4. At most every 8 s while the plan changes, and when the last person leaves, the room writes the plan, `seq`,
   `plan_updated_at` and `updated_at` to the database (one write), extends or ends the lease, and trims the journal.

So the database sees one write per 8 s per open plan, never one per edit, and a crash loses nothing: on start the
service replays every journal over the stored plans and stores the result.

### The lease

Opening a room sets `live_lease_until` 90 s ahead and reads the plan in the same request; the room renews it every
30 s. While it is in the future, the REST plan PUT refuses a plan body with `409 { live: true }` (metadata still goes
through), and its write is conditional on the lease, so a lease taken between its read and its write still wins.
There is one live service per database: it takes leases without asking whose they were, so a restart picks its own
back up at once. Flushes and renewals only touch designs that are not tombstoned, so a deleted plan is never written
back.

## Protocol notes beyond the contract's table

The frames are the contract's (version 1). What the service adds or decides:

- **Resent batches.** A batch whose `cid` the room already applied (resent after a reconnect, its echo lost) is
  acknowledged to its sender alone as `{ t: "ops", seq: <its original seq>, cid, ops: [] }`: nothing to apply, and
  the client drops it from `pending`. Each room keeps its last 1,000 cids, in memory and on disk beside its journal
  (`<ownerId>.<designId>.cids.json`, written by every flush before the journal is trimmed), so a resend after a
  restart is known even when its journal was already flushed. A journal replay applies a cid it holds twice once.
- **Refusals name the batch.** An `error` about a batch carries its `cid`, so the client can drop it
  (`LiveClientState.refuse`). Codes: `bad_op` (shape or schema), `too_big` (a frame over 256 KB, more than 5,000 ops,
  or a plan over the 3 MB upload limit), `rate` (over 30 batches a second), `forbidden` (not shared with you, or not
  joined), `not_found`, `auth` (no valid session: the socket closes with 4001), `version` (hello first, `v: 1`).
- **Comments.** A new comment gets `by`, `byName` and `at` from the server whatever the client sent; changing an
  existing one is its author's alone and keeps those stamps; anyone in the room may delete one.
- **Plan fields.** A `meta` op may only set fields the plan schema knows and may not delete required ones.
- **People.** `Person` and relayed `presence` carry `conn`, the connection, as one account can be in a plan twice (a
  game and a browser). `snapshot` carries `owner: { id, username }`.
- **Presence** is relayed to the others in the room, never stored, at most 20 frames a second per connection: between
  slots only the latest is kept, so the last position always lands.
- **Limits per connection:** 200 frames a second (more closes the socket), 10 joins a second, 8 plans open, 500
  selected ids in a presence frame; 16 sockets per account.
- **Pings.** Clients send `{ t: "ping" }` every 25 s (Cloudflare drops a socket idle for 100 s); the server also pings
  at the WebSocket level and drops a connection silent for 90 s.
- **Origins.** A browser's upgrade must come from an origin in `LIVE_ALLOWED_ORIGINS` (403 otherwise); a client that
  sends no Origin (the game) is let in. Sign-in is the `gtnh_session` cookie on the upgrade, checked with
  `src/lib/server/session.ts`, the module the website uses.

HTTP on the same port: `GET /live/health` (`{ ok, rooms, connections }`), `GET /live/nearby` (cookie: signed-in
accounts connected from the same game server, the `game.server` hash in `hello`), and, for the Next.js routes only,
`POST /internal/members` (`{ doc, members }`), `/internal/deleted` (`{ doc }`) and `/internal/shutdown` (store
everything and exit), each with `Authorization: Bearer $LIVE_INTERNAL_TOKEN`. Caddy routes only `/live` and `/live/*`
to the service, so `/internal` is never reachable from outside.

## REST

All signed in by the session cookie. A design id is unique per owner only, so every design route takes
`?owner=<ownerId>` (absent: your own).

- `GET /api/library`: as before (tombstones included), each design with `members: [{ id, username }]`, plus
  `shared: [{ ownerId, ownerName, id, name, icon, updatedAt, planUpdatedAt, members }]`.
- `GET /api/library/designs/<id>?owner=`: the plan, for its owner or a member: `{ design, plan, ownerId, role, seq,
  live }`.
- `PUT /api/library/designs/<id>?owner=`: as before for the owner; a member may save the plan and its name. A plan body
  while the lease is held: `409 { live: true }`.
- `DELETE /api/library/designs/<id>`: the owner only; drops every member and tells the live service.
- `GET /api/library/designs/<id>/members?owner=`: `{ ownerId, ownerName, role, members }`.
- `PUT /api/library/designs/<id>/members/<userId>`: the owner shares (20 accounts at most).
- `DELETE /api/library/designs/<id>/members/<userId>?owner=`: the owner unshares, or a member leaves (their own id).
- `GET /api/accounts/search?q=<prefix>`: `{ accounts: [{ id, username }] }`, up to 10, case-insensitive, you left out;
  60 a minute.

Sharing changes and deletes are posted to the live service when `LIVE_INTERNAL_URL` and `LIVE_INTERNAL_TOKEN` are set,
so open rooms update (`members`) and anyone no longer allowed is dropped (`kicked`).

## Running it locally

```bash
npm run dev:local
```

starts the local database on 127.0.0.1:54329 (data in `scratch/local-db/pgdata`), the live service on :3001 (journal
in `scratch/local-db/live-journal`) and `next dev` on :3000, with `LOCAL_DB=1`, a development-only
`COMMUNITY_HASH_SALT` and `NEXT_PUBLIC_LIVE_URL=ws://localhost:3001/live`. No Supabase credentials anywhere. Accounts
made there exist only there. Ctrl+C stops all three; the live service stores its open plans first.

The pieces alone: `npm run local-db`, `npm run live` (with `LOCAL_DB=1`, `COMMUNITY_HASH_SALT` and friends set),
`npm run dev`. Delete `scratch/local-db/` for a fresh database.

Two people: two browser profiles, a browser and the dev game (`call 'library?url=http://localhost:3000'`), or the
test client:

```bash
C="node tools/live/test-client.mjs"
$C --user ann --password annpass1 register
$C --user bob --password bobpass1 register
$C --user ann --password annpass1 create "Shared test"        # prints { doc, designId }
$C --user ann --password annpass1 share <designId> bob
$C --user bob --password bobpass1 --game world-1 join <doc>    # prints frames; type `presence 10 20` or `ops [...]`
$C --user ann --password annpass1 send <doc> '[{"o":"meta","f":{"primaryView":"tasks"}}]'
```

## Production

`npm run build:live` bundles the service to `dist-live/live.mjs` (esbuild; packages stay in `node_modules`), run with
`node dist-live/live.mjs` as the systemd unit `gtnh-live` on 127.0.0.1:3001. `next build` and `next start` are
unchanged. Environment: `COMMUNITY_HASH_SALT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LIVE_PORT`,
`LIVE_HOST`, `LIVE_JOURNAL_DIR`, `LIVE_INTERNAL_TOKEN`, `LIVE_ALLOWED_ORIGINS`, `NODE_ENV=production`. The website
needs `LIVE_INTERNAL_URL` and `LIVE_INTERNAL_TOKEN` at run time and `NEXT_PUBLIC_LIVE_URL` at build time (unset:
no live features). The rollout, staging first, is `docs/live-rollout.md`.

## Tests

- `src/lib/live/ops.test.ts` (the vectors), `validate.test.ts`.
- `src/lib/server/local-db/postgrest.test.ts`: every query shape against real Postgres.
- `src/app/api/library/cloud-plans.test.ts`: sharing, members, the lease refusal, deletes, search, the notices.
- `src/live/service.test.ts`: the service in-process with real sockets: two editors converging, reconnects, the
  journal after a crash, refusals, unsharing and deleting, limits, comments, presence, the lease against REST, origins.
