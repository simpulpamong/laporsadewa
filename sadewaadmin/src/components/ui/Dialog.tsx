import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Modal } from './Modal';

type Tone = 'info' | 'success' | 'warning' | 'danger';
type ConfirmOpts = { title?: string; message: React.ReactNode; confirmLabel?: string; cancelLabel?: string; tone?: Tone };
type AlertOpts = { title?: string; message: React.ReactNode; okLabel?: string; tone?: Tone };
type ToastItem = { id: number; message: string; tone: Tone };

interface DialogApi {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  alert: (opts: AlertOpts) => Promise<void>;
  toast: (message: string, tone?: Tone) => void;
}

const Ctx = createContext<DialogApi | null>(null);
export function useDialog(): DialogApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDialog harus dipakai di dalam <DialogProvider>.');
  return v;
}

let _toastId = 1;
export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [confirmState, setConfirmState] = useState<(ConfirmOpts & { resolve: (v:boolean)=>void }) | null>(null);
  const [alertState, setAlertState] = useState<(AlertOpts & { resolve: ()=>void }) | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, any>>(new Map());

  const removeToast = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id));
    const tm = timers.current.get(id); if (tm) clearTimeout(tm); timers.current.delete(id);
  }, []);

  const toast = useCallback((message: string, tone: Tone = 'info') => {
    const id = _toastId++;
    setToasts(t => [...t.slice(-4), { id, message, tone }]);
    timers.current.set(id, setTimeout(() => removeToast(id), tone === 'danger' ? 5200 : 3600));
  }, [removeToast]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const confirm = useCallback((opts: ConfirmOpts) => new Promise<boolean>(resolve => setConfirmState({ ...opts, resolve })), []);
  const alertFn = useCallback((opts: AlertOpts) => new Promise<void>(resolve => setAlertState({ ...opts, resolve })), []);

  const iconFor = (tone: Tone) => tone === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-500"/> : tone === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-500"/> : tone === 'danger' ? <XCircle className="w-4 h-4 text-rose-500"/> : <Info className="w-4 h-4 text-blue-500"/>;
  const toneBtn = (tone: Tone) => tone === 'danger' ? 'bg-rose-600 hover:bg-rose-500' : tone === 'warning' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500';

  return (
    <Ctx.Provider value={{ confirm, alert: alertFn, toast }}>
      {children}

      <Modal open={!!confirmState} onClose={() => { confirmState?.resolve(false); setConfirmState(null); }} title={confirmState?.title || 'Konfirmasi'} icon={iconFor(confirmState?.tone || 'warning')} size="sm"
        footer={<>
          <button onClick={() => { confirmState?.resolve(false); setConfirmState(null); }} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800">{confirmState?.cancelLabel || 'Batal'}</button>
          <button onClick={() => { confirmState?.resolve(true); setConfirmState(null); }} className={cn('rounded-xl text-white px-4 py-2 text-sm font-semibold', toneBtn(confirmState?.tone || 'warning'))}>{confirmState?.confirmLabel || 'Lanjutkan'}</button>
        </>}>
        <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{confirmState?.message}</div>
      </Modal>

      <Modal open={!!alertState} onClose={() => { alertState?.resolve(); setAlertState(null); }} title={alertState?.title || 'Informasi'} icon={iconFor(alertState?.tone || 'info')} size="sm"
        footer={<button onClick={() => { alertState?.resolve(); setAlertState(null); }} className={cn('rounded-xl text-white px-4 py-2 text-sm font-semibold', toneBtn(alertState?.tone || 'info'))}>{alertState?.okLabel || 'OK'}</button>}>
        <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{alertState?.message}</div>
      </Modal>

      {typeof document !== 'undefined' && createPortal(
        <div className="fixed z-[12500] top-4 right-4 flex flex-col gap-2 w-[min(92vw,360px)] pointer-events-none">
          {toasts.map(t => (
            <div key={t.id} className={cn('pointer-events-auto flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 shadow-lg shadow-slate-900/10 dark:shadow-black/30 backdrop-blur-sm',
              t.tone==='success'?'bg-emerald-50/95 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-200':
              t.tone==='danger'?'bg-rose-50/95 dark:bg-rose-950/80 border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-200':
              t.tone==='warning'?'bg-amber-50/95 dark:bg-amber-950/80 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200':
              'bg-white/95 dark:bg-slate-900/90 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200')}>
              <span className="shrink-0 mt-0.5">{iconFor(t.tone)}</span>
              <span className="text-sm font-medium flex-1 min-w-0">{t.message}</span>
              <button onClick={()=>removeToast(t.id)} className="shrink-0 opacity-60 hover:opacity-100"><X className="w-4 h-4"/></button>
            </div>
          ))}
        </div>, document.body
      )}
    </Ctx.Provider>
  );
}

// fallback untuk modul non-React (mis. cetak)
export function domToast(message: string, tone: Tone = 'info') {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  const bg = tone==='danger'?'#fef2f2;border:1px solid #fecaca;color:#991b1b':tone==='warning'?'#fffbeb;border:1px solid #fde68a;color:#92400e':tone==='success'?'#ecfdf5;border:1px solid #a7f3d0;color:#065f46':'#ffffff;border:1px solid #e2e8f0;color:#0f172a';
  el.setAttribute('style',`position:fixed;z-index:12500;top:16px;right:16px;max-width:min(92vw,360px);padding:12px 14px;border-radius:14px;${bg};font:600 13px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(15,23,42,.12)`);
  el.textContent = message; document.body.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .25s'; setTimeout(()=>el.remove(),260); }, tone==='danger'?5200:3600);
}
