import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { handleSadewaAction } from './ingest/sadewaRoutes';
import { handleDraftsGet, handleDraftsPost } from './ingest/draftsRoutes';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { handleExportPdf } from './exportPdf';

// Load env: admin .env → sibling SADEWA .env → /data/SiproGo/sadewa/.env (shared, sama dengan SADEWA)
function loadEnvFile(p: string) {
  try {
    if (!fs.existsSync(p)) return;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim(); if (!t || t.startsWith('#')) continue;
      const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m || process.env[m[1]] !== undefined) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  } catch {}
}
const here = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
for (const p of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../sadewa/.env'),
  path.resolve(here, '../../../sadewa/.env'),
  path.resolve(here, '../../sadewa/.env'),
  '/data/Sadewa/sadewa/.env',
  '/data/SiproGo/sadewa/.env',
]) loadEnvFile(p);

type Role = 'superadmin' | 'admin';
interface Session { userId: string; username: string; role: Role; categoryScopes: string[]; exp: number }
interface StoredSession extends Session { createdAt: number }
const sessions = new Map<string, Session>(); // cache lokal (cepat, fallback instance); sumber kebenaran = Firestore admin_sessions
const SESSION_TTL = 10 * 60 * 60 * 1000; // 10h
const SESSION_CACHE_TTL = 60_000;
const sessionCacheAt = new Map<string, number>();
const SESSIONS_COL = 'admin_sessions';

function sessionDocId(token: string) { return crypto.createHash('sha256').update(token).digest('hex'); }
function cacheSession(token: string, s: Session) { sessions.set(token, s); sessionCacheAt.set(token, Date.now()); }
function dropSessionCache(token: string) { sessions.delete(token); sessionCacheAt.delete(token); }
async function persistSession(token: string, s: Session) {
  const db = getDb();
  await db.collection(SESSIONS_COL).doc(sessionDocId(token)).set({ ...s, createdAt: Date.now() }, { merge: false });
}
async function readPersistedSession(token: string): Promise<Session | null> {
  try {
    const db = getDb();
    const ref = db.collection(SESSIONS_COL).doc(sessionDocId(token));
    const snap = await ref.get();
    if (!snap.exists) return null;
    const d = snap.data() as any;
    const exp = Number(d?.exp || 0);
    if (!Number.isFinite(exp) || exp < Date.now()) { await ref.delete().catch(() => {}); return null; }
    if (!d?.userId || !d?.username || (d.role !== 'superadmin' && d.role !== 'admin')) { await ref.delete().catch(() => {}); return null; }
    return { userId: String(d.userId), username: String(d.username).slice(0, 80), role: d.role, categoryScopes: Array.isArray(d.categoryScopes) ? d.categoryScopes.filter((x: any) => typeof x === 'string') : [], exp };
  } catch { return null; }
}
async function deletePersistedSession(token: string) {
  try { await getDb().collection(SESSIONS_COL).doc(sessionDocId(token)).delete(); } catch {}
}

// --- brute-force / login hardening (in-memory) ---
type LoginAttempt = { fails: number; lockUntil: number; last: number };
const loginAttempts = new Map<string, LoginAttempt>();
const LOGIN_MAX_FAILS = 8;
const LOGIN_LOCK_MS = 10 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
function ipOf(req: express.Request) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}
function loginKey(req: express.Request, username: string) {
  return `${ipOf(req)}|${String(username || '').toLowerCase().trim().slice(0, 80)}`;
}
function getAttempt(key: string): LoginAttempt | null {
  const a = loginAttempts.get(key);
  if (!a) return null;
  if (Date.now() - a.last > LOGIN_WINDOW_MS && a.lockUntil < Date.now()) { loginAttempts.delete(key); return null; }
  return a;
}
function noteFail(key: string) {
  const a = getAttempt(key) || { fails: 0, lockUntil: 0, last: 0 };
  a.fails += 1; a.last = Date.now();
  if (a.fails >= LOGIN_MAX_FAILS) { a.lockUntil = Date.now() + LOGIN_LOCK_MS; a.fails = 0; }
  loginAttempts.set(key, a);
  return a;
}
function clearFail(key: string) { loginAttempts.delete(key); }
function safeMsg(e: any) { return (e && typeof e.message === 'string') ? e.message : 'Terjadi kesalahan.'; }
function safeStr(v: any, max: number) { return typeof v === 'string' ? v.trim().slice(0, max) : (v == null ? '' : String(v).slice(0, max)); }
setInterval(() => {
  const now = Date.now();
  for (const [k, s] of sessions) if (!s || s.exp < now) dropSessionCache(k);
  for (const [k, at] of sessionCacheAt) if (!sessions.has(k) || (at || 0) < now - SESSION_TTL) dropSessionCache(k);
  for (const [k, a] of loginAttempts) if (now - a.last > LOGIN_WINDOW_MS && a.lockUntil < now) loginAttempts.delete(k);
}, 5 * 60 * 1000).unref?.();

function parseServiceAccount(rawInput: string) {
  let raw = String(rawInput || '').trim();
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT kosong.');
  // support base64-encoded JSON env (common in some deploy setups)
  if (!raw.startsWith('{')) {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8').trim();
      if (decoded.startsWith('{')) raw = decoded;
    } catch {}
  }
  let sa: any;
  try { sa = JSON.parse(raw); } catch {
    // tolerate envs that store literal newlines/escaped sequences oddly
    try { sa = JSON.parse(raw.replace(/\r\n/g, '\n')); } catch (e: any) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT bukan JSON valid.');
    }
  }
  if (sa?.private_key && typeof sa.private_key === 'string') {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }
  if (!sa?.project_id || !sa?.client_email || !sa?.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT tidak lengkap (butuh project_id, client_email, private_key).');
  }
  return sa;
}

function getDb() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT belum dikonfigurasi pada server.');
  const sa = parseServiceAccount(raw);
  const app = getApps()[0] || initializeApp({ credential: cert(sa) });
  return getFirestore(app);
}

async function callAppsScript(action: string, data: any = {}) {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) return { ok: false, skipped: true, message: 'APPS_SCRIPT_URL belum dikonfigurasi.' };
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token: process.env.APPS_SCRIPT_TOKEN || '', data }),
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok || json?.success === false) return { ok: false, message: json?.message || `Apps Script error ${res.status}`, json };
  return { ok: true, json };
}

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `item-${Date.now()}`;
}

let _appPromise: Promise<express.Express> | null = null;

async function createApp(): Promise<express.Express> {
  const app = express();
  const PORT = Number(process.env.PORT || 3010);
  const isVercel = Boolean(process.env.VERCEL);
  const allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:5175,http://localhost:3010').split(',').map(s => s.trim()).filter(Boolean);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    if (isVercel || process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  app.use(cors({
    origin: (o, cb) => {
      if (!o) return cb(null, true);
      if (allowed.includes(o)) return cb(null, true);
      if (isVercel && /\.vercel\.app$/.test(o)) return cb(null, true); // same-project preview/prod domains
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization','X-Session','X-Bootstrap-Key'],
  }));
  app.use(express.json({ limit: '4mb' })); // Vercel serverless membatasi body request (~4.5MB). Upload Drive base64 besar gunakan Apps Script/Drive langsung; gambar dikompresi & divalidasi per endpoint.

  app.get('/api/health', async (_req, res) => {
    try {
      await getDb().collection('admin_users').limit(1).get();
      res.json({ success: true, services: { firestore: 'connected' } });
    } catch (e: any) {
      console.error('[health] Firestore check failed:', e?.message || e);
      res.status(503).json({ success: false, message: 'Koneksi Firestore tidak tersedia.' });
    }
  });

  const bearerToken = (req: express.Request) => ((req.headers.authorization || '').replace(/^Bearer\s+/i, '') || (req.headers['x-session'] as string) || '').trim();
  const auth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ success: false, message: 'Sesi tidak valid / berakhir.' });
    const now = Date.now();
    const cached = sessions.get(token);
    if (cached && cached.exp >= now && (sessionCacheAt.get(token) || 0) > now - SESSION_CACHE_TTL) {
      (req as any).session = cached; (req as any).sessionToken = token; return next();
    }
    if (cached && cached.exp < now) dropSessionCache(token);
    const s = await readPersistedSession(token);
    if (!s) { dropSessionCache(token); return res.status(401).json({ success: false, message: 'Sesi tidak valid / berakhir.' }); }
    cacheSession(token, s);
    (req as any).session = s; (req as any).sessionToken = token; next();
  };
  const superOnly = (req: any, res: any, next: any) => req.session?.role === 'superadmin' ? next() : res.status(403).json({ success: false, message: 'Akses khusus superadmin.' });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};
      const uname = String(username || '').toLowerCase().trim().slice(0, 80);
      const pw = String(password || '');
      if (!uname || !pw) return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });
      const key = loginKey(req, uname);
      const att = getAttempt(key);
      if (att && att.lockUntil > Date.now()) {
        const wait = Math.max(1, Math.ceil((att.lockUntil - Date.now()) / 1000));
        return res.status(429).json({ success: false, message: `Terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil(wait / 60)} menit.` });
      }
      const db = getDb();
      const q = await db.collection('admin_users').where('username', '==', uname).limit(1).get();
      const fail = async () => { noteFail(key); await new Promise(r => setTimeout(r, 350)); return res.status(401).json({ success: false, message: 'Username/password salah.' }); };
      if (q.empty) return fail();
      const doc = q.docs[0]; const u = doc.data() as any;
      if (u.active === false) { noteFail(key); return res.status(403).json({ success: false, message: 'Akun nonaktif.' }); }
      const hash = String(u.passwordHash || u.password || '');
      let ok = false;
      if (hash.startsWith('$2')) {
        ok = await bcrypt.compare(pw, hash);
      } else if (hash) {
        // legacy/plain fallback (migrate on successful login)
        ok = hash === pw;
        if (ok) {
          try { await doc.ref.set({ passwordHash: await bcrypt.hash(pw, 12), password: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); } catch {}
        }
      }
      if (!ok) return fail();
      clearFail(key);
      const token = crypto.randomBytes(24).toString('hex');
      const session: Session = { userId: doc.id, username: safeStr(u.username, 80), role: (u.role === 'superadmin' ? 'superadmin' : 'admin'), categoryScopes: Array.isArray(u.categoryScopes) ? u.categoryScopes.filter((x: any) => typeof x === 'string') : [], exp: Date.now() + SESSION_TTL };
      await persistSession(token, session);
      cacheSession(token, session);
      res.json({ success: true, token, user: { id: doc.id, username: session.username, displayName: safeStr(u.displayName || u.nama || u.username, 80), role: session.role, categoryScopes: session.categoryScopes, active: true } });
    } catch (e: any) {
      const msg = safeMsg(e);
      console.error('[auth/login] failed:', msg);
      const hint = /FIREBASE_SERVICE_ACCOUNT|credential|permission|PERMISSION_DENIED|UNAUTHENTICATED|ENOTFOUND|fetch failed|Firestore/i.test(msg)
        ? 'Periksa FIREBASE_SERVICE_ACCOUNT / koneksi Firestore pada server.'
        : 'Layanan login sedang bermasalah. Coba lagi atau periksa konfigurasi server.';
      res.status(503).json({ success: false, message: hint });
    }
  });
  app.get('/api/auth/me', auth, async (req: any, res) => {
    try {
      const db = getDb(); const snap = await db.collection('admin_users').doc(String(req.session.userId)).get();
      const u = snap.exists ? (snap.data() as any) : {};
      res.json({ success: true, user: { ...req.session, displayName: u.displayName || req.session.username, active: u.active !== false } });
    } catch { res.json({ success: true, user: req.session }); }
  });
  app.post('/api/auth/logout', auth, async (req: any, res) => {
    const token = (req.sessionToken || (req.headers.authorization||'').replace(/^Bearer\s+/i,'') || (req.headers['x-session'] as string) || '').trim();
    if (token) { dropSessionCache(token); await deletePersistedSession(token); }
    res.json({ success: true });
  });
  app.post('/api/auth/change-password', auth, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'Password saat ini dan password baru wajib diisi.' });
      if (String(newPassword).length < 8) return res.status(400).json({ success: false, message: 'Password baru minimal 8 karakter.' });
      if (!/[A-Za-z]/.test(String(newPassword)) || !/[0-9]/.test(String(newPassword))) return res.status(400).json({ success: false, message: 'Password baru harus memuat huruf dan angka.' });
      if (String(currentPassword) === String(newPassword)) return res.status(400).json({ success: false, message: 'Password baru harus berbeda.' });
      const db = getDb(); const ref = db.collection('admin_users').doc(String(req.session.userId));
      const snap = await ref.get(); if (!snap.exists) return res.status(404).json({ success: false, message: 'Akun tidak ditemukan.' });
      const u = snap.data() as any;
      const ok = await bcrypt.compare(String(currentPassword), String(u.passwordHash || ''));
      if (!ok) return res.status(401).json({ success: false, message: 'Password saat ini salah.' });
      await ref.set({ passwordHash: bcrypt.hashSync(String(newPassword), 12), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      res.json({ success: true, message: 'Password berhasil diperbarui.' });
    } catch (e: any) { console.error('[auth/change-password] failed:', safeMsg(e)); res.status(500).json({ success: false, message: 'Gagal memperbarui password.' }); }
  });
  app.put('/api/auth/me', auth, async (req: any, res) => {
    try {
      const { displayName } = req.body || {};
      const db = getDb(); const patch: any = { updatedAt: FieldValue.serverTimestamp() };
      if (typeof displayName === 'string') patch.displayName = displayName.trim().slice(0, 80);
      await db.collection('admin_users').doc(String(req.session.userId)).set(patch, { merge: true });
      res.json({ success: true, message: 'Profil diperbarui.' });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
  });

  // Pengaturan cetak/kop (tersimpan di Firestore app_settings/print; dipakai Rekap/Berita Acara)
  function normKopLogo(v: any): string {
    const s = String(v ?? '').trim(); if (!s) return '';
    const low = s.toLowerCase();
    if (low === 'logo1' || low === 'logo2' || low === 'logo3') return low;
    if (s === '/assets/satpol.webp') return 'logo1';
    if (s === '/assets/damkar.webp') return 'logo2';
    if (s === '/assets/ponorogo.webp') return 'logo3';
    if (/^https?:\/\//i.test(s) || s.startsWith('/assets/')) return s.slice(0, 500);
    return '';
  }
  const DEFAULT_PRINT = {
    kop: { instansi1: 'SATUAN POLISI PAMONG PRAJA', instansi2: 'KABUPATEN PONOROGO', sub: 'SADEWA — Sistem Aksi dan Evaluasi Praja Wibawa', alamat: '', telepon: '', email: '', website: '', showLogo: true, logoLeftUrl: '', logoRightUrl: '' },
    tandaTangan: {
      beritaAcara: { kiriJabatan: 'Pelapor / Petugas', kiriNama: '', kananKota: 'Ponorogo', kananJabatan: 'Mengetahui / Petugas Admin', kananNama: '' },
      rekap: { kiriJabatan: '', kiriNama: '', kananKota: 'Ponorogo', kananJabatan: 'Petugas Admin', kananNama: '' },
    },
    footer: 'Dicetak dari SADEWA Admin',
  };
  function mergePrint(data: any) {
    const d = data && typeof data === 'object' ? data : {};
    return {
      kop: { ...DEFAULT_PRINT.kop, ...(d.kop || {}), logoLeftUrl: normKopLogo(d.kop?.logoLeftUrl), logoRightUrl: normKopLogo(d.kop?.logoRightUrl), showLogo: d.kop?.showLogo !== false },
      tandaTangan: { beritaAcara: { ...DEFAULT_PRINT.tandaTangan.beritaAcara, ...(d.tandaTangan?.beritaAcara || {}) }, rekap: { ...DEFAULT_PRINT.tandaTangan.rekap, ...(d.tandaTangan?.rekap || {}) } },
      footer: typeof d.footer === 'string' ? d.footer.slice(0, 160) : DEFAULT_PRINT.footer,
    };
  }
  app.get('/api/admin/print-settings', auth, async (_req: any, res) => {
    try {
      const db = getDb(); const snap = await db.collection('app_settings').doc('print').get();
      const data = snap.exists ? (snap.data() as any) : {};
      res.json({ success: true, settings: mergePrint(data) });
    } catch (e: any) {
      console.warn('[print-settings] GET failed:', e?.message || e);
      const msg = /FIREBASE|credential|permission|PERMISSION|not configured|initialize/i.test(String(e?.message||e))
        ? 'Gagal memuat kop dari Firestore: koneksi/izin Firebase belum siap. Cek FIREBASE_SERVICE_ACCOUNT dan restart API admin.'
        : 'Gagal memuat pengaturan cetak dari Firestore.';
      res.status(500).json({ success: false, message: msg });
    }
  });
  app.put('/api/admin/print-settings', auth, superOnly, async (req: any, res) => {
    try {
      const db = getDb(); const b = req.body || {};
      const settings = {
        kop: {
          instansi1: String(b.kop?.instansi1 ?? DEFAULT_PRINT.kop.instansi1).slice(0, 120),
          instansi2: String(b.kop?.instansi2 ?? DEFAULT_PRINT.kop.instansi2).slice(0, 120),
          sub: String(b.kop?.sub ?? DEFAULT_PRINT.kop.sub).slice(0, 160),
          alamat: String(b.kop?.alamat ?? '').slice(0, 200),
          telepon: String(b.kop?.telepon ?? '').slice(0, 60),
          email: String(b.kop?.email ?? '').slice(0, 80),
          website: String(b.kop?.website ?? '').slice(0, 80),
          showLogo: b.kop?.showLogo !== false,
          logoLeftUrl: normKopLogo(b.kop?.logoLeftUrl),
          logoRightUrl: normKopLogo(b.kop?.logoRightUrl),
        },
        tandaTangan: {
          beritaAcara: { kiriJabatan: String(b.tandaTangan?.beritaAcara?.kiriJabatan ?? DEFAULT_PRINT.tandaTangan.beritaAcara.kiriJabatan).slice(0, 80), kiriNama: String(b.tandaTangan?.beritaAcara?.kiriNama ?? '').slice(0, 80), kananKota: String(b.tandaTangan?.beritaAcara?.kananKota ?? 'Ponorogo').slice(0, 60), kananJabatan: String(b.tandaTangan?.beritaAcara?.kananJabatan ?? DEFAULT_PRINT.tandaTangan.beritaAcara.kananJabatan).slice(0, 80), kananNama: String(b.tandaTangan?.beritaAcara?.kananNama ?? '').slice(0, 80) },
          rekap: { kiriJabatan: String(b.tandaTangan?.rekap?.kiriJabatan ?? '').slice(0, 80), kiriNama: String(b.tandaTangan?.rekap?.kiriNama ?? '').slice(0, 80), kananKota: String(b.tandaTangan?.rekap?.kananKota ?? 'Ponorogo').slice(0, 60), kananJabatan: String(b.tandaTangan?.rekap?.kananJabatan ?? DEFAULT_PRINT.tandaTangan.rekap.kananJabatan).slice(0, 80), kananNama: String(b.tandaTangan?.rekap?.kananNama ?? '').slice(0, 80) },
        },
        footer: String(b.footer ?? DEFAULT_PRINT.footer).slice(0, 160),
        updatedAt: FieldValue.serverTimestamp(),
      };
      await db.collection('app_settings').doc('print').set(settings, { merge: true });
      const saved = mergePrint(settings);
      res.json({ success: true, message: 'Pengaturan cetak disimpan.', settings: saved });
    } catch (e: any) { console.warn('[print-settings] PUT failed:', e?.message || e); res.status(500).json({ success: false, message: e?.message || 'Gagal menyimpan pengaturan cetak.' }); }
  });

  // Bootstrap superadmin awal (hanya jika belum ada). Jika ADMIN_BOOTSTRAP_KEY diset, wajib kirim key.
  app.post('/api/auth/bootstrap', async (req, res) => {
    try {
      const requiredKey = process.env.ADMIN_BOOTSTRAP_KEY;
      if (requiredKey) {
        const given = String(req.headers['x-bootstrap-key'] || (req.body as any)?.key || '');
        if (!given || given !== requiredKey) return res.status(403).json({ success: false, message: 'Bootstrap tidak diizinkan.' });
      }
      const db = getDb();
      const existing = await db.collection('admin_users').where('role', '==', 'superadmin').limit(1).get();
      if (!existing.empty) return res.json({ success: true, message: 'Superadmin sudah ada.' });
      const pw = process.env.SEED_ADMIN_PASSWORD || String((req.body as any)?.password || '');
      if (String(pw).length < 8) return res.status(400).json({ success: false, message: 'Password bootstrap minimal 8 karakter.' });
      const username = safeStr(process.env.SEED_ADMIN_USERNAME || 'superadmin', 40).toLowerCase().replace(/[^a-z0-9_.-]/g, '') || 'superadmin';
      await db.collection('admin_users').add({ username, displayName: 'Super Admin', passwordHash: await bcrypt.hash(String(pw), 12), role: 'superadmin', categoryScopes: [], active: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      res.json({ success: true, message: `Superadmin '${username}' dibuat.` });
    } catch (e: any) { res.status(500).json({ success: false, message: 'Bootstrap gagal.' }); }
  });

  // Users (superadmin)
  app.get('/api/admin/users', auth, superOnly, async (_req, res) => {
    const db = getDb(); const s = await db.collection('admin_users').orderBy('username').get();
    res.json({ success: true, items: s.docs.map(d => { const { passwordHash, ...u } = d.data() as any; return { id: d.id, ...u }; }) });
  });
  app.post('/api/admin/users', auth, superOnly, async (req, res) => {
    try {
      const { username, password, displayName, role, categoryScopes } = req.body || {};
      const uname = safeStr(username, 40).toLowerCase().replace(/[^a-z0-9_.-]/g, '');
      if (!uname || String(uname).length < 3) return res.status(400).json({ success: false, message: 'Username wajib (min 3 karakter, huruf/angka/._-).' });
      if (!password || String(password).length < 6) return res.status(400).json({ success: false, message: 'Password wajib (min 6 karakter).' });
      const db = getDb();
      const dup = await db.collection('admin_users').where('username', '==', uname).limit(1).get();
      if (!dup.empty) return res.status(409).json({ success: false, message: 'Username sudah digunakan.' });
      const roleVal = role === 'superadmin' ? 'superadmin' : 'admin';
      const scopes = roleVal === 'superadmin' ? [] : (Array.isArray(categoryScopes) ? categoryScopes.filter((x: any) => typeof x === 'string').slice(0, 50) : []);
      await db.collection('admin_users').add({ username: uname, displayName: safeStr(displayName || uname, 80), passwordHash: await bcrypt.hash(String(password), 12), role: roleVal, categoryScopes: scopes, active: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false, message: 'Gagal membuat pengguna.' }); }
  });
  app.put('/api/admin/users/:id', auth, superOnly, async (req, res) => {
    try {
      const db = getDb(); const ref = db.collection('admin_users').doc(String(req.params.id));
      const snap = await ref.get(); if (!snap.exists) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
      const b = req.body || {};
      const patch: any = { updatedAt: FieldValue.serverTimestamp() };
      if (typeof b.displayName === 'string') patch.displayName = safeStr(b.displayName, 80);
      if (typeof b.username === 'string') {
        const uname = b.username.toLowerCase().trim().replace(/[^a-z0-9_.-]/g, '').slice(0, 40);
        if (uname.length >= 3) {
          const dup = await db.collection('admin_users').where('username', '==', uname).limit(1).get();
          if (!dup.empty && dup.docs[0].id !== ref.id) return res.status(409).json({ success: false, message: 'Username sudah digunakan.' });
          patch.username = uname;
        }
      }
      if (b.role === 'superadmin' || b.role === 'admin') patch.role = b.role;
      if (typeof b.active === 'boolean') patch.active = b.active;
      if (patch.role === 'superadmin') patch.categoryScopes = [];
      else if (Array.isArray(b.categoryScopes)) patch.categoryScopes = b.categoryScopes.filter((x: any) => typeof x === 'string').slice(0, 50);
      if (b.password && String(b.password).length >= 6) patch.passwordHash = await bcrypt.hash(String(b.password), 12);
      // prevent removing last superadmin
      if (snap.data()?.role === 'superadmin' && (patch.role === 'admin' || patch.active === false)) {
        const others = await db.collection('admin_users').where('role','==','superadmin').get();
        const activeOthers = others.docs.filter(d => d.id !== ref.id && d.data().active !== false);
        if (!activeOthers.length) return res.status(400).json({ success: false, message: 'Tidak dapat menurunkan/nonaktifkan superadmin terakhir.' });
      }
      await ref.set(patch, { merge: true });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false, message: 'Gagal memperbarui pengguna.' }); }
  });

  app.delete('/api/admin/users/:id', auth, superOnly, async (req: any, res) => {
    try {
      const db = getDb(); const id = String(req.params.id);
      if (id === req.session.userId) return res.status(400).json({ success: false, message: 'Tidak dapat menghapus akun sendiri yang sedang aktif.' });
      const ref = db.collection('admin_users').doc(id); const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
      if (snap.data()?.role === 'superadmin') {
        const others = await db.collection('admin_users').where('role','==','superadmin').get();
        if (others.docs.filter(d => d.id !== id).length === 0) return res.status(400).json({ success: false, message: 'Tidak dapat menghapus superadmin terakhir.' });
      }
      await ref.delete();
      res.json({ success: true, message: 'Pengguna dihapus.' });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
  });

  // Categories & subcategories
  app.get('/api/admin/categories', auth, async (req: any, res) => {
    const db = getDb();
    let cats = (await db.collection('report_categories').orderBy('order').get()).docs.map(d => ({ id: d.id, ...d.data() } as any));
    if (req.session.role !== 'superadmin') cats = cats.filter(c => req.session.categoryScopes.includes(c.id));
    const subs = (await db.collection('report_subcategories').orderBy('order').get()).docs.map(d => ({ id: d.id, ...d.data() } as any));
    const allowedCatIds = new Set(cats.map(c => c.id));
    res.json({ success: true, categories: cats, subcategories: subs.filter(s => allowedCatIds.has(s.categoryId)) });
  });
  function safeConfig(v: any) {
    const c = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    const out: any = {};
    for (const k of ['spreadsheetId','driveRootFolderId','reportSheet','photoSheet','narrativeSheet','driveFolder']) if (c[k] != null) out[k] = safeStr(c[k], 160);
    return out;
  }
  function safeFormat(v: any) {
    if (!v || typeof v !== 'object') return { template: '', fields: [] };
    const fields = Array.isArray(v.fields) ? v.fields.slice(0, 80).map((f: any) => ({
      key: safeStr(f?.key, 60), label: safeStr(f?.label, 120),
      aliases: Array.isArray(f?.aliases) ? f.aliases.slice(0, 20).map((a: any) => safeStr(a, 120)).filter(Boolean) : [],
      required: Boolean(f?.required), type: ['text','time','number','multiline'].includes(f?.type) ? f.type : 'text',
    })).filter((f: any) => f.key || f.label) : [];
    return { template: safeStr(v.template, 20000), fields, version: Number(v.version) || 1 };
  }
  function catPayload(b: any, isCreate: boolean) {
    const has = (k: string) => !!b && Object.prototype.hasOwnProperty.call(b, k) && b[k] !== undefined;
    const name = safeStr(b?.name, 120);
    const out: any = { updatedAt: FieldValue.serverTimestamp() };
    if (isCreate || has('name')) out.name = name;
    if (isCreate || has('slug') || has('name')) out.slug = safeStr(b?.slug, 120) || slugify(name || 'kategori');
    if (isCreate || has('description')) out.description = safeStr(b?.description, 500);
    if (isCreate || has('image')) out.image = safeStr(b?.image, 200);
    if (isCreate || has('order')) out.order = Math.max(0, Math.min(9999, Number(b?.order) || 0));
    if (isCreate || has('active')) out.active = b?.active !== false;
    if (isCreate || has('config')) out.config = safeConfig(b?.config);
    if (isCreate) {
      out.name = name; out.slug = safeStr(b?.slug, 120) || slugify(name || 'kategori');
      out.description = safeStr(b?.description, 500); out.image = safeStr(b?.image, 200);
out.order = Math.max(0, Math.min(9999, Number(b?.order) || 0));
      out.active = b?.active !== false; out.config = safeConfig(b?.config); out.createdAt = FieldValue.serverTimestamp();
    }
    return out;
  }
  function subPayload(b: any, isCreate: boolean) {
    // has() untuk field opsional — image harus tetap dikirim walaupun string kosong ('' = hapus foto)
    const has = (k: string) => !!b && Object.prototype.hasOwnProperty.call(b, k) && b[k] !== undefined;
    // hasImage: izinkan '' agar foto bisa dihapus dari admin
    const hasImage = !!b && Object.prototype.hasOwnProperty.call(b, 'image');
    const name = safeStr(b?.name, 120);
    const out: any = { updatedAt: FieldValue.serverTimestamp() };
    if (isCreate || has('categoryId')) out.categoryId = safeStr(b?.categoryId, 120);
    if (isCreate || has('name')) out.name = name;
    if (isCreate || has('slug') || has('name')) out.slug = safeStr(b?.slug, 120) || slugify(name || 'subkategori');
    if (isCreate || has('description')) out.description = safeStr(b?.description, 500);
    if (isCreate || hasImage) out.image = safeStr(b?.image, 200);
    if (isCreate || has('order')) out.order = Math.max(0, Math.min(9999, Number(b?.order) || 0));
    if (isCreate || has('active')) out.active = b?.active !== false;
    if (isCreate || has('format')) out.format = safeFormat(b?.format);
    if (isCreate || has('config')) out.config = safeConfig(b?.config);
    if (isCreate) {
      out.categoryId = safeStr(b?.categoryId, 120); out.name = name;
      out.slug = safeStr(b?.slug, 120) || slugify(name || 'subkategori');
      out.description = safeStr(b?.description, 500); out.image = safeStr(b?.image, 200);
      out.order = Math.max(0, Math.min(9999, Number(b?.order) || 0)); out.active = b?.active !== false;
      out.format = safeFormat(b?.format); out.config = safeConfig(b?.config); out.createdAt = FieldValue.serverTimestamp();
    }
    return out;
  }

  app.post('/api/admin/categories', auth, superOnly, async (req, res) => {
    try {
      const db = getDb();
      const payload = catPayload(req.body || {}, true);
      const ref = await db.collection('report_categories').add(payload);
      res.json({ success: true, id: ref.id });
    } catch (e: any) { console.warn('[categories:create]', e?.message || e); res.status(500).json({ success: false, message: e?.message || 'Gagal menyimpan kategori.' }); }
  });
  app.put('/api/admin/categories/:id', auth, superOnly, async (req, res) => {
    try {
      const db = getDb();
      const body = req.body || {};
      const payload = catPayload(body, false);
      await db.collection('report_categories').doc(String(req.params.id)).set(payload, { merge: true });
      res.json({ success: true });
    } catch (e: any) { console.warn('[categories:update]', e?.message || e); res.status(500).json({ success: false, message: e?.message || 'Gagal menyimpan kategori.' }); }
  });
  app.post('/api/admin/subcategories', auth, superOnly, async (req, res) => {
    try {
      const p = subPayload(req.body || {}, true);
      if (!p.categoryId) return res.status(400).json({ success: false, message: 'categoryId wajib.' });
      const db = getDb(); const ref = await db.collection('report_subcategories').add(p);
      res.json({ success: true, id: ref.id });
    } catch (e: any) { console.warn('[subcategories:create]', e?.message || e); res.status(500).json({ success: false, message: e?.message || 'Gagal menyimpan subkategori.' }); }
  });
  app.put('/api/admin/subcategories/:id', auth, superOnly, async (req, res) => {
    try {
      const body = req.body || {};
      const p = subPayload(body, false); delete p.categoryId; // jangan pindah kategori via edit biasa
      const db = getDb(); await db.collection('report_subcategories').doc(String(req.params.id)).set(p, { merge: true });
      res.json({ success: true });
    } catch (e: any) { console.warn('[subcategories:update]', e?.message || e); res.status(500).json({ success: false, message: e?.message || 'Gagal menyimpan subkategori.' }); }
  });

  // Input laporan & draft — native (mandiri), backend setara Sadewa, dengan auth RBAC admin.
  async function resolveKategoriScope(kategori: string): Promise<{ categoryId: string; subcategoryId?: string } | null> {
    const k = String(kategori || '').trim();
    if (!k) return null;
    try {
      const db = getDb();
      let snap = await db.collection('report_subcategories').where('slug', '==', k).limit(1).get();
      if (snap.empty) { const d = await db.collection('report_subcategories').doc(k).get(); if (d.exists) snap = { empty: false, docs: [d] } as any; }
      if (!snap.empty) {
        const sub = snap.docs[0].data() as any;
        return { categoryId: String(sub.categoryId || ''), subcategoryId: snap.docs[0].id };
      }
      let cs = await db.collection('report_categories').where('slug', '==', k).limit(1).get();
      if (cs.empty) { const d = await db.collection('report_categories').doc(k).get(); if (d.exists) cs = { empty: false, docs: [d] } as any; }
      if (!cs.empty) return { categoryId: cs.docs[0].id };
    } catch {}
    return null;
  }
  function canAccessCategory(req: any, categoryId: string) {
    if (!categoryId) return req.session?.role === 'superadmin';
    return req.session?.role === 'superadmin' || (req.session?.categoryScopes || []).includes(categoryId);
  }

  app.post('/api/admin/sadewa', auth, async (req: any, res) => {
    try {
      const body = req.body || {};
      const kategori = String(body?.data?.kategori || body?.kategori || '').trim();
      if (kategori) {
        const scope = await resolveKategoriScope(kategori);
        if (scope?.categoryId && !canAccessCategory(req, scope.categoryId)) return res.status(403).json({ success: false, message: 'Akses kategori ditolak.' });
        if (!scope && req.session?.role !== 'superadmin') return res.status(403).json({ success: false, message: 'Kategori/subkategori tidak dikenali atau akses ditolak.' });
      }
      return handleSadewaAction(req as any, res as any);
    } catch (e: any) {
      return res.status(500).json({ success: false, message: e?.message || 'Gagal memproses input laporan.' });
    }
  });
  app.get('/api/admin/drafts', auth, async (req: any, res) => handleDraftsGet(req as any, res as any));
  app.post('/api/admin/drafts', auth, async (req: any, res) => handleDraftsPost(req as any, res as any));

  // Rekap + manajemen (edit / soft-delete ke sampah / restore / hapus permanen)
  function canAccessDoc(req: any, doc: any) { return req.session.role === 'superadmin' || (req.session.categoryScopes || []).includes(doc.categoryId); }
  app.get('/api/admin/rekap', auth, async (req: any, res) => {
    try {
      const db = getDb();
      const { categoryId, subcategoryId, limit = '200', trash } = req.query as any;
      const wantTrash = String(trash) === '1' || String(trash) === 'true';
      if (req.session.role !== 'superadmin' && categoryId && !req.session.categoryScopes.includes(categoryId)) {
        return res.status(403).json({ success: false, message: 'Tidak punya akses kategori ini.' });
      }
      let q: any = db.collection('sadewa_reports');
      if (categoryId) q = q.where('categoryId', '==', categoryId);
      if (subcategoryId) q = q.where('subcategoryId', '==', subcategoryId);
      // avoid composite index issues: fetch and filter deleted in memory
      q = q.orderBy('createdAt', 'desc').limit(Math.min(Number(limit)||200, 500));
      const s = await q.get().catch(() => null);
      let items = s ? s.docs.map((d: any) => ({ id: d.id, ...d.data() })) : [];
      items = items.filter((i: any) => wantTrash ? i.deleted === true : i.deleted !== true);
      if (req.session.role !== 'superadmin') {
        const allowed = new Set(req.session.categoryScopes);
        items = items.filter((i: any) => allowed.has(i.categoryId));
      }
      res.json({ success: true, items });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
  });

  app.put('/api/admin/rekap/:id', auth, async (req: any, res) => {
    try {
      const db = getDb(); const ref = db.collection('sadewa_reports').doc(String(req.params.id));
      const snap = await ref.get(); if (!snap.exists) return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan.' });
      const doc = snap.data() as any; if (!canAccessDoc(req, doc)) return res.status(403).json({ success: false, message: 'Akses ditolak.' });
      const b = req.body || {};
      const allowed = ['lokasi','tanggal','pelapor','kronologi','tindakan','keterangan','status','objek','korban','penyebab'];
      const patch: any = { updatedAt: FieldValue.serverTimestamp(), updatedBy: req.session.username };
      for (const k of allowed) if (k in b) patch[k] = b[k];
      await ref.set(patch, { merge: true });
      // best-effort sync key fields to sheet
      if (doc.reportId && (doc.sheetNames?.reportSheet || doc.sheetNames)) {
        const sn = doc.sheetNames || {};
        const updates: any = {};
        if ('lokasi' in b) updates['LOKASI'] = b.lokasi;
        if ('tanggal' in b) updates['TANGGAL'] = b.tanggal;
        if ('pelapor' in b) updates['PELAPOR'] = b.pelapor;
        if (Object.keys(updates).length) await callAppsScript('updateReport', { reportId: doc.reportId, reportSheet: sn.reportSheet, spreadsheetId: sn.spreadsheetId, updates }).catch(() => {});
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
  });

  app.post('/api/admin/rekap/:id/trash', auth, async (req: any, res) => {
    try {
      const db = getDb(); const ref = db.collection('sadewa_reports').doc(String(req.params.id));
      const snap = await ref.get(); if (!snap.exists) return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan.' });
      const doc = snap.data() as any; if (!canAccessDoc(req, doc)) return res.status(403).json({ success: false, message: 'Akses ditolak.' });
      const sn = doc.sheetNames || {};
      const fileIds = Array.isArray(doc.photos) ? doc.photos.map((p: any) => p.fileId).filter(Boolean) : [];
      const gas = await callAppsScript('moveToTrash', { reportId: doc.reportId, spreadsheetId: sn.spreadsheetId, sheetNames: { reportSheet: sn.reportSheet, photoSheet: sn.photoSheet, narrativeSheet: sn.narrativeSheet }, folderId: doc.folderId || '', fileIds });
      await ref.set({ deleted: true, deletedAt: FieldValue.serverTimestamp(), deletedBy: req.session.username, status: 'SAMPAH' }, { merge: true });
      res.json({ success: true, sheet: gas });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
  });

  app.post('/api/admin/rekap/:id/restore', auth, async (req: any, res) => {
    try {
      const db = getDb(); const ref = db.collection('sadewa_reports').doc(String(req.params.id));
      const snap = await ref.get(); if (!snap.exists) return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan.' });
      const doc = snap.data() as any; if (!canAccessDoc(req, doc)) return res.status(403).json({ success: false, message: 'Akses ditolak.' });
      const sn = doc.sheetNames || {};
      const fileIds = Array.isArray(doc.photos) ? doc.photos.map((p: any) => p.fileId).filter(Boolean) : [];
      const gas = await callAppsScript('restoreFromTrash', { reportId: doc.reportId, spreadsheetId: sn.spreadsheetId, sheetNames: { reportSheet: sn.reportSheet, photoSheet: sn.photoSheet, narrativeSheet: sn.narrativeSheet }, folderId: doc.folderId || '', fileIds });
      await ref.set({ deleted: false, deletedAt: null, restoredAt: FieldValue.serverTimestamp(), restoredBy: req.session.username, status: 'TERSIMPAN' }, { merge: true });
      res.json({ success: true, sheet: gas });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
  });

  app.delete('/api/admin/rekap/:id', auth, async (req: any, res) => {
    try {
      const db = getDb(); const ref = db.collection('sadewa_reports').doc(String(req.params.id));
      const snap = await ref.get(); if (!snap.exists) return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan.' });
      const doc = snap.data() as any; if (!canAccessDoc(req, doc)) return res.status(403).json({ success: false, message: 'Akses ditolak.' });
      const sn = doc.sheetNames || {};
      const fileIds = Array.isArray(doc.photos) ? doc.photos.map((p: any) => p.fileId).filter(Boolean) : [];
      const gas = await callAppsScript('deletePermanent', { reportId: doc.reportId, spreadsheetId: sn.spreadsheetId, sheetNames: { reportSheet: sn.reportSheet, photoSheet: sn.photoSheet, narrativeSheet: sn.narrativeSheet }, folderId: doc.folderId || '', fileIds });
      await ref.delete();
      res.json({ success: true, sheet: gas });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
  });

  // Konfigurasi Drive (untuk menu iframe Drive di admin)
  app.get('/api/admin/drive-config', auth, (_req, res) => {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.SADEWA_DRIVE_FOLDER_ID || '';
    const folderUrl = folderId ? `https://drive.google.com/drive/folders/${folderId}` : (process.env.DRIVE_FOLDER_URL || '');
    const embedUrl = folderUrl ? folderUrl.replace(/\/view.*$/, '') : '';
    res.json({ success: true, folderId, folderUrl, embedUrl, note: 'Kelola file via tampilan Drive. Untuk embed penuh pastikan izin berbagi folder sesuai kebijakan organisasi.' });
  });

  // Bootstrap default categories/subcategories (superadmin). Data default DI-HARDCODE di sini
  // sengaja hanya sebagai SEED ke Firestore (sumber kebenaran runtime = Firestore), bukan dipakai app.
  app.post('/api/admin/bootstrap-defaults', auth, superOnly, async (_req, res) => {
    try {
      const db = getDb();
      const catSnap = await db.collection('report_categories').limit(1).get();
      if (!catSnap.empty) return res.json({ success: true, message: 'Kategori sudah ada.' });

      // Template WA lengkap (seed) — dipakai SadewaForm via Firestore format.template
      const TPL_KEBAKARAN = `Kepada,Yth. Kepala Satuan Polisi Pamong Praja Kabupaten Ponorogo di - *PONOROGO* .

*Mohon ijin Melaporkan Hasil Pelaksanaan Kegiatan,* • Pemadaman Kebakaran ( [OBJEK KEBAKARAN] )

*HARI DAN TANGGAL PELAKSANAAN :*• [Hari], [Tanggal] [Bulan] [Tahun].

*LAPORAN MASUK :* • [HH.MM] Wib.
*WAKTU BERANGKAT :*• [HH.MM] Wib.
*TIBA DILOKASI :*• [HH.MM] Wib.
*MULAI KEGIATAN :*  • [HH.MM] Wib.
*SELESAI KEGIATAN :*• [HH.MM] Wib.
*TIBA KEMBALI DI MAKO :*• [HH.MM] Wib.

*LOKASI :*• [Alamat lengkap lokasi].
GPS [Lintang]⁰S, [Bujur]⁰E

*JARAK TEMPUH PERJALANAN :* • [Jarak] Km
*ESTIMASI WAKTU PERJALANAN :*• [Durasi] Menit
*PEMBERI INFORMASI ( PELAPOR / PEMOHON ) :*• [Nama]
*PEMILIK :*• [Nama / Umum]
*JUMLAH PENGHUNI RUMAH YANG TERDAMPAK :* • [Jumlah / -]
*LUAS AREA:*• [Luas]
*KORBAN :*• [Nihil / Keterangan]
*KENDALA :*• [Nihil / Keterangan]

*PENYEBAB:*• [Penyebab]
*Kronologi* [Uraian kronologi]
*PERKIRAAN KERUGIAN:*• [Kerugian]
*PERKIRAAN HARTA BENDA YANG TERSELAMATKAN:*• [Harta benda]
*Areal yang terbakar*: • [Luas]

*TINDAKAN* [Uraian tindakan]
 *RINCIAN KEGIATAN :*• Menindak lanjuti laporan, Regu [A/B/C/D/E] Satpol PP Ponorogo melaksanakan pemadaman [uraian].

*JUMLAH UNIT KENDARAKAN YANG DIGUNAKAN :* [Jumlah] unit
• [Kendaraan dan nomor]
*PERSONIL YANG TERLIBAT :*• Personil Regu [A/B/C/D/E] Satpol PP.
• [Personil lainnya]

Pelaksanaan kegiatan tersebut sampai dengan selesai berjalan aman dan lancar.
*DOKUMENTASI TERLAMPIR*

Demikian yang dapat kami laporkan untuk menjadikan periksa, dan apabila ada perkembangan informasi dilapangan dapat dilaporkan kembali.

*YANG MELAPORKAN :*_ *[NAMA PELAPOR]*_Komandan Regu [A/B/C/D/E] Satpol PP Ponorogo.
 *TEMBUSAN*1. Dir Pol PP Kemendagri.2. Kasatpol PP Prov. Jatim.`;
      const TPL_ODNK = `Kepada,Yth. Kepala Satuan Polisi Pamong Praja Kabupaten Ponorogo di - *PONOROGO* .

*Mohon ijin Melaporkan Hasil Pelaksanaan Kegiatan Sebagai Berikut :* *OBJEK :*• [Jenis kejadian/objek non-kebakaran]

*HARI DAN TANGGAL PELAKSANAAN :*• [Hari], [Tanggal] [Bulan] [Tahun].

*LAPORAN MASUK :* • [HH.MM] Wib.
*WAKTU BERANGKAT :*• [HH.MM] Wib.
*TIBA DILOKASI :*• [HH.MM] Wib.
*MULAI KEGIATAN :*  • [HH.MM] Wib.
*SELESAI KEGIATAN :*• [HH.MM] Wib.
*TIBA KEMBALI DI MAKO :*• [HH.MM] Wib.

*LOKASI :*• [Alamat lengkap lokasi].
GPS [Lintang]⁰S, [Bujur]⁰E

*JARAK TEMPUH PERJALANAN :* • [Jarak] Km
*ESTIMASI WAKTU PERJALANAN :*• [Durasi] Menit
*PELAPOR / PEMOHON :*• [Nama]
*PEMILIK :*• [Nama / Umum]
*JUMLAH PENGHUNI :*• [Jumlah / -]
*KORBAN :*• [Nihil / Keterangan]

*PENYEBAB:*• [Penyebab / -]
*Kronologi* [Uraian kronologi]

*RINCIAN KEGIATAN :*• Menindak lanjuti laporan, Regu [A/B/C/D/E] Satpol PP Ponorogo melaksanakan [evakuasi/rescue/penanganan].
*TINDAKAN* [Uraian tindakan]

*JUMLAH UNIT KENDARAKAN YANG DIGUNAKAN :* [Jumlah] unit
• [Kendaraan dan nomor]
*KENDALA :*• [Nihil / Keterangan]
*PERSONIL YANG TERLIBAT :*• Personil Regu [A/B/C/D/E] Satpol PP.
• [Personil lainnya]

Pelaksanaan kegiatan tersebut sampai dengan selesai berjalan aman dan lancar.
*DOKUMENTASI TERLAMPIR*

Demikian yang dapat kami laporkan untuk menjadikan periksa, dan apabila ada perkembangan informasi dilapangan dapat dilaporkan kembali.

*YANG MELAPORKAN :*_ *[NAMA PELAPOR]*_Komandan Regu [A/B/C/D/E] Satpol PP Ponorogo.
 *TEMBUSAN*1. Dir Pol PP Kemendagri.2. Kasatpol PP Prov. Jatim.`;
      const TPL_GENERIC = (name: string) => `LAPORAN ${name}

Hari/Tanggal: 
Waktu: 
Lokasi: 
Kronologi: 
Tindakan: 
Pelapor/Petugas: 
Keterangan: `;

      const fields = [
        { key: 'tanggal', label: 'Hari/Tanggal', aliases: ['HARI DAN TANGGAL', 'TANGGAL', 'HARI/TANGGAL'], required: true },
        { key: 'waktu', label: 'Waktu', aliases: ['WAKTU', 'JAM'], type: 'time' },
        { key: 'lokasi', label: 'Lokasi', aliases: ['LOKASI', 'ALAMAT'], required: true, type: 'multiline' },
        { key: 'kronologi', label: 'Kronologi', aliases: ['KRONOLOGI'], type: 'multiline' },
        { key: 'tindakan', label: 'Tindakan', aliases: ['TINDAKAN', 'PENANGANAN'], type: 'multiline' },
        { key: 'pelapor', label: 'Pelapor/Petugas', aliases: ['PELAPOR', 'PETUGAS', 'YANG MELAPORKAN'] },
        { key: 'keterangan', label: 'Keterangan', aliases: ['KETERANGAN', 'KENDALA'], type: 'multiline' },
      ];
      const fmt = (template: string) => ({ template, fields, version: 1 });

      const now = FieldValue.serverTimestamp();
      const damkar = await db.collection('report_categories').add({ name: 'DAMKAR', slug: 'damkar', description: 'Laporan Pemadam Kebakaran & Penyelamatan', order: 1, active: true, image: '1', config: { driveFolder: 'DAMKAR' }, createdAt: now, updatedAt: now });
      const tibum = await db.collection('report_categories').add({ name: 'TIBUM', slug: 'tibum', description: 'Laporan Ketertiban Umum', order: 2, active: true, image: '3', config: { driveFolder: 'TIBUM' }, createdAt: now, updatedAt: now });
      await db.collection('report_subcategories').add({ categoryId: damkar.id, name: 'Kebakaran', slug: 'kebakaran', description: 'Laporan pemadaman dan penanganan kebakaran', order: 1, active: true, image: '1', format: fmt(TPL_KEBAKARAN), config: { driveFolder: 'KEBAKARAN', reportSheet: 'KEBAKARAN', photoSheet: 'DOKUMENTASI KEBAKARAN', narrativeSheet: 'NARASI KEBAKARAN' }, createdAt: now, updatedAt: now });
      await db.collection('report_subcategories').add({ categoryId: damkar.id, name: 'ODNK (Non-Kebakaran)', slug: 'odnk', description: 'Laporan evakuasi, rescue, dan kejadian non-kebakaran', order: 2, active: true, image: '2', format: fmt(TPL_ODNK), config: { driveFolder: 'ODNK', reportSheet: 'ODNK', photoSheet: 'DOKUMENTASI ODNK', narrativeSheet: 'NARASI ODNK' }, createdAt: now, updatedAt: now });
      await db.collection('report_subcategories').add({ categoryId: tibum.id, name: 'Piket Mako', slug: 'piket-mako', description: 'Laporan piket mako', order: 1, active: true, image: '4', format: fmt(TPL_GENERIC('PIKET MAKO')), config: { driveFolder: 'PIKET_MAKO', reportSheet: 'PIKET MAKO', photoSheet: 'DOKUMENTASI PIKET MAKO', narrativeSheet: 'NARASI PIKET MAKO' }, createdAt: now, updatedAt: now });
      await db.collection('report_subcategories').add({ categoryId: tibum.id, name: 'Penggunaan Kendaraan', slug: 'penggunaan-kendaraan', description: 'Laporan penggunaan kendaraan', order: 2, active: true, image: '5', format: fmt(TPL_GENERIC('PENGGUNAAN KENDARAAN')), config: { driveFolder: 'PENGGUNAAN_KENDARAAN', reportSheet: 'PENGGUNAAN KENDARAAN', photoSheet: 'DOKUMENTASI PENGGUNAAN KENDARAAN', narrativeSheet: 'NARASI PENGGUNAAN KENDARAAN' }, createdAt: now, updatedAt: now });
      res.json({ success: true, message: 'Kategori default (DAMKAR, TIBUM + subkategori, template lengkap) dibuat di Firestore.' });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
  });

  // --- Google clients (Drive/Sheets). Prioritaskan OAuth untuk provisioning; fallback service account. ---
  async function getGoogleClients() {
    let google: any;
    try { google = (await import('googleapis')).google; } catch {}
    if (!google) {
      try { const { createRequire } = await import('module'); const req = createRequire(path.resolve(process.cwd(), '../sadewa/package.json')); google = req('googleapis').google; } catch {}
    }
    if (!google) {
      try { const { createRequire } = await import('module'); const req = createRequire('/data/Sadewa/sadewa/package.json'); google = req('googleapis').google; } catch {}
    }
    if (!google) {
      try { const { createRequire } = await import('module'); const req = createRequire('/data/SiproGo/sadewa/package.json'); google = req('googleapis').google; } catch {}
    }
    if (!google) throw new Error('googleapis tidak tersedia. Pasang dependensi googleapis (npm i googleapis).');
    const clientId = process.env.GOOGLE_CLIENT_ID; const clientSecret = process.env.GOOGLE_CLIENT_SECRET; const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    let auth: any = null;
    if (clientId && clientSecret && refreshToken) {
      const o = new google.auth.OAuth2(clientId, clientSecret); o.setCredentials({ refresh_token: refreshToken }); auth = o;
    }
    if (!auth && raw) {
      try { const creds = JSON.parse(raw); if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n'); auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive'] }); } catch {}
    }
    if (!auth) throw new Error('Kredensial Google tidak ditemukan (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN atau GOOGLE_SERVICE_ACCOUNT_JSON).');
    return { drive: google.drive({ version: 'v3', auth }), sheets: google.sheets({ version: 'v4', auth }) };
  }

  async function ensureDriveFolder(drive: any, name: string, parentId?: string) {
    const safeName = name.replace(/'/g, "\\'");
    const q = [`name='${safeName}'`, `mimeType='application/vnd.google-apps.folder'`, 'trashed=false', parentId ? `'${parentId}' in parents` : null].filter(Boolean).join(' and ');
    try { const found = await drive.files.list({ q, fields: 'files(id,name)', spaces: 'drive', pageSize: 5, supportsAllDrives: true, includeItemsFromAllDrives: true }); const hit = (found.data.files||[])[0]; if (hit?.id) return { id: hit.id, name: hit.name, created: false }; } catch {}
    const created = await drive.files.create({ supportsAllDrives: true, requestBody: { name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) }, fields: 'id,name,webViewLink' });
    // make link-readable best-effort
    try { await drive.permissions.create({ fileId: created.data.id, supportsAllDrives: true, requestBody: { role: 'reader', type: 'anyone' } }); } catch {}
    return { id: created.data.id, name: created.data.name, created: true, webViewLink: created.data.webViewLink };
  }

  app.post('/api/admin/categories/:id/provision', auth, superOnly, async (req, res) => {
    try {
      const db = getDb(); const catRef = db.collection('report_categories').doc(String(req.params.id));
      const snap = await catRef.get(); if (!snap.exists) return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan.' });
      const cat = { id: snap.id, ...(snap.data() as any) };
      const cfg = { ...(cat.config || {}) };
      const force = Boolean((req.body || {}).force);
      const { drive, sheets } = await getGoogleClients();
      const result: any = { category: cat.name };

      // 1) Folder Drive per kategori (root). Coba di bawah global root bila ada; fallback ke root akun kredensial.
      const globalRoot = process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.FOLDER_UTAMA_ID || '';
      if (!cfg.driveRootFolderId || force) {
        const folderName = `SADEWA - ${cat.name || cat.slug || 'KATEGORI'}`;
        let folder: any = null;
        if (globalRoot) { try { folder = await ensureDriveFolder(drive, folderName, globalRoot); folder.parent = 'global'; } catch (e:any) { folder = { _warn: e.message }; } }
        if (!folder?.id) { folder = await ensureDriveFolder(drive, folderName); folder.parent = 'account-root'; folder.note = folder._warn ? `Global root tidak dapat diakses (${folder._warn}); dibuat di root akun.` : 'Dibuat di root akun kredensial.'; }
        cfg.driveRootFolderId = folder.id; result.folder = folder;
      } else { result.folder = { id: cfg.driveRootFolderId, reused: true }; }

      // 2) Spreadsheet per kategori
      if (!cfg.spreadsheetId || force) {
        const title = `SADEWA - ${cat.name || cat.slug || 'Kategori'} - Laporan`;
        const created = await sheets.spreadsheets.create({ requestBody: { properties: { title } }, fields: 'spreadsheetId,spreadsheetUrl,properties' });
        cfg.spreadsheetId = created.data.spreadsheetId;
        result.spreadsheet = { id: created.data.spreadsheetId, url: created.data.spreadsheetUrl, title, created: true };
        // share spreadsheet best-effort (reader anyone? no - keep restricted; service account owner is enough for API; Apps Script deployer needs access - advise)
        result.spreadsheet.note = 'Spreadsheet dibuat oleh kredensial app. Pastikan akun deployer Apps Script & pengguna yang perlu akses diberi izin Editor bila memakai akses langsung.';
      } else { result.spreadsheet = { id: cfg.spreadsheetId, reused: true }; }

      if (!cfg.driveFolder) cfg.driveFolder = (cat.name || cat.slug || 'KATEGORI').toUpperCase().replace(/\s+/g, '_');
      await catRef.set({ config: cfg, active: true, provisionedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      res.json({ success: true, message: `Kategori ${cat.name} diprovision & diaktifkan (spreadsheet + folder terpisah).`, config: cfg, result });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message || 'Gagal provisioning.' }); }
  });

  app.post('/api/admin/provision-all', auth, superOnly, async (req, res) => {
    try {
      const db = getDb(); const cats = (await db.collection('report_categories').orderBy('order').get()).docs;
      const results: any[] = [];
      for (const d of cats) {
        try {
          const catRef = db.collection('report_categories').doc(d.id);
          const cat = { id: d.id, ...(d.data() as any) }; const cfg = { ...(cat.config || {}) };
          const force = Boolean((req.body||{}).force);
          const { drive, sheets } = await getGoogleClients();
          const globalRoot = process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.FOLDER_UTAMA_ID || '';
          if (!cfg.driveRootFolderId || force) {
            const folderName = `SADEWA - ${cat.name || cat.slug || 'KATEGORI'}`;
            let folder: any = null; if (globalRoot) { try { folder = await ensureDriveFolder(drive, folderName, globalRoot); } catch {} }
            if (!folder?.id) folder = await ensureDriveFolder(drive, folderName);
            cfg.driveRootFolderId = folder.id;
          }
          if (!cfg.spreadsheetId || force) {
            const title = `SADEWA - ${cat.name || cat.slug || 'Kategori'} - Laporan`;
            const created = await sheets.spreadsheets.create({ requestBody: { properties: { title } }, fields: 'spreadsheetId,spreadsheetUrl' });
            cfg.spreadsheetId = created.data.spreadsheetId;
          }
          if (!cfg.driveFolder) cfg.driveFolder = (cat.name || 'KATEGORI').toUpperCase().replace(/\s+/g, '_');
          await catRef.set({ config: cfg, active: true, provisionedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          results.push({ id: d.id, name: cat.name, spreadsheetId: cfg.spreadsheetId, driveRootFolderId: cfg.driveRootFolderId });
        } catch (e:any) { results.push({ id: d.id, name: (d.data() as any).name, error: e.message }); }
      }
      res.json({ success: true, message: 'Provisioning semua kategori selesai.', results });
    } catch (e:any) { res.status(500).json({ success: false, message: e.message }); }
  });

  // --- Dashboard (pemantauan) ---
  app.get('/api/admin/dashboard', auth, async (req: any, res) => {
    try {
      const db = getDb();
      const [catSnap, subSnap, repSnap, trashSnap] = await Promise.all([
        db.collection('report_categories').orderBy('order').get(),
        db.collection('report_subcategories').orderBy('order').get(),
        db.collection('sadewa_reports').orderBy('createdAt','desc').limit(500).get().catch(()=>null),
        db.collection('sadewa_reports').where('deleted','==',true).limit(500).get().catch(()=>null),
      ]);
      let cats = catSnap.docs.map(d=>({id:d.id, ...(d.data() as any)}));
      if (req.session.role !== 'superadmin') cats = cats.filter(c => (req.session.categoryScopes||[]).includes(c.id));
      const allowed = new Set(cats.map(c=>c.id));
      const subs = subSnap.docs.map(d=>({id:d.id, ...(d.data() as any)})).filter(s=>allowed.has(s.categoryId));
      let reports = repSnap ? repSnap.docs.map(d=>({id:d.id, ...(d.data() as any)})) : [];
      reports = reports.filter(r => r.deleted !== true && (req.session.role === 'superadmin' || allowed.has(r.categoryId)));
      const now = Date.now();
      const dayMs = 86400000;
      const today = reports.filter(r => (r.createdAt||0) > now - dayMs).length;
      const week = reports.filter(r => (r.createdAt||0) > now - 7*dayMs).length;
      const month = reports.filter(r => (r.createdAt||0) > now - 30*dayMs).length;
      const gps = reports.filter(r => Number.isFinite(Number(r.lat??r.latitude)) && Number.isFinite(Number(r.lng??r.longitude))).length;
      const trashCount = (trashSnap ? trashSnap.docs.map(d=>d.data()) : []).filter((r:any)=> req.session.role==='superadmin' || allowed.has(r.categoryId)).length;
      const byCategory = cats.map(c => ({ id:c.id, name:c.name, total: reports.filter(r=>r.categoryId===c.id).length }));
      const bySub = subs.map(s => ({ id:s.id, name:s.name, categoryId:s.categoryId, total: reports.filter(r=>r.subcategoryId===s.id).length }));
      const recent = reports.slice(0, 12).map(r => ({ id:r.id, reportId:r.reportId, categoryId:r.categoryId, subcategoryId:r.subcategoryId, lokasi:r.lokasi, pelapor:r.pelapor, waktuSubmit:r.waktuSubmit, status:r.status, jumlahFoto:r.jumlahFoto, hasGps: Number.isFinite(Number(r.lat??r.latitude)) }));
      const trend7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now - (6 - i) * dayMs);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const label = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const end = start + dayMs;
        const totalDay = reports.filter(r => { const t = Number(r.createdAt)||0; return t >= start && t < end; }).length;
        return { key, label, total: totalDay };
      });
      res.json({ success:true, stats:{ total:reports.length, today, week, month, gps, trash:trashCount, categories:cats.length, subcategories:subs.length, users: req.session.role==='superadmin' ? (await db.collection('admin_users').get()).size : undefined }, byCategory, bySub, trend7, recent, categories: cats, subcategories: subs, role: req.session.role });
    } catch(e:any){ res.status(500).json({ success:false, message:e.message }); }
  });

  // --- Drive File Manager (API v3, bukan iframe) ---
  async function getDriveRoots(req:any) {
    const db = getDb();
    let cats = (await db.collection('report_categories').orderBy('order').get()).docs.map(d=>({id:d.id,...(d.data() as any)}));
    if (req.session.role !== 'superadmin') cats = cats.filter(c => (req.session.categoryScopes||[]).includes(c.id));
    const roots:any[] = [];
    const globalId = process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.FOLDER_UTAMA_ID || '';
    if (globalId && req.session.role === 'superadmin') roots.push({ id: globalId, name: 'Root Proyek (Global)', type: 'global' });
    for (const c of cats) {
      if (c.config?.driveRootFolderId) roots.push({ id: c.config.driveRootFolderId, name: `Folder ${c.name}`, type: 'category', categoryId: c.id });
      else roots.push({ id: globalId || '', name: `Folder ${c.name} (global)`, type: 'category-global', categoryId: c.id, missing: !c.config?.driveRootFolderId });
    }
    return roots.filter(r=>r.id);
  }

  app.get('/api/admin/drive/roots', auth, async (req:any, res) => {
    try { const roots = await getDriveRoots(req); res.json({ success:true, roots }); }
    catch(e:any){ res.status(500).json({ success:false, message:e.message }); }
  });

  app.get('/api/admin/drive/files', auth, async (req:any, res) => {
    try {
      const folderId = String(req.query.folderId||'');
      const trashed = String(req.query.trashed||'0') === '1';
      const pageToken = String(req.query.pageToken||'');
      const search = String(req.query.q||'').replace(/'/g, "\\'");
      if (!folderId) return res.status(400).json({ success:false, message:'folderId wajib.' });
      const { drive } = await getGoogleClients();
      const parts = [`'${folderId}' in parents`, `trashed = ${trashed}`];
      if (search) parts.push(`name contains '${search}'`);
      const r = await drive.files.list({
        q: parts.join(' and '),
        fields: 'nextPageToken, files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink,iconLink,thumbnailLink,parents,trashed)',
        orderBy: 'folder,modifiedTime desc',
        pageSize: 100,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        ...(pageToken ? { pageToken } : {}),
      });
      // resolve folder name/breadcrumb hint
      let folderInfo:any = null;
      try { const fi = await drive.files.get({ fileId: folderId, fields:'id,name,parents,webViewLink', supportsAllDrives:true }); folderInfo = fi.data; } catch {}
      res.json({ success:true, files: r.data.files||[], nextPageToken: r.data.nextPageToken||null, folder: folderInfo });
    } catch(e:any){ res.status(500).json({ success:false, message:e.message }); }
  });

  app.post('/api/admin/drive/upload', auth, async (req:any, res) => {
    try {
      const { folderId, fileName, mimeType, contentBase64 } = req.body || {};
      if (!folderId || !fileName || !contentBase64) return res.status(400).json({ success:false, message:'folderId, fileName, contentBase64 wajib.' });
      const { drive } = await getGoogleClients();
      const buf = Buffer.from(String(contentBase64).replace(/^data:[^;]+;base64,/,''), 'base64');
      if (buf.length > 18*1024*1024) return res.status(413).json({ success:false, message:'File terlalu besar (maks 18MB).' });
      const { Readable } = await import('stream');
      const created = await drive.files.create({
        supportsAllDrives: true,
        requestBody: { name: String(fileName), parents: [String(folderId)] },
        media: { mimeType: mimeType || 'application/octet-stream', body: Readable.from(buf) },
        fields: 'id,name,mimeType,size,webViewLink,webContentLink,createdTime',
      });
      res.json({ success:true, file: created.data, message:`File "${fileName}" diunggah.` });
    } catch(e:any){ res.status(500).json({ success:false, message:e.message }); }
  });

  app.get('/api/admin/drive/download/:fileId', auth, async (req:any, res) => {
    try {
      const fileId = String(req.params.fileId);
      const { drive } = await getGoogleClients();
      const meta = await drive.files.get({ fileId, fields:'id,name,mimeType,size', supportsAllDrives:true });
      const isGoogle = String(meta.data.mimeType||'').startsWith('application/vnd.google-apps');
      if (isGoogle) {
        const exp = await drive.files.export({ fileId, mimeType: 'application/pdf' }, { responseType:'stream' });
        res.setHeader('Content-Type','application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(String(meta.data.name||'file')+'.pdf')}"`);
        (exp.data as any).pipe(res);
        return;
      }
      const dl = await drive.files.get({ fileId, alt:'media', supportsAllDrives:true }, { responseType:'stream' });
      if (meta.data.mimeType) res.setHeader('Content-Type', String(meta.data.mimeType));
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(String(meta.data.name||'download'))}`);
      (dl.data as any).pipe(res);
    } catch(e:any){ if (!res.headersSent) res.status(500).json({ success:false, message:e.message }); }
  });

  app.patch('/api/admin/drive/files/:fileId', auth, async (req:any, res) => {
    try {
      const fileId = String(req.params.fileId); const { name, trashed } = req.body || {};
      const { drive } = await getGoogleClients();
      const requestBody:any = {};
      if (typeof name === 'string' && name.trim()) requestBody.name = name.trim();
      if (typeof trashed === 'boolean') requestBody.trashed = trashed;
      if (!Object.keys(requestBody).length) return res.status(400).json({ success:false, message:'Tidak ada perubahan.' });
      const r = await drive.files.update({ fileId, supportsAllDrives:true, requestBody, fields:'id,name,trashed,mimeType,webViewLink' });
      res.json({ success:true, file: r.data });
    } catch(e:any){ res.status(500).json({ success:false, message:e.message }); }
  });

  app.delete('/api/admin/drive/files/:fileId', auth, async (req:any, res) => {
    try {
      const fileId = String(req.params.fileId);
      const { drive } = await getGoogleClients();
      await drive.files.delete({ fileId, supportsAllDrives:true });
      res.json({ success:true, message:'File dihapus permanen.' });
    } catch(e:any){ res.status(500).json({ success:false, message:e.message }); }
  });

  // Pemetaan: PDF vektor server (alias agar kompatibel dengan client PETA). Butuh auth (CPU-intensive).
  app.post('/api/export-pdf', auth, (req, res) => void handleExportPdf(req, res));
  app.post('/api/pemetaan/export-pdf', auth, (req, res) => void handleExportPdf(req, res));

  // --- Pemetaan (kerawanan wilayah): kategori & skor di Firestore (bukan IDB) ---
  // Koleksi: pemetaan_categories, pemetaan_scores (doc id = `${categoryId}__${regionId}`)
  // Cache memori (hemat baca Firestore; invalidasi saat mutasi). Aman di serverless (per-instance).
  let _pmCatCache: { at: number; data: any } | null = null;
  const _pmScoreCache = new Map<string, { at: number; data: any }>();
  const PM_TTL = 30_000;
  const pmInvalidate = (scoresToo = true, catId?: string) => { _pmCatCache = null; if (scoresToo) { if (catId) _pmScoreCache.delete(catId); else _pmScoreCache.clear(); } };

  app.get('/api/admin/pemetaan/categories', auth, async (_req: any, res) => {
    try {
      if (_pmCatCache && Date.now() - _pmCatCache.at < PM_TTL) return res.json(_pmCatCache.data);
      const db = getDb();
      const s = await db.collection('pemetaan_categories').orderBy('createdAt', 'asc').get().catch(async () => {
        return db.collection('pemetaan_categories').get();
      });
      const categories = s.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      const payload = { success: true, categories };
      _pmCatCache = { at: Date.now(), data: payload };
      res.json(payload);
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
  });

  app.post('/api/admin/pemetaan/categories', auth, superOnly, async (req: any, res) => {
    try {
      const db = getDb(); const b = req.body || {};
      const id = String(b.id || '').trim();
      const doc = {
        name: String(b.name || 'Kategori').slice(0, 120),
        description: String(b.description || '').slice(0, 500),
        palette: Array.isArray(b.palette) && b.palette.length === 5 ? b.palette : ['#fef3c7','#fde68a','#f59e0b','#ea580c','#b91c1c'],
        bands: Array.isArray(b.bands) && b.bands.length === 5 ? b.bands : ['Sangat Rendah','Rendah','Sedang','Tinggi','Sangat Tinggi'],
        icon: String(b.icon || 'flame'),
        noDataColor: String(b.noDataColor || '#e2e8f0'),
        createdAt: b.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: req.session?.username || null,
      };
      pmInvalidate(false);
      if (id) {
        await db.collection('pemetaan_categories').doc(id).set(doc, { merge: true });
        res.json({ success: true, category: { id, ...doc } });
      } else {
        const ref = await db.collection('pemetaan_categories').add(doc);
        res.json({ success: true, category: { id: ref.id, ...doc } });
      }
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
  });

  app.put('/api/admin/pemetaan/categories/:id', auth, superOnly, async (req: any, res) => {
    try {
      const db = getDb(); const id = String(req.params.id); const b = req.body || {};
      const patch: any = { updatedAt: new Date().toISOString() };
      for (const k of ['name','description','palette','bands','icon','noDataColor']) if (k in b) patch[k] = b[k];
      if (patch.name) patch.name = String(patch.name).slice(0, 120);
      await db.collection('pemetaan_categories').doc(id).set(patch, { merge: true });
      const snap = await db.collection('pemetaan_categories').doc(id).get();
      pmInvalidate(false);
      res.json({ success: true, category: { id, ...(snap.data() as any) } });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
  });

  app.delete('/api/admin/pemetaan/categories/:id', auth, superOnly, async (req: any, res) => {
    try {
      const db = getDb(); const id = String(req.params.id);
      await db.collection('pemetaan_categories').doc(id).delete();
      // hapus skor kategori ini
      const scores = await db.collection('pemetaan_scores').where('categoryId', '==', id).get();
      const batch = db.batch(); scores.docs.forEach(d => batch.delete(d.ref));
      if (scores.size) await batch.commit();
      pmInvalidate(true, id);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
  });

  app.get('/api/admin/pemetaan/scores', auth, async (req: any, res) => {
    try {
      const categoryId = String(req.query.categoryId || '');
      const ck = categoryId || '__all__';
      const hit = _pmScoreCache.get(ck);
      if (hit && Date.now() - hit.at < PM_TTL) return res.json(hit.data);
      const db = getDb();
      let q: any = db.collection('pemetaan_scores');
      if (categoryId) q = q.where('categoryId', '==', categoryId);
      const s = await q.get();
      const scores: Record<string, any> = {};
      s.docs.forEach((d: any) => { const v = d.data() as any; const key = `${v.categoryId}::${v.regionId}`; scores[key] = { regionId: v.regionId, categoryId: v.categoryId, score: v.score, note: v.note || '', updatedAt: v.updatedAt || '' }; });
      const payload = { success: true, scores };
      _pmScoreCache.set(ck, { at: Date.now(), data: payload });
      res.json(payload);
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
  });

  app.put('/api/admin/pemetaan/scores', auth, superOnly, async (req: any, res) => {
    try {
      const db = getDb(); const b = req.body || {};
      const upserts: any[] = Array.isArray(b.upserts) ? b.upserts : (b.record ? [b.record] : []);
      const deletes: any[] = Array.isArray(b.deletes) ? b.deletes : [];
      const batch = db.batch();
      for (const r of upserts) {
        if (!r?.categoryId || !r?.regionId || !r?.score) continue;
        const docId = `${r.categoryId}__${r.regionId}`;
        batch.set(db.collection('pemetaan_scores').doc(docId), { categoryId: r.categoryId, regionId: r.regionId, score: r.score, note: String(r.note || ''), updatedAt: new Date().toISOString(), updatedBy: req.session?.username || null }, { merge: true });
      }
      for (const r of deletes) {
        if (!r?.categoryId || !r?.regionId) continue;
        batch.delete(db.collection('pemetaan_scores').doc(`${r.categoryId}__${r.regionId}`));
      }
      if (upserts.length || deletes.length) await batch.commit();
      pmInvalidate(true);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
  });

  app.delete('/api/admin/pemetaan/scores', auth, superOnly, async (req: any, res) => {
    try {
      const db = getDb(); const categoryId = String((req.query.categoryId || (req.body && req.body.categoryId) || ''));
      if (!categoryId) return res.status(400).json({ success: false, message: 'categoryId wajib.' });
      const s = await db.collection('pemetaan_scores').where('categoryId', '==', categoryId).get();
      const batch = db.batch(); s.docs.forEach(d => batch.delete(d.ref));
      if (s.size) await batch.commit();
      pmInvalidate(true, categoryId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
  });

  if (!isVercel) {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
      app.use(vite.middlewares);
    } else {
      const dist = path.resolve(process.cwd(), 'dist/client');
      app.use(express.static(dist));
      app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
    }
  }

  app.use('/api', (_req, res) => { if (!res.headersSent) res.status(404).json({ success: false, message: 'Endpoint API tidak ditemukan.' }); });
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error('[api] unhandled:', err?.message || err);
    if (res.headersSent) return;
    const msg = safeMsg(err);
    const status = Number(err?.status || err?.statusCode) || 500;
    res.status(status >= 400 && status < 600 ? status : 500).json({ success: false, message: msg || 'Terjadi kesalahan pada server.' });
  });

  return app;
}

export function getApp() {
  if (!_appPromise) _appPromise = createApp();
  return _appPromise;
}

// Vercel serverless handler (Node)
export default async function handler(req: any, res: any) {
  const app = await getApp();
  return app(req, res);
}

// Standalone (local / self-hosted)
const isDirect = typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;
if (!process.env.VERCEL && (isDirect || process.env.NODE_ENV === 'production' || process.argv[1]?.includes('server'))) {
  getApp().then(app => {
    const PORT = Number(process.env.PORT || 3010);
    app.listen(PORT, () => console.log(`SADEWA Admin running on :${PORT}`));
  }).catch(e => { console.error(e); process.exit(1); });
}
