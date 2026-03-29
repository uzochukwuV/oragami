import { createHash } from 'crypto';

/** UTF-8 encode and null-pad to 64 bytes (Solstice / vault fixed-width strings). */
export function strToBytes64(s: string): number[] {
  const buf = Buffer.alloc(64);
  const enc = Buffer.from(s, 'utf8');
  if (enc.length > 64) {
    enc.copy(buf, 0, 0, 64);
  } else {
    enc.copy(buf, 0);
  }
  return [...buf];
}

/** ISO 3166-1 alpha-2 (e.g. CH) → 4 bytes UTF-8, null-padded. */
export function jurisdictionToBytes(s: string): number[] {
  const buf = Buffer.alloc(4);
  const trimmed = s.trim().toUpperCase().slice(0, 4);
  Buffer.from(trimmed, 'utf8').copy(buf, 0);
  return [...buf];
}

export function strToBytes34(s: string): number[] {
  const buf = Buffer.alloc(34);
  const enc = Buffer.from(s, 'utf8');
  if (enc.length > 34) {
    enc.copy(buf, 0, 0, 34);
  } else {
    enc.copy(buf, 0);
  }
  return [...buf];
}

export function sha256Hex(data: string | Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}
