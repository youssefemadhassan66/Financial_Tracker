/**
 * Errors raised by use cases.
 *
 * These describe WHAT went wrong in application terms. They say nothing
 * about HTTP — the API layer maps each one to a status code in a single
 * place (the error handler). A use case that threw `res.status(401)`
 * would be welded to Express; one that throws AuthenticationError can be
 * driven from HTTP, a CLI, a queue worker, or a test.
 */
export abstract class ApplicationError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Who are you? Missing, invalid, or expired credentials. */
export class AuthenticationError extends ApplicationError {
  readonly code = 'UNAUTHENTICATED';
}

/**
 * A refresh token that was already used was presented again.
 *
 * Legitimate clients never do this — each refresh returns a NEW token and
 * the old one is dead. Replay means two parties hold the same token, i.e.
 * it was stolen. Kept as its own subclass so the API layer can log it as
 * a security event, while the client still sees a plain 401.
 */
export class RefreshTokenReuseError extends AuthenticationError {}

/** Known identity, but not allowed to do this. */
export class AuthorizationError extends ApplicationError {
  readonly code = 'FORBIDDEN';
}

export class NotFoundError extends ApplicationError {
  readonly code = 'NOT_FOUND';
}

/** The request conflicts with existing state, e.g. an email already registered. */
export class ConflictError extends ApplicationError {
  readonly code = 'CONFLICT';
}
