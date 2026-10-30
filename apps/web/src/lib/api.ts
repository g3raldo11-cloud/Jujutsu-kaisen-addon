export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Listener = (err: ApiError) => void;
const listeners = new Set<Listener>();
/** Global hooks for session-level failures (logged out, access revoked, maintenance). */
export const onApiError = (fn: Listener) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function csrfToken() {
  return document.cookie.match(/(?:^|; )ouroboros_csrf=([^;]+)/)?.[1] ?? '';
}

async function ensureCsrf() {
  if (!csrfToken()) await fetch('/api/auth/csrf', { credentials: 'same-origin' });
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  if (method !== 'GET') await ensureCsrf();
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    signal: opts.signal,
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'x-csrf-token': csrfToken() } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'Algo deu errado. Tente novamente.', data?.error?.details);
    listeners.forEach((l) => l(err));
    throw err;
  }
  return data as T;
}

export const get = <T = any>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const post = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const patch = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'PATCH', body });
export const put = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'PUT', body });
export const del = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });

export interface UploadedFile {
  id: string;
  name: string;
  mimeType: string;
  category: string;
  size: number;
  width: number | null;
  height: number | null;
}

/** Multipart upload with progress (fields are sent before the file so the server can apply limits). */
export async function upload(file: Blob & { name?: string }, fields: Record<string, string> = {}, onProgress?: (p: number) => void): Promise<UploadedFile> {
  await ensureCsrf();
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', file, file.name ?? 'arquivo');
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files');
    xhr.withCredentials = true;
    xhr.setRequestHeader('x-csrf-token', csrfToken());
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'Falha no envio'));
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'Falha de conexão durante o envio'));
    xhr.send(form);
  });
}

export const fileUrl = (id: string, download = false) => `/api/files/${id}${download ? '?download=1' : ''}`;
