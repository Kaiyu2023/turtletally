import { describe, expect, it } from 'vitest';
import { parseGbpInput, toGbpInput } from '../utils/format';

describe('parseGbpInput accepts what the application displays', () => {
  it('accepts a value carrying the currency symbol and group separators', () => {
    expect(parseGbpInput('£1,234.56')).toBe(123_456);
    expect(parseGbpInput('1,234.56')).toBe(123_456);
    expect(parseGbpInput(' £12.00 ')).toBe(1_200);
  });

  it('still accepts a bare value', () => {
    expect(parseGbpInput('48.75')).toBe(4_875);
    expect(parseGbpInput('7')).toBe(700);
  });

  it('honours a locale that groups differently', () => {
    expect(parseGbpInput('1 234.56', ' ')).toBe(123_456);
  });

  it('rejects what is not an amount', () => {
    expect(parseGbpInput('')).toBeNull();
    expect(parseGbpInput('abc')).toBeNull();
    expect(parseGbpInput('1.234')).toBeNull();
    expect(parseGbpInput('-5.00')).toBeNull();
  });

  it('round-trips a displayed value back through the parser', () => {
    for (const minor of [1, 99, 100, 4_875, 123_456, 999_999]) {
      expect(parseGbpInput(toGbpInput(minor))).toBe(minor);
    }
  });
});
