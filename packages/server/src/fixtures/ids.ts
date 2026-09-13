import { createHash } from 'node:crypto';

/**
 * A stable uuid for one named thing in one fixture (D-122).
 *
 * The same fixture and key give the same id on every machine and every run,
 * which is what lets `db:seed` recognise a campaign it already wrote and a
 * bookmarked dev URL keep working after `db:reset`. Version 8 — RFC 9562's
 * layout for ids a program derives itself — so a fixture id can never be
 * mistaken for a server-minted v7 one.
 *
 * Only the ids a fixture chooses are stable: the campaign, its commands, its
 * sessions and scenes. Ids the commands mint internally (events, characters,
 * tracks, entities) still come from `uuidv7`, as they do in play.
 */
export function fixtureUuid<T extends string>(fixture: string, key: string): T {
  const bytes = createHash('sha256').update(`astrolabe:fixture:${fixture}:${key}`).digest();
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as T;
}
