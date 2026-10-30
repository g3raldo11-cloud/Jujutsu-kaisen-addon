import { eq } from 'drizzle-orm';
import { DEFAULT_SETTINGS, platformSettingsSchema, type PlatformSettings } from '@enclave/shared';
import type { DB } from '../db/client';
import { settings } from '../db/schema';

function deepMerge<T>(base: T, patch: any): T {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return (patch ?? base) as T;
  const out: any = { ...base };
  for (const [k, v] of Object.entries(patch ?? {})) {
    out[k] = k in out && typeof out[k] === 'object' && !Array.isArray(out[k]) && out[k] !== null ? deepMerge(out[k], v) : v;
  }
  return out;
}

/** Platform settings stored as a single JSON document, cached in memory. */
export class SettingsService {
  private cache: PlatformSettings | null = null;
  constructor(private db: DB) {}

  async get(): Promise<PlatformSettings> {
    if (this.cache) return this.cache;
    const [row] = await this.db.select().from(settings).where(eq(settings.key, 'platform'));
    const merged = deepMerge(DEFAULT_SETTINGS, row?.value ?? {});
    const parsed = platformSettingsSchema.safeParse(merged);
    this.cache = parsed.success ? parsed.data : DEFAULT_SETTINGS;
    return this.cache;
  }

  async update(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
    const next = platformSettingsSchema.parse(deepMerge(await this.get(), patch));
    await this.db
      .insert(settings)
      .values({ key: 'platform', value: next })
      .onConflictDoUpdate({ target: settings.key, set: { value: next, updatedAt: new Date() } });
    this.cache = next;
    return next;
  }

  /** Secrets (API keys) stored separately and never returned by the public settings endpoint. */
  async getSecret(key: string): Promise<string | null> {
    const [row] = await this.db.select().from(settings).where(eq(settings.key, `secret:${key}`));
    return (row?.value as { v?: string } | undefined)?.v ?? null;
  }

  async setSecret(key: string, value: string | null) {
    if (value === null) {
      await this.db.delete(settings).where(eq(settings.key, `secret:${key}`));
      return;
    }
    await this.db
      .insert(settings)
      .values({ key: `secret:${key}`, value: { v: value } })
      .onConflictDoUpdate({ target: settings.key, set: { value: { v: value }, updatedAt: new Date() } });
  }

  invalidate() {
    this.cache = null;
  }
}
