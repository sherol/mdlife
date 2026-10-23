import { describe, expect, it } from 'vitest';
import { getErrorMessage } from '../errors';

describe('getErrorMessage', () => {
  it('reads the message like err?.message did', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage({ message: 'gapi said no', status: 403 })).toBe('gapi said no');
    expect(getErrorMessage(new Error(''))).toBe('');
  });

  it('is undefined when there is no string message', () => {
    expect(getErrorMessage('text')).toBeUndefined();
    expect(getErrorMessage(null)).toBeUndefined();
    expect(getErrorMessage(undefined)).toBeUndefined();
    expect(getErrorMessage({ code: 1 })).toBeUndefined();
  });
});
