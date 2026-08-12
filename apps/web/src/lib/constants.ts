export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Restaurant Campus';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';
export const AI_URL = process.env.NEXT_PUBLIC_AI_URL ?? 'http://localhost:8001';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080';

export const SESSION_COOKIE = 'restaurant_campus_session';
export const XSRF_COOKIE = 'XSRF-TOKEN';

/** Header the API reads to decide which restaurant a request belongs to. */
export const TENANT_HEADER = 'X-Tenant';

export const DEFAULT_LOCALE = 'uz';
export const SUPPORTED_LOCALES = ['uz', 'ru', 'en'] as const;

/**
 * How a visitor reaches sales. Configuration rather than copy, so it lives
 * here instead of in the message catalogues — a phone number is the same
 * number in Uzbek, Russian and English.
 */
export const CONTACT = {
  phone: '+998 71 200 40 40',
  telegram: '@smartrestaurant_uz',
  telegramUrl: 'https://t.me/smartrestaurant_uz',
  email: 'sales@smartrestaurant.uz',
} as const;

/** `tel:` wants the digits without the spaces the display form carries. */
export const CONTACT_TEL = `tel:${CONTACT.phone.replace(/\s/g, '')}`;

/** Where an order came from — mirrors MenuItem::CHANNELS on the API. */
export const SALES_CHANNELS = ['dine_in', 'takeaway', 'delivery', 'aggregator'] as const;

/** Kitchen stations a dish can be routed to. */
export const KITCHEN_STATIONS = ['hot', 'cold', 'grill', 'bar', 'pastry'] as const;

/**
 * Money crosses the wire as an integer number of tiyin (1 UZS = 100 tiyin).
 * Format at the edge, never store the formatted value.
 */
export const CURRENCY = 'UZS';
export const TIYIN_PER_SOM = 100;
