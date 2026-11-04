import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import type { Config } from '../config';

export interface StoredObject {
  stream: Readable;
  size: number;
  start?: number;
  end?: number;
}

/** Private object storage. Objects are never exposed by URL; the API streams them after permission checks. */
export interface Storage {
  putFile(key: string, filePath: string, mime: string): Promise<void>;
  get(key: string, range?: { start: number; end: number }): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  init(): Promise<void>;
  usage(): Promise<{ bytes: number; objects: number } | null>;
}

function safeKey(key: string) {
  if (!/^[a-z0-9/_-]+$/i.test(key) || key.includes('..')) throw new Error('Invalid storage key');
  return key;
}

export function createLocalStorage(dir: string): Storage {
  const root = path.resolve(dir);
  const full = (key: string) => {
    const p = path.resolve(root, safeKey(key));
    if (!p.startsWith(root + path.sep)) throw new Error('Invalid storage path');
    return p;
  };
  return {
    async init() {
      await fsp.mkdir(root, { recursive: true });
    },
    async putFile(key, filePath) {
      const dest = full(key);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      try {
        await fsp.rename(filePath, dest);
      } catch {
        await fsp.copyFile(filePath, dest);
        await fsp.unlink(filePath).catch(() => {});
      }
    },
    async get(key, range) {
      const p = full(key);
      const stat = await fsp.stat(p);
      const stream = range ? fs.createReadStream(p, { start: range.start, end: range.end }) : fs.createReadStream(p);
      return { stream, size: stat.size, start: range?.start, end: range?.end };
    },
    async delete(key) {
      await fsp.unlink(full(key)).catch(() => {});
    },
    async usage() {
      let bytes = 0;
      let objects = 0;
      const walk = async (d: string) => {
        for (const e of await fsp.readdir(d, { withFileTypes: true }).catch(() => [])) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) await walk(p);
          else {
            objects++;
            bytes += (await fsp.stat(p)).size;
          }
        }
      };
      await walk(root);
      return { bytes, objects };
    },
  };
}

export function createS3Storage(c: Config): Storage {
  const client = new S3Client({
    region: c.S3_REGION,
    endpoint: c.S3_ENDPOINT,
    forcePathStyle: c.S3_FORCE_PATH_STYLE,
    credentials: c.S3_ACCESS_KEY && c.S3_SECRET_KEY ? { accessKeyId: c.S3_ACCESS_KEY, secretAccessKey: c.S3_SECRET_KEY } : undefined,
  });
  const Bucket = c.S3_BUCKET;
  return {
    async init() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket }));
      }
    },
    async putFile(key, filePath, mime) {
      const stat = await fsp.stat(filePath);
      await client.send(
        new PutObjectCommand({ Bucket, Key: safeKey(key), Body: fs.createReadStream(filePath), ContentType: mime, ContentLength: stat.size }),
      );
      await fsp.unlink(filePath).catch(() => {});
    },
    async get(key, range) {
      const res = await client.send(
        new GetObjectCommand({ Bucket, Key: safeKey(key), Range: range ? `bytes=${range.start}-${range.end}` : undefined }),
      );
      const total = res.ContentRange ? Number(res.ContentRange.split('/')[1]) : Number(res.ContentLength ?? 0);
      return { stream: res.Body as Readable, size: total, start: range?.start, end: range?.end };
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: safeKey(key) }));
    },
    async usage() {
      return null;
    },
  };
}

export const createStorage = (c: Config) => (c.STORAGE_DRIVER === 's3' ? createS3Storage(c) : createLocalStorage(c.STORAGE_LOCAL_DIR));
