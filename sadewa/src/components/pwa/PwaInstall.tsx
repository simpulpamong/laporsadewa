'use client';

import { Download, Share, X } from 'lucide-react';
import { useInstallPrompt } from './useInstallPrompt';
import { APP_NAME } from '@/lib/constants';

/**
 * Notif/prompt install PWA SADEWA (ala JANAKA) — hanya muncul jika belum terinstal.
 * Minimalis, rapi, tidak mengganggu alur laporan.
 */
export default function PwaInstall() {
  const { showBanner, canPrompt, isiOS, installing, install, dismiss } = useInstallPrompt();
  if (!showBanner) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex justify-center p-3 sm:justify-end sm:p-4"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-white/10 bg-[#0f172a]/95 p-3.5 text-slate-100 shadow-2xl shadow-black/40 backdrop-blur-md ring-1 ring-white/5">
        <div className="shrink-0 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 p-1.5 shadow-sm">
          <img
            src="/assets/sadewa-white.svg"
            alt=""
            className="h-8 w-8 rounded-lg object-contain"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold leading-snug text-white">Pasang {APP_NAME}</p>
          {isiOS && !canPrompt ? (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-300/90">
              Di iPhone/iPad: ketuk{' '}
              <Share className="inline h-3 w-3 -translate-y-px" aria-hidden="true" />{' '}
              <b>Bagikan</b>, lalu pilih <b>Tambah ke Layar Utama</b>.
            </p>
          ) : (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-300/90">
              Akses cepat dari layar utama, lebih ringan dan tetap bisa dipakai saat sinyal lemah.
            </p>
          )}

          <div className="mt-2.5 flex items-center gap-2">
            {canPrompt ? (
              <button
                type="button"
                onClick={() => void install()}
                disabled={installing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" />
                {installing ? 'Memasang…' : 'Pasang'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-white/5"
            >
              Nanti dulu
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Tutup ajakan pasang aplikasi"
          className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
