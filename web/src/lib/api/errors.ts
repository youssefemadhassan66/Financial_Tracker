import type { ApiErrorIssue } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues?: ApiErrorIssue[];

  constructor(
    status: number,
    code: string,
    message: string,
    issues?: ApiErrorIssue[]
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export function parseApiError(status: number, body: unknown): ApiError {
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    (body as { error: unknown }).error &&
    typeof (body as { error: unknown }).error === 'object'
  ) {
    const errorObj = (
      body as {
        error: {
          code?: unknown;
          message?: unknown;
          issues?: unknown;
        };
      }
    ).error;

    const code =
      typeof errorObj.code === 'string' && errorObj.code.trim().length > 0
        ? errorObj.code
        : 'UNKNOWN';

    const message =
      typeof errorObj.message === 'string' && errorObj.message.trim().length > 0
        ? errorObj.message
        : `Request failed with status ${status}`;

    let issues: ApiErrorIssue[] | undefined;
    if (Array.isArray(errorObj.issues)) {
      issues = errorObj.issues
        .filter(
          (issue): issue is { path: string; message: string } =>
            issue &&
            typeof issue === 'object' &&
            typeof issue.path === 'string' &&
            typeof issue.message === 'string'
        )
        .map((issue) => ({
          path: issue.path,
          message: issue.message,
        }));
    }

    return new ApiError(status, code, message, issues);
  }

  const fallbackMessage =
    typeof body === 'string' && body.trim().length > 0
      ? body
      : `Request failed with status ${status}`;

  return new ApiError(status, 'UNKNOWN', fallbackMessage);
}

export function createNetworkError(originalError?: unknown): ApiError {
  const message =
    originalError instanceof Error
      ? originalError.message
      : 'Network request failed';
  return new ApiError(0, 'NETWORK_ERROR', message);
}
