# Rollout: cloud plans and live editing

## Go (the state on 2026-10-15)

Done: the migration (step 1) is in production; staging (step 2) runs `live-backport` (the mod backport with live
editing merged in, 4.0.0) at `new.gtnhplanner.com` from `/opt/releases/live-backport-1792066008`; the mod's
`0.2.0-beta.2` is a draft release on GitHub. When the owner says go, in this order:

1. Give staging room to serve everyone (it restarts, nobody but testers is on it):
   `sed -i 's/^MemoryMax=900M/MemoryMax=1400M/; s/max-old-space-size=600/max-old-space-size=1000/' /etc/systemd/system/gtnh-flow-next.service && systemctl daemon-reload && systemctl restart gtnh-flow-next`,
   then `curl -s http://127.0.0.1:3002/api/version` says 4.0.0.
2. The switch, without downtime: in `/etc/caddy/Caddyfile` (back it up first) the `gtnhplanner.com` block keeps
   `handle_path /umami/*` and its log, and its `reverse_proxy 127.0.0.1:3000 { header_up X-Client-Ip {client_ip} }`
   becomes the three handles the `new.gtnhplanner.com` block already has (`@live` to 3001, `/api/datasets/*` to 3000,
   the rest to 3002). Do the same in the `http://<ip>` block. `caddy validate`, `systemctl reload caddy`.
   `gtnh-flow` on 3000 keeps running: it serves the warm recipe data. Check `https://gtnhplanner.com/api/version`
   says 4.0.0, `/live/health` answers, a page loads.
3. Rollback, if needed: copy the backed-up Caddyfile back and reload (one step, instant). The old site ignores the
   new columns; plans it saves lose their task boards.
4. GitHub: website `git push origin live-backport:main` (a fast-forward: live-backport contains main); mod
   `git push origin mod-live-backport:main` (also a fast-forward), then publish the draft release
   (`gh release edit 0.2.0-beta.2 --repo jackwrichards/gtnh-planner-mod --draft=false`), which tags the draft's
   target commit. Publish after the switch: a beta.2 game asks `gtnhplanner.com/live/health` before it turns on
   cloud plans.
5. Later, at a quiet moment, back to one site process (a normal deploy, the usual 5 to 10 seconds of restart): add
   `NEXT_PUBLIC_LIVE_URL=/live` to `/opt/shared/env.local`, add `npm run build:live` after `npm run build` in
   `/opt/deploy.sh`, add `EnvironmentFile=/opt/shared/live.env` to the `gtnh-flow` unit (a drop-in), run the deploy,
   point `gtnh-live`'s `WorkingDirectory` at `/opt/gtnh-flow` and restart it, set the `gtnhplanner.com` block back to
   3000 for everything but `@live`, stop and disable `gtnh-flow-next`, and remove or repoint `new.gtnhplanner.com`.

The rest of this file is the plan as written before staging, with what was actually deployed in section 2.7.

## The plan

The production runbook for the `cloud-live` branch: the database migration, staging at `new.gtnhplanner.com`, the
switch, the rollback, and the merge into `main`. Architecture and protocol: `docs/live.md`.

Every step can be undone on its own:

- The migration only adds (three columns, one table); the code on `main` never reads them.
- Staging is a second Next.js instance and the live service beside the running site; stopping them changes nothing
  for `gtnhplanner.com`.
- The switch is one Caddy change, and so is the rollback.
- An empty `NEXT_PUBLIC_LIVE_URL` at build time turns every live feature off in the website.

Values in `<angle brackets>` are filled in on the day. `$REL` is the staging release directory.

## 0. Look first

On the droplet, read how the running site is set up, and copy it rather than guessing:

```bash
systemctl cat gtnh-flow                 # user, WorkingDirectory, EnvironmentFile(s), Environment=, ExecStart, node path
ls -la /opt/releases/                   # the current release
readlink -f /opt/releases/<current>/public/datasets/gtnh   # how datasets reach a release (a link to /opt/shared/gtnh-datasets?)
cat /etc/caddy/Caddyfile                # the gtnhplanner.com site block: TLS, headers (X-Client-Ip), logs, the upstream :3000
free -m                                 # a second Next.js needs memory: the site caps its heap at 3 GB
node --version                          # 20 or newer
```

Note in particular the `gtnh-flow` unit's `User=`, its env file (the rest of this file calls it
`/opt/shared/env.local`), its `NODE_OPTIONS` heap cap, `GTNH_PREWARM_ON_STARTUP`, and how the Caddy block sets
`X-Client-Ip` and its TLS. If memory is short, give staging a smaller heap (`--max-old-space-size=1536`) for the test
period.

Confirm the session secret is set for the running site, without printing it: the website signs sessions with a
public fallback secret when `COMMUNITY_HASH_SALT` is missing (and now warns about it at startup), and the live service
refuses to start without it.

```bash
sudo grep -c '^COMMUNITY_HASH_SALT=..*' /opt/shared/env.local      # 1 (0: stop here and set it first)
systemctl show gtnh-flow -p Environment | grep -c COMMUNITY_HASH_SALT   # 0 unless the unit sets it itself
sudo grep -c '^LOCAL_DB=' /opt/shared/env.local                     # 0: LOCAL_DB is development only
```

After any restart of a site built from `cloud-live`, `journalctl -u <unit> | grep "COMMUNITY_HASH_SALT is not set"`
must find nothing. With `LOCAL_DB=1` and `NODE_ENV=production` neither the website nor the live service starts.

## 1. The migration (Supabase, additive)

In the Supabase SQL editor of the production project, run `supabase/migrations/2026-10-14-cloud-live.sql` as it is in
the branch (the same SQL is at the end of `supabase/schema.sql`). It is idempotent:

```sql
alter table library_designs add column if not exists seq bigint not null default 0;
alter table library_designs add column if not exists live_lease_until timestamptz;
alter table library_designs add column if not exists live_lease_token text;

create table if not exists library_design_members (
  owner_id uuid not null references community_users (id) on delete cascade,
  design_id text not null,
  member_id uuid not null references community_users (id) on delete cascade,
  role text not null default 'editor' check (role in ('editor')),
  added_at timestamptz not null default now(),
  primary key (owner_id, design_id, member_id),
  foreign key (owner_id, design_id) references library_designs (user_id, id) on delete cascade
);

create index if not exists library_design_members_member on library_design_members (member_id);

alter table library_design_members enable row level security;
```

`add column ... default 0` on `library_designs` rewrites nothing in Postgres 11 and later (a constant default); the
table is small either way. `live_lease_token` is the live service's lease: every write it makes is conditional on it,
so a room that lost its lease never writes over the plan. Check:

```sql
select column_name, data_type from information_schema.columns
 where table_name = 'library_designs' and column_name in ('seq', 'live_lease_until', 'live_lease_token');   -- 3 rows
select relrowsecurity from pg_class where relname = 'library_design_members';   -- true
select count(*) from library_design_members;                                      -- 0
```

Undo (only if nothing uses them yet): `drop table library_design_members; alter table library_designs drop column
live_lease_token, drop column live_lease_until, drop column seq;`.

If the earlier version of this migration (without `live_lease_token`) was already applied somewhere, run the file
again: it is idempotent and adds only the missing column.

## 2. Staging at new.gtnhplanner.com

Two new services on the production database, beside the running site:

| Unit | Listens | Runs |
|---|---|---|
| `gtnh-flow-next` | 127.0.0.1:3002 | `next start` from the `cloud-live` release |
| `gtnh-live` | 127.0.0.1:3001 | `node dist-live/live.mjs` from the same release |

Session cookies are host-only, so staging has its own sign-in (the same accounts and passwords). The owner tests there
with plans they don't mind losing. While staging runs, the main site (the old code) does not know about leases: a plan
saved on `gtnhplanner.com` while it is open live on staging can be overwritten by the live service's next flush.

### 2.1 Secrets and directories

```bash
sudo install -d -o <app user> -g <app user> -m 750 /opt/shared/live-journal
openssl rand -hex 32        # the LIVE_INTERNAL_TOKEN
sudo tee /opt/shared/live.env > /dev/null <<'EOF'
LIVE_PORT=3001
LIVE_HOST=127.0.0.1
LIVE_JOURNAL_DIR=/opt/shared/live-journal
LIVE_INTERNAL_URL=http://127.0.0.1:3001
LIVE_INTERNAL_TOKEN=<the token>
LIVE_ALLOWED_ORIGINS=https://new.gtnhplanner.com,https://gtnhplanner.com
# Optional: plans open at once in the service (default 500).
# LIVE_MAX_ROOMS=500
EOF
sudo chown root:<app user> /opt/shared/live.env && sudo chmod 640 /opt/shared/live.env
```

`COMMUNITY_HASH_SALT`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` come from the site's existing env file; the live
service must use the same `COMMUNITY_HASH_SALT` as the website, or no session will verify.

### 2.2 Build the release

As the app user:

```bash
REL=/opt/releases/cloud-live-$(date +%Y%m%d-%H%M)
git clone --branch cloud-live --depth 1 https://github.com/jackwrichards/gtnh-factory-flow.git "$REL"
cd "$REL"
npm ci
# datasets, exactly as the current release has them (see step 0), e.g.:
ln -s /opt/shared/gtnh-datasets public/datasets/gtnh
# NEXT_PUBLIC_* values are baked in at build time. "/live" means "/live on whatever host served the page"
# (src/lib/live/protocol.ts, liveSocketUrl), so this one build works on new.gtnhplanner.com now and on
# gtnhplanner.com after the switch, and the host-only session cookie always goes with the socket.
set -a; . /opt/shared/env.local; set +a          # the same build-time env the site is built with
NEXT_PUBLIC_LIVE_URL=/live npm run build
npm run build:live                                # dist-live/live.mjs
```

(`NEXT_PUBLIC_LIVE_URL=wss://new.gtnhplanner.com/live` also works for staging, but then the switch needs a rebuild
with `wss://gtnhplanner.com/live`: a page on one host cannot carry the other host's cookie.)

### 2.3 The units

`/etc/systemd/system/gtnh-live.service`:

```ini
[Unit]
Description=GTNH Planner live service (live plan editing over WebSockets)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=<app user>
WorkingDirectory=<REL>
EnvironmentFile=/opt/shared/env.local
EnvironmentFile=/opt/shared/live.env
Environment=NODE_ENV=production
ExecStart=<node path, as in gtnh-flow> dist-live/live.mjs
Restart=always
RestartSec=2
# SIGTERM stores every open plan and lets its lease go before exiting.
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/gtnh-flow-next.service`: a copy of `gtnh-flow`'s unit (from step 0) with these differences:

```ini
[Unit]
Description=GTNH Factory Flow, cloud-live staging (new.gtnhplanner.com)
After=network-online.target gtnh-live.service

[Service]
WorkingDirectory=<REL>
EnvironmentFile=/opt/shared/env.local
EnvironmentFile=/opt/shared/live.env
Environment=NODE_ENV=production
Environment=PORT=3002
Environment=HOSTNAME=127.0.0.1
# plus gtnh-flow's own Environment= lines (NODE_OPTIONS heap cap, GTNH_PREWARM_ON_STARTUP=1, ...)
ExecStart=<node path> node_modules/next/dist/bin/next start -p 3002 -H 127.0.0.1
Restart=always
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gtnh-live gtnh-flow-next
systemctl status gtnh-live gtnh-flow-next --no-pager
curl -s http://127.0.0.1:3001/live/health          # {"ok":true,"rooms":0,"connections":0}
curl -sI http://127.0.0.1:3002/ | head -1          # HTTP/1.1 200 OK
journalctl -u gtnh-live -n 20 --no-pager           # "[live] listening on 127.0.0.1:3001, origins ..."
```

### 2.4 Cloudflare DNS

In the `gtnhplanner.com` zone: a record `new`, proxied (orange cloud), pointing where `gtnhplanner.com` points (an `A`
record to the droplet's address, or a `CNAME` to `gtnhplanner.com`). WebSockets are on by default (Network,
WebSockets); check the toggle. Cloudflare closes a WebSocket idle for 100 s; clients ping every 25 s.

### 2.5 Caddy

Add a site block for `new.gtnhplanner.com` beside the existing one. Copy the `gtnhplanner.com` block's TLS, logging
and header lines exactly (the `X-Client-Ip` header, the Cloudflare trusted proxies, any emergency rules), and change
only the routing:

```caddy
new.gtnhplanner.com {
	# ... the gtnhplanner.com block's tls / log / header / trusted_proxies lines, unchanged ...

	@live path /live /live/*
	handle @live {
		# WebSocket upgrades pass through reverse_proxy as they are.
		reverse_proxy 127.0.0.1:3001 {
			# The client's address, as the site's own block sets it (Cloudflare's
			# CF-Connecting-IP, trusted only from Cloudflare's ranges).
			header_up X-Client-Ip {client_ip}
		}
	}
	handle {
		reverse_proxy 127.0.0.1:3002 {
			# ... the same header_up lines as the gtnhplanner.com block ...
		}
	}
}
```

Only `/live` and `/live/*` reach the live service, so its `/internal/*` endpoints stay unreachable from outside.

The live service limits socket upgrades (60 a minute) and `/live/nearby` (60 a minute) per client address. It
listens on loopback, so every request seems to come from Caddy: it takes the address from `X-Client-Ip` (falling back
to `CF-Connecting-IP`), and only on requests from loopback. The `header_up X-Client-Ip {client_ip}` line above
overwrites whatever a client sends; `{client_ip}` is the real client only with Cloudflare's ranges in Caddy's
`trusted_proxies` (the main block's global options already have them if its `X-Client-Ip` works: copy what it does).
Without it every player shares one address and the limits bite everyone at once.

TLS: if the existing block uses a Cloudflare origin certificate (`tls <cert> <key>`), check it covers the new name
(`openssl x509 -in <cert> -noout -ext subjectAltName`: `*.gtnhplanner.com` does); if it does not, issue one that
does. If Caddy gets its own certificates, behind the Cloudflare proxy only the HTTP challenge works, so "Always Use
HTTPS" must not intercept `/.well-known/acme-challenge/`, or use the DNS challenge as the main block does.

```bash
caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### 2.6 Check staging

From any machine:

```bash
curl -sI https://new.gtnhplanner.com/ | head -1                                    # 200
curl -s https://new.gtnhplanner.com/live/health                                    # {"ok":true,...,"flushBacklog":0}
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://new.gtnhplanner.com/internal/members   # 404 (Next.js, not the live service)

# The WebSocket upgrade through Cloudflare: expect "101 Switching Protocols" (the service then says "auth": no cookie).
curl -si -N --http1.1 --max-time 5 https://new.gtnhplanner.com/live \
  -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Origin: https://new.gtnhplanner.com" | head -1
# From another origin: 403.
curl -si -N --http1.1 --max-time 5 https://new.gtnhplanner.com/live \
  -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Origin: https://example.com" | head -1
```

With two test accounts the owner does not mind using (a checkout of the branch, `npm ci`):

```bash
C="node tools/live/test-client.mjs --base https://new.gtnhplanner.com"
$C --user <a> --password <pa> create "Staging live test"         # { doc, designId }
$C --user <a> --password <pa> share <designId> <b>
$C --user <b> --password <pb> list                                 # the plan under "shared"
$C --user <b> --password <pb> join <doc> --for 150                 # a second shell; stays past Cloudflare's 100 s
$C --user <a> --password <pa> send <doc> '[{"o":"meta","f":{"primaryView":"tasks"}}]'   # appears in the join shell
$C --user <a> --password <pa> unshare <designId> <b>               # the join shell prints "kicked"
$C --user <a> --password <pa> read <doc>                           # seq has moved, live false once everyone left
```

Then the real thing: the website on `new.gtnhplanner.com` in two browsers, and a game test build started with
`-Dgtnhplanner.library.url=https://new.gtnhplanner.com`.

Also check:

- A restart stores open plans: with a plan open, `sudo systemctl restart gtnh-live`; clients reconnect, nothing is
  lost, `/opt/shared/live-journal` is empty afterwards.
- Leases end: a minute after nobody is in a plan (rooms linger that long),
  `select count(*) from library_designs where live_lease_until > now();` is 0, and so is
  `select count(*) from library_designs where live_lease_token is not null;`.
- The flush queue keeps up: `/live/health`'s `flushBacklog` stays near 0 (it grows while the database is failing,
  as flushes rest, and drains when it is back).
- Addresses reach the service: in Caddy's access log, `/live` upgrades from ordinary use answer 101, never 429 (a 429
  for everyone at once means `X-Client-Ip` is not set on the `@live` route and every player shares one address).
- Logs: `journalctl -u gtnh-live -f`, `journalctl -u gtnh-flow-next -f`, Caddy's `/var/lib/caddy/access.log`.

Undo staging: `sudo systemctl disable --now gtnh-flow-next gtnh-live` (the live service stores its plans as it
stops), remove the Caddy block and reload, delete the DNS record.

### 2.7 What was actually deployed (2026-10-15)

Staging went up as above, with these differences, forced by the droplet: 3.9 GB of memory, of which the live site
holds about 2 GB (its prewarmed recipe data) and swap already held 0.6 GB. A second copy with its own prewarm does not
fit.

- Staging never loads recipe data: the `new.gtnhplanner.com` block sends `/api/datasets/*` to the live site on 3000,
  which has it warm (the branch never changed those routes). Staging runs with no prewarm, a 600 MB heap
  (`NODE_OPTIONS=--max-old-space-size=600`) and a hard cap (`MemoryMax=900M`, `OOMScoreAdjust=800`); the live service
  has `MemoryMax=400M`, `OOMScoreAdjust=500`. Both run as root like `gtnh-flow`, with `/usr/bin/node` (v22).
- The release is `/opt/releases/cloud-live-1792055998` (built by `/opt/build-cloud-live.sh`, the deploy script's
  steps on the branch plus `NEXT_PUBLIC_LIVE_URL=/live` in the release's `.env.local` and `npm run build:live`); its
  path is in `/opt/shared/cloud-live-release`. `deploy.sh` prunes only `r*` releases, so it never removes this one.
  `/opt/shared/live.env` holds the live settings (mode 600).
- Caddy runs as `caddy`, which cannot create files in `/var/lib/caddy`: the staging block's log,
  `/var/lib/caddy/access-new.log`, was created and given to `caddy` first (the first reload failed on it and Caddy
  kept its old config). The Caddyfile from before is `/etc/caddy/Caddyfile.before-cloud-live`. Caddy got its own
  certificate for the name; Cloudflare's SSL mode is strict and WebSockets are on.
- DNS: `new` is a proxied CNAME to `gtnhplanner.com`.
- Measured: the live site's slowest `/api/version` during the build was 0.9 s (0.1 s normally); after, 0.1 s.
  Staging uses about 230 MB, the live service about 40 MB.

For the switch on this droplet the same trick makes the Caddy change free of downtime: `gtnhplanner.com` goes to 3002
except `/api/datasets/*`, which stays on 3000 (keep `gtnh-flow` running), and `/live*` goes to 3001. Raise staging's
caps first (`MemoryMax=1400M`, heap 1000 MB): it then serves every page and save. The merge into `main` (section 4)
later brings it back to one instance with its own prewarm.

## 3. The switch

When the owner is happy with staging, `gtnhplanner.com` moves to the staging release: one change to its Caddy block.

Before (today):

```caddy
gtnhplanner.com {
	# ... tls / log / headers ...
	reverse_proxy 127.0.0.1:3000 {
		# ... header_up lines ...
	}
}
```

After:

```caddy
gtnhplanner.com {
	# ... tls / log / headers, unchanged ...
	@live path /live /live/*
	handle @live {
		reverse_proxy 127.0.0.1:3001 {
			header_up X-Client-Ip {client_ip}
		}
	}
	handle {
		reverse_proxy 127.0.0.1:3002 {
			# ... the same header_up lines ...
		}
	}
}
```

(If the block already uses `handle` blocks or other routes, change only the upstream `127.0.0.1:3000` to
`127.0.0.1:3002` and add the `@live` handle before the others.)

```bash
caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
curl -s https://gtnhplanner.com/api/version        # the cloud-live build's version
curl -s https://gtnhplanner.com/live/health
```

The release was built with `NEXT_PUBLIC_LIVE_URL=/live`, so pages on `gtnhplanner.com` open their socket on
`gtnhplanner.com/live` with that host's cookie: nothing to rebuild. `LIVE_ALLOWED_ORIGINS` already lists
`https://gtnhplanner.com`. Players stay signed in (their cookie is `gtnhplanner.com`'s, and the secret is the same).

### Rollback

The same line back: `gtnhplanner.com`'s upstream to `127.0.0.1:3000` (the `@live` handle may stay or go), validate,
reload. The old site ignores the new columns and table. Two things to know: plans saved by the old site lose their
task boards and the game's data (its schema strips fields it does not know); and while `gtnh-live` runs, the old site
does not honour leases, so stop it too for a full rollback (`sudo systemctl stop gtnh-live`: it stores open plans
first).

## 4. Merging into main

Once the switch has held:

1. On a workstation: merge `cloud-live` into `main` (`git merge --no-ff cloud-live`), bump `APP_VERSION` in
   `src/lib/version.ts` (minor: features) and add the release's entry to `src/lib/changelog.ts`. Typecheck and the
   full suite green; push `main`.
2. The ordinary deploy builds the merged `main` for `gtnh-flow` (:3000), with two additions to the deploy from now on:
   `NEXT_PUBLIC_LIVE_URL=/live` at build time, and `npm run build:live` after `npm run build`. Add
   `EnvironmentFile=/opt/shared/live.env` to the `gtnh-flow` unit, so its routes reach the live service
   (`LIVE_INTERNAL_URL`, `LIVE_INTERNAL_TOKEN`).
3. Point `gtnh-live` at the deployed release (`WorkingDirectory=`, or a stable `current` link if the deploy keeps
   one), `daemon-reload`, `systemctl restart gtnh-live` (it stores open plans as it stops; clients reconnect).
4. Caddy: `gtnhplanner.com`'s site upstream back to `127.0.0.1:3000`, keeping the `@live` handle to 3001. Reload.
5. Stop and disable `gtnh-flow-next`; keep or remove `new.gtnhplanner.com` (its block now has nothing on 3002: remove
   it, or point it at 3000).
6. From then on every deploy restarts `gtnh-live` after `gtnh-flow`, and `/api/version` is checked as usual.

## Environment, all of it

| Variable | Who | Value |
|---|---|---|
| `COMMUNITY_HASH_SALT` | site, live | the existing secret (the same for both) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | site, live | the existing values |
| `LIVE_PORT`, `LIVE_HOST` | live | `3001`, `127.0.0.1` |
| `LIVE_JOURNAL_DIR` | live | `/opt/shared/live-journal` (outside releases: survives deploys) |
| `LIVE_INTERNAL_TOKEN` | site, live | random, `openssl rand -hex 32` |
| `LIVE_INTERNAL_URL` | site | `http://127.0.0.1:3001` |
| `LIVE_ALLOWED_ORIGINS` | live | `https://new.gtnhplanner.com,https://gtnhplanner.com` |
| `LIVE_MAX_ROOMS` | live | optional, plans open at once (default `500`) |
| `LOCAL_DB` | nobody | never set in production: with `NODE_ENV=production` neither process starts |
| `NEXT_PUBLIC_LIVE_URL` | site, build time | `/live` (empty: no live features) |
| `NODE_ENV` | site, live | `production` |
| `PORT` | staging site | `3002` |
