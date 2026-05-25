import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes intelligently.
 * Usage: cn('p-4', isLarge && 'p-8', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a number with Uzbek locale conventions.
 */
export function formatNumber(value: number, locale: 'uz' | 'ru' | 'en' = 'uz'): string {
  const localeMap = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' };
  return new Intl.NumberFormat(localeMap[locale]).format(value);
}

/**
 * Format currency (sums by default).
 */
export function formatCurrency(
  value: number,
  currency: 'UZS' | 'USD' | 'EUR' | 'RUB' = 'UZS',
  locale: 'uz' | 'ru' | 'en' = 'uz',
): string {
  const localeMap = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' };
  return new Intl.NumberFormat(localeMap[locale], {
    style: 'currency',
    currency,
  }).format(value);
}

/**
 * Truncate string to N chars with ellipsis.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

/**
 * Sleep helper (for tests/demos).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Type-safe Object.entries.
 */
export function entries<T extends Record<string, unknown>>(obj: T): Array<[keyof T, T[keyof T]]> {
  return Object.entries(obj) as Array<[keyof T, T[keyof T]]>;
}

/**
 * Type-safe Object.keys.
 */
export function keys<T extends Record<string, unknown>>(obj: T): Array<keyof T> {
  return Object.keys(obj) as Array<keyof T>;
}
