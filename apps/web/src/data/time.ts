import type { LocalDate } from './types';

const ZONE = 'Europe/London';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function zonedDate(instant: string): LocalDate {
  return dateFormatter.format(new Date(instant)) as LocalDate;
}

export function zonedTime(instant: string): string {
  return timeFormatter.format(new Date(instant));
}

// Find the instant whose Europe/London wall clock reads the given date and
// time. The zone offset depends on the instant being solved for, so start from
// the naive reading and correct by the drift it produces; this settles within
// two rounds for every offset this zone uses.
export function instantAt(localDate: LocalDate, timeOfDay: string): string {
  const target = Date.parse(`${localDate}T${timeOfDay}Z`);
  let guess = target;

  for (let round = 0; round < 4; round += 1) {
    const iso = new Date(guess).toISOString();
    const drift = target - Date.parse(`${zonedDate(iso)}T${zonedTime(iso)}Z`);
    if (drift === 0) break;
    guess += drift;
  }

  return new Date(guess).toISOString();
}

export function reanchor(occurredAt: string, localDate: LocalDate): string {
  return instantAt(localDate, zonedTime(occurredAt));
}
