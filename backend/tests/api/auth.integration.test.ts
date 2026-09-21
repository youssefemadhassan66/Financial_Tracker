import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { getPrismaClient } from '../../src/infrastructure/persistence/prisma-client.js';
import { buildTestApp, databaseAvailable, PASSWORD, refreshCookieFrom, testConfig } from './helpers.js';

/**
 * End-to-end through real HTTP, real argon2, real JWTs and the real
 * database. Skipped when Docker is not running.
 */
const hasDb = await databaseAvailable();
const suite = hasDb ? describe : describe.skip;

const app = buildTestApp();
const prisma = getPrismaClient();
const createdEmails: string[] = [];

function uniqueEmail(): string {
  const email = `it-${randomUUID()}@example.com`;
  createdEmails.push(email);
  return email;
}

async function register(email = uniqueEmail()) {
  const res = await request(app).post('/api/auth/register').send({ email, password: PASSWORD });
  return { res, email, cookie: refreshCookieFrom(res.headers['set-cookie']), accessToken: res.body.accessToken as string };
}

afterAll(async () => {
  if (hasDb) {
    // ON DELETE CASCADE removes their tokens, devices and messages too.
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  }
});

suite('register and login', () => {
  it('registers, returns an access token, and sets a hardened refresh cookie', async () => {
    const { res } = await register();

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(res.body.user).toEqual({ id: expect.any(String), email: expect.any(String), defaultCurrency: 'EGP' });

    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('refresh_token='));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain('Secure');
  });

  it('never puts the refresh token in the JSON body', async () => {
    const { res, cookie } = await register();
    const token = cookie?.split('=')[1] ?? 'missing';
    expect(JSON.stringify(res.body)).not.toContain(token);
  });

  it('never returns the password hash', async () => {
    const { res } = await register();
    expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash/);
  });

  it('stores an argon2id hash, not the password', async () => {
    const { email } = await register();
    const row = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(row.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(row.passwordHash).not.toContain(PASSWORD);
  });

  it('creates the user settings row alongside the user', async () => {
    const { email } = await register();
    const row = await prisma.user.findUniqueOrThrow({ where: { email }, include: { settings: true } });
    expect(row.settings?.countFeesAsSpending).toBe(true);
  });

  it('rejects a duplicate registration with 409', async () => {
    const { email } = await register();
    const res = await request(app).post('/api/auth/register').send({ email: email.toUpperCase(), password: PASSWORD });
    expect(res.status).toBe(409);
  });

  it('logs in with the right password', async () => {
    const { email } = await register();
    const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('returns the SAME 401 for a wrong password and an unknown email', async () => {
    const { email } = await register();
    const wrong = await request(app).post('/api/auth/login').send({ email, password: 'wrong password!!' });
    const unknown = await request(app).post('/api/auth/login').send({ email: uniqueEmail(), password: PASSWORD });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('returns the current user for a valid access token', async () => {
    const { accessToken, email } = await register();
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });
});

suite('refresh token rotation', () => {
  it('rotates: a refresh returns a NEW cookie and a new access token', async () => {
    const { cookie } = await register();
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie!);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    const next = refreshCookieFrom(res.headers['set-cookie']);
    expect(next).toBeDefined();
    expect(next).not.toBe(cookie);
  });

  it('detects a replayed token and kills the whole session — end to end', async () => {
    const { cookie: original } = await register();

    const first = await request(app).post('/api/auth/refresh').set('Cookie', original!);
    const rotated = refreshCookieFrom(first.headers['set-cookie']);
    expect(first.status).toBe(200);

    // Replay the ORIGINAL token, as a thief holding a copy would.
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', original!);
    expect(replay.status).toBe(401);
    // The server also tells the browser to drop the dead cookie.
    expect(String(replay.headers['set-cookie'])).toContain('refresh_token=;');

    // The newest token is dead too: the whole family was revoked.
    const afterRevoke = await request(app).post('/api/auth/refresh').set('Cookie', rotated!);
    expect(afterRevoke.status).toBe(401);
  });

  it('refuses a refresh with no cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('logout revokes the session so the refresh token stops working', async () => {
    const { cookie } = await register();

    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie!);
    expect(out.status).toBe(204);

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie!);
    expect(res.status).toBe(401);
  });

  it('logout-all ends sessions on every device', async () => {
    const { email, accessToken, cookie: first } = await register();
    const second = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    const secondCookie = refreshCookieFrom(second.headers['set-cookie']);

    const out = await request(app).post('/api/auth/logout-all').set('Authorization', `Bearer ${accessToken}`);
    expect(out.status).toBe(204);

    for (const cookie of [first, secondCookie]) {
      const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie!);
      expect(res.status).toBe(401);
    }
  });

  it('handles two simultaneous refreshes with one token: exactly one wins', async () => {
    const { cookie } = await register();

    const [a, b] = await Promise.all([
      request(app).post('/api/auth/refresh').set('Cookie', cookie!),
      request(app).post('/api/auth/refresh').set('Cookie', cookie!),
    ]);

    // The atomic conditional UPDATE lets only one through. Without it,
    // both could succeed and mint two live descendants of one token.
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 401]);
  });
});

suite('device keys and SMS ingest', () => {
  async function userWithDevice() {
    const { accessToken, email } = await register();
    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Pixel 8' });
    return { accessToken, email, key: res.body.key as string, deviceId: res.body.device.id as string, res };
  }

  const sms = () => ({
    sender: 'CIB',
    body: `Your card ending 1234 was charged EGP 500.00 at CARREFOUR ${randomUUID()}`,
    receivedAt: new Date(Date.now() - 60_000).toISOString(),
  });

  it('creates a device key, returning it once with the fad_ prefix', async () => {
    const { res, key } = await userWithDevice();
    expect(res.status).toBe(201);
    expect(key.startsWith('fad_')).toBe(true);
  });

  it('never shows the key or its hash when listing devices', async () => {
    const { accessToken, key } = await userWithDevice();
    const res = await request(app).get('/api/devices').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.devices).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain(key);
    expect(JSON.stringify(res.body)).not.toMatch(/hash/i);
  });

  it('stores an SMS sent with a valid device key', async () => {
    const { key } = await userWithDevice();
    const res = await request(app).post('/api/ingest/sms').set('X-Device-Key', key).send(sms());
    expect(res.status).toBe(201);
    expect(res.body.duplicate).toBe(false);
  });

  it('answers a retried SMS with 200 duplicate, storing it only once', async () => {
    const { key } = await userWithDevice();
    const payload = sms();

    const first = await request(app).post('/api/ingest/sms').set('X-Device-Key', key).send(payload);
    const retry = await request(app).post('/api/ingest/sms').set('X-Device-Key', key).send(payload);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual({ id: first.body.id, duplicate: true });
  });

  it('stores an Arabic SMS body byte-for-byte', async () => {
    const { key } = await userWithDevice();
    const body = `تم خصم 500 جنيه من بطاقتك المنتهية بـ 1234 ${randomUUID()}`;
    const res = await request(app).post('/api/ingest/sms').set('X-Device-Key', key).send({ ...sms(), sender: 'NBE', body });

    const row = await prisma.rawMessage.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.body).toBe(body);
  });

  it('rejects an unknown device key', async () => {
    const res = await request(app).post('/api/ingest/sms').set('X-Device-Key', 'fad_not-a-real-key').send(sms());
    expect(res.status).toBe(401);
  });

  it('does NOT accept a user access token on the ingest route', async () => {
    const { accessToken } = await userWithDevice();
    const res = await request(app).post('/api/ingest/sms').set('Authorization', `Bearer ${accessToken}`).send(sms());
    expect(res.status).toBe(401);
  });

  it('does NOT let a device key act as a user — it cannot read anything', async () => {
    const { key } = await userWithDevice();
    const me = await request(app).get('/api/auth/me').set('X-Device-Key', key);
    const devices = await request(app).get('/api/devices').set('X-Device-Key', key);

    expect(me.status).toBe(401);
    expect(devices.status).toBe(401);
  });

  it('stops accepting a key once it is revoked', async () => {
    const { accessToken, key, deviceId } = await userWithDevice();

    const del = await request(app).delete(`/api/devices/${deviceId}`).set('Authorization', `Bearer ${accessToken}`);
    expect(del.status).toBe(204);

    const res = await request(app).post('/api/ingest/sms').set('X-Device-Key', key).send(sms());
    expect(res.status).toBe(401);
  });

  it("will not let one user revoke another user's device — 404", async () => {
    const alice = await userWithDevice();
    const bob = await register();

    const res = await request(app).delete(`/api/devices/${alice.deviceId}`).set('Authorization', `Bearer ${bob.accessToken}`);
    expect(res.status).toBe(404);

    // Alice's key still works.
    const ingest = await request(app).post('/api/ingest/sms').set('X-Device-Key', alice.key).send(sms());
    expect(ingest.status).toBe(201);
  });

  it('rejects a malformed device id with 400 rather than a database error', async () => {
    const { accessToken } = await userWithDevice();
    const res = await request(app).delete('/api/devices/not-a-uuid').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(400);
  });
});

suite('rate limiting', () => {
  it('blocks login after too many attempts with 429', async () => {
    const tight = buildTestApp({
      rateLimits: { ...testConfig().rateLimits, login: 3 },
    });
    const email = uniqueEmail();

    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await request(tight).post('/api/auth/login').send({ email, password: 'wrong password!!' });
      statuses.push(res.status);
    }

    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });
});
