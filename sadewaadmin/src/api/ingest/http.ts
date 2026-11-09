import type { Request, Response } from 'express';

export const MAX_BODY_BYTES = 8 * 1024 * 1024;

export type ApiFail = { success: false; message: string; code?: string };
export function ok<T extends object>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, ...data });
}
export function fail(res: Response, message: string, status = 400, code?: string) {
  return res.status(status).json({ success: false, message, code } as ApiFail);
}

export class ApiError extends Error {
  constructor(message: string, readonly status = 400, readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function toError(res: Response, error: unknown) {
  if (error instanceof ApiError) return fail(res, error.message, error.status, error.code);
  const message = error instanceof Error ? error.message : String(error);
  console.error('[api]', error);
  return fail(res, `Kesalahan server: ${message}`, 500);
}

export function str(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Rate limit sederhana per instance (parsial pada serverless). */
const _rl = new Map<string, { n: number; reset: number }>();
export function checkRateLimit(req: Request, bucket: string, limit: number, windowMs: number) {
  const xf = String(req.headers['x-forwarded-for'] || '');
  const ip = (xf.split(',')[0] || String(req.headers['x-real-ip'] || (req as any).ip || 'unknown')).trim().slice(0, 80);
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const cur = _rl.get(key);
  if (!cur || cur.reset <= now) { _rl.set(key, { n: 1, reset: now + windowMs }); return; }
  cur.n += 1;
  if (cur.n > limit) throw new ApiError('Terlalu banyak permintaan. Coba lagi sebentar.', 429, 'rate_limited');
  if (_rl.size > 5000) { for (const [k, v] of _rl) if (v.reset <= now) _rl.delete(k); }
}

export function assertImageDataUrl(dataUrl: string): { mime: string } {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    throw new ApiError('Data foto tidak valid.', 400, 'invalid_photo');
  }
  const head = /^data:(image\/(jpeg|png|webp|gif));base64,/.exec(dataUrl);
  if (!head) throw new ApiError('Format foto harus JPEG, PNG, atau WebP.', 400, 'invalid_photo_type');
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1, dataUrl.indexOf(',') + 25).replace(/\s/g, '');
  try {
    const bytes = Buffer.from(b64, 'base64');
    const okSig = (head[2] === 'jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8)
      || (head[2] === 'png' && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
      || (head[2] === 'gif' && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)
      || (head[2] === 'webp' && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46);
    if (!okSig) throw new ApiError('Isi file foto tidak valid.', 400, 'invalid_photo_signature');
  } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError('Data foto tidak dapat dibaca.', 400, 'invalid_photo'); }
  return { mime: head[1] };
}

export function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : min;
}
