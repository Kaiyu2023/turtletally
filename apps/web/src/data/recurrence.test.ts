import { describe, expect, it } from 'vitest';
import { nextOccurrence } from './recurrence';

describe('nextOccurrence', () => {
  it('has no successor for a one-off', () => {
    expect(nextOccurrence({ frequency: 'ONCE', date: '2026-08-24' }, '2026-08-24')).toBeNull();
  });

  it('advances weekly by the configured interval and keeps the weekday', () => {
    expect(nextOccurrence({ frequency: 'WEEKLY', weekday: 'SATURDAY', intervalWeeks: 1 }, '2026-08-22')).toBe(
      '2026-08-29',
    );
    expect(nextOccurrence({ frequency: 'WEEKLY', weekday: 'SATURDAY', intervalWeeks: 4 }, '2026-08-22')).toBe(
      '2026-09-19',
    );
  });

  it('advances monthly and rolls into the next year', () => {
    expect(nextOccurrence({ frequency: 'MONTHLY', day: 2, endOfMonthPolicy: 'CLAMP' }, '2026-12-02')).toBe(
      '2027-01-02',
    );
  });

  it('clamps a month that is too short', () => {
    expect(nextOccurrence({ frequency: 'MONTHLY', day: 31, endOfMonthPolicy: 'CLAMP' }, '2026-08-31')).toBe(
      '2026-09-30',
    );
    expect(nextOccurrence({ frequency: 'MONTHLY', day: 30, endOfMonthPolicy: 'CLAMP' }, '2027-01-30')).toBe(
      '2027-02-28',
    );
  });

  it('skips a month that is too short when asked to', () => {
    expect(nextOccurrence({ frequency: 'MONTHLY', day: 31, endOfMonthPolicy: 'SKIP' }, '2026-08-31')).toBe(
      '2026-10-31',
    );
    expect(nextOccurrence({ frequency: 'MONTHLY', day: 30, endOfMonthPolicy: 'SKIP' }, '2027-01-30')).toBe(
      '2027-03-30',
    );
  });

  it('handles the 29 February case both ways', () => {
    expect(nextOccurrence({ frequency: 'YEARLY', month: 2, day: 29, endOfMonthPolicy: 'CLAMP' }, '2028-02-29')).toBe(
      '2029-02-28',
    );
    expect(nextOccurrence({ frequency: 'YEARLY', month: 2, day: 29, endOfMonthPolicy: 'SKIP' }, '2028-02-29')).toBe(
      '2032-02-29',
    );
  });

  it('advances yearly on an ordinary date', () => {
    expect(nextOccurrence({ frequency: 'YEARLY', month: 9, day: 11, endOfMonthPolicy: 'CLAMP' }, '2026-09-11')).toBe(
      '2027-09-11',
    );
  });
});
