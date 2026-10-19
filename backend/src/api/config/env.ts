import { z } from 'zod';

/**
 * Environment configuration, validated ONCE at startup.
 *
 * A missing or weak secret should stop the process before it serves a
 * single request — not surface as a confusing failure on the first login,
 * or worse, run happily with an empty signing key.
 */

const UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };

/** "15m" -> 900, "30d" -> 2592000. */
export function parseDurationSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (match === null) {
    throw new Error(`Invalid duration "${value}". Use a number followed by s, m, h or d.`);
  }
  const [, amount, unit] = match;
  return Number(amount) * (UNITS[unit ?? 's'] ?? 1);
}

const duration = z
  .string()
  .regex(/^\d+[smhd]$/, 'Use a number followed by s, m, h or d, e.g. 15m')
  .transform(parseDurationSeconds);

const envSchema = z.object({
  // Defaults to PRODUCTION on purpose. Forgetting to set NODE_ENV on a
  // real server must fail safe — secure cookies on — not quietly run in
  // relaxed development mode.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  TOKEN_HASH_PEPPER: z.string().min(32, 'TOKEN_HASH_PEPPER must be at least 32 characters'),
  ACCESS_TOKEN_TTL: duration.default(900),
  REFRESH_TOKEN_TTL: duration.default(30 * 86_400),

  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3001')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
});

export interface RateLimitConfig {
  windowMs: number;
  global: number;
  login: number;
  register: number;
  refresh: number;
  ingestPerMinute: number;
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  jwtAccessSecret: string;
  tokenHashPepper: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  corsOrigins: string[];
  trustProxy: number;
  /** Only false in local development over plain http. */
  cookieSecure: boolean;
  rateLimits: RateLimitConfig;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  global: 300,
  // Tight on the endpoints an attacker would hammer to guess passwords.
  login: 10,
  register: 5,
  refresh: 60,
  ingestPerMinute: 60,
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  const e = parsed.data;
  if (e.JWT_ACCESS_SECRET === e.TOKEN_HASH_PEPPER) {
    throw new Error('JWT_ACCESS_SECRET and TOKEN_HASH_PEPPER must be different values');
  }

  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtAccessSecret: e.JWT_ACCESS_SECRET,
    tokenHashPepper: e.TOKEN_HASH_PEPPER,
    accessTokenTtlSeconds: e.ACCESS_TOKEN_TTL,
    refreshTokenTtlSeconds: e.REFRESH_TOKEN_TTL,
    corsOrigins: e.CORS_ORIGIN,
    trustProxy: e.TRUST_PROXY,
    cookieSecure: e.NODE_ENV !== 'development',
    rateLimits: DEFAULT_RATE_LIMITS,
  };
}
