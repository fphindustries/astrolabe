import type { CampaignId, SceneId, SessionId } from '@astrolabe/shared';
import { LOCAL_PLAYER_ID } from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { beginSession } from '../db/session-commands.js';

import { fixtureUuid } from './ids.js';
import { playSessionOne, type SessionOneRun } from './session-one.js';

/**
 * `session-2-open`: the golden session's Setup, playable in the browser (D-122).
 *
 * The same session 1 under its own campaign id, plus session 2 opened
 * through Begin a Session at Varga Relay, with no recap. Server tests seed
 * it when they need an open session; browser play of Beat 1 starts from
 * `session-1` instead, with Begin Session and its recap (D-146).
 */

export const SESSION_TWO_OPEN = 'session-2-open';

export const SESSION_TWO_OPEN_CAMPAIGN_ID = fixtureUuid<CampaignId>(SESSION_TWO_OPEN, 'campaign');

export interface SessionTwoOpenRun extends SessionOneRun {
  readonly sessionTwoId: SessionId;
}

export async function playSessionTwoOpen(sql: Sql): Promise<SessionTwoOpenRun> {
  const key = <T extends string>(name: string): T => fixtureUuid<T>(SESSION_TWO_OPEN, name);
  const run = await playSessionOne(sql, {
    fixture: SESSION_TWO_OPEN,
    campaignName: 'Lantern Wake (session 2 open)',
  });

  const sessionTwoId = key<SessionId>('session:2');
  // Begin a Session carries the relay scene forward (D-146). No recap: the
  // tests that seed this want an open session, not a Guide call.
  await beginSession(sql, {
    campaignId: run.campaignId,
    commandId: key('session:2:begin'),
    actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
    ids: { sessionId: sessionTwoId, sceneId: key<SceneId>('scene:2') },
  });

  return { ...run, sessionTwoId };
}
