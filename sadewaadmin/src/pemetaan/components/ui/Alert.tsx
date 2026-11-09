'use client';

import clsx from 'clsx';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import type { ToastMessage } from '@/pemetaan/lib/types';

const icons = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
  warning: TriangleAlert,
} as const;

const styles = {
  success: { border: 'border-emerald-200', icon: 'text-emerald-500', role: 'status' },
  error: { border: 'border-red-200', icon: 'text-red-500', role: 'alert' },
  info: { border: 'border-slate-200', icon: 'text-brand-500', role: 'status' },
  warning: { border: 'border-amber-200', icon: 'text-amber-500', role: 'status' },
} as const;

export function Alert({
  type,
  title,
  description,
  onClose,
}: Pick<ToastMessage, 'type' | 'title' | 'description'> & { onClose?: () => void }) {
  const Icon = icons[type];
  const appearance = styles[type];

  return (
    <div
      role={appearance.role}
      className={clsx(
        'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border bg-white px-3.5 py-3 shadow-[0_12px_36px_rgba(15,23,42,0.16)]',
        appearance.border,
      )}
    >
      <Icon size={18} className={clsx('mt-0.5 shrink-0', appearance.icon)} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-900">{title}</p>
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p> : null}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          aria-label="Tutup notifikasi"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}
