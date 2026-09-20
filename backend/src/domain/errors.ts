/**
 * Base class for every rule violation raised from inside the Domain layer.
 *
 * Why a dedicated class instead of throwing a plain Error or a string:
 * the API layer needs to tell "you broke a business rule" (→ HTTP 400,
 * safe to show the message to the user) apart from "something crashed"
 * (→ HTTP 500, log it, hide the details). A single `instanceof DomainError`
 * check in one place (Module 6) does that job for every route at once.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
