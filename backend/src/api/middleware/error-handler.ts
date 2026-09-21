import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { DomainError } from '../../domain/errors.js';
import {
  ApplicationError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  RefreshTokenReuseError,
} from '../../application/errors.js';
import { RequestRejectedError } from './reject-dangerous-keys.js';

/**
 * The ONE place errors become HTTP responses.
 *
 * Every layer below throws plain, meaningful errors; this translates them.
 * Anything unrecognized becomes a generic 500 whose details go to the log
 * and never to the client — a stack trace or SQL message in a response
 * hands an attacker a map of the system.
 */

interface ErrorBody {
  error: {
    code: string;
    message: string;
    issues?: { path: string; message: string }[];
  };
}

function send(res: Parameters<ErrorRequestHandler>[2], status: number, body: ErrorBody): void {
  res.status(status).json(body);
}

/** body-parser marks its own failures with a `type` string. */
function bodyParserType(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'type' in error) {
    const type = (error as { type: unknown }).type;
    return typeof type === 'string' ? type : undefined;
  }
  return undefined;
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    send(res, 400, {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        // Field paths and messages only. Zod does not echo the submitted
        // value by default, so a rejected password never appears here.
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (error instanceof RequestRejectedError) {
    send(res, 400, { error: { code: error.code, message: error.message } });
    return;
  }

  const parserType = bodyParserType(error);
  if (parserType === 'entity.parse.failed') {
    send(res, 400, { error: { code: 'MALFORMED_JSON', message: 'Request body is not valid JSON' } });
    return;
  }
  if (parserType === 'entity.too.large') {
    send(res, 413, { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
    return;
  }

  if (error instanceof ApplicationError) {
    if (error instanceof RefreshTokenReuseError) {
      // The client gets an ordinary 401. The log gets the truth: this is
      // what a stolen token looks like, and someone should know.
      console.warn('[security] refresh token reuse detected — token family revoked');
    }

    const status =
      error instanceof AuthenticationError ? 401
      : error instanceof AuthorizationError ? 403
      : error instanceof NotFoundError ? 404
      : error instanceof ConflictError ? 409
      : 400;

    if (status === 401) {
      // Required by RFC 6750 on a 401 for bearer-token protected routes.
      res.setHeader('WWW-Authenticate', 'Bearer');
    }
    send(res, status, { error: { code: error.code, message: error.message } });
    return;
  }

  if (error instanceof DomainError) {
    send(res, 400, { error: { code: 'DOMAIN_RULE_VIOLATION', message: error.message } });
    return;
  }

  console.error('[unhandled]', error);
  send(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
};

export const notFound: RequestHandler = (_req, res) => {
  send(res, 404, { error: { code: 'NOT_FOUND', message: 'Route not found' } });
};
