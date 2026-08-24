import { describe, expect, it } from 'vitest';

import { PASSWORD_MAX, withinPasswordLimit } from './password-rule';

/**
 * The console's copy of the only limit the API still puts on a typed password.
 *
 * There is no strength rule: the operator types what the restaurant asked for.
 * What is left is `max:72`, and it is not a policy — bcrypt reads the first 72
 * bytes and ignores the rest, so a longer password would be stored and then
 * match anything sharing that prefix. Refusing is the honest answer; truncating
 * without saying so is not.
 *
 * These cases pin the boundary so the browser and the API cannot drift into a
 * console that promises what the server refuses.
 */
describe('the password limit the console checks before posting', () => {
  it('accepts anything the operator types, however weak', () => {
    // The decision this file exists to record: strength is not enforced. A
    // restaurant that dictates `1` gets `1`.
    expect(withinPasswordLimit('1')).toBe(true);
    expect(withinPasswordLimit('parol')).toBe(true);
    expect(withinPasswordLimit('Osh Xona 2026')).toBe(true);
    expect(withinPasswordLimit('Парол')).toBe(true);
  });

  it('refuses one longer than bcrypt would actually read', () => {
    // The off-by-one that a `<` instead of `<=` would introduce: 72 is stored
    // whole, 73 is the first one that would be silently cut.
    expect(withinPasswordLimit('a'.repeat(PASSWORD_MAX))).toBe(true);
    expect(withinPasswordLimit('a'.repeat(PASSWORD_MAX + 1))).toBe(false);
  });

  it('says the limit is seventy-two, which is bcrypt and not a preference', () => {
    // Asserted because the number has a reason. Changing it means changing the
    // hashing algorithm, not changing a rule.
    expect(PASSWORD_MAX).toBe(72);
  });

  it('treats an empty field as within the limit — the panel decides what it means', () => {
    // Empty is "generate one" at the call site, not a password. This function
    // answers a length question and nothing else.
    expect(withinPasswordLimit('')).toBe(true);
  });
});
