import { describe, expect, it } from 'vitest';
import { instantAt, reanchor, zonedDate, zonedTime } from './time';

describe('Europe/London conversion', () => {
  it('reads the local date across the UTC boundary', () => {
    expect(zonedDate('2026-01-15T23:30:00.000Z')).toBe('2026-01-15');
    expect(zonedDate('2026-07-15T23:30:00.000Z')).toBe('2026-07-16');
  });

  it('finds the instant for a wall-clock time in winter and in summer', () => {
    expect(instantAt('2026-01-15', '12:00:00')).toBe('2026-01-15T12:00:00.000Z');
    expect(instantAt('2026-07-15', '12:00:00')).toBe('2026-07-15T11:00:00.000Z');
  });

  it('round-trips a wall-clock time through an instant', () => {
    for (const date of ['2026-01-15', '2026-03-29', '2026-06-01', '2026-10-25', '2026-12-31'] as const) {
      const instant = instantAt(date, '09:30:00');
      expect(zonedDate(instant)).toBe(date);
      expect(zonedTime(instant)).toBe('09:30:00');
    }
  });

  it('keeps the wall-clock time when a record moves to another date', () => {
    const winter = instantAt('2026-01-15', '18:45:00');
    const moved = reanchor(winter, '2026-07-20');

    expect(zonedDate(moved)).toBe('2026-07-20');
    expect(zonedTime(moved)).toBe('18:45:00');
    expect(moved).not.toBe(winter);
  });
});
