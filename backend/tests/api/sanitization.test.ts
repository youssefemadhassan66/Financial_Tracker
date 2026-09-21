import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, PASSWORD } from './helpers.js';

/**
 * Request sanitization at the HTTP boundary.
 *
 * Every one of these is rejected BEFORE any database access, so this
 * suite runs without Docker. Special characters are built with
 * String.fromCharCode so the test file itself stays free of invisible
 * characters (see source-hygiene.test.ts).
 */
const NUL = String.fromCharCode(0);
const RLO = String.fromCharCode(0x202e); // right-to-left override

const app = buildTestApp();

function postJson(path: string, body: string) {
  return request(app).post(path).set('Content-Type', 'application/json').send(body);
}

describe('input validation', () => {
  it('rejects malformed JSON with 400, not 500', async () => {
    const res = await postJson('/api/auth/login', '{"email": "a@b.com",');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MALFORMED_JSON');
  });

  it('rejects an unknown field — mass assignment defence', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: PASSWORD, role: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(res.body)).toContain('role');
  });

  it('rejects an invalid email', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'not-an-email', password: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error.issues[0].path).toBe('email');
  });

  it('rejects a password shorter than the policy', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.issues[0].path).toBe('password');
  });

  it('never echoes a submitted password back in an error', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'bad', password: 'SuperSecretValue' });
    expect(JSON.stringify(res.body)).not.toContain('SuperSecretValue');
  });

  it('rejects a NUL byte, which Postgres would otherwise turn into a 500', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: `a${NUL}@b.com`, password: PASSWORD });
    expect(res.status).toBe(400);
  });

  it('rejects a bidirectional override character in an email', async () => {
    // The bidi rule for free text (names, SMS) is unit-tested directly in
    // fields.test.ts; this confirms the character cannot enter via email.
    const res = await request(app).post('/api/auth/login').send({ email: `a${RLO}b@c.com`, password: PASSWORD });
    expect(res.status).toBe(400);
  });

  it('rejects a __proto__ key — prototype pollution defence', async () => {
    const res = await postJson('/api/auth/login', '{"__proto__": {"isAdmin": true}, "email": "a@b.com", "password": "x"}');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REQUEST_REJECTED');
    // And the pollution did not happen.
    expect(({} as Record<string, unknown>)['isAdmin']).toBeUndefined();
  });

  it('rejects a nested constructor.prototype key', async () => {
    const res = await postJson('/api/auth/login', '{"a": {"constructor": {"prototype": {"x": 1}}}}');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REQUEST_REJECTED');
  });

  it('rejects absurdly deep nesting', async () => {
    const deep = '['.repeat(50) + ']'.repeat(50);
    const res = await postJson('/api/auth/login', deep);
    expect(res.status).toBe(400);
  });

  it('rejects a body over 64kb with 413', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'x'.repeat(70_000), password: PASSWORD });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('authentication boundary', () => {
  it('rejects /me without a token, with a WWW-Authenticate header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  it('rejects a forged bearer token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
  });

  it('rejects ingest without a device key', async () => {
    const res = await request(app).post('/api/ingest/sms').send({ sender: 'CIB', body: 'x', receivedAt: new Date().toISOString() });
    expect(res.status).toBe(401);
  });

  it('rejects a device key with the wrong prefix without touching the database', async () => {
    const res = await request(app)
      .post('/api/ingest/sms')
      .set('X-Device-Key', 'not-a-device-key')
      .send({ sender: 'CIB', body: 'x', receivedAt: new Date().toISOString() });
    expect(res.status).toBe(401);
  });
});

describe('security headers and CORS', () => {
  it('sets hardening headers and hides the framework', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('grants CORS to the configured frontend origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:3001');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant CORS to any other origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers unknown routes with a JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
