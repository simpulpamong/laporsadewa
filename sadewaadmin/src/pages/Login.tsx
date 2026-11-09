import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Shield, Eye, EyeOff, LogIn, AlertCircle, Loader2, Lock, User, Moon, Sun, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useDialog } from '@/components/ui';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/lib/api';

const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 5 * 60 * 1000;
const LS_ATTEMPTS = 'sadewa_admin_login_attempts';
const LS_COOLDOWN = 'sadewa_admin_login_cooldown';

function fmtRemain(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('sa_theme');
    if (saved === 'light') return false;
    if (saved === 'dark') return true;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('sa_theme', dark ? 'dark' : 'light');
  }, [dark]);
  return { dark, toggle: () => setDark(d => !d) };
}

function greeting() {
  const h = new Date().getHours();
  if (h >= 4 && h < 11) return 'Selamat pagi';
  if (h >= 11 && h < 15) return 'Selamat siang';
  if (h >= 15 && h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export default function Login() {
  const { login } = useAuth();
  const dialog = useDialog();
  const nav = useNavigate();
  const { dark, toggle } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  // restore lockout state
  useEffect(() => {
    try {
      const a = parseInt(localStorage.getItem(LS_ATTEMPTS) || '0', 10) || 0;
      const c = parseInt(localStorage.getItem(LS_COOLDOWN) || '0', 10) || 0;
      if (c > Date.now()) { setAttempts(a); setCooldownUntil(c); setErr('Sistem terkunci sementara karena terlalu banyak percobaan gagal.'); }
      else { if (c) { localStorage.removeItem(LS_COOLDOWN); localStorage.setItem(LS_ATTEMPTS, '0'); } setAttempts(0); }
    } catch {}
  }, []);

  // countdown
  useEffect(() => {
    if (!cooldownUntil || cooldownUntil <= Date.now()) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= cooldownUntil) {
        setCooldownUntil(null);
        setAttempts(0);
        try { localStorage.removeItem(LS_COOLDOWN); localStorage.setItem(LS_ATTEMPTS, '0'); } catch {}
        setErr('');
      }
    }, 1000);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  const locked = useMemo(() => !!(cooldownUntil && cooldownUntil > now), [cooldownUntil, now]);
  const remain = locked && cooldownUntil ? fmtRemain(cooldownUntil - now) : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    if (!username.trim() || !password) { setErr('Username dan password wajib diisi.'); return; }
    setErr(''); setBusy(true);
    try {
      const u = await login(username.trim(), password);
      try {
        localStorage.setItem(LS_ATTEMPTS, '0'); localStorage.removeItem(LS_COOLDOWN);
        sessionStorage.setItem('sa_greeted', '1');
      } catch {}
      const role = u?.role === 'superadmin' ? 'Superadmin' : 'Admin';
      const name = (u as any)?.displayName || u?.username || username.trim();
      dialog.toast(`${greeting()}, ${name} (${role}).`, 'success');
      nav('/beranda');
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 401) {
        const next = Math.min(MAX_ATTEMPTS, attempts + 1);
        setAttempts(next);
        try { localStorage.setItem(LS_ATTEMPTS, String(next)); } catch {}
        if (next >= MAX_ATTEMPTS) {
          const until = Date.now() + COOLDOWN_MS;
          setCooldownUntil(until);
          setNow(Date.now());
          try { localStorage.setItem(LS_COOLDOWN, String(until)); } catch {}
          setErr('Terlalu banyak percobaan gagal. Sistem dikunci sementara demi keamanan.');
        } else {
          setErr(`${e.message || 'Username/password salah.'} Sisa ${MAX_ATTEMPTS - next} percobaan sebelum terkunci.`);
        }
      } else {
        setAttempts(0);
        setCooldownUntil(null);
        try { localStorage.removeItem(LS_ATTEMPTS); localStorage.removeItem(LS_COOLDOWN); } catch {}
        setErr(e?.message || 'Tidak dapat terhubung ke layanan login. Coba lagi beberapa saat.');
      }
    } finally { setBusy(false); }
  };

  // ringkas & profesional: fitur dipadatkan jadi satu baris info (hemat ruang vertikal)

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0, h = 0, raf = 0;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.floor(w * DPR); canvas.height = Math.floor(h * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    const N = Math.max(28, Math.min(55, Math.floor((w * h) / 26000)));
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.45, vy: (Math.random() - 0.5) * 0.45, r: 1.6 + Math.random() * 1.4,
    }));
    const LINK = 140;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const isDark = document.documentElement.classList.contains('dark');
      const dot = isDark ? 'rgba(147,197,253,0.45)' : 'rgba(37,99,235,0.32)';
      const line = isDark ? '147,197,253' : '37,99,235';
      for (const p of pts) {
        if (!reduce) { p.x += p.vx; p.y += p.vy; }
        if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK * LINK) {
            const a = (1 - Math.sqrt(d2) / LINK) * (isDark ? 0.18 : 0.14);
            ctx.strokeStyle = `rgba(${line},${a})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
          }
        }
      }
      ctx.fillStyle = dot;
      for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [dark]);

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden bg-slate-100 dark:bg-[#060b16] transition-colors">
      {/* background: jaringan partikel halus (gaya particle-network, ringan), bukan salinan persis */}
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />

      {/* theme toggle */}
      <button type="button" onClick={toggle} aria-label="Ubah tema"
        className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 h-9 w-9 sm:h-10 sm:w-10 inline-flex items-center justify-center rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 shadow-sm backdrop-blur hover:bg-white dark:hover:bg-slate-700/70 transition">
        {dark ? <Sun className="w-4 h-4"/> : <Moon className="w-4 h-4"/>}
      </button>

      <div className="relative z-10 w-full max-w-[960px] flex flex-col lg:flex-row rounded-2xl overflow-hidden shadow-[0_24px_60px_rgba(15,23,42,.12)] dark:shadow-[0_28px_70px_rgba(0,0,0,.55)] border border-slate-200/80 dark:border-slate-800/60 bg-white dark:bg-[#0F172A]">
        {/* Left / brand panel (ringkas di mobile, lengkap di desktop) */}
        <div className="lg:flex-[1] bg-gradient-to-br from-[#143a8a] via-[#0f2f73] to-[#0a1f4d] px-5 py-4 sm:px-10 sm:py-6 lg:py-10 flex lg:flex-col lg:justify-center items-center lg:items-stretch gap-3 lg:gap-6 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.06] hidden lg:block" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.7) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.7) 1px,transparent 1px)', backgroundSize: '28px 28px' }} />
          <div className="relative z-10 flex items-center gap-3 lg:gap-4 min-w-0">
            <div className="w-12 h-12 lg:w-[84px] lg:h-[84px] rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0 shadow-[0_10px_28px_rgba(0,0,0,.2)] backdrop-blur-sm select-none">
              <img src="/assets/sadewa-white.svg" alt="SADEWA" draggable={false} className="w-8 h-8 lg:w-[56px] lg:h-[56px] object-contain drop-shadow-sm select-none" />
            </div>
            <div className="min-w-0">
              <div className="text-white font-extrabold text-[15px] lg:text-[1.45rem] tracking-tight leading-none truncate">SADEWA Admin</div>
              <div className="text-blue-200/85 text-[11px] lg:text-[13px] font-semibold mt-0.5 lg:mt-1.5 truncate">Satpol PP · Kabupaten Ponorogo</div>
            </div>
          </div>
          <div className="relative z-10 hidden lg:block">
            <h2 className="text-white text-[1.9rem] font-extrabold leading-[1.18] tracking-tight">Sistem Aksi dan Evaluasi<br/>Praja Wibawa</h2>
          </div>
          <p className="relative z-10 text-sm text-blue-100/75 leading-relaxed max-w-sm hidden lg:block">Kelola rekap laporan, peta GPS/EXIF, Drive, format, dan pengguna secara terintegrasi.</p>
          <div className="relative z-10 pt-4 border-t border-white/10 text-[11px] leading-relaxed text-blue-200/60 font-medium hidden lg:block">
            &copy; 2026 Satuan Polisi Pamong Praja<br/>Kabupaten Ponorogo
          </div>
        </div>

        {/* Right / form panel */}
        <div className="lg:flex-1 px-5 py-6 sm:px-10 lg:px-12 lg:py-10 flex flex-col justify-center">
          <div className="mb-5 sm:mb-6 lg:pt-6">
            <div className="mb-6 sm:mb-7 lg:mb-8 flex items-center justify-center select-none min-h-[56px] lg:min-h-[84px]">
              <img src="/assets/sadewa-full.svg" alt="SADEWA" draggable={false} className="h-12 sm:h-14 lg:h-[68px] w-auto max-w-full object-contain dark:brightness-0 dark:invert select-none shrink-0" />
            </div>
            <h1 className="text-slate-900 dark:text-white font-extrabold text-[1.5rem] sm:text-[1.75rem] tracking-tight">Masuk</h1>
            <p className="text-slate-500 dark:text-slate-400 text-[14px] sm:text-[15px] mt-1 sm:mt-1.5">Gunakan akun admin SADEWA untuk melanjutkan.</p>
          </div>

          {err && (
            <div role="alert" className={`mb-5 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${locked ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300'}`}>
              {locked ? <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0"/> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0"/>}
              <span>{err}{locked ? ` Coba lagi dalam ${remain}.` : ''}</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate>
            <label className="block">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Username</span>
              <div className="mt-2 relative">
                <User className="w-[18px] h-[18px] text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" required disabled={locked}
                  className="w-full rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700/70 pl-11 pr-4 py-3.5 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition disabled:opacity-60" placeholder="Masukkan username" />
              </div>
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Password</span>
              <div className="mt-2 relative">
                <Lock className="w-[18px] h-[18px] text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required disabled={locked}
                  className="w-full rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700/70 pl-11 pr-11 py-3.5 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition disabled:opacity-60" placeholder="Masukkan password" />
                <button type="button" onClick={()=>setShow(s=>!s)} tabIndex={-1} aria-label={show?'Sembunyikan password':'Tampilkan password'} disabled={locked}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md disabled:opacity-50">{show?<Eye className="w-[18px] h-[18px]"/>:<EyeOff className="w-[18px] h-[18px]"/>}</button>
              </div>
            </label>
            <button type="submit" disabled={busy || locked}
              className="w-full mt-1 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-60 text-white font-semibold text-[15px] py-3.5 flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20">
              {busy ? <><Loader2 className="w-[18px] h-[18px] animate-spin"/>Memverifikasi…</> : locked ? <><ShieldAlert className="w-[18px] h-[18px]"/>Terkunci ({remain})</> : <><LogIn className="w-[18px] h-[18px]"/>Masuk ke Sistem</>}
            </button>
          </form>


        </div>
      </div>
    </div>
  );
}
