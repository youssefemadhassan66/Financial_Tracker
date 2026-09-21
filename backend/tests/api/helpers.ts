import 'dotenv/config';
import type { Express } from 'express';
import { loadConfig, type AppConfig, type RateLimitConfig } from '../../src/api/config/env.js';
import { buildContainer } from '../../src/api/container.js';
import { createServer } from '../../src/api/server.js';
import { getPrismaClient } from '../../src/infrastructure/persistence/prisma-client.js';

/** Generous limits so the functional tests never trip them. The rate
 *  limit test builds its own app with tight limits instead. */
const RELAXED_LIMITS: RateLimitConfig = {
  windowMs: 60_000,
  global: 10_000,
  login: 10_000,
  register: 10_000,
  refresh: 10_000,
  ingestPerMinute: 10_000,
};

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...loadConfig(), rateLimits: RELAXED_LIMITS, ...overrides };
}

export function buildTestApp(overrides: Partial<AppConfig> = {}): Express {
  const config = testConfig(overrides);
  return createServer(buildContainer(config), config);
}

/** True when the Docker database is reachable. Integration suites skip
 *  themselves otherwise, so `npm test` still works without Docker. */
export async function databaseAvailable(): Promise<boolean> {
  return getPrismaClient()
    .$queryRaw`SELECT 1`
    .then(() => true)
    .catch(() => false);
}

/** Extracts `refresh_token=…` from a response's Set-Cookie headers. */
export function refreshCookieFrom(setCookie: string | string[] | undefined): string | undefined {
  const all = Array.isArray(setCookie) ? setCookie : setCookie === undefined ? [] : [setCookie];
  const cookie = all.find((c) => c.startsWith('refresh_token='));
  const value = cookie?.split(';')[0];
  return value === undefined || value === 'refresh_token=' ? undefined : value;
}

export const PASSWORD = 'correct horse battery staple';
