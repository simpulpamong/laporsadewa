'use client';

/** Klien HTTP tipis dengan timeout, error terstruktur, dan pembatas paralelisme. */

export type ApiResult<T = Record<string, unknown>> = {
  success: boolean;
  message?: string;
  code?: string;
} & T;

export class RequestError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) {
    super(message);
    this.name = 'RequestError';
  }
}

const DEFAULT_TIMEOUT = 70_000;

export interface FetchOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  timeout?: number;
  signal?: AbortSignal;
}

export async function apiFetch<T = Record<string, unknown>>(
  url: string,
  options: FetchOptions = {},
): Promise<ApiResult<T>> {
  const { method = 'GET', body, timeout = DEFAULT_TIMEOUT, signal } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const abortExternal = () => controller.abort();
  signal?.addEventListener('abort', abortExternal);

  try {
    const response = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });

    let payload: any = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok || payload?.success === false) {
      throw new RequestError(
        payload?.message || `Permintaan gagal (${response.status}).`,
        payload?.code,
        response.status,
      );
    }

    return (payload || { success: true }) as ApiResult<T>;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if ((error as Error)?.name === 'AbortError') {
      throw new RequestError(
        signal?.aborted ? 'Permintaan dibatalkan.' : 'Koneksi terlalu lama, coba lagi.',
        'timeout',
      );
    }
    throw new RequestError(
      'Tidak dapat menghubungi server. Periksa koneksi internet.',
      'network',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortExternal);
  }
}

/**
 * Jalankan worker untuk seluruh item dengan batas konkurensi.
 * Hasil pada posisi yang gagal berisi `Error` agar UI bisa melapor Precisely.
 */
export async function parallelLimit<T, R>(
  items: T[],
  worker: (index: number, item: T) => Promise<R>,
  concurrency = 4,
): Promise<Array<R | Error>> {
  const results: Array<R | Error> = new Array(items.length);
  let cursor = 0;

  const runner = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(index, items[index]);
      } catch (error) {
        results[index] = error instanceof Error ? error : new Error(String(error));
      }
    }
  };

  const pool = Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, runner);
  await Promise.all(pool);
  return results;
}

/** Ulangi sekali dengan jeda singkat — cukup untuk overcoming gangguan sesaat. */
export async function withRetry<T>(task: () => Promise<T>, attempts = 2, delayMs = 400): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      // Jangan mengulang validation/4xx/auth errors: pada operasi upload/submit,
      // retry buta dapat membuat file atau baris Sheet ganda.
      const status = typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : 0;
      const message = error instanceof Error ? error.message : String(error);
      const nonTransient = (status >= 400 && status < 500) || /invalid|unauthorized|forbidden|payload|lengkap|kosong/i.test(message);
      if (nonTransient || attempt >= attempts - 1) break;
      const jitter = Math.round(Math.random() * Math.min(delayMs, 250));
      await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1) + jitter));
    }
  }
  throw lastError;
}

/** Tambah waktu untuk jaringan seluler lambat agar upload besar tidak gagal prematur. */
export function adaptiveTimeout(baseMs: number): number {
  if (typeof navigator === 'undefined') return baseMs;
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;
  if (connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') return baseMs * 2;
  if (connection?.effectiveType === '3g' || connection?.saveData) return Math.round(baseMs * 1.5);
  return baseMs;
}

/** Batas konkurensi menyesuaikan perangkat agar HP kelas bawah tetap lancar. */
export function adaptiveConcurrency(max = 6): number {
  if (typeof navigator === 'undefined') return 3;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; saveData?: boolean };
  };
  const effective = nav.connection?.effectiveType || '';
  if (effective === 'slow-2g' || effective === '2g') return 2;
  if (nav.connection?.saveData) return 2;
  if (effective === '3g') return 3;
  const memory = nav.deviceMemory || 4;
  if (memory <= 2) return 2;
  if (memory <= 4) return 4;
  return max;
}
