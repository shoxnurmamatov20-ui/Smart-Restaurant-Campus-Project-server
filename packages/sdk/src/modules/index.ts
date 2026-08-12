/**
 * Per-module API clients.
 *
 * Import the one you need — `import { createMenuClient } from '@restaurant/sdk'`
 * — or use `createApi()` from the package root to get all of them wired to a
 * single Axios instance.
 */

export * from './contracts';
export * from './menu';
export * from './orders';
export * from './kitchen';
export * from './tables';
export * from './inventory';
export * from './suppliers';
export * from './staff';
export * from './finance';
export * from './crm';
export * from './analytics';
