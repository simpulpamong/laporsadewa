import React, { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Save, FolderTree, ChevronDown, ChevronRight, Zap, Loader2, CheckCircle2, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, authHeaders } from '@/context/AuthContext';
import { ImagePicker } from '@/components/ImagePicker';
import { resolveKategoriImage } from '@/lib/image';
import { getCategoryLogoSrc, isDamkarCategory } from '@/lib/categoryLogo';
import { Modal, Switch, useDialog } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ReportCategory, ReportSubcategory } from '@/types';

const emptyCat = (): Partial<ReportCategory> => ({ name: '', slug: '', description: '', order: 0, active: true, config: { driveFolder: '' } } as any);
const emptySub = (categoryId = ''): Partial<ReportSubcategory> => ({ categoryId, name: '', slug: '', description: '', image: '', order: 0, active: true, format: { template: '', fields: [], version: 1 }, config: { driveFolder: '', reportSheet: '', photoSheet: '', narrativeSheet: '' } });

export default function Kategori() {
  const { token, isSuper } = useAuth();
  const dialog = useDialog();
  const [cats, setCats] = useState<ReportCategory[]>([]);
  const [subs, setSubs] = useState<ReportSubcategory[]>([]);
  // loading: true hanya saat load pertama (belum ada data sama sekali)
  const [loading, setLoading] = useState(true);
  // refreshing: true saat reload setelah save (data sudah ada, cukup overlay tipis)
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');
  // busy: null | 'cat' | 'sub' | catId (untuk provision per-kategori)
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editCat, setEditCat] = useState<Partial<ReportCategory> | null>(null);
  const [editSub, setEditSub] = useState<Partial<ReportSubcategory> | null>(null);
  const hasData = useRef(false);

  // load: firstLoad=true → full loading state; false → hanya refreshing overlay
  const load = async (firstLoad = false) => {
    if (firstLoad) setLoading(true); else setRefreshing(true);
    setErr('');
    try {
      const r = await api<{ success: true; categories: ReportCategory[]; subcategories: ReportSubcategory[] }>(
        `/api/admin/categories`, { headers: authHeaders(token), fresh: true }
      );
      setCats(r.categories);
      setSubs(r.subcategories);
      hasData.current = true;
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(true); }, []); // eslint-disable-line

  const provision = async (cat: ReportCategory) => {
    const ok = await dialog.confirm({
      title: 'Otomasi & Aktifkan Kategori', tone: 'info', confirmLabel: 'Aktifkan',
      message: <>Buat Spreadsheet & Folder Drive terpisah untuk <b>{cat.name}</b> lalu simpan ID-nya?</>
    });
    if (!ok) return;
    setBusy(cat.id);
    try {
      const r = await api<any>(`/api/admin/categories/${cat.id}/provision`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({}) });
      dialog.toast(r.message || 'Berhasil diaktifkan.', 'success');
      await load(false);
    } catch (e: any) {
      dialog.toast('Gagal: ' + e.message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const saveCat = async () => {
    if (!editCat?.name) { dialog.toast('Nama kategori wajib diisi.', 'warning'); return; }
    setBusy('cat');
    try {
      const { icon, tone, ...rest } = editCat as any;
      const payload = { ...rest, order: Number(rest.order || 0) };
      const url = editCat.id ? `/api/admin/categories/${editCat.id}` : `/api/admin/categories`;
      await api<any>(url, { method: editCat.id ? 'PUT' : 'POST', headers: authHeaders(token), body: JSON.stringify(payload) });
      setEditCat(null);
      dialog.toast('Kategori tersimpan.', 'success');
      await load(false);
    } catch (e: any) {
      dialog.toast(e?.message || 'Gagal menyimpan kategori.', 'danger');
    } finally {
      setBusy(null);
    }
  };

  const saveSub = async () => {
    if (!editSub?.name || !editSub?.categoryId) { dialog.toast('Nama & kategori sub wajib diisi.', 'warning'); return; }
    setBusy('sub');
    try {
      // image selalu dikirim ('' = hapus foto) agar server tidak mengabaikannya via has() check
      const payload = { ...editSub, image: editSub.image ?? '', order: Number(editSub.order ?? 0) };
      const url = editSub.id ? `/api/admin/subcategories/${editSub.id}` : `/api/admin/subcategories`;
      await api<any>(url, { method: editSub.id ? 'PUT' : 'POST', headers: authHeaders(token), body: JSON.stringify(payload) });
      setEditSub(null);
      dialog.toast('Subkategori tersimpan.', 'success');
      await load(false);
    } catch (e: any) {
      dialog.toast(e?.message || 'Gagal menyimpan subkategori.', 'danger');
    } finally {
      setBusy(null);
    }
  };

  // ── Loading state: tampil hanya saat pertama kali (belum ada data) ─────────
  if (loading) {
    return (
      <div className="space-y-3">
        {/* skeleton header */}
        <div className="flex items-center justify-between gap-3">
          <div className="h-5 w-32 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-9 w-36 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
        </div>
        {/* skeleton cards */}
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-4 space-y-3 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-3 w-64 rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const savingCat = busy === 'cat';
  const savingSub = busy === 'sub';

  return (
    <div className="space-y-5">
      {/* Header */}
      {isSuper && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{cats.length}</span> kategori
            <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{subs.length}</span> subkategori
            {refreshing && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 ml-1" />}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(false)}
              disabled={refreshing}
              title="Muat ulang"
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 disabled:opacity-50 transition"
            >
              <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            </button>
            <button
              onClick={() => setEditCat(emptyCat())}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 text-sm font-semibold shadow-sm transition"
            >
              <Plus className="w-4 h-4" />Kategori Baru
            </button>
          </div>
        </div>
      )}

      {err && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 px-4 py-3 text-sm flex items-center gap-2">
          <span className="flex-1">{err}</span>
          <button onClick={() => load(false)} className="text-rose-400 hover:text-rose-300 text-xs font-semibold underline">Coba lagi</button>
        </div>
      )}

      {/* Modal Edit Kategori */}
      <Modal
        open={!!editCat && isSuper}
        onClose={() => { if (!savingCat) setEditCat(null); }}
        title={editCat?.id ? 'Edit Kategori' : 'Kategori Baru'}
        icon={<FolderTree className="w-4 h-4 text-blue-400" />}
        size="lg"
        footer={
          <>
            <button
              onClick={() => setEditCat(null)}
              disabled={savingCat}
              className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Batal
            </button>
            <button
              onClick={saveCat}
              disabled={savingCat}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold transition"
            >
              {savingCat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingCat ? 'Menyimpan…' : 'Simpan'}
            </button>
          </>
        }
      >
        {editCat && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-3 py-2.5">
              <img src={getCategoryLogoSrc(editCat as any)} alt="" className="w-12 h-12 rounded-xl object-contain border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1" />
              <div className="min-w-0 text-sm">
                <div className="font-semibold">Logo kategori otomatis</div>
                <div className="text-xs text-slate-500">{isDamkarCategory(editCat as any) ? 'Damkar' : 'Satpol PP'} · tidak perlu dipilih.</div>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Inp label="Nama" value={editCat.name || ''} onChange={v => setEditCat({ ...editCat, name: v })} />
              <Inp label="Slug" value={editCat.slug || ''} onChange={v => setEditCat({ ...editCat, slug: v })} placeholder="otomatis dari nama" />
              <div className="sm:col-span-2"><Inp label="Deskripsi" value={editCat.description || ''} onChange={v => setEditCat({ ...editCat, description: v })} /></div>
              <Inp label="Urutan" type="number" value={String(editCat.order ?? 0)} onChange={v => setEditCat({ ...editCat, order: Number(v) })} />
              <Inp label="Folder Drive (nama)" value={editCat.config?.driveFolder || ''} onChange={v => setEditCat({ ...editCat, config: { ...(editCat.config || {}), driveFolder: v } })} />
            </div>
            <Switch checked={editCat.active !== false} onChange={v => setEditCat({ ...editCat, active: v })} label="Aktif" size="sm" />
          </div>
        )}
      </Modal>

      {/* Daftar Kategori */}
      <div className="space-y-3">
        {cats.map(cat => {
          const children = subs.filter(s => s.categoryId === cat.id);
          const isOpen = open[cat.id] ?? true;
          const catLogo = getCategoryLogoSrc(cat as any);
          const provisioning = busy === cat.id;
          return (
            <div
              key={cat.id}
              className={cn(
                'rounded-2xl border bg-white dark:bg-[#0F172A] overflow-hidden transition-all',
                cat.config?.spreadsheetId && cat.config?.driveRootFolderId
                  ? 'border-emerald-500/25'
                  : 'border-slate-200 dark:border-slate-800'
              )}
            >
              <div className="flex items-center gap-3 px-4 py-3.5">
                <button
                  onClick={() => setOpen(o => ({ ...o, [cat.id]: !isOpen }))}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition shrink-0"
                >
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <img src={catLogo} alt={cat.name} className="w-10 h-10 rounded-xl object-contain border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold flex items-center gap-2 flex-wrap text-sm">
                    {cat.name}
                    {!cat.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">nonaktif</span>}
                    {cat.config?.spreadsheetId && cat.config?.driveRootFolderId && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                        <CheckCircle2 className="w-3 h-3" />Spreadsheet & Folder terpisah
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {cat.description && <>{cat.description} · </>}
                    slug: {cat.slug} · {children.length} subkategori · logo {isDamkarCategory(cat as any) ? 'Damkar' : 'Satpol PP'} (otomatis)
                  </div>
                </div>
                {isSuper && (
                  <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                    <button
                      onClick={() => provision(cat)}
                      disabled={!!busy}
                      title="Otomasi: buat Spreadsheet & Folder Drive terpisah"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600/90 hover:bg-violet-500 disabled:opacity-50 text-white px-2.5 py-1.5 text-xs font-semibold transition"
                    >
                      {provisioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      {cat.config?.spreadsheetId ? 'Otomasi' : 'Aktifkan'}
                    </button>
                    <button
                      onClick={() => setEditCat(cat)}
                      disabled={!!busy}
                      className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 disabled:opacity-50 transition"
                      title="Edit kategori"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditSub(emptySub(cat.id))}
                      disabled={!!busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />Sub
                    </button>
                  </div>
                )}
              </div>

              {isOpen && (
                <div className="border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800/80">
                  {children.length === 0 && (
                    <div className="px-12 py-4 text-sm text-slate-500">Belum ada subkategori.</div>
                  )}
                  {children.map(sub => {
                    const subImg = resolveKategoriImage(sub.image);
                    return (
                      <div key={sub.id} className="px-6 sm:px-12 py-3 flex items-center gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition">
                        {/* Thumbnail foto subkategori */}
                        {subImg ? (
                          <img
                            src={subImg}
                            alt={`Foto ${sub.name}`}
                            className="w-11 h-11 rounded-xl object-cover border-2 border-blue-200 dark:border-blue-500/30 bg-slate-100 dark:bg-slate-800 shrink-0 shadow-sm"
                            onError={e => {
                              e.currentTarget.style.display = 'none';
                              (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.removeProperty('display');
                            }}
                          />
                        ) : null}
                        <span
                          className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 items-center justify-center shrink-0 text-slate-400"
                          style={{ display: subImg ? 'none' : 'flex' }}
                          title="Belum ada foto subkategori"
                          aria-hidden="true"
                        >
                          <ImageIcon className="w-4 h-4" />
                        </span>

                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                            {sub.name}
                            {!sub.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">nonaktif</span>}
                            {sub.image && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/20">
                                foto {sub.image}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            slug: {sub.slug} · sheet: {sub.config?.reportSheet || '-'} · drive: {sub.config?.driveFolder || '-'} · {sub.format?.fields?.length || 0} field parser
                          </div>
                        </div>

                        {isSuper && (
                          <button
                            onClick={() => setEditSub({ ...sub, image: sub.image ?? '' })}
                            disabled={!!busy}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 disabled:opacity-50 transition shrink-0"
                            title="Edit subkategori"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {!cats.length && !loading && (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-slate-500">
            Belum ada kategori.{' '}
            {isSuper && 'Buat kategori baru atau jalankan bootstrap default via API /api/admin/bootstrap-defaults.'}
          </div>
        )}
      </div>

      {/* Modal Edit Subkategori */}
      <Modal
        open={!!editSub && isSuper}
        onClose={() => { if (!savingSub) setEditSub(null); }}
        title={editSub?.id ? 'Edit Subkategori' : 'Subkategori Baru'}
        size="xl"
        footer={
          <>
            <button
              onClick={() => setEditSub(null)}
              disabled={savingSub}
              className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Batal
            </button>
            <button
              onClick={saveSub}
              disabled={savingSub}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold transition"
            >
              {savingSub ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingSub ? 'Menyimpan…' : 'Simpan'}
            </button>
          </>
        }
      >
        {editSub && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Inp label="Nama" value={editSub.name || ''} onChange={v => setEditSub({ ...editSub, name: v })} />
              <Inp label="Slug" value={editSub.slug || ''} onChange={v => setEditSub({ ...editSub, slug: v })} placeholder="otomatis dari nama" />
              <div className="sm:col-span-2"><Inp label="Deskripsi" value={editSub.description || ''} onChange={v => setEditSub({ ...editSub, description: v })} /></div>
              <Inp label="Urutan" type="number" value={String(editSub.order ?? 0)} onChange={v => setEditSub({ ...editSub, order: Number(v) })} />
              <Inp label="Folder Drive" value={editSub.config?.driveFolder || ''} onChange={v => setEditSub({ ...editSub, config: { ...(editSub.config || {}), driveFolder: v } })} />
              <Inp label="Sheet Laporan" value={editSub.config?.reportSheet || ''} onChange={v => setEditSub({ ...editSub, config: { ...(editSub.config || {}), reportSheet: v } })} />
              <Inp label="Sheet Foto" value={editSub.config?.photoSheet || ''} onChange={v => setEditSub({ ...editSub, config: { ...(editSub.config || {}), photoSheet: v } })} />
              <div className="sm:col-span-2"><Inp label="Sheet Narasi" value={editSub.config?.narrativeSheet || ''} onChange={v => setEditSub({ ...editSub, config: { ...(editSub.config || {}), narrativeSheet: v } })} /></div>
            </div>

            {/* Image Picker */}
            <div className="space-y-2">
              <ImagePicker label="Foto Subkategori (1–10)" value={editSub.image || ''} onChange={v => setEditSub({ ...editSub, image: v })} />
              {editSub.image ? (
                <div className="flex items-center gap-3 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-500/10 px-3 py-2">
                  <img
                    src={resolveKategoriImage(editSub.image) || ''}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0"
                    onError={e => { e.currentTarget.style.opacity = '0.3'; }}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-blue-700 dark:text-blue-300">Foto terpilih: {editSub.image}</div>
                    <div className="text-xs text-slate-500">Akan tampil di SADEWA app & daftar admin.</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 px-1">Belum ada foto dipilih — subkategori tampil dengan ikon generik.</div>
              )}
            </div>

            <Switch checked={editSub.active !== false} onChange={v => setEditSub({ ...editSub, active: v })} label="Aktif" size="sm" />
          </div>
        )}
      </Modal>
    </div>
  );
}

function Inp({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1120] px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 focus:outline-none transition"
      />
    </label>
  );
}
