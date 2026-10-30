import type { FastifyRequest } from 'fastify';
import type { ZodSchema, z } from 'zod';
import { badRequest } from './errors';

export function parse<S extends ZodSchema>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw badRequest(first?.message ?? 'Dados inválidos', 'VALIDATION', r.error.flatten());
  }
  return r.data;
}

export const body = <S extends ZodSchema>(req: FastifyRequest, schema: S) => parse(schema, req.body ?? {});
export const query = <S extends ZodSchema>(req: FastifyRequest, schema: S) => parse(schema, req.query ?? {});

export function param(req: FastifyRequest, name: string): string {
  const v = (req.params as Record<string, string>)[name];
  if (!v) throw badRequest(`Parâmetro ausente: ${name}`);
  return v;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidParam(req: FastifyRequest, name: string) {
  const v = param(req, name);
  if (!UUID_RE.test(v)) throw badRequest('Identificador inválido');
  return v;
}

export function bigintParam(req: FastifyRequest, name: string) {
  const v = param(req, name);
  if (!/^\d{1,19}$/.test(v)) throw badRequest('Identificador inválido');
  return BigInt(v);
}

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/** JSON-safe serialization: bigint ids become strings. */
export function json<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}
