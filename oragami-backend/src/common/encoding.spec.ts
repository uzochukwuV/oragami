import {
  jurisdictionToBytes,
  sha256Hex,
  strToBytes34,
  strToBytes64,
} from './encoding';

describe('encoding', () => {
  describe('strToBytes64', () => {
    it('pads short strings with zeros', () => {
      const out = strToBytes64('Hi');
      expect(out).toHaveLength(64);
      expect(out[0]).toBe('H'.charCodeAt(0));
      expect(out[1]).toBe('i'.charCodeAt(0));
      expect(out[2]).toBe(0);
    });

    it('truncates strings longer than 64 bytes', () => {
      const long = 'x'.repeat(80);
      const out = strToBytes64(long);
      expect(out).toHaveLength(64);
      expect(out.every((b) => b === 'x'.charCodeAt(0))).toBe(true);
    });
  });

  describe('jurisdictionToBytes', () => {
    it('uppercases and fits in 4 bytes', () => {
      expect(jurisdictionToBytes('ch')).toEqual([
        67, 72, 0, 0,
      ]);
    });
  });

  describe('strToBytes34', () => {
    it('pads to 34 bytes', () => {
      const out = strToBytes34('IBAN');
      expect(out).toHaveLength(34);
    });
  });

  describe('sha256Hex', () => {
    it('returns 32-byte digest', () => {
      const d = sha256Hex('test');
      expect(d).toHaveLength(32);
      expect(sha256Hex('test').equals(sha256Hex('test'))).toBe(true);
    });
  });
});
