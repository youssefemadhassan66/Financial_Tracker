/**
 * The current time, as a dependency.
 *
 * Token expiry, refresh-token rotation and "is this SMS dated in the
 * future" all depend on the clock. Calling `new Date()` inside a use case
 * makes those rules untestable — you cannot wait 30 days in a unit test.
 * Injecting a Clock lets a test move time forward instantly.
 */
export interface Clock {
  now(): Date;
}
