import type { CampaignId, SceneId, SessionId } from '@astrolabe/shared';
import { LOCAL_PLAYER_ID } from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { appendCommand } from '../db/event-store.js';

import { fixtureUuid } from './ids.js';
import { playSessionOne, type SessionOneRun } from './session-one.js';

/**
 * `session-2-open`: the golden session's Setup, playable in the browser (D-122).
 *
 * `session-1` ends its session, which is right for D-72 and 10.4, but it
 * leaves nothing a person can play: Begin a Session (9.1) isn't built, so
 * the app can't open session 2. This is the same session 1 under its own
 * campaign id, plus session 2 already open at Varga Relay.
 *
 * The session-2 opening is a stand-in for Beat 1. Once 9.1 lands, this
 * fixture should end at session 1, and play should begin with Begin Session.
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
  await appendCommand(sql, {
    campaignId: run.campaignId,
    commandId: key('session:2:begin'),
    kind: 'session.begin',
    actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
    events: [
      { type: 'session.began', payload: { sessionId: sessionTwoId, number: 2 } },
      {
        type: 'scene.started',
        payload: {
          sceneId: key<SceneId>('scene:relay'),
          title: 'The derelict relay station',
          locationId: run.locations.relay,
        },
        sessionId: sessionTwoId,
      },
    ],
  });

  return { ...run, sessionTwoId };
}
