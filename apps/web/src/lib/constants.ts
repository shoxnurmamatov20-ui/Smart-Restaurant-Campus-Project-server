export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'CAMPUS';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';
export const AI_URL = process.env.NEXT_PUBLIC_AI_URL ?? 'http://localhost:8001';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080';

export const SESSION_COOKIE = 'campus_session';
export const XSRF_COOKIE = 'XSRF-TOKEN';

export const DEFAULT_LOCALE = 'uz';
export const SUPPORTED_LOCALES = ['uz', 'ru', 'en'] as const;
