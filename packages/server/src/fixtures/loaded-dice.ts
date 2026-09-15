import type { RandomSource } from '@astrolabe/rules';

/**
 * Dice that land where a fixture says (D-122).
 *
 * A fixture plays moves through the real `invokeMove`, so the rules engine
 * still decides what a roll means — only the faces are chosen. That keeps a
 * fixture honest: a scripted weak hit that the rules would score as a strong
 * hit shows up as a failed assertion, not as a campaign state play could
 * never reach.
 *
 * Faces are consumed in the order the rules draw them — for an action roll,
 * the d6 and then both d10s (`rules/src/dice/action-roll.ts`). Drawing more
 * than were loaded throws, so a rules change that rolls an extra die breaks
 * the fixture loudly instead of reading past its script.
 */

export interface Face {
  readonly sides: number;
  readonly face: number;
}

export interface LoadedDice extends RandomSource {
  /** Faces not yet drawn. A finished fixture expects none. */
  readonly remaining: number;
}

export function loadedDice(faces: readonly Face[]): LoadedDice {
  for (const { sides, face } of faces) {
    if (!Number.isInteger(face) || face < 1 || face > sides) {
      throw new Error(`A d${sides} cannot land on ${face}.`);
    }
  }
  const queue = [...faces];
  return {
    next(): number {
      const next = queue.shift();
      if (next === undefined) {
        throw new Error(
          'The loaded dice ran out: the rules drew more dice than the fixture scripted.',
        );
      }
      // The middle of the face's interval, so `floor(next * sides) + 1`
      // lands on it without depending on float rounding at an edge.
      return (next.face - 0.5) / next.sides;
    },
    get remaining() {
      return queue.length;
    },
  };
}

/** One action roll: the action die, then the two challenge dice. */
export function actionRoll(actionDie: number, challenge: readonly [number, number]): LoadedDice {
  return loadedDice([
    { sides: 6, face: actionDie },
    { sides: 10, face: challenge[0] },
    { sides: 10, face: challenge[1] },
  ]);
}
