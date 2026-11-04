import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema>;

export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 20 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

/** Locates the drizzle migrations folder both in source (tsx) and bundled (dist) layouts. */
export function migrationsFolder() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, '../../drizzle'), path.resolve(here, '../drizzle'), path.resolve(process.cwd(), 'drizzle')];
  const found = candidates.find((p) => fs.existsSync(path.join(p, 'meta', '_journal.json')));
  if (!found) throw new Error('Migrations folder not found');
  return found;
}

export async function runMigrations(db: DB) {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
