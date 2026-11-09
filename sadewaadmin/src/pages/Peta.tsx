import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPinned, Layers, Maximize2, Minimize2, Navigation, Crosshair, Plus, Minus, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Compass, Info, RefreshCw, Filter, ExternalLink, FolderOpen, Camera, Calendar, User, MapPin as Pin, Route, Map as MapIcon, Palette } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, authHeaders } from '@/context/AuthContext';
import { cn } from '@/lib/cn';
import { DateRangePicker, Modal, Dropdown } from '@/components/ui';
import type { ReportCategory, ReportSubcategory } from '@/types';
import { AppProvider as PemetaanProvider } from '@/pemetaan/lib/store';
import type { ReportPoint } from '@/pemetaan/components/map/MapCanvas';

const PemetaanDashboard = lazy(() => import('@/pemetaan/components/dashboard/Dashboard').then(m => ({ default: m.Dashboard })));

declare const window: any;

const CENTER: [number, number] = [-7.8695, 111.462]; // Ponorogo
const ZOOM = 12;
const TILES: Record<string, { url: string; attr: string; label: string; maxZoom: number }> = {
  osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap', label: 'OSM', maxZoom: 19 },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Esri', label: 'Satelit', maxZoom: 19 },
  hybrid: { url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', attr: 'Google', label: 'Hybrid', maxZoom: 20 },
  google_sat: { url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', attr: 'Google', label: 'G.Sat', maxZoom: 20 },
};
const PALETTE_COLORS = ['#2563eb','#16a34a','#f59e0b','#ef4444','#8b5cf6','#0891b2','#e11d48','#65a30d','#ea580c','#0ea5e9'];

function ensureLeaflet(cb: () => void) {
  if (window.L) { cb(); return; }
  if (window.__lfLoading) return;
  window.__lfLoading = true;
  if (!document.getElementById('leaflet-css-sa')) { const l=document.createElement('link'); l.id='leaflet-css-sa'; l.rel='stylesheet'; l.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(l); }
  const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload=()=>{ window.__lfLoading=false; cb(); }; s.onerror=()=>{ window.__lfLoading=false; }; document.head.appendChild(s);
}
function esc(s: string) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

type Point = { id:string; lat:number; lng:number; reportId?:string; categoryId?:string; subcategoryId?:string; categoryName?:string; subcategoryName?:string; lokasi?:string; pelapor?:string; tanggal?:string; waktuSubmit?:string; jumlahFoto?:number; folderDrive?:string; alamatFoto?:string; waktuFoto?:string; googleMaps?:string; photos?:any[]; keterangan?:string; status?:string };

type Tab = 'peta' | 'pemetaan';

function useReportPoints(token: string | null, cats: ReportCategory[], subs: ReportSubcategory[]) {
  const [points, setPoints] = useState<ReportPoint[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const r = await api<{success:true;items:any[]}>(`/api/admin/rekap?limit=1000`, { headers: authHeaders(token) });
        if (!alive) return;
        const pts: ReportPoint[] = (r.items || []).map((it: any) => {
          const lat = Number(it.lat ?? it.latitude); const lng = Number(it.lng ?? it.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return {
            id: it.id, lat, lng,
            categoryId: it.categoryId, subcategoryId: it.subcategoryId,
            lokasi: it.lokasi, pelapor: it.pelapor, tanggal: it.tanggal, waktuSubmit: it.waktuSubmit,
            createdAt: it.createdAt,
            status: it.status, jumlahFoto: it.jumlahFoto, keterangan: it.keterangan,
            categoryName: it.categoryName || cats.find(c => c.id === it.categoryId)?.name,
            subcategoryName: it.subcategoryName || subs.find(s => s.id === it.subcategoryId)?.name,
            photos: Array.isArray(it.photos) ? it.photos : undefined,
          } as ReportPoint;
        }).filter(Boolean) as ReportPoint[];
        setPoints(pts);
      } catch { if (alive) setPoints([]); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [token, cats, subs]);
  return { points, loading };
}

function pointInRange(p: ReportPoint, range: {start:string;end:string}) {
  if (!range.start && !range.end) return true;
  const raw = p.waktuSubmit || p.tanggal || (typeof p.createdAt === 'number' ? new Date(p.createdAt).toISOString() : (p.createdAt as string) || '');
  const ms = Date.parse(raw); if (!Number.isFinite(ms)) return true;
  const d = new Date(ms); const day = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if (range.start && day < range.start) return false;
  if (range.end && day > range.end) return false;
  return true;
}

export default function Peta({ initialTab = 'peta' }: { initialTab?: Tab }) {
  const { token, isSuper, user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  const [cats, setCats] = useState<ReportCategory[]>([]);
  const [subs, setSubs] = useState<ReportSubcategory[]>([]);
  // Filter overlay titik laporan (tab Pemetaan)
  const [pmCatId, setPmCatId] = useState('');
  const [pmSubId, setPmSubId] = useState('');
  const [pmDateRange, setPmDateRange] = useState<{start:string;end:string}>({start:'',end:''});

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{success:true;categories:ReportCategory[];subcategories:ReportSubcategory[]}>(`/api/admin/categories`, { headers: authHeaders(token) });
        setCats(r.categories || []); setSubs(r.subcategories || []);
      } catch {}
    })();
  }, [token]);

  const { points: reportPoints, loading: rptLoading } = useReportPoints(token, cats, subs);
  const pmVisibleSubs = subs.filter(s => !pmCatId || s.categoryId === pmCatId);
  const filteredReportPoints = useMemo(() => reportPoints.filter(p =>
    (!pmCatId || p.categoryId === pmCatId) &&
    (!pmSubId || p.subcategoryId === pmSubId) &&
    pointInRange(p, pmDateRange)
  ), [reportPoints, pmCatId, pmSubId, pmDateRange]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] p-1 shadow-sm">
          <button type="button" aria-pressed={tab==='peta'} onClick={() => navigate('/peta')} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition', tab==='peta' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800')}>
            <MapIcon className="w-4 h-4"/>Peta
          </button>
          <button type="button" aria-pressed={tab==='pemetaan'} onClick={() => navigate('/pemetaan')} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition', tab==='pemetaan' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800')}>
            <Palette className="w-4 h-4"/>Pemetaan
          </button>
        </div>
        {!isSuper && <p className="text-xs text-amber-500">Scope: {(user?.categoryScopes||[]).map(id=>cats.find(c=>c.id===id)?.name||id).join(', ')||'-'}</p>}
      </div>

      {tab === 'peta' ? (
        <PetaTitikLaporan token={token} isSuper={isSuper} user={user} cats={cats} subs={subs} />
      ) : (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-2 items-end rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] px-3 py-2.5">
            <Filter className="w-3.5 h-3.5 text-slate-400 mb-1.5 shrink-0"/>
            <div className="block w-full sm:w-auto"><span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Overlay: Kategori</span>
              <div className="mt-0.5 w-full sm:min-w-[170px]"><Dropdown value={pmCatId} onChange={v=>{setPmCatId(v); setPmSubId('');}} options={(isSuper?[{value:'',label:'Semua'}]:[]).concat(cats.map(c=>({value:c.id,label:c.name})))} /></div>
            </div>
            <div className="block w-full sm:w-auto"><span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Overlay: Subkategori</span>
              <div className="mt-0.5 w-full sm:min-w-[190px]"><Dropdown value={pmSubId} onChange={setPmSubId} options={[{value:'',label:'Semua'}].concat(pmVisibleSubs.map(s=>({value:s.id,label:s.name})))} /></div>
            </div>
            <div className="block w-full sm:w-auto"><span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Overlay: Rentang Tanggal</span><div className="mt-0.5"><DateRangePicker start={pmDateRange.start} end={pmDateRange.end} onChange={setPmDateRange} /></div></div>
            <div className="sm:ml-auto text-xs"><span className="font-semibold text-slate-700 dark:text-slate-200">{filteredReportPoints.length}</span> <span className="text-slate-500">titik overlay</span></div>
          </div>
          <PemetaanProvider token={token}>
            <Suspense fallback={<div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm text-slate-500">Memuat pemetaan…</div>}>
              <PemetaanDashboard reportPoints={filteredReportPoints} loading={rptLoading} />
            </Suspense>
          </PemetaanProvider>
        </>
      )}
    </div>
  );
}

function PetaTitikLaporan({ token, isSuper, user, cats, subs }: { token: string | null; isSuper: boolean; user: any; cats: ReportCategory[]; subs: ReportSubcategory[] }) {
  const [items, setItems] = useState<Point[]>([]);
  const [catId, setCatId] = useState(''); const [subId, setSubId] = useState('');
  const [dateRange, setDateRange] = useState<{start:string;end:string}>({start:'',end:''});
  const [loading, setLoading] = useState(false); const [err, setErr] = useState('');
  const [selected, setSelected] = useState<Point | null>(null);
  const mapRef = useRef<any>(null); const baseRef = useRef<any>(null); const layerRef = useRef<any>(null);
  const [ready, setReady] = useState(false); const [base, setBase] = useState('osm');
  const [navOpen, setNavOpen] = useState(false); const [layerOpen, setLayerOpen] = useState(false); const [legendOpen, setLegendOpen] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const wrapId = 'sa-map-wrap'; const divId = 'sa-map-div';

  useEffect(() => { if(!isSuper && cats.length===1 && !catId) setCatId(cats[0].id); }, [cats, isSuper, catId]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setErr('');
    try {
      const q = new URLSearchParams({ limit: '1000' }); if (catId) q.set('categoryId', catId); if (subId) q.set('subcategoryId', subId);
      const r = await api<{success:true;items:any[]}>(`/api/admin/rekap?${q}`, { headers: authHeaders(token) });
      const inRange = (it:any) => {
        if (!dateRange.start && !dateRange.end) return true;
        const raw = it.waktuSubmit || it.tanggal || (it.createdAt?.toDate ? it.createdAt.toDate().toISOString() : '');
        const ms = Date.parse(raw); if (!Number.isFinite(ms)) return true;
        const d = new Date(ms); const day = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (dateRange.start && day < dateRange.start) return false;
        if (dateRange.end && day > dateRange.end) return false;
        return true;
      };
      const pts = (r.items||[]).filter(inRange).map((it:any): Point|null => {
        const lat = Number(it.lat ?? it.latitude); const lng = Number(it.lng ?? it.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { id: it.id, lat, lng, reportId: it.reportId, categoryId: it.categoryId, subcategoryId: it.subcategoryId, categoryName: it.categoryName||cats.find(c=>c.id===it.categoryId)?.name, subcategoryName: it.subcategoryName||subs.find(s=>s.id===it.subcategoryId)?.name, lokasi: it.lokasi, pelapor: it.pelapor, tanggal: it.tanggal, waktuSubmit: it.waktuSubmit, jumlahFoto: it.jumlahFoto, folderDrive: it.folderDrive, alamatFoto: it.alamatFoto, waktuFoto: it.waktuFoto, googleMaps: it.googleMaps, photos: it.photos, keterangan: it.keterangan, status: it.status };
      }).filter(Boolean) as Point[];
      setItems(pts);
    } catch(e:any){ setErr(e.message); } finally { setLoading(false); }
  }, [catId, subId, token, cats, subs, dateRange]);
  useEffect(()=>{ load(); }, [load]);

  const visibleSubs = subs.filter(s => !catId || s.categoryId===catId);
  const colorFor = useCallback((p: Point) => { const key = p.subcategoryId || p.categoryId || ''; const arr = subs.length?subs:cats; const idx = Math.max(0, arr.findIndex((x:any)=>x.id===key)); return PALETTE_COLORS[idx % PALETTE_COLORS.length] || '#2563eb'; }, [subs,cats]);

  useEffect(() => {
    ensureLeaflet(() => {
      const L = window.L; const el = document.getElementById(divId); if (!el) return;
      if (mapRef.current) { try{ mapRef.current.remove(); }catch{} mapRef.current=null; }
      const map = L.map(divId, { center: CENTER, zoom: ZOOM, zoomControl:false });
      mapRef.current = map;
      baseRef.current = L.tileLayer(TILES.osm.url, { attribution: TILES.osm.attr, maxZoom: TILES.osm.maxZoom }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      setTimeout(()=>{ map.invalidateSize(); setReady(true); }, 80);
    });
    return ()=>{ setReady(false); if(mapRef.current){ try{mapRef.current.remove();}catch{} mapRef.current=null; } };
  }, []);

  useEffect(() => {
    const L = window.L, map = mapRef.current; if (!ready || !L || !map) return;
    let alive = true;
    fetch('/data/ponorogo.geojson').then(r => r.ok ? r.json() : null).then(data => {
      if (!alive || !data || !mapRef.current) return;
      try { L.geoJSON(data, { style: { color: '#0f172a', weight: 2.5, opacity: 0.9, fillColor: '#34d399', fillOpacity: 0.06 }, interactive: false }).addTo(mapRef.current); } catch {}
    }).catch(()=>{});
    return () => { alive = false; };
  }, [ready]);

  useEffect(() => {
    const L = window.L; const map = mapRef.current; const group = layerRef.current; if(!L||!map||!group||!ready) return;
    group.clearLayers();
    items.forEach(p => {
      const c = colorFor(p);
      const m = L.circleMarker([p.lat,p.lng], { radius:9, color:'#fff', weight:2, fillColor:c, fillOpacity:0.92 });
      m.on('mouseover', function(this:any){ this.setStyle({ radius: 11, weight: 3 }); });
      m.on('mouseout', function(this:any){ this.setStyle({ radius: 9, weight: 2 }); });
      m.on('click', () => { setSelected(p); try { map.panTo([p.lat,p.lng], { animate: true }); } catch {} });
      m.bindTooltip(`<b>${esc(p.reportId||'Laporan')}</b><br/><span style="font-size:11px">${esc(p.lokasi||'-')}</span>`, { direction:'top', offset:[0,-6], opacity:0.95 });
      m.addTo(group);
    });
    if (items.length) { try { map.fitBounds(L.latLngBounds(items.map(p=>[p.lat,p.lng])), { padding:[30,30], maxZoom:16 }); } catch {} }
    else { map.setView(CENTER, ZOOM); }
  }, [items, ready, colorFor]);

  const setBasemap = (id:string) => {
    const L=window.L, map=mapRef.current, t=TILES[id]; if(!L||!map||!t) return;
    if(baseRef.current) map.removeLayer(baseRef.current);
    baseRef.current = L.tileLayer(t.url,{attribution:t.attr,maxZoom:t.maxZoom}).addTo(map);
    setBase(id); setLayerOpen(false);
  };
  const toggleFs = () => { const el=document.getElementById(wrapId); if(!el) return; if(!document.fullscreenElement){ el.requestFullscreen?.().then(()=>setIsFs(true)).catch(()=>{});} else { document.exitFullscreen?.(); setIsFs(false);} };
  useEffect(()=>{ const h=()=>{ setIsFs(!!document.fullscreenElement); setTimeout(()=>mapRef.current?.invalidateSize?.(), 120); }; document.addEventListener('fullscreenchange',h); return ()=>document.removeEventListener('fullscreenchange',h); },[]);
  useEffect(()=>{ const onR=()=>setTimeout(()=>mapRef.current?.invalidateSize?.(), 120); window.addEventListener('resize', onR); return ()=>window.removeEventListener('resize', onR); },[]);
  const locate = () => { const map=mapRef.current, L=window.L; if(!map||!L) return; map.locate({setView:true,maxZoom:16}); map.once('locationfound',(e:any)=>{ L.circleMarker(e.latlng,{radius:7,color:'#2563eb',fillColor:'#3b82f6',fillOpacity:.9,weight:2}).addTo(map); }); };

  const legendSubs = (catId ? subs.filter(s=>s.categoryId===catId) : subs).slice(0,12);

  return (
    <>
      <div className="flex flex-wrap gap-x-3 gap-y-2 items-end rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] px-3 py-2.5">
        <Filter className="w-3.5 h-3.5 text-slate-400 mb-1.5 shrink-0"/>
        <div className="block w-full sm:w-auto"><span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Kategori</span>
          <div className="mt-0.5 w-full sm:min-w-[170px]"><Dropdown value={catId} onChange={v=>{setCatId(v); setSubId('');}} options={(isSuper?[{value:'',label:'Semua'}]:[]).concat(cats.map(c=>({value:c.id,label:c.name})))} /></div>
        </div>
        <div className="block w-full sm:w-auto"><span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Subkategori</span>
          <div className="mt-0.5 w-full sm:min-w-[190px]"><Dropdown value={subId} onChange={setSubId} options={[{value:'',label:'Semua'}].concat(visibleSubs.map(s=>({value:s.id,label:s.name})))} /></div>
        </div>
        <div className="block w-full sm:w-auto"><span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Rentang Tanggal</span><div className="mt-0.5"><DateRangePicker start={dateRange.start} end={dateRange.end} onChange={setDateRange} /></div></div>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"><RefreshCw className={cn('w-3.5 h-3.5', loading&&'animate-spin')}/>Muat</button>
        <div className="sm:ml-auto text-xs"><span className="font-semibold text-slate-700 dark:text-slate-200">{items.length}</span> <span className="text-slate-500">titik termuat</span></div>
      </div>
      {err && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 px-4 py-3 text-sm">{err}</div>}

      <div id={wrapId} className={cn('relative w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 shadow-sm', isFs?'h-screen':'h-[72vh] min-h-[440px]')}>
        <div id={divId} className="absolute inset-0" />
        {!ready && <div className="absolute inset-0 grid place-items-center text-slate-500 text-sm">Memuat peta…</div>}
        <div className="absolute left-1/2 -translate-x-1/2 top-[10px] z-[800] pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-slate-200/80 dark:border-slate-700/70 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm px-3 py-1.5 shadow-md">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Titik Aktif: {items.length}</span>
            <span className="text-[10px] text-slate-500 hidden sm:inline">· filter kategori/subkategori &amp; tanggal</span>
          </div>
        </div>

        {/* Nav */}
        <div className="absolute left-[10px] top-[10px] z-[800] flex flex-col gap-[3px]">
          <MapBtn title="Navigasi" active={navOpen} onClick={()=>{setNavOpen(v=>!v); setLayerOpen(false);}}><Compass className="h-4 w-4"/></MapBtn>
          <div className={cn('flex flex-col items-center gap-[3px] overflow-hidden transition-all', navOpen?'max-h-[260px] opacity-100':'max-h-0 opacity-0 pointer-events-none')}>
            <MapBtn title="Zoom in" onClick={()=>mapRef.current?.zoomIn()}><Plus className="h-3.5 w-3.5"/></MapBtn>
            <MapBtn title="Zoom out" onClick={()=>mapRef.current?.zoomOut()}><Minus className="h-3.5 w-3.5"/></MapBtn>
            <MapBtn title="Atas" onClick={()=>mapRef.current?.panBy([0,-80])}><ChevronUp className="h-3.5 w-3.5"/></MapBtn>
            <div className="flex gap-[3px]"><MapBtn title="Kiri" onClick={()=>mapRef.current?.panBy([-80,0])}><ChevronLeft className="h-3.5 w-3.5"/></MapBtn><MapBtn title="Kanan" onClick={()=>mapRef.current?.panBy([80,0])}><ChevronRight className="h-3.5 w-3.5"/></MapBtn></div>
            <MapBtn title="Bawah" onClick={()=>mapRef.current?.panBy([0,80])}><ChevronDown className="h-3.5 w-3.5"/></MapBtn>
            <MapBtn title="Lokasi saya" onClick={locate} className="text-blue-600"><Navigation className="h-3.5 w-3.5"/></MapBtn>
            <MapBtn title="Reset Ponorogo" onClick={()=>mapRef.current?.setView(CENTER,ZOOM)} className="text-amber-500"><Crosshair className="h-3.5 w-3.5"/></MapBtn>
          </div>
        </div>
        {/* Layer + fullscreen */}
        <div className="absolute right-[10px] top-[10px] z-[800] flex items-center gap-[6px]">
          <div className="relative">
            <MapBtn title="Layer peta" active={layerOpen} onClick={()=>{setLayerOpen(v=>!v); setNavOpen(false);}}><Layers className="h-4 w-4"/></MapBtn>
            {layerOpen && <div className="absolute right-0 top-[36px] min-w-[150px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1 shadow-xl">
              <p className="px-3 pb-1 pt-1.5 text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Gambar Peta / Basemap</p>
              {Object.entries(TILES).map(([id,t])=>(
                <button key={id} onClick={()=>setBasemap(id)} className={cn('w-full text-left px-3 py-2 text-[.72rem] font-semibold flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700', base===id?'text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20':'text-slate-700 dark:text-slate-200')}>
                  <span className={cn('h-2 w-2 rounded-full', base===id?'bg-blue-500':'bg-slate-300 dark:bg-slate-600')}/>{t.label}{base===id && <span className="ml-auto text-blue-500">✓</span>}
                </button>
              ))}
            </div>}
          </div>
          <MapBtn title={isFs?'Keluar fullscreen':'Fullscreen'} onClick={toggleFs}>{isFs?<Minimize2 className="h-4 w-4"/>:<Maximize2 className="h-4 w-4"/>}</MapBtn>
        </div>
        {/* Legend */}
        <div className="absolute bottom-[14px] left-[10px] z-[800] flex flex-col items-start gap-[6px]">
          {legendOpen && <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 p-3 shadow-xl backdrop-blur-sm min-w-[160px] max-h-[220px] overflow-y-auto custom-scrollbar">
            <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 mb-1.5">Legenda {catId?'Subkategori':'Subkategori/Kategori'}</p>
            {legendSubs.map((s:any,i:number)=>(<div key={s.id} className="flex items-center gap-2 py-0.5"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{background:PALETTE_COLORS[i%PALETTE_COLORS.length]}}/><span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">{s.name}</span></div>))}
            {!legendSubs.length && cats.map((c:any,i:number)=>(<div key={c.id} className="flex items-center gap-2 py-0.5"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{background:PALETTE_COLORS[i%PALETTE_COLORS.length]}}/><span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">{c.name}</span></div>))}
          </div>}
          <button onClick={()=>setLegendOpen(v=>!v)} className={cn('flex h-[30px] items-center gap-1.5 rounded-md border px-2.5 shadow-md backdrop-blur-sm text-xs font-semibold', legendOpen?'border-blue-500 bg-blue-600 text-white':'border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200')}><Info className="h-3.5 w-3.5"/>Legenda</button>
        </div>
      </div>


      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.reportId ? `Detail Titik — ${selected.reportId}` : 'Detail Titik Laporan'} icon={<MapPinned className="w-4 h-4 text-blue-400" />} size="lg"
        footer={selected ? (<>
          <a href={selected.googleMaps || `https://www.google.com/maps?q=${selected.lat},${selected.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 text-sm font-semibold"><ExternalLink className="w-4 h-4"/>Buka di Google Maps</a>
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"><Route className="w-4 h-4"/>Rute</a>
          {selected.folderDrive && <a href={selected.folderDrive} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"><FolderOpen className="w-4 h-4"/>Folder Drive</a>}
        </>) : undefined}>
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/40">{selected.categoryName || selected.categoryId || '-'} · {selected.subcategoryName || selected.subcategoryId || '-'}</span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-900/40"><Pin className="w-3 h-3"/>Koordinat EXIF/GPS</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <InfoRow icon={Pin} label="Lokasi" value={selected.lokasi} />
              <InfoRow icon={Calendar} label="Tanggal / Waktu Laporan" value={selected.tanggal || selected.waktuSubmit} />
              <InfoRow icon={User} label="Pelapor / Petugas" value={selected.pelapor} />
              <InfoRow icon={Camera} label="Dokumentasi" value={`${selected.jumlahFoto ?? '-'} foto${selected.waktuFoto ? ` · waktu foto: ${selected.waktuFoto}` : ''}`} />
              <InfoRow icon={Navigation} label="Koordinat" value={`${selected.lat.toFixed(6)}, ${selected.lng.toFixed(6)}`} mono />
              <InfoRow icon={MapPinned} label="Sumber Peta" value="GPS kamera (EXIF) / koordinat laporan — terintegrasi SADEWA" />
            </div>
            {selected.alamatFoto && <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 px-4 py-3 text-sm"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Alamat (resolusi foto)</span><span className="text-slate-700 dark:text-slate-200">{selected.alamatFoto}</span></div>}
          </div>
        )}
      </Modal>
    </>
  );
}

function InfoRow({ icon: Icon, label, value, mono }: { icon:any; label:string; value?:string|null; mono?:boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/20 p-3 flex gap-3 min-w-0">
      <span className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-500"><Icon className="w-4 h-4"/></span>
      <div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div><div className={cn('text-sm font-semibold text-slate-800 dark:text-slate-100 mt-0.5 break-words', mono && 'font-mono text-[12px]')}>{value && String(value).trim() ? value : '-'}</div></div>
    </div>
  );
}

function MapBtn({ children, onClick, title, active, className }: { children:React.ReactNode; onClick:()=>void; title?:string; active?:boolean; className?:string }) {
  return <button type="button" title={title} onClick={onClick} className={cn('flex h-[30px] w-[30px] items-center justify-center rounded-md border shadow-md backdrop-blur-sm transition-all', active?'border-blue-500 bg-blue-600 text-white':'border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:border-blue-400 hover:bg-blue-600 hover:text-white', className)}>{children}</button>;
}
