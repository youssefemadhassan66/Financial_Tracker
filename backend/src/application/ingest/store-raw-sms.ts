import { createHash } from 'node:crypto';
import type { UserId } from '../../domain/ids.js';
import { DomainError } from '../../domain/errors.js';
import type { Clock } from '../ports/clock.js';
import type { RawMessageRepository } from '../ports/repositories.js';

export interface IncomingSms {
  sender: string;
  body: string;
  receivedAt: Date;
}

/**
 * Tolerance for the phone's clock running ahead of the server's. Phones
 * sync time over the network, but a few minutes of drift is common.
 */
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Stores an SMS exactly as received, for parsing later.
 *
 * Parsing into a transaction is a separate step (the SMS parser module).
 * Storing the raw text first means a parser bug never loses a message:
 * fix the parser, then re-run it over everything stored.
 */
export class StoreRawSms {
  constructor(
    private readonly rawMessages: RawMessageRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: UserId,
    deviceKeyId: string,
    sms: IncomingSms,
  ): Promise<{ id: string; duplicate: boolean }> {
    if (sms.receivedAt.getTime() > this.clock.now().getTime() + CLOCK_SKEW_TOLERANCE_MS) {
      throw new DomainError('SMS receivedAt cannot be in the future');
    }

    return this.rawMessages.insertIfNew({
      userId,
      deviceKeyId,
      sender: sms.sender,
      body: sms.body,
      receivedAt: sms.receivedAt,
      sha256: fingerprint(userId, sms),
    });
  }
}

/**
 * The dedupe key. A forwarder retrying on bad signal sends the identical
 * payload, which produces the identical fingerprint, which the UNIQUE
 * index rejects.
 *
 * userId is part of the hash deliberately. The sha256 column is unique
 * across the WHOLE table, so without it, two users receiving the same
 * bank SMS at the same second would collide — the second user's message
 * silently dropped as a "duplicate" of a stranger's. That is a tenancy
 * bug hiding inside a dedupe feature.
 */
export function fingerprint(userId: UserId, sms: IncomingSms): string {
  return createHash('sha256')
    .update([userId, sms.sender, sms.body, sms.receivedAt.toISOString()].join('\u001F'))
    .digest('hex');
}
