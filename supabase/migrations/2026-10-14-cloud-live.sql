-- CLOUD PLANS, LIVE CO-EDITING AND TASK BOARDS (2026-10-14).
--
-- A cloud plan is a library_designs row, addressed as <owner id>:<design id>.
-- Its owner can share it with other accounts as editors; the live service
-- (src/live/) holds an open plan in memory and writes it back in batches.
-- Purely additive: the old code never reads these columns or this table, so
-- it keeps running while this is applied. Idempotent: re-running is safe.
-- Mirrored at the end of supabase/schema.sql.

-- How many edit batches the live service has applied to the plan; written
-- with each flush.
alter table library_designs add column if not exists seq bigint not null default 0;

-- While this is in the future the live service holds the plan and is its only
-- writer: the REST plan PUT refuses a plan body (409 {live: true}); metadata
-- still goes through REST.
alter table library_designs add column if not exists live_lease_until timestamptz;

-- Accounts a design is shared with. (owner_id, design_id) is library_designs'
-- primary key (user_id, id), so the composite reference needs no new unique
-- constraint. Designs are tombstoned rather than deleted, so the API removes
-- a tombstoned design's members itself; the cascade covers account deletion.
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

-- Same access model as every other table: RLS on, no policies, service-role
-- only. Without it the hosted project's anon key could read the table.
alter table library_design_members enable row level security;
