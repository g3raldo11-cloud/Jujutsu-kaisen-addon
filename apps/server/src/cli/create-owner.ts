/**
 * Creates the single platform owner (super administrator).
 * Usage: pnpm create-owner --username admin --email admin@example.com [--password ...]
 * Without --password the password is read from the OWNER_PASSWORD env var or prompted.
 */
import { createInterface } from 'node:readline/promises';
import { sql } from 'drizzle-orm';
import { emailSchema, passwordSchema, usernameSchema } from '@ouroboros/shared';
import { loadConfig } from '../config';
import { createDb, runMigrations } from '../db/client';
import { seed } from '../db/seed';
import { hashPassword } from '../lib/crypto';
import { accessRequests, userProfiles, users } from '../db/schema';

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
await runMigrations(db);
await seed(db);

const [existing] = await db.select({ id: users.id, username: users.username }).from(users).where(sql`${users.isOwner} = true`);
if (existing) {
  console.error(`Já existe um proprietário: ${existing.username}. A plataforma admite apenas um.`);
  await pool.end();
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const username = usernameSchema.parse(arg('username') ?? (await rl.question('Nome de usuário: ')));
const email = emailSchema.parse(arg('email') ?? (await rl.question('E-mail: ')));
const password = passwordSchema.parse(arg('password') ?? process.env.OWNER_PASSWORD ?? (await rl.question('Senha (mín. 10 caracteres): ')));
rl.close();

const [u] = await db
  .insert(users)
  .values({ username, email, passwordHash: await hashPassword(password), status: 'approved', isOwner: true, emailVerifiedAt: new Date() })
  .returning();
await db.insert(userProfiles).values({ userId: u.id, displayName: username });
await db.insert(accessRequests).values({ userId: u.id, status: 'approved', decidedAt: new Date(), decisionNote: 'Proprietário da plataforma' });
console.log(`Proprietário "${username}" criado. Recomendado: ative a autenticação em dois fatores em Configurações → Segurança.`);
await pool.end();
