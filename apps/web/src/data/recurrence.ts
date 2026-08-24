import type { LocalDate, ScheduleRecurrence } from './types';

const MAX_MONTH_STEPS = 48;
const MAX_YEAR_STEPS = 8;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDate(year: number, month: number, day: number): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as LocalDate;
}

function addDays(date: LocalDate, days: number): LocalDate {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10) as LocalDate;
}

export function nextOccurrence(recurrence: ScheduleRecurrence, currentDue: LocalDate): LocalDate | null {
  if (recurrence.frequency === 'ONCE') {
    return null;
  }

  if (recurrence.frequency === 'WEEKLY') {
    return addDays(currentDue, recurrence.intervalWeeks * 7);
  }

  if (recurrence.frequency === 'MONTHLY') {
    let year = Number(currentDue.slice(0, 4));
    let month = Number(currentDue.slice(5, 7));

    for (let step = 0; step < MAX_MONTH_STEPS; step += 1) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
      const available = daysInMonth(year, month);
      if (recurrence.day <= available) return isoDate(year, month, recurrence.day);
      if (recurrence.endOfMonthPolicy === 'CLAMP') return isoDate(year, month, available);
    }
    return null;
  }

  let year = Number(currentDue.slice(0, 4));
  for (let step = 0; step < MAX_YEAR_STEPS; step += 1) {
    year += 1;
    const available = daysInMonth(year, recurrence.month);
    if (recurrence.day <= available) return isoDate(year, recurrence.month, recurrence.day);
    if (recurrence.endOfMonthPolicy === 'CLAMP') return isoDate(year, recurrence.month, available);
  }
  return null;
}
