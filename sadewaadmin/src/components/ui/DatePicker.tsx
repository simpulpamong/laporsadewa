import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

function daysInMonth(y:number,m:number){ return new Date(y,m+1,0).getDate(); }
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
function fmt(d:Date){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parse(v?:string){ if(!v) return null; const d=new Date(v+'T00:00:00'); return Number.isNaN(d.getTime())?null:d; }

export function DatePicker({ value, onChange, placeholder='Pilih tanggal', className }: { value?:string; onChange:(v:string)=>void; placeholder?:string; className?:string }) {
  const [open,setOpen]=useState(false);
  const sel = parse(value); const base = sel || new Date();
  const [y,setY]=useState(base.getFullYear()); const [m,setM]=useState(base.getMonth());
  const wrapRef=useRef<HTMLDivElement>(null);
  const btnRef=useRef<HTMLButtonElement>(null);
  const menuRef=useRef<HTMLDivElement>(null);
  const [pos,setPos]=useState<{top:number;left:number;up:boolean}|null>(null);

  const updatePos = useCallback(() => {
    const el = btnRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < 320 && r.top > spaceBelow;
    setPos({ top: up ? r.top : r.bottom, left: Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - 288)), up });
  }, []);
  useLayoutEffect(() => { if (open) updatePos(); }, [open, updatePos]);
  useEffect(()=>{
    if(!open) return;
    const onDoc=(e:MouseEvent)=>{ const t=e.target as Node; if(wrapRef.current?.contains(t)||menuRef.current?.contains(t)) return; setOpen(false); };
    const onMove=()=>updatePos();
    document.addEventListener('mousedown',onDoc);
    window.addEventListener('resize',onMove);
    window.addEventListener('scroll',onMove,true);
    return ()=>{ document.removeEventListener('mousedown',onDoc); window.removeEventListener('resize',onMove); window.removeEventListener('scroll',onMove,true); };
  },[open, updatePos]);
  useEffect(()=>{ if(sel){ setY(sel.getFullYear()); setM(sel.getMonth()); } }, [value]); // eslint-disable-line

  const first = new Date(y,m,1).getDay(); const dim = daysInMonth(y,m);
  const cells: Array<number|null> = []; for(let i=0;i<first;i++) cells.push(null); for(let d=1;d<=dim;d++) cells.push(d);
  const pick=(d:number)=>{ onChange(fmt(new Date(y,m,d))); setOpen(false); };

  const menu = open && pos && typeof document !== 'undefined' ? createPortal(
    <div ref={menuRef} className="fixed z-[11500] w-[280px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl shadow-slate-900/10 dark:shadow-black/30 p-3"
      style={{ left: pos.left, ...(pos.up ? { bottom: window.innerHeight - pos.top + 4 } : { top: pos.top + 4 }) }}>
      <div className="flex items-center justify-between mb-2"><button type="button" onClick={()=>{ if(m===0){setM(11);setY(y-1);} else setM(m-1);}} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronLeft className="w-4 h-4"/></button><div className="text-sm font-semibold">{MONTHS[m]} {y}</div><button type="button" onClick={()=>{ if(m===11){setM(0);setY(y+1);} else setM(m+1);}} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronRight className="w-4 h-4"/></button></div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-500 mb-1">{['Mg','Sn','Sl','Rb','Km','Jm','Sb'].map(d=><div key={d}>{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">{cells.map((d,i)=> d? <button key={i} type="button" onClick={()=>pick(d)} className={cn('h-8 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors', value===fmt(new Date(y,m,d)) && 'bg-blue-600 text-white hover:bg-blue-500')}>{d}</button> : <div key={i}/>)}</div>
      <div className="mt-2 flex justify-between"><button type="button" onClick={()=>{onChange(''); setOpen(false);}} className="text-xs text-slate-500 hover:text-slate-300">Hapus</button><button type="button" onClick={()=>{onChange(fmt(new Date())); setOpen(false);}} className="text-xs text-blue-500 dark:text-blue-400">Hari ini</button></div>
    </div>, document.body
  ) : null;

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button ref={btnRef} type="button" onClick={()=>setOpen(o=>!o)} className={cn('w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] px-3 py-2.5 text-sm transition', open && 'border-blue-500 ring-1 ring-blue-500/30')}>
        <span className={cn(!value && 'text-slate-400')}>{value || placeholder}</span><Calendar className="w-4 h-4 text-slate-400"/>
      </button>
      {menu}
    </div>
  );
}

export function DateRangePicker({ start, end, onChange }: { start?:string; end?:string; onChange:(r:{start:string;end:string})=>void }) {
  return <div className="flex flex-wrap items-center gap-2"><DatePicker value={start} placeholder="Dari" onChange={v=>onChange({start:v,end:end||''})} className="w-full sm:w-auto sm:min-w-[150px]"/><span className="text-slate-500 text-sm hidden sm:inline">–</span><DatePicker value={end} placeholder="Sampai" onChange={v=>onChange({start:start||'',end:v})} className="w-full sm:w-auto sm:min-w-[150px]"/></div>;
}
