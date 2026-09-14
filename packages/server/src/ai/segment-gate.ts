import {
  checkSegmentTags,
  checkSegmentText,
  type SegmentAbout,
  type SegmentContext,
  type SegmentTags,
} from './context/segments.js';
import { JsonStream, type JsonPath } from './json-stream.js';

/**
 * Reads a segmented passage as its JSON streams, and lets text through to
 * the player only once D-127's checks have passed on it (task 7.14).
 *
 * A segment's text is held until its tags have arrived and passed. After
 * that, text is released up to the last word boundary, and only after the
 * text checks pass on everything up to that boundary. A player character's
 * name in a `world` segment, or a quotation mark below Full voice, is caught
 * before any part of it is shown. The first failure stops all further text.
 * The stream still runs to its end, and the caller rejects the attempt with
 * `problem`.
 */

interface OpenSegment {
  about: SegmentAbout | undefined;
  character: string | null | undefined;
  basis: string[];
  basisClosed: boolean;
  text: string;
  released: number;
  /** Whether any of its text has reached the player. */
  shown: boolean;
  checked: boolean;
}

export class SegmentGate {
  readonly #ctx: SegmentContext;
  readonly #release: (text: string) => void;
  readonly #json: JsonStream;
  readonly #segments = new Map<number, OpenSegment>();
  #releasedAny = false;
  #problem: string | undefined;

  constructor(ctx: SegmentContext, release: (text: string) => void) {
    this.#ctx = ctx;
    this.#release = release;
    this.#json = new JsonStream({
      value: (path, value) => {
        const at = this.#at(path);
        if (at === undefined) {
          return;
        }
        const [segment, field] = at;
        if (field === 'about' && typeof value === 'string') {
          segment.about = value as SegmentAbout;
        } else if (field === 'character' && (typeof value === 'string' || value === null)) {
          segment.character = value;
        } else if (field === 'basis' && typeof value === 'string') {
          segment.basis.push(value);
        }
      },
      stringChunk: (path, chunk) => {
        const at = this.#at(path);
        if (at?.[1] === 'text') {
          at[0].text += chunk;
          this.#advance(at[0], false);
        }
      },
      close: (path) => {
        if (path.length === 3 && path[2] === 'basis') {
          const at = this.#at(path);
          if (at !== undefined) {
            at[0].basisClosed = true;
          }
        } else if (path.length === 2 && path[0] === 'segments' && typeof path[1] === 'number') {
          const segment = this.#segments.get(path[1]);
          if (segment !== undefined) {
            this.#advance(segment, true);
          }
        }
      },
    });
  }

  /** The first check that failed, in words. */
  get problem(): string | undefined {
    return this.#problem;
  }

  write(json: string): void {
    this.#json.write(json);
  }

  #at(path: JsonPath): [OpenSegment, string] | undefined {
    const [root, index, field] = path;
    if (root !== 'segments' || typeof index !== 'number' || typeof field !== 'string') {
      return undefined;
    }
    let segment = this.#segments.get(index);
    if (segment === undefined) {
      segment = {
        about: undefined,
        character: undefined,
        basis: [],
        basisClosed: false,
        text: '',
        released: 0,
        shown: false,
        checked: false,
      };
      this.#segments.set(index, segment);
    }
    return [segment, field];
  }

  #advance(segment: OpenSegment, finished: boolean): void {
    if (this.#problem !== undefined) {
      return;
    }
    const tags = tagsOf(segment);
    if (tags === undefined) {
      if (finished) {
        this.#problem = 'A segment arrived without its tags.';
      }
      return;
    }
    if (!segment.checked) {
      this.#problem = checkSegmentTags(tags, this.#ctx);
      segment.checked = true;
      if (this.#problem !== undefined) {
        return;
      }
    }

    const upTo = finished ? segment.text.length : lastBoundary(segment.text);
    if (upTo <= segment.released) {
      return;
    }
    this.#problem = checkSegmentText(tags, segment.text.slice(0, upTo), this.#ctx);
    if (this.#problem !== undefined) {
      return;
    }

    let piece = segment.text.slice(segment.released, upTo);
    segment.released = upTo;
    if (!segment.shown) {
      piece = piece.trimStart();
      if (piece.length === 0) {
        return;
      }
      if (this.#releasedAny) {
        piece = ` ${piece}`;
      }
      segment.shown = true;
    }
    if (piece.length > 0) {
      this.#releasedAny = true;
      this.#release(piece);
    }
  }
}

function tagsOf(segment: OpenSegment): SegmentTags | undefined {
  return segment.about === undefined || segment.character === undefined || !segment.basisClosed
    ? undefined
    : { about: segment.about, character: segment.character, basis: segment.basis };
}

/** Just past the last character that isn't part of a word, so no name is shown half-checked. */
function lastBoundary(text: string): number {
  for (let i = text.length - 1; i >= 0; i--) {
    if (!/[\p{L}\p{N}'’-]/u.test(text[i] ?? '')) {
      return i + 1;
    }
  }
  return 0;
}
