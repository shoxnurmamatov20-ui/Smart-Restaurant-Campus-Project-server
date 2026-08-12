import type { User } from '@restaurant/types';
import { describe, expect, it } from 'vitest';

import {
  canManageBackups,
  canManageIntegrations,
  canManageUsers,
  canViewAuditLog,
  isSuperAdmin,
} from './index';

/**
 * These decide what the admin UI shows. The server is authoritative, so a bug
 * here is a usability problem rather than a security hole — but a signed-out
 * visitor being handed a backups button is still wrong.
 */
const user = (roles: string[]): User => ({ roles }) as User;

describe('isSuperAdmin', () => {
  it('recognises a platform operator', () => {
    expect(isSuperAdmin(user(['super-admin']))).toBe(true);
  });

  it('does not promote a restaurant owner', () => {
    expect(isSuperAdmin(user(['owner']))).toBe(false);
  });

  it('treats nobody as nobody', () => {
    expect(isSuperAdmin(null)).toBe(false);
  });
});

describe('platform-only actions', () => {
  const platformOnly = [canManageUsers, canViewAuditLog, canManageIntegrations, canManageBackups];

  it('are closed to a waiter and to a signed-out visitor', () => {
    for (const can of platformOnly) {
      expect(can(user(['waiter']))).toBe(false);
      expect(can(null)).toBe(false);
    }
  });

  it('are open to a platform operator', () => {
    for (const can of platformOnly) {
      expect(can(user(['super-admin']))).toBe(true);
    }
  });
});
