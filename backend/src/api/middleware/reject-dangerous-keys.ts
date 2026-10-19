import type { RequestHandler } from 'express';

/**
 * Rejects JSON bodies carrying prototype-pollution keys or absurd nesting.
 *
 * PROTOTYPE POLLUTION: `JSON.parse('{"__proto__": {"isAdmin": true}}')`
 * yields an object with an own key literally named "__proto__". If any
 * code later deep-merges that object into another (lodash.merge, a naive
 * `Object.assign` loop, a config loader), it writes to Object.prototype —
 * and suddenly EVERY object in the process has `isAdmin === true`.
 *
 * Strict zod schemas already refuse unknown keys, but only where a schema
 * is applied, and only at the levels it describes. This runs on every
 * request before any route, as a second, independent layer.
 *
 * DEPTH: `[[[[[[…]]]]]]` nested thousands deep is cheap to send and
 * expensive to walk recursively. Real requests here are 2–3 levels.
 */

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 10;

export class RequestRejectedError extends Error {
  readonly code = 'REQUEST_REJECTED';
}

function findProblem(value: unknown, depth: number): string | null {
  if (depth > MAX_DEPTH) {
    return 'Request body is nested too deeply';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const problem = findProblem(item, depth + 1);
      if (problem !== null) return problem;
    }
    return null;
  }
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        return `Forbidden key "${key}" in request body`;
      }
      const problem = findProblem((value as Record<string, unknown>)[key], depth + 1);
      if (problem !== null) return problem;
    }
  }
  return null;
}

export const rejectDangerousKeys: RequestHandler = (req, _res, next) => {
  const problem = findProblem(req.body, 0);
  next(problem === null ? undefined : new RequestRejectedError(problem));
};
