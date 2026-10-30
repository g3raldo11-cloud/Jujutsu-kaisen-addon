import { and, asc, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { fileTypeFromFile } from 'file-type';
import { imageSize } from 'image-size';
import { z } from 'zod';
import { ALLOWED_MIME, categoryForMime, INLINE_SAFE_MIME, PERMISSIONS } from '@enclave/shared';
import type { AppContext } from '../lib/context';
import type { Guards } from '../lib/auth';
import { audit } from '../lib/audit';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { query, uuidParam } from '../lib/http';
import type { UserAuthz } from '../lib/permissions';
import { getPublicUsers } from '../lib/users';
import { requireChannel } from './structure';
import { channels, files, folders, forumPosts, messageAttachments, messages } from '../db/schema';

type FileRow = typeof files.$inferSelect;
const PURPOSES = ['attachment', 'library', 'avatar', 'emoji', 'sticker', 'branding', 'music'] as const;
const PUBLIC_PURPOSES = new Set(['avatar', 'emoji', 'sticker', 'branding']);

const EXT_MIME: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.xls': 'application/vnd.ms-excel',
};

/** Detects the real MIME type from file content; text formats are accepted only if they are valid UTF-8 without NUL bytes. */
async function detectMime(tmp: string, originalName: string): Promise<string | null> {
  const ext = path.extname(originalName).toLowerCase();
  const ft = await fileTypeFromFile(tmp);
  if (ft) {
    if (ft.mime === 'application/x-cfb' && (ext === '.doc' || ext === '.xls')) return EXT_MIME[ext];
    if ((ft.mime as string) === 'audio/x-wav' || (ft.mime as string) === 'audio/wave') return 'audio/wav';
    if (ft.mime === 'audio/x-flac') return 'audio/flac';
    if (ft.mime === 'video/x-matroska' && ext === '.webm') return 'video/webm';
    if (ft.mime === 'audio/x-m4a') return 'audio/mp4';
    // MediaRecorder output in Chromium is a WebM container with only an audio track.
    return ft.mime;
  }
  if (['.txt', '.md', '.csv'].includes(ext)) {
    const fh = await fsp.open(tmp, 'r');
    try {
      const buf = Buffer.alloc(64 * 1024);
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      const chunk = buf.subarray(0, bytesRead);
      if (chunk.includes(0)) return null;
      new TextDecoder('utf-8', { fatal: true }).decode(chunk.subarray(0, Math.max(0, bytesRead - 4)));
      return EXT_MIME[ext];
    } catch {
      return null;
    } finally {
      await fh.close();
    }
  }
  return null;
}

/** Optional antivirus scan through clamd (INSTREAM). Enabled when CLAMAV_HOST is set. */
async function scanWithClamav(filePath: string): Promise<{ clean: boolean; signature?: string } | null> {
  const host = process.env.CLAMAV_HOST;
  if (!host) return null;
  const port = Number(process.env.CLAMAV_PORT ?? 3310);
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    let response = '';
    sock.setTimeout(60_000, () => sock.destroy(new Error('clamd timeout')));
    sock.on('data', (d) => (response += d.toString()));
    sock.on('error', reject);
    sock.on('end', () => {
      const r = response.replace(/\0/g, '').trim();
      if (r.endsWith('OK')) resolve({ clean: true });
      else if (r.includes('FOUND')) resolve({ clean: false, signature: r.replace(/^stream:\s*/, '').replace(/\s*FOUND$/, '') });
      else reject(new Error(`clamd: ${r}`));
    });
    sock.on('connect', async () => {
      sock.write('zINSTREAM\0');
      const rs = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
      for await (const chunk of rs) {
        const len = Buffer.alloc(4);
        len.writeUInt32BE((chunk as Buffer).length);
        sock.write(len);
        sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
  });
}

/** Whether a user may read a file. Private conversations stay private even for staff. */
export async function canAccessFile(ctx: AppContext, a: UserAuthz, f: FileRow): Promise<boolean> {
  if (f.deletedAt) return false;
  if (f.ownerId === a.id) return true;
  if (f.isPublicAsset || PUBLIC_PURPOSES.has(f.purpose)) return true;
  const msgRows = await ctx.db
    .select({ channelId: messages.channelId })
    .from(messageAttachments)
    .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
    .where(and(eq(messageAttachments.fileId, f.id), isNull(messages.deletedAt)));
  for (const r of msgRows) {
    const { perms } = await ctx.perms.channelPermsById(a, r.channelId);
    if (perms.has(PERMISSIONS.VIEW_CHANNEL)) return true;
  }
  if (f.channelId && (f.purpose === 'library' || f.purpose === 'music')) {
    const { perms } = await ctx.perms.channelPermsById(a, f.channelId);
    if (perms.has(PERMISSIONS.VIEW_CHANNEL)) return true;
  }
  const posts = await ctx.db
    .select({ channelId: forumPosts.channelId })
    .from(forumPosts)
    .where(and(sql`${f.id}::uuid = any(${forumPosts.attachmentIds})`, isNull(forumPosts.deletedAt)));
  for (const p of posts) {
    const { perms } = await ctx.perms.channelPermsById(a, p.channelId);
    if (perms.has(PERMISSIONS.VIEW_CHANNEL)) return true;
  }
  return false;
}

export function serializeFile(f: FileRow) {
  return {
    id: f.id,
    name: f.originalName,
    mimeType: f.mimeType,
    category: f.category,
    size: f.size,
    width: f.width,
    height: f.height,
    purpose: f.purpose,
    channelId: f.channelId,
    folderId: f.folderId,
    description: f.description,
    ownerId: f.ownerId,
    createdAt: f.createdAt,
  };
}

async function streamFile(ctx: AppContext, f: FileRow, reply: FastifyReply, rangeHeader: string | undefined, forceDownload: boolean) {
  const inline = !forceDownload && INLINE_SAFE_MIME.has(f.mimeType);
  const encoded = encodeURIComponent(f.originalName);
  reply.header('Content-Type', f.mimeType);
  reply.header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encoded}`);
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Cache-Control', 'private, max-age=3600');
  reply.header('Accept-Ranges', 'bytes');
  if (f.mimeType !== 'application/pdf') reply.header('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");

  const m = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    const size = f.size;
    let start = m[1] ? Number(m[1]) : size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return reply.code(416).header('Content-Range', `bytes */${size}`).send();
    const obj = await ctx.storage.get(f.storageKey, { start, end });
    reply.code(206).header('Content-Range', `bytes ${start}-${end}/${size}`).header('Content-Length', end - start + 1);
    return reply.send(obj.stream);
  }
  const obj = await ctx.storage.get(f.storageKey);
  reply.header('Content-Length', obj.size);
  return reply.send(obj.stream);
}

export async function fileRoutes(app: FastifyInstance, ctx: AppContext, g: Guards) {
  const P = PERMISSIONS;
  const approved = { preHandler: g.approved };

  app.post('/api/files', { preHandler: g.approved, config: { rateLimit: { max: 30, timeWindow: 60_000 } } }, async (req, reply) => {
    const a = req.authz!;
    const s = await ctx.settings.get();
    const isMultipart = req.isMultipart();
    if (!isMultipart) throw badRequest('Envie o arquivo como multipart/form-data');

    // Fields must precede the file part so limits can be decided before streaming.
    const fields: Record<string, string> = {};
    let tmpPath: string | null = null;
    let originalName = 'arquivo';
    let size = 0;
    let truncated = false;
    let sha = '';
    const purposeLimit = (purpose: string) => (purpose === 'avatar' || purpose === 'emoji' || purpose === 'sticker' || purpose === 'branding' ? s.uploads.maxAvatarSizeMb : s.uploads.maxFileSizeMb) * 1024 * 1024;

    try {
      for await (const part of req.parts({ limits: { fileSize: s.uploads.maxFileSizeMb * 1024 * 1024, files: 1 } })) {
        if (part.type === 'field') {
          fields[part.fieldname] = String(part.value).slice(0, 500);
          continue;
        }
        const purpose = fields.purpose ?? 'attachment';
        const limit = purposeLimit(purpose);
        originalName = (part.filename || 'arquivo').replace(/[\\/\0\r\n]/g, '_').slice(0, 200);
        tmpPath = path.join(os.tmpdir(), `enclave-upload-${randomUUID()}`);
        const hash = createHash('sha256');
        const counter = new Transform({
          transform(chunk, _enc, cb) {
            size += chunk.length;
            if (size > limit) return cb(new AppError(413, 'TOO_LARGE', `O arquivo excede o limite de ${Math.round(limit / 1048576)} MB`));
            hash.update(chunk);
            cb(null, chunk);
          },
        });
        await pipeline(part.file, counter, fs.createWriteStream(tmpPath));
        truncated = part.file.truncated;
        sha = hash.digest('hex');
      }
      if (!tmpPath) throw badRequest('Nenhum arquivo enviado');
      if (truncated) throw new AppError(413, 'TOO_LARGE', `O arquivo excede o limite de ${s.uploads.maxFileSizeMb} MB`);
      if (size === 0) throw badRequest('Arquivo vazio');

      const meta = z
        .object({
          purpose: z.enum(PURPOSES).default('attachment'),
          channelId: z.string().uuid().optional(),
          folderId: z.string().uuid().optional(),
          description: z.string().max(300).optional(),
        })
        .safeParse(fields);
      if (!meta.success) throw badRequest('Metadados inválidos');
      const { purpose, channelId, folderId, description } = meta.data;

      if (purpose === 'branding' && !ctx.perms.has(a, P.MANAGE_SETTINGS)) throw forbidden();
      if ((purpose === 'emoji' || purpose === 'sticker') && !ctx.perms.has(a, P.MANAGE_EMOJIS)) throw forbidden();
      if (purpose === 'avatar' && !s.personalization.allowAvatars) throw forbidden('Avatares personalizados estão desativados');
      if (channelId) {
        const { channel, perms } = await requireChannel(ctx, a, channelId);
        const needed = channel.type === 'gallery' || channel.type === 'files' ? P.CREATE_POSTS : P.ATTACH_FILES;
        if (!perms.has(needed) && !perms.has(P.ATTACH_FILES)) throw forbidden('Você não pode enviar arquivos neste canal');
        if (purpose === 'music' && !perms.has(P.MANAGE_MESSAGES) && !ctx.perms.has(a, P.MANAGE_BOTS)) throw forbidden();
      }
      if (folderId) {
        const [fo] = await ctx.db.select().from(folders).where(eq(folders.id, folderId));
        if (!fo || fo.channelId !== channelId) throw badRequest('Pasta inválida');
      }

      const mime = await detectMime(tmpPath, originalName);
      const category = mime ? categoryForMime(mime) : 'other';
      if (!mime || category === 'other') throw badRequest('Tipo de arquivo não permitido', 'FILE_TYPE');
      if (['avatar', 'emoji', 'sticker', 'branding'].includes(purpose) && category !== 'image') throw badRequest('Envie uma imagem');
      if (purpose === 'music' && category !== 'audio') throw badRequest('Envie um arquivo de áudio');
      if (!s.uploads.allowedCategories.includes(category as never) && !['avatar', 'emoji', 'sticker', 'branding'].includes(purpose)) {
        throw badRequest('Este tipo de arquivo foi desativado pela administração', 'FILE_TYPE');
      }

      const [{ used }] = await ctx.db
        .select({ used: sql<number>`coalesce(sum(${files.size}), 0)::bigint` })
        .from(files)
        .where(and(eq(files.ownerId, a.id), isNull(files.deletedAt)));
      if (Number(used) + size > s.uploads.userQuotaMb * 1048576 && !a.isOwner) throw new AppError(413, 'QUOTA', 'Sua cota de armazenamento foi atingida');

      const scan = await scanWithClamav(tmpPath).catch((err) => {
        ctx.log.error({ err }, 'antivirus scan failed');
        throw new AppError(503, 'SCAN_FAILED', 'Não foi possível verificar o arquivo agora');
      });
      if (scan && !scan.clean) {
        await audit(ctx, { actorId: a.id, action: 'file.malware_blocked', ip: req.ip, metadata: { name: originalName, signature: scan.signature } });
        throw badRequest('O arquivo foi bloqueado pela verificação de segurança', 'MALWARE');
      }

      let width: number | null = null;
      let height: number | null = null;
      if (category === 'image') {
        try {
          const fh = await fsp.open(tmpPath, 'r');
          const buf = Buffer.alloc(Math.min(size, 512 * 1024));
          await fh.read(buf, 0, buf.length, 0);
          await fh.close();
          const dim = imageSize(buf);
          width = dim.width ?? null;
          height = dim.height ?? null;
        } catch {
          /* dimensions are optional */
        }
      }

      const now = new Date();
      const storageKey = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}`;
      await ctx.storage.putFile(storageKey, tmpPath, mime);
      tmpPath = null;
      const [row] = await ctx.db
        .insert(files)
        .values({
          ownerId: a.id,
          storageKey,
          originalName,
          mimeType: mime,
          category,
          size,
          sha256: sha,
          purpose,
          channelId: channelId ?? null,
          folderId: folderId ?? null,
          description: description ?? '',
          width,
          height,
          isPublicAsset: PUBLIC_PURPOSES.has(purpose),
        })
        .returning();
      if (channelId && (purpose === 'library' || purpose === 'music')) ctx.realtime.toChannel(channelId, 'file:new', serializeFile(row));
      return reply.code(201).send(serializeFile(row));
    } finally {
      if (tmpPath) await fsp.unlink(tmpPath).catch(() => {});
    }
  });

  app.get('/api/files/:id', approved, async (req, reply) => {
    const id = uuidParam(req, 'id');
    const [f] = await ctx.db.select().from(files).where(eq(files.id, id));
    if (!f || !(await canAccessFile(ctx, req.authz!, f))) throw notFound('Arquivo não encontrado');
    const { download } = query(req, z.object({ download: z.enum(['0', '1']).optional() }));
    return streamFile(ctx, f, reply, req.headers.range, download === '1');
  });

  app.get('/api/files/:id/meta', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const [f] = await ctx.db.select().from(files).where(eq(files.id, id));
    if (!f || !(await canAccessFile(ctx, req.authz!, f))) throw notFound('Arquivo não encontrado');
    return serializeFile(f);
  });

  /** The community logo is the only file readable before login. */
  app.get('/api/public/logo', async (_req, reply) => {
    const s = await ctx.settings.get();
    if (!s.appearance.logoFileId) throw notFound();
    const [f] = await ctx.db.select().from(files).where(and(eq(files.id, s.appearance.logoFileId), eq(files.purpose, 'branding')));
    if (!f || f.deletedAt) throw notFound();
    return streamFile(ctx, f, reply, undefined, false);
  });

  app.delete('/api/files/:id', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const [f] = await ctx.db.select().from(files).where(eq(files.id, id));
    if (!f || f.deletedAt) throw notFound();
    const isOwner = f.ownerId === req.authz!.id;
    if (!isOwner && !ctx.perms.has(req.authz!, P.MANAGE_FILES)) throw forbidden();
    if (!isOwner && !(await canAccessFile(ctx, req.authz!, f))) throw notFound();
    await ctx.db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, id));
    if (!isOwner) await audit(ctx, { actorId: req.authz!.id, action: 'file.delete', targetType: 'file', targetId: id, ip: req.ip, metadata: { name: f.originalName, ownerId: f.ownerId } });
    if (f.channelId) ctx.realtime.toChannel(f.channelId, 'file:deleted', { id, channelId: f.channelId });
    return { ok: true };
  });

  app.get('/api/files/mine', approved, async (req) => {
    const rows = await ctx.db.select().from(files).where(eq(files.ownerId, req.authz!.id)).orderBy(desc(files.createdAt)).limit(500);
    const s = await ctx.settings.get();
    const used = rows.filter((r) => !r.deletedAt).reduce((acc, r) => acc + r.size, 0);
    return { files: rows.map((r) => ({ ...serializeFile(r), deletedAt: r.deletedAt })), usedBytes: used, quotaBytes: s.uploads.userQuotaMb * 1048576 };
  });

  /** Library listing for files/gallery channels, or every attachment shared in any channel. */
  app.get('/api/channels/:id/files', approved, async (req) => {
    const channelId = uuidParam(req, 'id');
    await requireChannel(ctx, req.authz!, channelId);
    const q = query(
      req,
      z.object({
        folderId: z.string().uuid().optional(),
        q: z.string().max(100).optional(),
        category: z.enum(['image', 'video', 'audio', 'document', 'pdf', 'archive']).optional(),
        purpose: z.enum(['library', 'music', 'all']).default('all'),
      }),
    );
    const rows = await ctx.db
      .select()
      .from(files)
      .where(
        and(
          eq(files.channelId, channelId),
          isNull(files.deletedAt),
          q.q ? undefined : q.folderId ? eq(files.folderId, q.folderId) : q.purpose === 'library' ? isNull(files.folderId) : undefined,
          q.q ? ilike(files.originalName, `%${q.q.replace(/[%_]/g, '')}%`) : undefined,
          q.category ? eq(files.category, q.category) : undefined,
          q.purpose === 'all' ? undefined : eq(files.purpose, q.purpose),
        ),
      )
      .orderBy(desc(files.createdAt))
      .limit(500);
    const fo = await ctx.db.select().from(folders).where(eq(folders.channelId, channelId)).orderBy(asc(folders.name));
    return { files: rows.map(serializeFile), folders: fo, users: await getPublicUsers(ctx, rows.map((r) => r.ownerId!).filter(Boolean)) };
  });

  app.post('/api/channels/:id/folders', approved, async (req) => {
    const channelId = uuidParam(req, 'id');
    await requireChannel(ctx, req.authz!, channelId, P.CREATE_POSTS);
    const input = z.object({ name: z.string().trim().min(1).max(80), parentId: z.string().uuid().nullable().optional() }).parse(req.body);
    if (input.parentId) {
      const [p] = await ctx.db.select().from(folders).where(eq(folders.id, input.parentId));
      if (!p || p.channelId !== channelId) throw badRequest('Pasta pai inválida');
    }
    const [f] = await ctx.db.insert(folders).values({ channelId, name: input.name, parentId: input.parentId ?? null, createdById: req.authz!.id }).returning();
    ctx.realtime.toChannel(channelId, 'folder:changed', { channelId });
    return f;
  });

  app.patch('/api/folders/:id', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const [f] = await ctx.db.select().from(folders).where(eq(folders.id, id));
    if (!f) throw notFound();
    const { perms } = await requireChannel(ctx, req.authz!, f.channelId, P.CREATE_POSTS);
    if (f.createdById !== req.authz!.id && !perms.has(P.MANAGE_MESSAGES)) throw forbidden();
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
    const [u] = await ctx.db.update(folders).set({ name }).where(eq(folders.id, id)).returning();
    ctx.realtime.toChannel(f.channelId, 'folder:changed', { channelId: f.channelId });
    return u;
  });

  app.delete('/api/folders/:id', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const [f] = await ctx.db.select().from(folders).where(eq(folders.id, id));
    if (!f) throw notFound();
    const { perms } = await requireChannel(ctx, req.authz!, f.channelId, P.CREATE_POSTS);
    if (f.createdById !== req.authz!.id && !perms.has(P.MANAGE_MESSAGES)) throw forbidden();
    await ctx.db.update(files).set({ folderId: f.parentId }).where(eq(files.folderId, id));
    await ctx.db.update(folders).set({ parentId: f.parentId }).where(eq(folders.parentId, id));
    await ctx.db.delete(folders).where(eq(folders.id, id));
    ctx.realtime.toChannel(f.channelId, 'folder:changed', { channelId: f.channelId });
    return { ok: true };
  });

  app.patch('/api/files/:id', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const input = z.object({ folderId: z.string().uuid().nullable().optional(), description: z.string().max(300).optional(), name: z.string().trim().min(1).max(200).optional() }).parse(req.body);
    const [f] = await ctx.db.select().from(files).where(eq(files.id, id));
    if (!f || f.deletedAt) throw notFound();
    if (f.ownerId !== req.authz!.id && !ctx.perms.has(req.authz!, P.MANAGE_FILES)) throw forbidden();
    if (input.folderId) {
      const [fo] = await ctx.db.select().from(folders).where(eq(folders.id, input.folderId));
      if (!fo || fo.channelId !== f.channelId) throw badRequest('Pasta inválida');
    }
    const [u] = await ctx.db
      .update(files)
      .set({ folderId: input.folderId === undefined ? f.folderId : input.folderId, description: input.description ?? f.description, originalName: input.name ?? f.originalName })
      .where(eq(files.id, id))
      .returning();
    if (f.channelId) ctx.realtime.toChannel(f.channelId, 'folder:changed', { channelId: f.channelId });
    return serializeFile(u);
  });

  app.get('/api/admin/files', { preHandler: g.perm(P.MANAGE_FILES, P.MANAGE_SETTINGS) }, async (req) => {
    const q = query(req, z.object({ q: z.string().max(100).optional(), deleted: z.enum(['0', '1']).default('0') }));
    const rows = await ctx.db
      .select({ file: files, channelName: channels.name, channelType: channels.type })
      .from(files)
      .leftJoin(channels, eq(channels.id, files.channelId))
      .where(and(q.deleted === '1' ? undefined : isNull(files.deletedAt), q.q ? ilike(files.originalName, `%${q.q.replace(/[%_]/g, '')}%`) : undefined))
      .orderBy(desc(files.createdAt))
      .limit(500);
    // Files shared in private conversations are listed without names to preserve privacy.
    const out = rows.map((r) => {
      const priv = r.channelType === 'dm' || r.channelType === 'group_dm';
      return { ...serializeFile(r.file), name: priv ? '(conversa privada)' : r.file.originalName, channelName: priv ? null : r.channelName, deletedAt: r.file.deletedAt };
    });
    const [{ total }] = await ctx.db.select({ total: sql<number>`coalesce(sum(${files.size}),0)::bigint` }).from(files).where(isNull(files.deletedAt));
    const byCategory = await ctx.db
      .select({ category: files.category, n: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${files.size}),0)::bigint` })
      .from(files)
      .where(isNull(files.deletedAt))
      .groupBy(files.category);
    return { files: out, totalBytes: Number(total), byCategory: byCategory.map((b) => ({ ...b, bytes: Number(b.bytes) })), users: await getPublicUsers(ctx, rows.map((r) => r.file.ownerId!).filter(Boolean)) };
  });

  app.post('/api/admin/files/purge', { preHandler: g.owner }, async (req) => {
    const n = await purgeDeletedFiles(ctx, 0);
    await audit(ctx, { actorId: req.authz!.id, action: 'files.purge', ip: req.ip, metadata: { purged: n } });
    return { purged: n };
  });

  void inArray;
}

/** Removes soft-deleted files from storage after the retention period. */
export async function purgeDeletedFiles(ctx: AppContext, olderThanDays: number) {
  const cutoff = new Date(Date.now() - olderThanDays * 86400_000);
  const rows = await ctx.db.select().from(files).where(sql`${files.deletedAt} is not null and ${files.deletedAt} < ${cutoff}`).limit(500);
  for (const f of rows) {
    await ctx.storage.delete(f.storageKey).catch((err) => ctx.log.warn({ err }, 'storage delete failed'));
    await ctx.db.delete(files).where(eq(files.id, f.id));
  }
  return rows.length;
}

export { ALLOWED_MIME };
