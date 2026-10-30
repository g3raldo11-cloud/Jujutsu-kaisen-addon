import { and, eq, sql } from 'drizzle-orm';
import type { AppContext } from './context';
import { achievements, userProfiles } from '../db/schema';
import { notify } from './notify';

export const ACHIEVEMENTS: Record<string, { title: string; description: string; icon: string }> = {
  first_message: { title: 'Primeiras palavras', description: 'Enviou a primeira mensagem', icon: '💬' },
  chatterbox: { title: 'Boa de papo', description: '100 mensagens enviadas', icon: '🗣️' },
  veteran: { title: 'Veterano', description: '1.000 mensagens enviadas', icon: '🏛️' },
  level_5: { title: 'Em ascensão', description: 'Alcançou o nível 5', icon: '⭐' },
  level_10: { title: 'Pilar da comunidade', description: 'Alcançou o nível 10', icon: '🌟' },
  first_post: { title: 'Autor', description: 'Criou o primeiro tópico no fórum', icon: '📝' },
  first_call: { title: 'Ao vivo', description: 'Participou da primeira chamada', icon: '🎙️' },
  event_goer: { title: 'Presença confirmada', description: 'Inscreveu-se em um evento', icon: '📅' },
  friendly: { title: 'Amigável', description: 'Fez a primeira amizade', icon: '🤝' },
  reporter: { title: 'Guardião', description: 'Ajudou a moderação com uma denúncia', icon: '🛡️' },
};

export const levelForXp = (xp: number) => Math.floor(Math.sqrt(xp / 50)) + 1;
export const xpForLevel = (level: number) => (level - 1) ** 2 * 50;

export async function grantAchievement(ctx: AppContext, userId: string, key: keyof typeof ACHIEVEMENTS | string) {
  const a = ACHIEVEMENTS[key];
  if (!a) return;
  const rows = await ctx.db.insert(achievements).values({ userId, key }).onConflictDoNothing().returning();
  if (rows.length) {
    await notify(ctx, [userId], { type: 'achievement', title: `Conquista desbloqueada: ${a.title}`, body: `${a.icon} ${a.description}`, link: '/app/profile' });
  }
}

/** Awards participation XP (throttled to avoid farming) and unlocks message-count achievements. */
export async function awardXp(ctx: AppContext, userId: string, reason: 'message' | 'post' | 'call') {
  const s = await ctx.settings.get();
  const [p] = await ctx.db
    .update(userProfiles)
    .set({ messageCount: reason === 'message' ? sql`${userProfiles.messageCount} + 1` : userProfiles.messageCount })
    .where(eq(userProfiles.userId, userId))
    .returning();
  if (!p) return;
  if (reason === 'message') {
    if (p.messageCount === 1) await grantAchievement(ctx, userId, 'first_message');
    if (p.messageCount === 100) await grantAchievement(ctx, userId, 'chatterbox');
    if (p.messageCount === 1000) await grantAchievement(ctx, userId, 'veteran');
  }
  if (!s.gamification.enabled) return;
  const throttled = !(await ctx.redis.set(`xp:${userId}:${reason}`, '1', 'EX', 30, 'NX'));
  if (throttled) return;
  const gain = reason === 'message' ? s.gamification.xpPerMessage : reason === 'post' ? s.gamification.xpPerMessage * 4 : s.gamification.xpPerMessage * 2;
  const xp = p.xp + gain;
  const level = levelForXp(xp);
  await ctx.db.update(userProfiles).set({ xp, level }).where(and(eq(userProfiles.userId, userId)));
  if (level > p.level) {
    ctx.realtime.toUser(userId, 'level:up', { level });
    if (level >= 5) await grantAchievement(ctx, userId, 'level_5');
    if (level >= 10) await grantAchievement(ctx, userId, 'level_10');
  }
}
