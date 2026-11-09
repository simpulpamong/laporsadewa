import { createRequire } from 'module';
import path from 'path';
import { pathToFileURL } from 'url';

export const config = {
  api: {
    bodyParser: false, // Express handles parsing; limit disesuaikan untuk Vercel serverless (~4.5MB)
  },
};

type AnyHandler = (req: any, res: any) => any;

let cached: AnyHandler | null = null;

function pickFn(mod: any): AnyHandler | null {
  const fn = mod?.default || mod?.handler || mod;
  return typeof fn === 'function' ? fn : null;
}

async function loadHandler(): Promise<AnyHandler> {
  if (cached) return cached;
  const errors: string[] = [];
  const req = createRequire(import.meta.url);

  // literal relative paths help Vercel NFT tracing
  try { const fn = pickFn(req('../dist/server.cjs')); if (fn) { cached = fn; return fn; } errors.push('../dist/server.cjs: export bukan function'); } catch (e: any) { errors.push(`../dist/server.cjs: ${e?.message || e}`); }
  try { const fn = pickFn(req('../dist/server.js')); if (fn) { cached = fn; return fn; } errors.push('../dist/server.js: export bukan function'); } catch (e: any) { errors.push(`../dist/server.js: ${e?.message || e}`); }

  for (const p of [path.resolve(process.cwd(), 'dist/server.cjs'), path.resolve(process.cwd(), 'dist/server.js')]) {
    try { const fn = pickFn(req(p)); if (fn) { cached = fn; return fn; } errors.push(`${p}: export bukan function`); }
    catch (e: any) { errors.push(`${p}: ${e?.message || e}`); }
  }

  try {
    const mod = await import(pathToFileURL(path.resolve(process.cwd(), 'dist/server.js')).href);
    const fn = pickFn(mod);
    if (fn) { cached = fn; return fn; }
  } catch (e: any) { errors.push(`esm dist/server.js: ${e?.message || e}`); }

  throw new Error(`SADEWA Admin API handler tidak ditemukan. Pastikan build menghasilkan dist/server.cjs.\n${errors.join('\n')}`);
}

export default async function handler(req: any, res: any) {
  try {
    const fn = await loadHandler();
    return await fn(req, res);
  } catch (e: any) {
    console.error('[api/index] bootstrap failed:', e?.message || e);
    res.status(500).json({ success: false, message: e?.message || 'API gagal dimuat.' });
  }
}

