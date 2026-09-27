import { describe, expect, it } from 'vitest';
import { ApiError } from './errors';
import { toFormErrors } from './form-errors';

describe('toFormErrors', () => {
  it('puts validation issues under their fields and unknown paths in the general message', () => {
    const err = new ApiError(400, 'VALIDATION_FAILED', 'Request validation failed', [
      { path: 'email', message: 'Invalid email' },
      { path: 'body', message: 'Unknown key "foo"' },
    ]);
    expect(toFormErrors(err, ['email', 'password'])).toEqual({
      fields: { email: 'Invalid email' },
      general: 'Unknown key "foo"',
    });
  });

  it('uses the per-status wording when given', () => {
    const err = new ApiError(401, 'UNAUTHENTICATED', 'Invalid credentials');
    expect(toFormErrors(err, ['email'], { 401: 'Wrong email or password.' }).general).toBe('Wrong email or password.');
  });

  it('maps network, rate limit and server errors to friendly messages', () => {
    expect(toFormErrors(new ApiError(0, 'NETWORK_ERROR', 'x'), []).general).toMatch(/Cannot reach the server/);
    expect(toFormErrors(new ApiError(429, 'RATE_LIMITED', 'x'), []).general).toMatch(/Too many attempts/);
    expect(toFormErrors(new ApiError(500, 'INTERNAL_ERROR', 'x'), []).general).toMatch(/on our side/);
  });

  it('never shows raw text for unknown throwables', () => {
    expect(toFormErrors(new TypeError('boom'), []).general).toBe('Something went wrong. Please try again.');
  });
});
