import type { Month } from '../data/types';

export function parseGbpInput(value: string, groupSeparator = ','): number | null {
  const bare = value.replace(/[£\s]/g, '').split(groupSeparator).join('');
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(bare);
  if (!match) {
    return null;
  }

  const pounds = match[1];
  if (!pounds) {
    return null;
  }

  const pence = (match[2] ?? '').padEnd(2, '0');
  const amount = Number(pounds) * 100 + Number(pence);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function toGbpInput(amountMinor: number): string {
  const sign = amountMinor < 0 ? '-' : '';
  const magnitude = Math.abs(amountMinor);
  return `${sign}${Math.floor(magnitude / 100)}.${String(magnitude % 100).padStart(2, '0')}`;
}

export function previousMonth(month: Month): Month {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7) as Month;
}

export function nextMonth(month: Month): Month {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7) as Month;
}

export function joinClassNames(...values: ReadonlyArray<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
