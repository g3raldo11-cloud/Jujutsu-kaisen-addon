import { loadConfig } from '../config';
import { createDb, runMigrations } from '../db/client';
import { seed } from '../db/seed';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
await runMigrations(db);
await seed(db);
await pool.end();
console.log('Migrações aplicadas.');
