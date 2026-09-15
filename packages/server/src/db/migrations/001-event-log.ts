import type { Migration } from '../migrate.js';

/**
 * The event log itself: campaigns, the commands that write to them, and the
 * append-only events table. Design: `docs/design-event-log.md` sections 3
 * and 9.
 */
export const migration001: Migration = {
  id: '001',
  name: 'event-log',
  sql: `
create table campaigns (
  id          uuid primary key,
  name        text not null,
  created_at  timestamptz not null default now(),

  -- The per-campaign event sequence. Bumped inside the same transaction as
  -- the insert, which serialises writers per campaign and keeps the
  -- sequence gapless — a Postgres sequence would gap on every rollback.
  next_seq    bigint not null default 1,

  constraint campaigns_next_seq_positive check (next_seq >= 1)
);

-- One row per write request. Its primary key is the idempotency key: a
-- retry of the same requestId hits the unique violation, reads the stored
-- response, and returns it unchanged rather than writing the events twice.
--
-- The command id is also the beat grouping for the narrative log and the
-- minimum unit a void operates on. That is not a coincidence: a request is
-- exactly "one thing the player did".
create table commands (
  campaign_id uuid not null references campaigns (id),
  id          uuid not null,
  kind        text not null,
  actor       jsonb not null,
  received_at timestamptz not null default now(),
  first_seq   bigint not null,
  last_seq    bigint not null,
  response    jsonb not null,

  primary key (campaign_id, id),
  constraint commands_seq_range check (last_seq >= first_seq)
);

create table events (
  campaign_id          uuid not null references campaigns (id),
  seq                  bigint not null,
  id                   uuid not null unique,
  command_id           uuid not null,

  -- The event that caused this one, across commands. Server-assigned only:
  -- a client able to supply it could forge causality and steer what a void
  -- cascades over.
  caused_by            uuid null,

  session_id           uuid null,
  scene_id             uuid null,
  actor                jsonb not null,
  subject_character_id text null,
  type                 text not null,
  version              int not null,
  visibility           text not null default 'table',
  payload              jsonb not null,
  occurred_at          timestamptz not null,

  primary key (campaign_id, seq),
  constraint events_seq_positive check (seq >= 1),
  constraint events_version_positive check (version >= 1)
);

-- Every read is either a seq-ordered range scan or served from the
-- in-memory projection, so two indexes beyond the primary key is the whole
-- story. No GIN index on payload: at a few thousand events per campaign
-- nothing needs one, and adding it later is a one-line migration.
create index events_by_command on events (campaign_id, command_id);
create index events_by_session on events (campaign_id, session_id, seq);

-- The events table is INSERT-only, forever, and the database is what
-- enforces it rather than discipline. Voids, corrections and manual
-- overrides are all new events; nothing is ever mutated in place.
create function astrolabe_reject_event_mutation() returns trigger
language plpgsql as $$
begin
  raise exception
    'events is append-only: % is not allowed (campaign %, seq %)',
    tg_op, old.campaign_id, old.seq
    using errcode = 'restrict_violation',
          hint = 'Append a new event instead: event.voided, narration.revised or state.overridden.';
end;
$$;

create trigger events_reject_mutation
  before update or delete on events
  for each row execute function astrolabe_reject_event_mutation();

-- TRUNCATE bypasses row-level triggers entirely, so it needs its own
-- statement-level guard. Without it, "delete is impossible" would be true
-- of every row and false of the table.
create function astrolabe_reject_event_truncate() returns trigger
language plpgsql as $$
begin
  raise exception 'events is append-only: TRUNCATE is not allowed'
    using errcode = 'restrict_violation';
end;
$$;

create trigger events_reject_truncate
  before truncate on events
  for each statement execute function astrolabe_reject_event_truncate();
`,
};
