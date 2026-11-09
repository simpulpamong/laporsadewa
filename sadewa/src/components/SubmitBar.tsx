'use client';

import Icon from './Icon';
import { useApp } from '@/features/core/AppContext';

export interface SubmitBarProps {
  onSubmit: () => void;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
  /** Slot kiri (mis. tombol draft sadewa). */
  children?: React.ReactNode;
  /** Catatan kecil di bawah tombol. */
  hint?: string;
}

/** Bilah aksi bawah yang menempel: kirim laporan + reset. */
export default function SubmitBar({
  onSubmit,
  disabled = false,
  busy = false,
  label = 'KIRIM LAPORAN',
  children,
  hint,
}: SubmitBarProps) {
  const { showConfirm, resetReport, flow, photoCount, isProcessing } = useApp();

  const reset = () =>
    showConfirm({
      title: 'Reset Laporan',
      message:
        flow === 'sadewa'
          ? 'Hapus semua foto dan teks laporan ini? Draft di server tidak terpengaruh.'
          : 'Hapus semua foto dan data laporan ini?',
      onConfirm: () => void resetReport(),
    });

  const blocked = !photoCount || isProcessing;

  return (
    <div className="submit-bar">
      <div className="submit-inner">
        {children}
        <button
          type="button"
          className="btn-reset"
          onClick={reset}
          title="Reset laporan"
          aria-label="Reset laporan"
        >
          <Icon name="trash" />
        </button>
        <button
          type="button"
          className="btn-submit"
          onClick={onSubmit}
          disabled={disabled || busy || blocked}
        >
          {busy ? <Icon name="loader" className="spin" /> : <Icon name="send" />}
          {busy ? 'MENGIRIM…' : label}
        </button>
      </div>

      {hint ? <p className="submit-hint">{hint}</p> : null}
    </div>
  );
}
