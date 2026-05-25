/**
 * Shared Tailwind v4 design tokens for CAMPUS.
 * Tailwind v4 is CSS-first — most config lives in @theme blocks in CSS.
 * This file exports shared TypeScript constants for use in apps.
 */

export const brandColors = {
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    900: '#1e3a8a',
  },
  accent: {
    500: '#f59e0b',
    600: '#d97706',
  },
} as const;

export const fontFamilies = {
  sans: ['var(--font-geist-sans)', 'Inter', 'system-ui', 'sans-serif'],
  mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
  serif: ['Georgia', 'serif'],
  // For Cyrillic / Latin Uzbek mix
  uzbek: ['var(--font-uzbek)', 'Inter', 'system-ui', 'sans-serif'],
} as const;

export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
} as const;

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;
