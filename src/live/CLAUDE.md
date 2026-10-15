# Live service (src/live)

The WebSocket server for live plans: a separate Node process beside Next.js (`next start` cannot hold sockets).
Architecture, protocol notes and REST: `docs/live.md`. Production rollout: `docs/live-rollout.md`. The contract with
the game is `docs/design/cloud-live.md` in the game's repository: frames and ops must stay as it says, and a change to
`src/lib/live/ops.ts` or `live-vectors.json` changes the game's engine too.

- One process, one live service per database. Rooms (`room.ts`) per doc key `<ownerId>:<designId>`; everything that
  changes a room runs through its queue, so batches apply in arrival order and a snapshot never sees half a batch.
- Never a database write per edit: a room writes when it opens (the lease, with the plan read back), every 30 s (the
  lease), and when it flushes (at most every 8 s while edited, and when the last person leaves). The instance is small.
- A batch is journalled and synced to disk (`journal.ts`) before it is broadcast; a flush trims the journal. Start-up
  replays every journal. Never broadcast before the journal write returns.
- A room's last 1,000 batch ids go to disk beside its journal at every flush, before the trim, and come back when it
  opens: a batch resent after a restart is acknowledged, never applied twice.
- Every thing a batch puts or patches must pass its collection's schema afterwards (`src/lib/live/validate.ts`), plan
  fields their field's rule. A batch is refused whole, with its `cid` in the error.
- Flushes, renewals and lease takes only touch designs that are not tombstoned: a deleted plan is never written back.
- Sessions: `src/lib/server/session.ts`, the website's own check (constant time). Origins: `LIVE_ALLOWED_ORIGINS`; a
  client sending no Origin (the game) is let in.
- `/internal/*` (Bearer `LIVE_INTERNAL_TOKEN`) is for the Next.js routes; Caddy routes only `/live` and `/live/*` here.
- Production runs the bundle `npm run build:live` makes (`dist-live/live.mjs`, gitignored); development runs the
  sources with tsx (`npm run live`, `npm run dev:local`).
- Exam: `service.test.ts` (in-process, real sockets, the local database). Run it after any change here.
