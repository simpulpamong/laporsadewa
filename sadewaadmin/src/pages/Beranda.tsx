import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, FileText, CalendarDays, CalendarRange, Activity, MapPin, Trash2, FolderTree, Users, ArrowRight, ShieldCheck, Image as ImageIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend, AreaChart, Area } from 'recharts';
import { api } from '@/lib/api';
import { useAuth, authHeaders } from '@/context/AuthContext';
import { cn } from '@/lib/cn';

type Dash = any;
const PALETTE = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#f43f5e','#06b6d4','#84cc16','#6366f1'];

function StatCard({ icon: Icon, label, value, tone='blue', sub, onClick }: { icon:any; label:string; value:React.ReactNode; tone?:string; sub?:string; onClick?:()=>void }) {
  const tones: Record<string,{wrap:string;icon:string}> = {
    blue:{wrap:'border-blue-200/70 dark:border-blue-900/40',icon:'bg-blue-500/10 text-blue-600 dark:text-blue-400'},
    emerald:{wrap:'border-emerald-200/70 dark:border-emerald-900/40',icon:'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'},
    violet:{wrap:'border-violet-200/70 dark:border-violet-900/40',icon:'bg-violet-500/10 text-violet-600 dark:text-violet-400'},
    amber:{wrap:'border-amber-200/70 dark:border-amber-900/40',icon:'bg-amber-500/10 text-amber-600 dark:text-amber-400'},
    rose:{wrap:'border-rose-200/70 dark:border-rose-900/40',icon:'bg-rose-500/10 text-rose-600 dark:text-rose-400'},
    slate:{wrap:'border-slate-200/80 dark:border-slate-800',icon:'bg-slate-500/10 text-slate-600 dark:text-slate-300'},
  };
  const t = tones[tone] || tones.blue;
  return (
    <button type="button" onClick={onClick} className={cn('text-left rounded-2xl border bg-white dark:bg-[#0F172A] p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow w-full', t.wrap, !onClick && 'cursor-default')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800 dark:text-slate-50 leading-none tabular-nums">{value ?? '—'}</div>
          {sub && <div className="mt-1.5 text-[11px] text-slate-500">{sub}</div>}
        </div>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', t.icon)}><Icon className="w-5 h-5"/></div>
      </div>
    </button>
  );
}

const tooltipStyle = { background: 'var(--tooltip-bg, #0f172a)', border: '1px solid rgba(148,163,184,.2)', borderRadius: 12, color: '#e2e8f0', fontSize: 12 };

export default function Beranda() {
  const { token, user, isSuper } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState<Dash|null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true); setErr('');
    try { setData(await api('/api/admin/dashboard', { headers: authHeaders(token) })); }
    catch(e:any){ setErr(e.message || 'Gagal memuat dashboard.'); } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); }, []); // eslint-disable-line

  const s = data?.stats || {};
  const byCat = useMemo(() => (data?.byCategory || []).map((c:any) => ({ name: c.name || 'Kategori', total: Number(c.total)||0 })), [data]);
  const bySub = useMemo(() => (data?.bySub || []).filter((x:any)=>Number(x.total)>0).map((x:any)=>({ name: x.name||'Sub', value: Number(x.total)||0 })), [data]);
  const trend7 = useMemo(() => (data?.trend7 || []).map((d:any) => ({ name: d.label, total: Number(d.total)||0 })), [data]);
  const period = useMemo(() => ([{ name: 'Hari Ini', total: Number(s.today)||0 }, { name: '7 Hari', total: Number(s.week)||0 }, { name: '30 Hari', total: Number(s.month)||0 }]), [s.today, s.week, s.month]);

  const total = Number(s.total) || 0;
  const catName = (id:string) => (data?.categories||[]).find((c:any)=>c.id===id)?.name || id || '-';
  const subName = (id:string) => (data?.subcategories||[]).find((x:any)=>x.id===id)?.name || id || '-';

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{loading && !data ? '…' : (s.total ?? 0)}</span> laporan
          <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
          <span className="font-semibold text-blue-600 dark:text-blue-400 tabular-nums">{loading && !data ? '…' : (s.gps ?? 0)}</span> titik GPS
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-sm">
          <RefreshCw className={cn('w-4 h-4', loading&&'animate-spin')}/>Muat Ulang
        </button>
      </div>

      {err && <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 px-4 py-3 text-sm">{err}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={FileText} label="Total Laporan" value={loading && !data ? '…' : s.total ?? 0} tone="blue" sub="seluruh data (scope)" onClick={()=>nav('/rekap')} />
        <StatCard icon={CalendarDays} label="Hari Ini" value={loading && !data ? '…' : s.today ?? 0} tone="emerald" sub="24 jam terakhir" onClick={()=>nav('/rekap')} />
        <StatCard icon={CalendarRange} label="7 Hari" value={loading && !data ? '…' : s.week ?? 0} tone="violet" sub="periode mingguan" />
        <StatCard icon={Activity} label="30 Hari" value={loading && !data ? '…' : s.month ?? 0} tone="blue" sub="periode bulanan" />
        <StatCard icon={MapPin} label="Titik GPS/EXIF" value={loading && !data ? '…' : s.gps ?? 0} tone="amber" sub="terpetakan di Peta" onClick={()=>nav('/peta')} />
        <StatCard icon={Trash2} label="Sampah" value={loading && !data ? '…' : s.trash ?? 0} tone="rose" sub="soft delete" onClick={()=>nav('/sampah')} />
        <StatCard icon={FolderTree} label="Kategori / Sub" value={loading && !data ? '…' : `${s.categories ?? 0} / ${s.subcategories ?? 0}`} tone="slate" sub="struktur laporan" onClick={()=>nav('/kategori')} />
        <StatCard icon={isSuper ? Users : ShieldCheck} label={isSuper ? 'Pengguna' : 'Akses'} value={isSuper ? (loading && !data ? '…' : s.users ?? 0) : 'Scope'} tone="slate" sub={isSuper ? 'akun admin' : 'sesuai kategori'} onClick={()=>nav(isSuper?'/pengguna':'/kategori')} />
      </div>

      <div className="grid xl:grid-cols-3 gap-4 sm:gap-5">
        <div className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-100 dark:border-slate-800 font-bold text-slate-800 dark:text-slate-100">Tren 7 Hari</div>
          <div className="p-3 sm:p-5 h-[220px] sm:h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend7} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs><linearGradient id="gTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.18)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#f8fafc', fontWeight: 700 }} />
                <Area type="monotone" dataKey="total" name="Laporan" stroke="#3b82f6" strokeWidth={2} fill="url(#gTrend)" dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-100 dark:border-slate-800 font-bold text-slate-800 dark:text-slate-100">Perbandingan Periode</div>
          <div className="p-3 sm:p-4 h-[220px] sm:h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={period} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.18)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(59,130,246,.06)' }} contentStyle={tooltipStyle} labelStyle={{ color: '#f8fafc', fontWeight: 700 }} />
                <Bar dataKey="total" name="Laporan" radius={[8,8,0,0]} maxBarSize={48}>
                  <Cell fill="#10b981" /><Cell fill="#8b5cf6" /><Cell fill="#3b82f6" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-3 gap-4 sm:gap-5">
        <div className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="font-bold text-slate-800 dark:text-slate-100">Laporan per Kategori</div>
            <button onClick={()=>nav('/rekap')} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 shrink-0">Rekap <ArrowRight className="w-3.5 h-3.5"/></button>
          </div>
          <div className="p-3 sm:p-5">
            {byCat.length ? (
              <div className="h-[220px] sm:h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byCat} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.18)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(59,130,246,.06)' }} contentStyle={tooltipStyle} labelStyle={{ color: '#f8fafc', fontWeight: 700 }} />
                    <Bar dataKey="total" name="Laporan" fill="#3b82f6" radius={[8,8,0,0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] flex flex-col items-center justify-center text-slate-400 text-sm gap-2"><FolderTree className="w-8 h-8 opacity-30"/>{loading ? 'Memuat grafik…' : 'Belum ada data kategori.'}</div>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <div className="font-bold text-slate-800 dark:text-slate-100">Distribusi Subkategori</div>
          </div>
          <div className="p-3 sm:p-4">
            {bySub.length ? (
              <div className="h-[220px] sm:h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={bySub} dataKey="value" nameKey="name" cx="50%" cy="46%" innerRadius="48%" outerRadius="72%" paddingAngle={3} stroke="transparent">
                      {bySub.map((_:any,i:number)=>(<Cell key={i} fill={PALETTE[i % PALETTE.length]} />))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] flex flex-col items-center justify-center text-slate-400 text-sm gap-2"><Activity className="w-8 h-8 opacity-30"/>{loading ? 'Memuat…' : (total ? 'Belum ada distribusi subkategori.' : 'Belum ada laporan masuk.')}</div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="font-bold text-slate-800 dark:text-slate-100">Laporan Terbaru</div>
          <button onClick={()=>nav('/rekap')} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 shrink-0">Lihat semua <ArrowRight className="w-3.5 h-3.5"/></button>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm min-w-[680px]">
            <thead className="bg-slate-50/80 dark:bg-slate-900/40 text-slate-500 text-[11px] uppercase tracking-wider">
              <tr><th className="text-left px-4 sm:px-5 py-3 font-semibold">Waktu</th><th className="text-left px-4 py-3 font-semibold">ID / Kategori</th><th className="text-left px-4 py-3 font-semibold">Lokasi / Pelapor</th><th className="text-left px-4 py-3 font-semibold">Info</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {(data?.recent||[]).map((r:any)=>(
                <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 sm:px-5 py-3 whitespace-nowrap text-slate-500 text-xs tabular-nums">{r.waktuSubmit||'-'}</td>
                  <td className="px-4 py-3"><div className="font-semibold text-slate-700 dark:text-slate-200">{r.reportId||'-'}</div><div className="text-[11px] text-slate-500 mt-0.5">{catName(r.categoryId)} · {subName(r.subcategoryId)}</div></td>
                  <td className="px-4 py-3 max-w-[280px]"><div className="truncate text-slate-700 dark:text-slate-300" title={r.lokasi}>{r.lokasi||'-'}</div><div className="text-[11px] text-slate-500 truncate mt-0.5">{r.pelapor||'-'}</div></td>
                  <td className="px-4 py-3"><div className="flex items-center gap-1.5 flex-wrap"><span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"><ImageIcon className="w-3 h-3"/>{r.jumlahFoto??0}</span>{r.hasGps && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400"><MapPin className="w-3 h-3"/>GPS</span>}</div></td>
                </tr>
              ))}
              {!data?.recent?.length && !loading && (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-400 text-sm">Belum ada laporan masuk.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
