import { Decimal } from 'decimal.js';
import { DomainError } from './errors.js';
import type { Currency } from './currency.js';

/**
 * Money is a VALUE OBJECT, not an entity.
 *
 * The difference: an entity is defined by identity ("this specific
 * transaction, #451, regardless of what changes about it"). A value
 * object is defined entirely by its data — two Money instances holding
 * 100 EGP are simply equal, there is no "which one is the real one."
 *
 * Consequences of that:
 *  - No id field. It doesn't need one.
 *  - Immutable. add()/subtract() return a NEW Money, they never mutate.
 *    Same reason Date arithmetic in most good APIs returns a new Date —
 *    shared mutable value objects are a source of bugs that are hard
 *    to trace, because some other code held a reference and changed it
 *    under you.
 *  - Equality is by value (`a.equals(b)`), never by reference (`a === b`).
 */
export class Money {
  private constructor(
    private readonly amount: Decimal,
    private readonly currency: Currency,
  ) {}

  /**
   * The only way to construct a Money. Private constructor + static
   * factory means invalid money can never exist — every caller, whether
   * it's the SMS parser, an HTTP handler, or a test, is forced through
   * this same validation gate.
   */
  static create(amount: Decimal.Value, currency: Currency): Money {
    const value = new Decimal(amount);

    if (!value.isFinite()) {
      throw new DomainError('Money amount must be a finite number');
    }
    if (value.isNegative()) {
      throw new DomainError('Money amount cannot be negative');
    }
    // Bank amounts never carry more than 2 decimal places. A third
    // decimal place almost always means a parsing bug upstream, not
    // a real fraction of a piastre.
    if (value.decimalPlaces() > 2) {
      throw new DomainError('Money amount cannot have more than 2 decimal places');
    }

    return new Money(value, currency);
  }

  static zero(currency: Currency): Money {
    return new Money(new Decimal(0), currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    const result = this.amount.minus(other.amount);
    if (result.isNegative()) {
      throw new DomainError(
        `Cannot subtract ${other.toString()} from ${this.toString()}: result would be negative`,
      );
    }
    return new Money(result, this.currency);
  }

  /**
   * Multiplies by numerator/denominator, rounding HALF-UP to 2 places.
   * e.g. a weekly charge's monthly equivalent is amount.scale(52, 12).
   *
   * The ONLY operation on Money that rounds, and it says so in its name
   * and here. 20.00 USD / 12 is 1.6666… — someone has to decide what
   * happens to the remainder, and hiding that decision inside a
   * general-purpose multiply() is how cents quietly go missing.
   * Multiply first, divide last, so the error is introduced once.
   */
  scale(numerator: number, denominator: number): Money {
    if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || numerator < 0 || denominator <= 0) {
      throw new DomainError('Money can only be scaled by a non-negative whole-number ratio');
    }
    const scaled = this.amount.times(numerator).dividedBy(denominator).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return new Money(scaled, this.currency);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.greaterThan(other.amount);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  getCurrency(): Currency {
    return this.currency;
  }

  /** Exposed for persistence/serialization boundaries only — Infrastructure
   *  reads this to store a numeric(18,2), the API layer reads it to put a
   *  string on the wire. Domain code itself should stay on Money methods. */
  toDecimalString(): string {
    return this.amount.toFixed(2);
  }

  toString(): string {
    return `${this.toDecimalString()} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new DomainError(`Cannot combine ${this.currency} and ${other.currency}`);
    }
  }
}
