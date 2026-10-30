import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(4000),
  /** Public URL users open in the browser (used in e-mails and origin checks). */
  APP_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('postgres://enclave:enclave@localhost:5432/enclave'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  /** 32+ byte secret used for HMAC (TURN credentials, encryption of secrets at rest). */
  APP_SECRET: z.string().min(32).default('dev-only-secret-change-me-dev-only-secret-change-me'),
  TRUST_PROXY: bool.default('false'),
  COOKIE_SECURE: bool.optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Enclave <no-reply@enclave.local>'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('enclave'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default('true'),

  STUN_URLS: z.string().default('stun:stun.l.google.com:19302'),
  TURN_URLS: z.string().optional(),
  TURN_SECRET: z.string().optional(),
  TURN_TTL_SECONDS: z.coerce.number().int().default(3600),

  /** Claude API key for the AI bot (can also be set by the owner in the admin panel, stored encrypted). */
  AI_API_KEY: z.string().optional(),
  /** Optional Anthropic API base URL (e.g. a corporate gateway). */
  AI_BASE_URL: z.string().url().optional(),
  AI_MODEL: z.string().default('claude-opus-5-5'),

  GIF_PROVIDER_KEY: z.string().optional(),

  WEB_DIST_DIR: z.string().optional(),
  DISABLE_SCHEDULER: bool.default('false'),
});

export type Config = z.infer<typeof envSchema> & { cookieSecure: boolean; isProd: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const c = parsed.data;
  const isProd = c.NODE_ENV === 'production';
  if (isProd && c.APP_SECRET.startsWith('dev-only-secret')) {
    throw new Error('APP_SECRET must be set to a strong random value in production');
  }
  return { ...c, isProd, cookieSecure: c.COOKIE_SECURE ?? c.APP_URL.startsWith('https://') };
}
