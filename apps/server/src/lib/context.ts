import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import type { Config } from '../config';
import type { DB } from '../db/client';
import type { EventBus } from './bus';
import type { Mailer } from './mailer';
import type { PermissionService } from './permissions';
import type { Realtime } from './realtime';
import type { SettingsService } from './settings';
import type { Storage } from './storage';

export interface AppContext {
  config: Config;
  db: DB;
  pool: pg.Pool;
  redis: Redis;
  mailer: Mailer;
  storage: Storage;
  bus: EventBus;
  settings: SettingsService;
  perms: PermissionService;
  realtime: Realtime;
  log: FastifyBaseLogger;
}
