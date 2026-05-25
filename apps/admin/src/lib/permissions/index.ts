import type { User } from '@campus/types';

/**
 * Client-side permission checks. Server-side enforcement is authoritative.
 * Use these to hide UI elements, not to block actual access.
 */

export function isSuperAdmin(user: User | null): boolean {
  return user?.roles.includes('super-admin') ?? false;
}

export function canManageUsers(user: User | null): boolean {
  return isSuperAdmin(user);
}

export function canViewAuditLog(user: User | null): boolean {
  return isSuperAdmin(user);
}

export function canManageIntegrations(user: User | null): boolean {
  return isSuperAdmin(user);
}

export function canManageBackups(user: User | null): boolean {
  return isSuperAdmin(user);
}
