// Runs before the server starts (see playwright.config.ts webServer.command):
// fresh database + Redis db + mail log, then creates the platform owner with the real CLI.
import pg from 'pg';
import { Redis } from 'ioredis';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const DB = process.env.DATABASE_URL;
const name = DB.split('/').pop();
const admin = new pg.Client({ connectionString: DB.replace(/\/[^/]+$/, '/postgres') });
await admin.connect();
await admin.query('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1', [name]);
await admin.query(`drop database if exists ${name}`);
await admin.query(`create database ${name}`);
await admin.end();
const redis = new Redis(process.env.REDIS_URL);
await redis.flushdb();
redis.disconnect();
fs.rmSync(process.env.MAIL_LOG_FILE, { force: true });
fs.rmSync(process.env.STORAGE_LOCAL_DIR, { recursive: true, force: true });
execFileSync('node', ['../server/dist/cli/create-owner.js', '--username', 'dono', '--email', 'dono@ouroboros.test', '--password', 'Senha-do-dono-123'], { stdio: 'inherit', env: process.env });
