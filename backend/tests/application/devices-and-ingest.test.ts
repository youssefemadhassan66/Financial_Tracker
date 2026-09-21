import { describe, expect, it } from 'vitest';
import {
  AuthenticateDevice,
  CreateDeviceKey,
  ListDeviceKeys,
  RevokeDeviceKey,
} from '../../src/application/devices/device-keys.js';
import { StoreRawSms, fingerprint } from '../../src/application/ingest/store-raw-sms.js';
import { AuthenticationError, NotFoundError } from '../../src/application/errors.js';
import { DomainError } from '../../src/domain/errors.js';
import { newUserId } from '../../src/domain/ids.js';
import {
  FakeClock,
  FakeOpaqueTokenService,
  InMemoryDeviceKeyRepository,
  InMemoryRawMessageRepository,
} from './fakes.js';

const ALICE = newUserId('11111111-1111-1111-1111-111111111111');
const BOB = newUserId('22222222-2222-2222-2222-222222222222');

function setup() {
  const clock = new FakeClock();
  const repo = new InMemoryDeviceKeyRepository();
  const opaque = new FakeOpaqueTokenService();
  return {
    clock,
    repo,
    create: new CreateDeviceKey(repo, opaque),
    list: new ListDeviceKeys(repo),
    revoke: new RevokeDeviceKey(repo, clock),
    authenticate: new AuthenticateDevice(repo, opaque, clock),
  };
}

describe('Device keys', () => {
  it('returns the plaintext key once, with a recognisable prefix', async () => {
    const s = setup();
    const { key, device } = await s.create.execute(ALICE, 'Pixel 8');

    expect(key.startsWith('fad_')).toBe(true);
    expect(device.name).toBe('Pixel 8');
    expect(JSON.stringify(device)).not.toContain(key);
  });

  it('stores only the hash of the key', async () => {
    const s = setup();
    const { key } = await s.create.execute(ALICE, 'Pixel 8');
    expect(s.repo.keys[0]?.keyHash).not.toBe(key);
  });

  it('authenticates a valid key as its owner', async () => {
    const s = setup();
    const { key } = await s.create.execute(ALICE, 'Pixel 8');
    const device = await s.authenticate.execute(key);
    expect(device.userId).toBe(ALICE);
  });

  it('records when the key was last used', async () => {
    const s = setup();
    const { key } = await s.create.execute(ALICE, 'Pixel 8');
    await s.authenticate.execute(key);
    expect(s.repo.keys[0]?.lastUsedAt).not.toBeNull();
  });

  it('rejects a missing, malformed, or unknown key', async () => {
    const s = setup();
    await expect(s.authenticate.execute(undefined)).rejects.toBeInstanceOf(AuthenticationError);
    await expect(s.authenticate.execute('no-prefix')).rejects.toBeInstanceOf(AuthenticationError);
    await expect(s.authenticate.execute('fad_unknown')).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('rejects a key after it is revoked', async () => {
    const s = setup();
    const { key, device } = await s.create.execute(ALICE, 'Pixel 8');
    await s.revoke.execute(ALICE, device.id);
    await expect(s.authenticate.execute(key)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("will not let one user revoke another user's key — and answers 404, not 403", async () => {
    const s = setup();
    const { device } = await s.create.execute(ALICE, 'Pixel 8');

    await expect(s.revoke.execute(BOB, device.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await s.list.execute(ALICE))[0]?.revoked).toBe(false);
  });

  it('lists only the caller’s own keys', async () => {
    const s = setup();
    await s.create.execute(ALICE, 'Pixel 8');
    await s.create.execute(BOB, 'iPhone');

    const alices = await s.list.execute(ALICE);
    expect(alices.map((d) => d.name)).toEqual(['Pixel 8']);
  });
});

describe('StoreRawSms', () => {
  const sms = { sender: 'CIB', body: 'Your card was charged EGP 500.00', receivedAt: new Date('2026-09-21T09:00:00Z') };

  it('stores a new SMS', async () => {
    const repo = new InMemoryRawMessageRepository();
    const result = await new StoreRawSms(repo, new FakeClock()).execute(ALICE, 'dev1', sms);
    expect(result.duplicate).toBe(false);
    expect(repo.messages).toHaveLength(1);
  });

  it('treats a forwarder retry of the same SMS as a duplicate, not a second message', async () => {
    const repo = new InMemoryRawMessageRepository();
    const store = new StoreRawSms(repo, new FakeClock());

    const first = await store.execute(ALICE, 'dev1', sms);
    const retry = await store.execute(ALICE, 'dev1', sms);

    expect(retry.duplicate).toBe(true);
    expect(retry.id).toBe(first.id);
    expect(repo.messages).toHaveLength(1);
  });

  it('keeps two USERS receiving the identical SMS apart — the tenancy bug', async () => {
    const repo = new InMemoryRawMessageRepository();
    const store = new StoreRawSms(repo, new FakeClock());

    await store.execute(ALICE, 'dev1', sms);
    const bobs = await store.execute(BOB, 'dev2', sms);

    // Without userId in the fingerprint, Bob's message would be dropped
    // as a "duplicate" of Alice's.
    expect(bobs.duplicate).toBe(false);
    expect(fingerprint(ALICE, sms)).not.toBe(fingerprint(BOB, sms));
  });

  it('preserves an Arabic SMS body exactly', async () => {
    const repo = new InMemoryRawMessageRepository();
    const arabic = { ...sms, sender: 'NBE', body: 'تم خصم 500 جنيه من بطاقتك' };
    await new StoreRawSms(repo, new FakeClock()).execute(ALICE, 'dev1', arabic);
    expect(repo.messages[0]?.body).toBe('تم خصم 500 جنيه من بطاقتك');
  });

  it('rejects an SMS dated well in the future, but tolerates small clock skew', async () => {
    const clock = new FakeClock();
    const store = new StoreRawSms(new InMemoryRawMessageRepository(), clock);
    const now = clock.now().getTime();

    await expect(store.execute(ALICE, 'd', { ...sms, receivedAt: new Date(now + 60 * 60_000) }))
      .rejects.toBeInstanceOf(DomainError);
    await expect(store.execute(ALICE, 'd', { ...sms, receivedAt: new Date(now + 2 * 60_000) }))
      .resolves.toBeDefined();
  });
});
