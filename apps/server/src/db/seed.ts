import { eq, sql } from 'drizzle-orm';
import { DEFAULT_MEMBER_PERMISSIONS, PERMISSION_LABELS, PERMISSIONS, type Permission } from '@ouroboros/shared';
import type { DB } from './client';
import { categories, channels, permissions, rolePermissions, roles, spaces, voiceRooms } from './schema';

/** Idempotent bootstrap: permission catalogue, base roles and the initial community structure. */
export async function seed(db: DB) {
  await db
    .insert(permissions)
    .values(Object.entries(PERMISSION_LABELS).map(([key, v]) => ({ key, label: v.label, description: v.description, scope: v.scope })))
    .onConflictDoUpdate({ target: permissions.key, set: { label: sql`excluded.label`, description: sql`excluded.description`, scope: sql`excluded.scope` } });

  const existingRoles = await db.select().from(roles);
  if (existingRoles.length === 0) {
    const make = async (name: string, color: string, position: number, perms: Permission[], isDefault = false, hoist = false) => {
      const [r] = await db.insert(roles).values({ name, color, position, isDefault, hoist }).returning();
      if (perms.length) await db.insert(rolePermissions).values(perms.map((permission) => ({ roleId: r.id, permission })));
      return r;
    };
    await make('Membro', '#8b93a7', 0, DEFAULT_MEMBER_PERMISSIONS, true);
    await make('Moderador', '#3fb68b', 50, [
      ...DEFAULT_MEMBER_PERMISSIONS,
      PERMISSIONS.MANAGE_MESSAGES,
      PERMISSIONS.MUTE_MEMBERS,
      PERMISSIONS.MODERATE_MEMBERS,
      PERMISSIONS.VIEW_REPORTS,
      PERMISSIONS.MENTION_EVERYONE,
    ], false, true);
    await make('Administrador', '#e0a43c', 100, [
      ...DEFAULT_MEMBER_PERMISSIONS,
      PERMISSIONS.MANAGE_MESSAGES,
      PERMISSIONS.MUTE_MEMBERS,
      PERMISSIONS.MODERATE_MEMBERS,
      PERMISSIONS.VIEW_REPORTS,
      PERMISSIONS.MENTION_EVERYONE,
      PERMISSIONS.MANAGE_CHANNELS,
      PERMISSIONS.MANAGE_MEMBERS,
      PERMISSIONS.BAN_MEMBERS,
      PERMISSIONS.VIEW_AUDIT_LOG,
      PERMISSIONS.MANAGE_BOTS,
      PERMISSIONS.MANAGE_EVENTS,
      PERMISSIONS.MANAGE_FILES,
      PERMISSIONS.MANAGE_EMOJIS,
    ], false, true);
  }

  const existingSpaces = await db.select({ id: spaces.id }).from(spaces).limit(1);
  if (existingSpaces.length === 0) {
    const [space] = await db.insert(spaces).values({ name: 'Comunidade', description: 'Espaço principal', position: 0 }).returning();
    const layout: { name: string; channels: { name: string; type: any; topic?: string; isPrivate?: boolean }[] }[] = [
      { name: 'Boas-vindas', channels: [
        { name: 'regras', type: 'announcement', topic: 'Leia antes de participar' },
        { name: 'anuncios', type: 'announcement', topic: 'Comunicados oficiais da administração' },
      ] },
      { name: 'Conversas', channels: [
        { name: 'geral', type: 'text', topic: 'Conversa livre entre os membros' },
        { name: 'off-topic', type: 'text', topic: 'Assuntos aleatórios' },
      ] },
      { name: 'Fórum', channels: [{ name: 'discussoes', type: 'forum', topic: 'Tópicos de longo prazo' }] },
      { name: 'Voz e vídeo', channels: [
        { name: 'Sala de voz', type: 'voice' },
        { name: 'Sala de vídeo', type: 'video' },
        { name: 'Sala de estudo', type: 'voice', topic: 'Foco silencioso com companhia' },
      ] },
      { name: 'Conteúdo', channels: [
        { name: 'arquivos', type: 'files', topic: 'Documentos e materiais compartilhados' },
        { name: 'galeria', type: 'gallery', topic: 'Galeria comunitária' },
        { name: 'agenda', type: 'events', topic: 'Calendário da comunidade' },
      ] },
      { name: 'Ajuda', channels: [{ name: 'suporte', type: 'support', topic: 'Abra um ticket com /ticket para falar com a administração' }] },
      { name: 'Administração', channels: [{ name: 'staff', type: 'admin', topic: 'Área restrita da equipe' }] },
    ];
    let cpos = 0;
    for (const cat of layout) {
      const [c] = await db.insert(categories).values({ spaceId: space.id, name: cat.name, position: cpos++ }).returning();
      let pos = 0;
      for (const ch of cat.channels) {
        const [row] = await db
          .insert(channels)
          .values({ spaceId: space.id, categoryId: c.id, name: ch.name, type: ch.type, topic: ch.topic ?? '', position: pos++, isPrivate: !!ch.isPrivate })
          .returning();
        if (['voice', 'video', 'stage'].includes(ch.type)) await db.insert(voiceRooms).values({ channelId: row.id, kind: 'channel' });
      }
    }
  }
}

export async function getDefaultRoleId(db: DB) {
  const [r] = await db.select({ id: roles.id }).from(roles).where(eq(roles.isDefault, true));
  return r?.id ?? null;
}
