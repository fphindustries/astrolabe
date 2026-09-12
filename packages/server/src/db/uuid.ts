import { randomBytes } from 'node:crypto';

/**
 * UUID v7: a 48-bit millisecond timestamp followed by randomness, so ids
 * sort by creation time.
 *
 * That ordering is the reason for choosing v7 over the v4 that
 * `crypto.randomUUID` produces. `events.id` carries a unique index, and
 * random v4 ids scatter inserts across the whole btree; v7 ids append to
 * one end of it. Fifteen lines here rather than a dependency, for the same
 * reason the rules package wrote its own PRNG: this is not cryptography,
 * and the implementation is short enough to read.
 *
 * Node has no built-in v7 as of 22.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);

  // 48-bit big-endian timestamp in the first six bytes.
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;

  // Version 7 in the high nibble of byte 6, RFC 4122 variant in byte 8.
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
