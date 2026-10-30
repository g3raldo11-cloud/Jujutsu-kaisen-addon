import pg from 'pg';
import { Redis } from 'ioredis';

/** Starts every test run from an empty database and Redis db. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://enclave:enclave@127.0.0.1:5432/enclave_test';
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await client.end();
  const redis = new Redis(process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/1');
  await redis.flushdb();
  redis.disconnect();
}
