'use client';

import { useEffect } from 'react';
import Icon from '@/components/Icon';
import { useApp } from '../core/AppContext';
import { esc } from '@/lib/html';
import type { DraftItem } from './useDraftManager';

export interface DraftSheetProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  drafts: DraftItem[];
  removing: string | null;
  onClose: () => void;
  onLoad: (draftId: string) => void;
  onRemove: (draftId: string) => void;
}

/** Daftar draft tersimpan di server (khusus sadewa). */
export default function DraftSheet({
  open,
  loading,
  error,
  drafts,
  removing,
  onClose,
  onLoad,
  onRemove,
}: DraftSheetProps) {
  const { showConfirm } = useApp();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      className={`sheet-overlay${open ? ' show' : ''}`}
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Daftar draft">
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>
            <Icon name="cloudDownload" /> Draft Tersimpan
          </h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Tutup">
            <Icon name="x" />
          </button>
        </div>

        <div className="sheet-body">
          <p className="set-hint">
            Draft berisi foto dan teks laporan. Memuat draft akan menghapusnya dari server.
          </p>

          {loading && (
            <div className="draft-state">
              <Icon name="loader" className="spin" />
              <span>Memuat daftar draft…</span>
            </div>
          )}

          {!loading && error && (
            <div className="draft-state tone-error">
              <Icon name="circleX" />
              <span>{esc(error)}</span>
              <button type="button" className="btn-ghost" onClick={onClose}>
                Tutup
              </button>
            </div>
          )}

          {!loading && !error && drafts.length === 0 && (
            <div className="draft-state">
              <Icon name="inbox" className="big" />
              <span>Belum ada draft tersimpan di server.</span>
            </div>
          )}

          {!loading && !error && drafts.length > 0 && (
            <ul className="draft-list">
              {drafts.map(draft => (
                <li key={draft.draftId} className={removing === draft.draftId ? 'is-removing' : ''}>
                  <div className="draft-top">
                    <span className="chip chip-muted">
                      <Icon name="receipt" /> {draft.timestamp}
                    </span>
                    <span className="chip chip-blue">
                      <Icon name="camera" /> {draft.jumlahFoto} foto
                    </span>
                  </div>
                  <p className="draft-text">{esc(draft.teksPreview || '(Tanpa teks laporan)')}</p>
                  <div className="draft-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => onLoad(draft.draftId)}
                      disabled={removing !== null}
                    >
                      <Icon name="cloudDownload" /> Muat
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() =>
                        showConfirm({
                          title: 'Hapus Draft',
                          message: 'Draft dan seluruh fotonya akan dihapus permanen dari server.',
                          onConfirm: () => onRemove(draft.draftId),
                        })
                      }
                      disabled={removing !== null}
                    >
                      {removing === draft.draftId ? (
                        <>
                          <Icon name="loader" className="spin" /> Menghapus…
                        </>
                      ) : (
                        <>
                          <Icon name="trash" /> Hapus
                        </>
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
