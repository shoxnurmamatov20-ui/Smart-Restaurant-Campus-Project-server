/**
 * The one limit on a password an operator types.
 *
 * There is no strength rule. That is the platform owner's decision and it has
 * moved twice — typed passwords refused outright, then allowed behind twelve
 * characters with letters and digits, now allowed as typed — because the
 * restaurants ring up and dictate what they want, and a console that argues with
 * a customer about their own password is one the operator works around by
 * writing it on paper.
 *
 * What remains is not a policy. **bcrypt reads the first 72 bytes and silently
 * ignores the rest**, so a longer password would be accepted, stored, and then
 * match on any string sharing those first 72 bytes. Refusing is the honest
 * answer; truncating without saying so is not.
 *
 * The API enforces the same limit in `IssueOwnerPasswordRequest` and always
 * will. This copy exists so the console can say it before the round trip rather
 * than after — a browser check is a courtesy, never a guard.
 */

/** What bcrypt actually reads. Not a policy — a property of the algorithm. */
export const PASSWORD_MAX = 72;

/** Whether this string can be stored as typed, rather than quietly truncated. */
export function withinPasswordLimit(value: string): boolean {
  return value.length <= PASSWORD_MAX;
}
