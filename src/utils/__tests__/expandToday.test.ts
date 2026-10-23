import { describe, expect, it } from 'vitest';
import { expandTodayTokens } from '../expandToday';

const D = '26-10-17';

describe('expandTodayTokens', () => {
  it('keeps the caret right after a token typed at the caret', () => {
    const text = 'a @today|b'.replace('|', '');
    expect(expandTodayTokens(text, 8, D)).toEqual({ text: `a ${D}b`, cursor: 2 + D.length });
  });

  it('keeps the caret after a trailing space inserted with the token (predictive text)', () => {
    const text = 'line one\nnote @today more\nline three';
    const cursor = 'line one\nnote @today '.length;
    const res = expandTodayTokens(text, cursor, D);
    expect(res.text).toBe(`line one\nnote ${D} more\nline three`);
    expect(res.cursor).toBe(`line one\nnote ${D} `.length);
  });

  it('does not move the caret for tokens after it', () => {
    expect(expandTodayTokens('ab @today', 1, D)).toEqual({ text: `ab ${D}`, cursor: 1 });
  });

  it('places the caret after the date when it was inside the token', () => {
    expect(expandTodayTokens('x @today y', 5, D)).toEqual({
      text: `x ${D} y`,
      cursor: 2 + D.length,
    });
  });

  it('handles several tokens and is case-insensitive', () => {
    const res = expandTodayTokens('@TODAY and @today!', 18, D);
    expect(res.text).toBe(`${D} and ${D}!`);
    expect(res.cursor).toBe(res.text.length);
  });
});
