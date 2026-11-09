'use client';

import { apiFetch, RequestError, withRetry } from './apiClient';
import type { ServerConfig, UploadMode } from './types';

/**
 * Unggah foto.
 *
 * Mode utama: tanda tangan dibuat server, lalu foto dikirim langsung dari
 * browser ke Cloudinary. Ini menghindari batas payload 4.5 MB pada fungsi
 * server dan membuat unggahan jauh lebih cepat.
 *
 * Mode cadangan: bila penandatanganan tidak tersedia, foto dikirim ke server
 * sebagai multipart.
 */

export interface SignResponse {
  mode: UploadMode;
  params: {
    signature: string;
    apiKey: string;
    cloudName: string;
    timestamp: number;
    folder: string;
    publicId: string;
    tags: string[];
    context: Record<string, string>;
  } | null;
  config: ServerConfig;
}

export interface UploadedAsset {
  publicId: string;
  url: string;
  bytes?: number;
  width?: number;
  height?: number;
}

interface SignCache {
  mode: UploadMode;
  config: ServerConfig;
  used: number;
}

let signCache: SignCache | null = null;
let signInFlight: Promise<SignCache> | null = null;

/** Ambil (dan cache) status konfigurasi + mode unggah. */
export async function resolveUploadMode(scope: string): Promise<SignCache> {
  if (signCache && signCache.used < 40) {
    signCache.used += 1;
    return signCache;
  }
  if (!signInFlight) {
    signInFlight = apiFetch<SignResponse>(`/api/sign?scope=${encodeURIComponent(scope)}&index=1`, {
      timeout: 12_000,
    })
      .then(response => {
        signCache = { mode: response.mode, config: response.config, used: 1 };
        return signCache;
      })
      .catch(() => {
        // Server tidak dapat dihubungi → tetap coba unggah lewat server.
        signCache = {
          mode: 'server',
          config: {
            cloudinary: false, firebase: false, google: false,
            sheet: false, drive: false, appsScript: false,
          },
          used: 1,
        };
        return signCache;
      })
      .finally(() => {
        signInFlight = null;
      });
  }
  return signInFlight;
}

async function requestSignature(scope: string, index: number): Promise<SignResponse> {
  const response = await apiFetch<SignResponse>(
    `/api/sign?scope=${encodeURIComponent(scope)}&index=${index}`,
    { timeout: 12_000 },
  );
  return response;
}

async function uploadToCloudinary(
  file: Blob,
  scope: string,
  index: number,
  context: Record<string, string>,
  signal?: AbortSignal,
): Promise<UploadedAsset> {
  const sign = await requestSignature(scope, index);
  if (sign.mode !== 'direct' || !sign.params) {
    throw new RequestError('Upload langsung tidak tersedia.', 'no_signature', 400);
  }

  const { params } = sign;
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', params.apiKey);
  form.append('timestamp', String(params.timestamp));
  form.append('signature', params.signature);
  form.append('folder', params.folder);
  form.append('public_id', params.publicId);
  if (params.tags.length) form.append('tags', params.tags.join(','));
  const mergedContext = { ...params.context, ...context };
  const contextPairs = Object.entries(mergedContext)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join('|');
  if (contextPairs) form.append('context', contextPairs);

  const response = await fetchWithTimeout(
    `https://api.cloudinary.com/v1_1/${params.cloudName}/image/upload`,
    { method: 'POST', body: form },
    60_000,
    signal,
  );

  if (!response.ok) {
    throw new RequestError(`Cloudinary menolak unggahan (${response.status}).`, 'cloudinary', response.status);
  }

  const result = (await response.json()) as {
    secure_url: string;
    public_id: string;
    bytes?: number;
    width?: number;
    height?: number;
  };

  if (!result.public_id || !result.secure_url) {
    throw new RequestError('Cloudinary tidak mengembalikan data foto yang valid.', 'invalid_upload_response');
  }

  return {
    publicId: result.public_id,
    url: result.secure_url,
    bytes: result.bytes,
    width: result.width,
    height: result.height,
  };
}

async function uploadViaServer(
  file: Blob,
  scope: string,
  context: Record<string, string>,
  signal?: AbortSignal,
): Promise<UploadedAsset> {
  const form = new FormData();
  form.append('scope', scope);
  form.append('konteks', JSON.stringify(context));
  form.append('foto', file, 'foto.jpg');

  const response = await fetchWithTimeout('/api/upload', { method: 'POST', body: form }, 60_000, signal);
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    throw new RequestError(payload?.message || `Server menolak unggahan (${response.status}).`, 'upload', response.status);
  }

  if (typeof payload.publicId !== 'string' || typeof payload.url !== 'string') {
    throw new RequestError('Server tidak mengembalikan data foto yang valid.', 'invalid_upload_response');
  }

  return { publicId: payload.publicId, url: payload.url };
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeout: number,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const abort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  externalSignal?.addEventListener('abort', abort, { once: true });

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new RequestError(
        externalSignal?.aborted ? 'Unggahan dibatalkan.' : 'Unggahan terlalu lama, coba lagi.',
        externalSignal?.aborted ? 'aborted' : 'timeout',
      );
    }
    throw new RequestError('Koneksi unggah terputus. Periksa internet lalu coba lagi.', 'network');
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abort);
  }
}

export interface UploadPhotoOptions {
  file: Blob;
  scope: string;
  index: number;
  context?: Record<string, string>;
  signal?: AbortSignal;
  attempts?: number;
}

/** Unggah satu foto dengan fallback otomatis dan satu kali pengulangan. */
export async function uploadPhoto(options: UploadPhotoOptions): Promise<UploadedAsset> {
  const { file, scope, index, context = {}, signal, attempts = 2 } = options;
  const mode = await resolveUploadMode(scope).catch(() => null);

  const run = async (): Promise<UploadedAsset> => {
    if (mode?.mode === 'direct') {
      try {
        return await uploadToCloudinary(file, scope, index, context, signal);
      } catch (error) {
        if (signal?.aborted) throw error;
        console.warn('[upload] upload langsung gagal, beralih ke server', error);
        return uploadViaServer(file, scope, context, signal);
      }
    }
    return uploadViaServer(file, scope, context, signal);
  };

  return withRetry(run, attempts, 500);
}
