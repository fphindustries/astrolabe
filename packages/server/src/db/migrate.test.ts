import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CAMPAIGN_ID,
  SESSION_ID,
  testCommandId,
  testEventId,
} from '@astrolabe/shared/test-fixtures';

import { MIGRATIONS, migrate, type Migration } from './migrate.js';
import {
  NO_DATABASE_MESSAGE,
  createTestDatabase,
  hasTestDatabase,
  type TestDatabase,
} from './testing.js';

/**
 * These run against a real Postgres — the append-only trigger,
 * transactional DDL and the check constraints are the whole deliverable of
 * task 2.1, and none of them exist in a stand-in. Without a database they
 * skip loudly rather than passing vacuously.
 */
describe('migration list', () => {
  it('is ordered and free of duplicate ids', async () => {
    // assertOrdered runs inside migrate(), but the list is data worth
    // checking directly: an edited id changes history other databases have
    // already recorded.
    const ids = MIGRATIONS.map((m) => m.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('numbers every migration with a zero-padded id', () => {
    for (const migration of MIGRATIONS) {
      expect(migration.id).toMatch(/^\d{3}$/);
      expect(migration.name).not.toBe('');
    }
  });
});

const OTHER_CAMPAIGN = '12121212-1212-4121-8121-121212121212';

describe.skipIf(!hasTestDatabase)('the event log schema', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('schema');
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  async function insertCampaign() {
    await db.sql`insert into campaigns (id, name) values (${CAMPAIGN_ID}, 'Lantern Wake')`;
  }

  async function insertCommand(seq: number) {
    await db.sql`
      insert into commands (campaign_id, id, kind, actor, first_seq, last_seq, response)
      values (${CAMPAIGN_ID}, ${testCommandId(seq)}, 'session.begin',
              ${db.sql.json({ kind: 'system' })}, ${seq}, ${seq}, ${db.sql.json({ ok: true })})
    `;
  }

  /**
   * `unique` names the command and event ids independently of `seq`, so a
   * test can collide on exactly one constraint at a time. Without it, a
   * second insert at the same seq would fail on the *commands* primary key
   * before ever reaching the events table — passing, but for the wrong
   * reason.
   */
  async function insertEvent(seq: number, unique: number = seq) {
    await insertCommand(unique);
    await db.sql`
      insert into events (
        campaign_id, seq, id, command_id, caused_by, session_id, scene_id,
        actor, subject_character_id, type, version, visibility, payload, occurred_at
      ) values (
        ${CAMPAIGN_ID}, ${seq}, ${testEventId(unique)}, ${testCommandId(unique)}, null,
        ${SESSION_ID}, null, ${db.sql.json({ kind: 'system' })}, null,
        'session.began', 1, 'table',
        ${db.sql.json({ sessionId: SESSION_ID, number: 2 })},
        '2026-09-12T19:00:00.000Z'
      )
    `;
  }

  describe('migrations', () => {
    it('records what it applied', async () => {
      const rows = await db.sql<{ id: string }[]>`select id from schema_migrations order by id`;
      expect(rows.map((r) => r.id)).toEqual(MIGRATIONS.map((m) => m.id));
    });

    it('is idempotent: running again applies nothing', async () => {
      const outcome = await migrate(db.sql);
      expect(outcome.applied).toEqual([]);
      expect(outcome.alreadyApplied).toEqual(MIGRATIONS.map((m) => m.id));
    });

    it('rolls back a failing migration and the row that records it', async () => {
      const broken: Migration = {
        id: '999',
        name: 'broken',
        sql: 'create table will_not_exist (id int); this is not sql;',
      };
      await expect(migrate(db.sql, [...MIGRATIONS, broken])).rejects.toThrow();

      const recorded = await db.sql<{ id: string }[]>`
        select id from schema_migrations where id = '999'
      `;
      expect(recorded).toHaveLength(0);

      // Postgres has transactional DDL, so the half-created table is gone too.
      const tables = await db.sql<{ table_name: string }[]>`
        select table_name from information_schema.tables
        where table_schema = ${db.schema} and table_name = 'will_not_exist'
      `;
      expect(tables).toHaveLength(0);
    });
  });

  describe('the append-only guarantee', () => {
    beforeAll(async () => {
      await insertCampaign();
      await insertEvent(1);
    });

    it('accepts an insert', async () => {
      const rows = await db.sql`select seq from events where campaign_id = ${CAMPAIGN_ID}`;
      expect(rows).toHaveLength(1);
    });

    it('rejects an update', async () => {
      await expect(
        db.sql`update events set type = 'session.ended' where campaign_id = ${CAMPAIGN_ID}`,
      ).rejects.toThrow(/append-only/);
    });

    it('rejects a delete', async () => {
      await expect(db.sql`delete from events where campaign_id = ${CAMPAIGN_ID}`).rejects.toThrow(
        /append-only/,
      );
    });

    it('rejects a truncate, which bypasses row-level triggers', async () => {
      await expect(db.sql`truncate events`).rejects.toThrow(/append-only/);
    });

    it('leaves the event intact after every rejected attempt', async () => {
      const rows = await db.sql<{ seq: string }[]>`
        select seq from events where campaign_id = ${CAMPAIGN_ID}
      `;
      expect(rows).toHaveLength(1);
    });

    it('still allows commands to be updated: only events are immutable', async () => {
      await expect(
        db.sql`
          update commands set response = ${db.sql.json({ ok: false })}
          where campaign_id = ${CAMPAIGN_ID}
        `,
      ).resolves.toBeDefined();
    });
  });

  describe('constraints', () => {
    it('rejects a second event at the same campaign and seq', async () => {
      // A distinct command and event id, so the only thing colliding is the
      // (campaign_id, seq) primary key the sequence depends on.
      await expect(insertEvent(1, 201)).rejects.toThrow(/events_pkey/);
    });

    it('rejects two events sharing an id across campaigns', async () => {
      await db.sql`insert into campaigns (id, name) values (${OTHER_CAMPAIGN}, 'Other')`;
      await db.sql`
        insert into commands (campaign_id, id, kind, actor, first_seq, last_seq, response)
        values (${OTHER_CAMPAIGN}, ${testCommandId(202)}, 'x',
                ${db.sql.json({ kind: 'system' })}, 1, 1, ${db.sql.json({})})
      `;
      // events.id is globally unique, not per-campaign: an event id is a
      // uuid v7 and identifies one event anywhere.
      await expect(
        db.sql`
          insert into events (
            campaign_id, seq, id, command_id, caused_by, session_id, scene_id,
            actor, subject_character_id, type, version, visibility, payload, occurred_at
          ) values (
            ${OTHER_CAMPAIGN}, 1, ${testEventId(1)}, ${testCommandId(202)}, null,
            null, null, ${db.sql.json({ kind: 'system' })}, null,
            'session.began', 1, 'table', ${db.sql.json({})}, now()
          )
        `,
      ).rejects.toThrow(/events_id_key/);
    });

    it('rejects a seq below 1', async () => {
      await expect(insertEvent(0, 203)).rejects.toThrow(/events_seq_positive/);
    });

    it('rejects a version below 1', async () => {
      await insertCommand(204);
      await expect(
        db.sql`
          insert into events (
            campaign_id, seq, id, command_id, caused_by, session_id, scene_id,
            actor, subject_character_id, type, version, visibility, payload, occurred_at
          ) values (
            ${CAMPAIGN_ID}, 204, ${testEventId(204)}, ${testCommandId(204)}, null,
            null, null, ${db.sql.json({ kind: 'system' })}, null,
            'session.began', 0, 'table', ${db.sql.json({})}, now()
          )
        `,
      ).rejects.toThrow(/events_version_positive/);
    });

    it('rejects an event whose campaign does not exist', async () => {
      await expect(
        db.sql`
          insert into events (
            campaign_id, seq, id, command_id, caused_by, session_id, scene_id,
            actor, subject_character_id, type, version, visibility, payload, occurred_at
          ) values (
            '00000000-0000-4000-8000-000000000000', 1, ${testEventId(99)},
            ${testCommandId(99)}, null, null, null,
            ${db.sql.json({ kind: 'system' })}, null, 'session.began', 1, 'table',
            ${db.sql.json({})}, now()
          )
        `,
      ).rejects.toThrow();
    });

    it('rejects a command whose seq range runs backwards', async () => {
      await expect(
        db.sql`
          insert into commands (campaign_id, id, kind, actor, first_seq, last_seq, response)
          values (${CAMPAIGN_ID}, ${testCommandId(50)}, 'x',
                  ${db.sql.json({ kind: 'system' })}, 9, 2, ${db.sql.json({})})
        `,
      ).rejects.toThrow();
    });

    it('starts a campaign sequence at 1', async () => {
      const rows = await db.sql<{ next_seq: string }[]>`
        select next_seq from campaigns where id = ${CAMPAIGN_ID}
      `;
      expect(Number(rows[0]?.next_seq)).toBe(1);
    });
  });

  describe('indexes the read paths depend on', () => {
    it('creates the command and session indexes', async () => {
      const rows = await db.sql<{ indexname: string }[]>`
        select indexname from pg_indexes
        where schemaname = ${db.schema} and tablename = 'events'
        order by indexname
      `;
      const names = rows.map((r) => r.indexname);
      expect(names).toContain('events_by_command');
      expect(names).toContain('events_by_session');
    });
  });
});

describe.skipIf(hasTestDatabase)('database tests', () => {
  it('are skipped without a database', () => {
    expect(NO_DATABASE_MESSAGE).toContain('docker compose up -d db');
  });
});
