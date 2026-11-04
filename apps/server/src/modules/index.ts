import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../lib/context';
import type { Guards } from '../lib/auth';
import { authRoutes } from './auth';
import { adminRoutes } from './admin';
import { structureRoutes } from './structure';
import { messageRoutes } from './messages';
import { fileRoutes } from './files';
import { userRoutes } from './users';
import { socialRoutes } from './social';
import { forumRoutes } from './forum';
import { eventRoutes } from './events';
import { moderationRoutes } from './moderation';
import { miscRoutes } from './misc';
import { botRoutes } from './bots';

export async function registerModules(app: FastifyInstance, ctx: AppContext, g: Guards) {
  for (const mod of [authRoutes, adminRoutes, structureRoutes, messageRoutes, fileRoutes, userRoutes, socialRoutes, forumRoutes, eventRoutes, moderationRoutes, miscRoutes, botRoutes]) {
    await mod(app, ctx, g);
  }
}
