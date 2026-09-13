import type { NarrationFrame } from '@astrolabe/shared';

/**
 * Splits an NDJSON byte stream into frames. Network chunks do not respect
 * line boundaries, so a partial line is held until the rest arrives.
 */
export class FrameSplitter {
  #buffer = '';

  /** Feed one decoded chunk; returns the complete frames it finished. */
  push(chunk: string): NarrationFrame[] {
    this.#buffer += chunk;
    const lines = this.#buffer.split('\n');
    this.#buffer = lines.pop() ?? '';
    return lines
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as NarrationFrame);
  }

  /** Whatever is left when the stream ends — a final line with no newline. */
  flush(): NarrationFrame[] {
    const rest = this.#buffer.trim();
    this.#buffer = '';
    return rest.length === 0 ? [] : [JSON.parse(rest) as NarrationFrame];
  }
}
