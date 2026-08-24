import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { AppLocale } from '../data/types';

type MessageValues = Readonly<Record<string, string | number>>;

export type MessageCatalog<Key extends string> = Readonly<Record<AppLocale, Readonly<Record<Key, string>>>>;

export function defineMessages<const English extends Readonly<Record<string, string>>>(
  english: English,
  simplifiedChinese: { readonly [Key in keyof English]: string },
) {
  return {
    'en-GB': english,
    'zh-CN': simplifiedChinese,
  } as const;
}

function renderMessage(template: string, values: MessageValues): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder,
  );
}

export function message<const Key extends string>(
  locale: AppLocale,
  catalog: MessageCatalog<Key>,
  key: Key,
  values: MessageValues = {},
): string {
  return renderMessage(catalog[locale][key], values);
}

function localDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

function createFormatters(locale: AppLocale) {
  const money = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  });
  const compactMoney = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'GBP',
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  });
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/London',
  });
  const shortDate = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/London',
  });
  const month = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/London',
  });
  const day = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    timeZone: 'Europe/London',
  });
  const shortMonth = new Intl.DateTimeFormat(locale, {
    month: 'short',
    timeZone: 'Europe/London',
  });

  const currencySymbol = money.formatToParts(0).find((part) => part.type === 'currency')?.value ?? '';
  const groupSeparator = number.formatToParts(1_000).find((part) => part.type === 'group')?.value ?? '';

  return {
    currencySymbol: () => currencySymbol,
    groupSeparator: () => groupSeparator,
    money: (amountMinor: number) => money.format(amountMinor / 100),
    compactMoney: (amountMinor: number) => compactMoney.format(amountMinor / 100),
    number: (value: number) => number.format(value),
    percent: (value: number) => percent.format(value),
    date: (value: string) => date.format(localDate(value)),
    shortDate: (value: string) => shortDate.format(localDate(value)),
    month: (value: string) => month.format(localDate(`${value}-01`)),
    day: (value: string) => day.format(localDate(value)),
    shortMonth: (value: string) => shortMonth.format(localDate(value)),
  };
}

export type LocaleFormatters = ReturnType<typeof createFormatters>;

type LocaleContextValue = {
  readonly locale: AppLocale;
  readonly format: LocaleFormatters;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ locale, children }: { readonly locale: AppLocale; readonly children: ReactNode }) {
  const format = useMemo(() => createFormatters(locale), [locale]);
  const value = useMemo(() => ({ locale, format }), [format, locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return value;
}

export function useMessages<const Key extends string>(catalog: MessageCatalog<Key>) {
  const { locale } = useLocale();
  return useCallback(
    (key: Key, values: MessageValues = {}) => message(locale, catalog, key, values),
    [catalog, locale],
  );
}

// Only a base with an `_other` form is accepted, because that form is the
// fallback when a locale has no rule for the selected category.
type PluralBase<Key extends string> = Key extends `${infer Base}_other` ? Base : never;

export function usePlural<const Key extends string>(catalog: MessageCatalog<Key>) {
  const { locale } = useLocale();
  return useCallback(
    (base: PluralBase<Key>, count: number, values: MessageValues = {}) => {
      const rule = new Intl.PluralRules(locale).select(count);
      const selected = `${base}_${rule}` as Key;
      const chosen = selected in catalog[locale] ? selected : (`${base}_other` as Key);
      return message(locale, catalog, chosen, { ...values, count });
    },
    [catalog, locale],
  );
}
