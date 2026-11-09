import React, { useEffect, useState } from 'react';
import { Plus, Save, Shield, UserCog, Pencil, Trash2, Power, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, authHeaders } from '@/context/AuthContext';
import { Modal, Dropdown, useDialog } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ReportCategory, Role } from '@/types';

type U = { id:string; username:string; displayName?:string; role:Role; categoryScopes?:string[]; active?:boolean };

export default function Pengguna({ embedded = false }: { embedded?: boolean }) {
  const { token, user } = useAuth();
  const dialog = useDialog();
  const [users, setUsers] = useState<U[]>([]);
  const [cats, setCats] = useState<ReportCategory[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ username:'', password:'', displayName:'', role:'admin' as Role, categoryScopes: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<U|null>(null);
  const [ef, setEf] = useState<any>({});


  const load = async () => {
    try {
      const [u, c] = await Promise.all([
        api<{success:true;items:U[]}>(`/api/admin/users`, { headers: authHeaders(token) }),
        api<{success:true;categories:ReportCategory[]}>(`/api/admin/categories`, { headers: authHeaders(token) }),
      ]);
      setUsers(u.items); setCats(c.categories);
    } catch(e:any){ setErr(e.message); }
  };
  useEffect(()=>{ load(); }, []); // eslint-disable-line

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(''); setErr('');
    try {
      if (!form.username || !form.password) throw new Error('Username & password wajib.');
      if (form.password.length < 6) throw new Error('Password minimal 6 karakter.');
      await api(`/api/admin/users`, { method:'POST', headers: authHeaders(token), body: JSON.stringify(form) });
      setMsg('Pengguna berhasil dibuat.'); setForm({ username:'', password:'', displayName:'', role:'admin', categoryScopes:[] }); load();
    } catch(e:any){ setErr(e.message); } finally { setBusy(false); }
  };

  const openEdit = (u:U) => { setEdit(u); setEf({ displayName: u.displayName||'', username: u.username||'', role: u.role||'admin', categoryScopes: Array.isArray(u.categoryScopes)?[...u.categoryScopes]:[], active: u.active!==false, password:'' }); setMsg(''); setErr(''); };
  const saveEdit = async () => {
    if (!edit) return; setBusy(true); setMsg(''); setErr('');
    try {
      const body:any = { displayName: ef.displayName, username: ef.username, role: ef.role, categoryScopes: ef.role==='superadmin'?[]:ef.categoryScopes, active: ef.active };
      if (ef.password) { if (String(ef.password).length < 6) throw new Error('Password baru minimal 6 karakter.'); body.password = ef.password; }
      await api(`/api/admin/users/${edit.id}`, { method:'PUT', headers: authHeaders(token), body: JSON.stringify(body) });
      setMsg(`Pengguna ${ef.username} diperbarui.`); setEdit(null); load();
    } catch(e:any){ setErr(e.message); } finally { setBusy(false); }
  };

  const toggleActive = async (u:U) => {
    setErr(''); setMsg('');
    try { await api(`/api/admin/users/${u.id}`, { method:'PUT', headers: authHeaders(token), body: JSON.stringify({ active: u.active === false ? true : false }) }); load(); }
    catch(e:any){ setErr(e.message); }
  };

  const doDelete = async (u: U) => {
    const ok = await dialog.confirm({ title: 'Hapus Pengguna', message: <>Hapus akun <b>@{u.username}</b> ({u.displayName||'-'})? Tindakan ini permanen.</>, confirmLabel: 'Hapus', cancelLabel: 'Batal', tone: 'danger' });
    if (!ok) return;
    setBusy(true); setErr(''); setMsg('');
    try { await api(`/api/admin/users/${u.id}`, { method:'DELETE', headers: authHeaders(token) }); setMsg(`Pengguna ${u.username} dihapus.`); load(); }
    catch(e:any){ setErr(e.message); } finally { setBusy(false); }
  };

  const catName = (id:string) => cats.find(c=>c.id===id)?.name || id;
  const toggleFormScope = (id:string) => setForm(f=>({...f, categoryScopes: f.categoryScopes.includes(id)?f.categoryScopes.filter(x=>x!==id):[...f.categoryScopes,id]}));
  const toggleEfScope = (id:string) => setEf((f:any)=>({...f, categoryScopes: (f.categoryScopes||[]).includes(id)?f.categoryScopes.filter((x:string)=>x!==id):[...(f.categoryScopes||[]),id]}));

  return (
    <div className="space-y-5">


      {msg && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 px-4 py-3 text-sm">{msg}</div>}
      {err && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 px-4 py-3 text-sm">{err}</div>}

      <div className="grid lg:grid-cols-[380px,1fr] gap-5">
        <form onSubmit={create} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-5 space-y-3 h-fit">
          <div className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-blue-400"/>Tambah Pengguna</div>
          <Inp label="Username" value={form.username} onChange={v=>setForm({...form,username:v.toLowerCase().replace(/\s+/g,'')})} placeholder="huruf/angka, unik" />
          <Inp label="Nama Lengkap" value={form.displayName} onChange={v=>setForm({...form,displayName:v})} />
          <Inp label="Password" value={form.password} onChange={v=>setForm({...form,password:v})} type="password" placeholder="min. 6 karakter" />
          <div className="block"><span className="text-xs font-semibold text-slate-500 uppercase">Role</span><div className="mt-1"><Dropdown value={form.role} onChange={v=>setForm({...form,role:v as Role, categoryScopes: v==='superadmin'?[]:form.categoryScopes})} options={[{value:'admin',label:'Admin'},{value:'superadmin',label:'Superadmin'}]} /></div></div>
          {form.role==='admin' && <div className="space-y-1.5"><span className="text-xs font-semibold text-slate-500 uppercase">Scope Kategori</span><div className="flex flex-wrap gap-2">{cats.map(c=>{ const on=form.categoryScopes.includes(c.id); return <button type="button" key={c.id} onClick={()=>toggleFormScope(c.id)} className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border', on?'bg-blue-600/15 border-blue-500/30 text-blue-300':'border-slate-200 dark:border-slate-700 text-slate-400')}>{c.name}</button>; })}{!cats.length && <span className="text-xs text-slate-500">Belum ada kategori.</span>}</div></div>}
          <button disabled={busy} className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold py-2.5 text-sm">{busy?'Menyimpan…':'Buat Pengguna'}</button>
        </form>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 font-semibold flex items-center gap-2"><UserCog className="w-4 h-4 text-blue-400"/>Daftar Pengguna <span className="text-xs font-normal text-slate-500">({users.length})</span></div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
            {users.map(u=>{
              const isSelf = u.id === (user?.id || (user as any)?.userId);
              return (
              <div key={u.id} className={cn('px-5 py-4 space-y-2', u.active===false && 'opacity-60')}>
                <div className="flex items-start gap-3">
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', u.role==='superadmin'?'bg-violet-500/10 text-violet-300':'bg-slate-100 dark:bg-slate-800 text-slate-400')}><Shield className="w-4 h-4"/></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">{u.displayName||u.username} <span className="text-slate-500 font-normal">@{u.username}</span>{isSelf && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">Anda</span>}{u.active===false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">nonaktif</span>}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5"><span className={cn('font-semibold uppercase', u.role==='superadmin'?'text-violet-300':'text-amber-300')}>{u.role}</span>{u.role==='admin' && <> · scope: {(u.categoryScopes||[]).map(catName).join(', ')||'(belum diatur)'}</>}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={()=>openEdit(u)} title="Edit / reset password" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-400"><Pencil className="w-4 h-4"/></button>
                    <button onClick={()=>toggleActive(u)} title={u.active===false?'Aktifkan':'Nonaktifkan'} className={cn('p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800', u.active===false?'text-emerald-400':'text-slate-400 hover:text-amber-400')}><Power className="w-4 h-4"/></button>
                    <button onClick={()=>doDelete(u)} title="Hapus" disabled={isSelf} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-400 disabled:opacity-30"><Trash2 className="w-4 h-4"/></button>
                  </div>
                </div>
              </div>);
            })}
            {!users.length && <div className="px-5 py-8 text-center text-slate-500 text-sm">Belum ada pengguna.</div>}
          </div>
        </div>
      </div>

      <Modal open={!!edit} onClose={()=>setEdit(null)} title={`Edit Pengguna: ${edit?.username||''}`} icon={<Pencil className="w-4 h-4 text-blue-400"/>} size="lg"
        footer={<><button onClick={()=>setEdit(null)} className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold">Batal</button><button disabled={busy} onClick={saveEdit} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"><Save className="w-4 h-4"/>Simpan</button></>}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Inp label="Username" value={ef.username||''} onChange={v=>setEf({...ef,username:v.toLowerCase().replace(/\s+/g,'')})} />
          <Inp label="Nama Lengkap" value={ef.displayName||''} onChange={v=>setEf({...ef,displayName:v})} />
          <div className="block"><span className="text-xs font-semibold text-slate-500 uppercase">Role</span><div className="mt-1"><Dropdown value={ef.role||'admin'} onChange={v=>setEf({...ef,role:v, categoryScopes: v==='superadmin'?[]:(ef.categoryScopes||[])})} options={[{value:'admin',label:'admin'},{value:'superadmin',label:'superadmin'}]} /></div></div>
          <div className="block"><span className="text-xs font-semibold text-slate-500 uppercase">Status</span><div className="mt-1"><Dropdown value={ef.active===false?'0':'1'} onChange={v=>setEf({...ef,active:v==='1'})} options={[{value:'1',label:'Aktif'},{value:'0',label:'Nonaktif'}]} /></div></div>
          <div className="sm:col-span-2"><Inp label="Reset Password (kosongkan jika tidak diubah)" value={ef.password||''} onChange={v=>setEf({...ef,password:v})} type="password" placeholder="min. 6 karakter" /></div>
        </div>
        {ef.role==='admin' && <div className="mt-4 space-y-1.5"><span className="text-xs font-semibold text-slate-500 uppercase">Scope Kategori</span><div className="flex flex-wrap gap-2">{cats.map(c=>{ const on=(ef.categoryScopes||[]).includes(c.id); return <button type="button" key={c.id} onClick={()=>toggleEfScope(c.id)} className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border', on?'bg-blue-600/15 border-blue-500/30 text-blue-300':'border-slate-200 dark:border-slate-700 text-slate-400')}>{c.name}</button>; })}</div></div>}
      </Modal>


    </div>
  );
}
function Inp({ label, value, onChange, type='text', placeholder }: { label:string; value:string; onChange:(v:string)=>void; type?:string; placeholder?:string }) {
  return <label className="block"><span className="text-xs font-semibold text-slate-500 uppercase">{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1120] px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" /></label>;
}
