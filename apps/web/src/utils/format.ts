const currencyFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/London',
});

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/London',
});

const monthFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/London',
});

export function formatMoney(amountMinor: number): string {
  return currencyFormatter.format(amountMinor / 100);
}

export function formatCompactMoney(amountMinor: number): string {
  return compactCurrencyFormatter.format(amountMinor / 100);
}

export function formatDate(localDate: string): string {
  return dateFormatter.format(new Date(`${localDate}T12:00:00Z`));
}

export function formatShortDate(localDate: string): string {
  return shortDateFormatter.format(new Date(`${localDate}T12:00:00Z`));
}

export function formatMonth(month: string): string {
  return monthFormatter.format(new Date(`${month}-01T12:00:00Z`));
}

export function parseGbpInput(value: string): number | null {
  const match = /^\s*(\d{1,9})(?:\.(\d{1,2}))?\s*$/.exec(value);
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
  return `${Math.floor(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, '0')}`;
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
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
import type { Month } from '../data/types';
