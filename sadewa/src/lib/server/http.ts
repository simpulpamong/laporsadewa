import { NextResponse } from 'next/server';

/** Batas payload per request untuk satu foto (≈ ≤ 400 KB setelah diproses). */
export const MAX_BODY_BYTES = 5 * 1024 * 1024;

export type ApiOk<T> = { success: true } & T;
export type ApiFail = { success: false; message: string; code?: string };

export function ok<T extends object>(data: T, status = 200) {
  return NextResponse.json({ success: true, ...data } as ApiOk<T>, { status });
}

export function fail(message: string, status = 400, code?: string) {
  return NextResponse.json({ success: false, message, code } as ApiFail, { status });
}

export class ApiError extends Error {
  constructor(message: string, readonly status = 400, readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Ubah error tak terduga menjadi pesan yang aman ditampilkan ke pengguna. */
export function toErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return fail(error.message, error.status, error.code);
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error('[api]', error);
  return fail(`Kesalahan server: ${message}`, 500);
}

/** Bungkus handler route agar error tidak bocor sebagai 500 tanpa pesan. */
export async function route(handler: () => Promise<NextResponse>) {
  try {
    return await handler();
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Baca body JSON dengan batas ukuran dan pesan error yang jelas. */
export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  const declared = Number(request.headers.get('content-length') || '0');
  if (declared && declared > MAX_BODY_BYTES) {
    throw new ApiError('Data yang dikirim terlalu besar.', 413, 'payload_too_large');
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new ApiError('Permintaan tidak dapat dibaca.', 400);
  }

  if (text.length > MAX_BODY_BYTES) {
    throw new ApiError('Data yang dikirim terlalu besar.', 413, 'payload_too_large');
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError('Format data tidak valid.', 400, 'invalid_json');
  }
}

export function str(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Rate limit sederhana per instance (parsial pada serverless). */
const _rl = new Map<string, { n: number; reset: number }>();
export function checkRateLimit(request: Request, bucket: string, limit: number, windowMs: number) {
  const xf = request.headers.get('x-forwarded-for') || '';
  const ip = (xf.split(',')[0] || request.headers.get('x-real-ip') || 'unknown').trim().slice(0, 80);
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const cur = _rl.get(key);
  if (!cur || cur.reset <= now) { _rl.set(key, { n: 1, reset: now + windowMs }); return; }
  cur.n += 1;
  if (cur.n > limit) throw new ApiError('Terlalu banyak permintaan. Coba lagi sebentar.', 429, 'rate_limited');
  if (_rl.size > 5000) { for (const [k, v] of _rl) if (v.reset <= now) _rl.delete(k); }
}

/** Validasi data URL gambar + magic bytes dasar (JPEG/PNG/WebP/GIF). */
export function assertImageDataUrl(dataUrl: string, _field = 'foto'): { mime: string } {
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
