/**
 * An incremental JSON reader for structured output that streams (D-127).
 *
 * A segmented passage arrives as JSON text a few characters at a time, and
 * a segment's tags have to be read and checked before any of its text is
 * shown. `JSON.parse` needs the whole document, so this reads one character
 * at a time and reports what it has as soon as it has it: every complete
 * scalar with its path, each piece of a string value as it arrives
 * (unescaped), and each object or array as it closes.
 *
 * It trusts its input to be well formed — the provider constrains the
 * output to the schema, and the complete text is parsed and validated again
 * once the stream ends. Malformed input produces nonsense events, never a
 * throw, and the final validation rejects it.
 */

export type JsonPath = readonly (string | number)[];
export type JsonScalar = string | number | boolean | null;

export interface JsonStreamHandlers {
  /** A string, number, boolean or null finished at `path`. */
  value?(path: JsonPath, value: JsonScalar): void;
  /** More of the string value at `path` arrived. Pieces concatenate to the finished value. */
  stringChunk?(path: JsonPath, chunk: string): void;
  /** The object or array at `path` closed. */
  close?(path: JsonPath): void;
}

type Frame =
  | { kind: 'object'; key: string | undefined; expectingKey: boolean }
  | { kind: 'array'; index: number };

interface OpenString {
  readonly isKey: boolean;
  text: string;
  /** Text not yet handed to `stringChunk`. */
  pending: string;
  escape: boolean;
  unicode: string | undefined;
}

const ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
};

export class JsonStream {
  readonly #handlers: JsonStreamHandlers;
  readonly #stack: Frame[] = [];
  #string: OpenString | undefined;
  #literal: string | undefined;

  constructor(handlers: JsonStreamHandlers) {
    this.#handlers = handlers;
  }

  write(chunk: string): void {
    for (const ch of chunk) {
      this.#read(ch);
    }
    const open = this.#string;
    if (open !== undefined && !open.isKey && open.pending.length > 0) {
      this.#handlers.stringChunk?.(this.#path(this.#stack), open.pending);
      open.pending = '';
    }
  }

  #read(ch: string): void {
    const open = this.#string;
    if (open !== undefined) {
      this.#readString(open, ch);
      return;
    }
    if (this.#literal !== undefined) {
      if (!/[\s,\]}]/u.test(ch)) {
        this.#literal += ch;
        return;
      }
      this.#closeLiteral();
    }
    if (/\s/u.test(ch)) {
      return;
    }

    const top = this.#stack.at(-1);
    switch (ch) {
      case '{':
        this.#stack.push({ kind: 'object', key: undefined, expectingKey: true });
        return;
      case '[':
        this.#stack.push({ kind: 'array', index: 0 });
        return;
      case '}':
      case ']':
        this.#stack.pop();
        this.#handlers.close?.(this.#path(this.#stack));
        return;
      case ':':
        return;
      case ',':
        if (top?.kind === 'object') {
          top.expectingKey = true;
        } else if (top?.kind === 'array') {
          top.index++;
        }
        return;
      case '"':
        this.#string = {
          isKey: top?.kind === 'object' && top.expectingKey,
          text: '',
          pending: '',
          escape: false,
          unicode: undefined,
        };
        return;
      default:
        this.#literal = ch;
    }
  }

  #readString(open: OpenString, ch: string): void {
    if (open.unicode !== undefined) {
      open.unicode += ch;
      if (open.unicode.length === 4) {
        this.#append(open, String.fromCharCode(Number.parseInt(open.unicode, 16)));
        open.unicode = undefined;
      }
      return;
    }
    if (open.escape) {
      open.escape = false;
      if (ch === 'u') {
        open.unicode = '';
      } else {
        this.#append(open, ESCAPES[ch] ?? ch);
      }
      return;
    }
    if (ch === '\\') {
      open.escape = true;
      return;
    }
    if (ch !== '"') {
      this.#append(open, ch);
      return;
    }

    this.#string = undefined;
    const top = this.#stack.at(-1);
    if (open.isKey && top?.kind === 'object') {
      top.key = open.text;
      top.expectingKey = false;
      return;
    }
    const path = this.#path(this.#stack);
    if (open.pending.length > 0) {
      this.#handlers.stringChunk?.(path, open.pending);
    }
    this.#handlers.value?.(path, open.text);
  }

  #append(open: OpenString, text: string): void {
    open.text += text;
    if (!open.isKey) {
      open.pending += text;
    }
  }

  #closeLiteral(): void {
    const literal = this.#literal ?? '';
    this.#literal = undefined;
    const value: JsonScalar =
      literal === 'true'
        ? true
        : literal === 'false'
          ? false
          : literal === 'null'
            ? null
            : Number(literal);
    this.#handlers.value?.(this.#path(this.#stack), value);
  }

  #path(frames: readonly Frame[]): JsonPath {
    return frames.map((frame) => (frame.kind === 'object' ? (frame.key ?? '') : frame.index));
  }
}
