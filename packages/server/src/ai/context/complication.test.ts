import { describe, expect, it } from 'vitest';

import type { CharacterId } from '@astrolabe/rules';
import type { AstrolabeEvent, EventId } from '@astrolabe/shared';

import { createProviderFromEnv } from '../create-provider.js';

import {
  COMPLICATION_ROLLS,
  checkComplicationOptions,
  complicationOptionsSchema,
  missingComplication,
  stubComplicationOptions,
  type RolledComplication,
} from './complication.js';

const CREW = [{ id: 'c-juno' as CharacterId, callsign: 'Juno', name: 'Juno Marr' }];
const ROLLED: readonly RolledComplication[] = COMPLICATION_ROLLS.map((spec, i) => ({
  ...spec,
  roll: i + 1,
  rowText: `row ${spec.key}`,
  eventId: `evt-${spec.key}` as EventId,
}));

describe('complication options (8.7, D-143)', () => {
  it('rolls an Action and a Theme for each of three options', () => {
    expect(COMPLICATION_ROLLS.map((r) => r.key)).toEqual([
      'O1.action',
      'O1.theme',
      'O2.action',
      'O2.theme',
      'O3.action',
      'O3.theme',
    ]);
  });

  it('accepts three distinct options each citing its own pair', () => {
    expect(checkComplicationOptions(stubComplicationOptions(), ROLLED, CREW)).toBeUndefined();
  });

  it('refuses the wrong count, a borrowed citation, a repeat and a named player character', () => {
    const stub = stubComplicationOptions();
    expect(checkComplicationOptions({ options: stub.options.slice(0, 2) }, ROLLED, CREW)).toMatch(
      /exactly 3/,
    );
    expect(
      checkComplicationOptions(
        {
          options: [
            { ...stub.options[0]!, cites: ['O2.action', 'O1.theme'] },
            ...stub.options.slice(1),
          ],
        },
        ROLLED,
        CREW,
      ),
    ).toMatch(/Option 1 must cite its own pair/);
    expect(
      checkComplicationOptions(
        {
          options: [
            stub.options[0]!,
            { ...stub.options[1]!, text: stub.options[0]!.text },
            stub.options[2]!,
          ],
        },
        ROLLED,
        CREW,
      ),
    ).toMatch(/same thing/);
    expect(
      checkComplicationOptions(
        {
          options: [
            { ...stub.options[0]!, text: 'Juno trips an alarm.' },
            ...stub.options.slice(1),
          ],
        },
        ROLLED,
        CREW,
      ),
    ).toMatch(/names Juno/);
  });

  it('knows a weak-hit Gather Information owes a complication until one is set, and a burn to a strong hit does not', () => {
    const invoked = {
      id: 'e1',
      commandId: 'c1',
      type: 'move.invoked',
      payload: { moveId: 'move:adventure/gather-information' },
    };
    const roll = { id: 'e2', commandId: 'c1', type: 'dice.rolled', payload: { tier: 'weak_hit' } };
    const events = [invoked, roll] as unknown as AstrolabeEvent[];
    expect(missingComplication(events)).toBe(true);
    expect(
      missingComplication([
        ...events,
        { id: 'e3', commandId: 'c2', causedBy: 'e1', type: 'complication.set', payload: {} },
      ] as unknown as AstrolabeEvent[]),
    ).toBe(false);
    expect(
      missingComplication([
        ...events,
        {
          id: 'e4',
          commandId: 'c3',
          type: 'momentum.burned',
          payload: { rollEventId: 'e2', tierAfter: 'strong_hit' },
        },
      ] as unknown as AstrolabeEvent[]),
    ).toBe(false);
  });

  it('gets options from the dev stub that pass the check', async () => {
    const result = await createProviderFromEnv({
      ASTROLABE_AI_PROVIDER: 'stub',
    }).generateStructured(
      { purpose: 'complication_options', system: [], user: '' },
      complicationOptionsSchema(ROLLED),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(checkComplicationOptions(result.value, ROLLED, CREW)).toBeUndefined();
  });
});
