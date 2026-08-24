import { describe, expect, it } from 'vitest';

import { todayLabel } from './today-label';

describe('todayLabel', () => {
  const tuesday = new Date(2026, 7, 11, 9, 0, 0);

  it('writes the day the way the design wrote its mock, in each language', () => {
    expect(todayLabel('uz', tuesday)).toBe('Seshanba, 11-avgust');
    expect(todayLabel('ru', tuesday)).toBe('Вторник, 11 августа');
    expect(todayLabel('en', tuesday)).toBe('Tuesday, 11 August');
  });

  it('is the clock, not the catalogue', () => {
    expect(todayLabel('uz', new Date(2026, 7, 22, 9, 0, 0))).toBe('Shanba, 22-avgust');
  });
});
