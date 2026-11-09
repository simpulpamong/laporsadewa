'use client';

import { useEffect, useRef } from 'react';
import Icon, { type IconName } from './Icon';
import { useApp } from '@/features/core/AppContext';
import { stripTags } from '@/lib/html';
import { formatSizeKB, stampCompact } from '@/lib/format';
import type { AlertType } from '@/features/core/types';

const ALERT_ICON: Record<AlertType, IconName> = {
  success: 'circleCheck',
  error: 'circleX',
  warn: 'triangleAlert',
  info: 'info',
};

/* ── Alert ──────────────────────────────────────────────────────── */

function AlertModal() {
  const { alertConfig, closeAlert } = useApp();

  useEffect(() => {
    if (!alertConfig) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAlert();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [alertConfig, closeAlert]);

  if (!alertConfig) return null;

  return (
    <div
      className="overlay"
      role="alertdialog"
      aria-modal="true"
      onClick={event => {
        if (event.target === event.currentTarget) closeAlert();
      }}
    >
      <div className={`dialog ${alertConfig.type === 'success' && alertConfig.title === 'Laporan Terkirim' ? 'dialog-report-success' : ''}`}>
        <button type="button" className="dialog-close" onClick={closeAlert} aria-label="Tutup">
          <Icon name="x" />
        </button>
        <div className={`dialog-ico tone-${alertConfig.type}`}>
          <Icon name={ALERT_ICON[alertConfig.type]} />
        </div>
        <h2 className="dialog-title">{alertConfig.title}</h2>
        <div className="dialog-msg" dangerouslySetInnerHTML={{ __html: alertConfig.message }} />
      </div>
    </div>
  );
}

/* ── Konfirmasi ─────────────────────────────────────────────────── */

function ConfirmModal() {
  const { confirmConfig, closeConfirm } = useApp();

  useEffect(() => {
    if (!confirmConfig) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmConfig, closeConfirm]);

  if (!confirmConfig) return null;

  return (
    <div
      className="overlay"
      role="alertdialog"
      aria-modal="true"
      aria-label={confirmConfig.title}
      onClick={event => {
        if (event.target === event.currentTarget) closeConfirm();
      }}
    >
      <div className="dialog">
        <button type="button" className="dialog-close" onClick={closeConfirm} aria-label="Tutup">
          <Icon name="x" />
        </button>
        <div className="dialog-ico tone-warn">
          <Icon name="circleAlert" />
        </div>
        <h2 className="dialog-title">{confirmConfig.title}</h2>
        <div className="dialog-msg" dangerouslySetInnerHTML={{ __html: confirmConfig.message }} />
        <div className="dialog-actions">
          <button type="button" className="dialog-btn tone-ghost" onClick={closeConfirm}>
            Batal
          </button>
          <button
            type="button"
            className="dialog-btn tone-danger"
            onClick={() => {
              confirmConfig.onConfirm();
              closeConfirm();
            }}
          >
            {confirmConfig.confirmLabel || 'Ya, Hapus'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Overlay proses ─────────────────────────────────────────────── */

function LoadingOverlay() {
  const { loading } = useApp();
  if (!loading.show) return null;

  return (
    <div className="overlay overlay-solid" role="status" aria-live="polite">
      <div className="loader-card">
        <div className="loader-ring" style={{ display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#1e3a8a,#172554)', borderRadius: 16, padding: 8 }}>
          <img src="/assets/sadewa-white.svg" alt="" width={36} height={36} style={{ objectFit: 'contain' }} />
        </div>
        <h2 className="loader-title">
          {loading.title}
          {loading.progress > 0 && <em>{Math.round(loading.progress)}%</em>}
        </h2>
        <p className="loader-sub">{loading.sub}</p>
        <div
          className="loader-bar"
          role="progressbar"
          aria-label="Kemajuan proses"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(loading.progress)}
        >
          <div className="loader-fill" style={{ width: `${loading.progress}%` }} />
        </div>
        {loading.steps.length > 0 && (
          <ol className="loader-steps">
            {loading.steps.map((step, index) => (
              <li
                key={step.label}
                className={
                  index < loading.step ? 'done' : index === loading.step ? 'active' : ''
                }
              >
                <Icon name={step.icon as IconName} />
                <span>{step.label}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/* ── Lightbox ───────────────────────────────────────────────────── */

function LightboxViewer() {
  const { photos, viewerIdx, closeViewer, navigateViewer, openMapModal, settings } = useApp();
  const touchStart = useRef(0);

  useEffect(() => {
    if (viewerIdx === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') navigateViewer(-1);
      if (event.key === 'ArrowRight') navigateViewer(1);
      if (event.key === 'Escape') closeViewer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerIdx, closeViewer, navigateViewer]);

  if (viewerIdx === null) return null;
  const photo = photos[viewerIdx];
  if (!photo?.data || photo.processing) return null;

  const info: string[] = [formatSizeKB(photo.sizeKB)];
  if (photo.exif?.gps) info.push('GPS + QR');
  if (photo.fromDraft) info.push('dari draft');

  const downloadName = `SADEWA_Foto${viewerIdx + 1}_${stampCompact()}.jpg`;
  const hasMap = Boolean(photo.exif?.gps) && settings.minimap;

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      onTouchStart={event => {
        touchStart.current = event.touches[0]?.clientX ?? 0;
      }}
      onTouchEnd={event => {
        const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStart.current;
        if (Math.abs(delta) > 48) navigateViewer(delta < 0 ? 1 : -1);
      }}
    >
      <div className="lightbox-top">
        <span className="lightbox-ttl">
          Foto {viewerIdx + 1} / {photos.length} · {photo.source === 'camera' ? 'Kamera' : 'Galeri'}
        </span>
        <button
          type="button"
          className="lightbox-btn"
          onClick={closeViewer}
          aria-label="Tutup pratinjau"
        >
          <Icon name="x" />
        </button>
      </div>

      <div className="lightbox-stage">
        <img src={photo.data} alt={`Foto ${viewerIdx + 1}`} />
      </div>

      <div className="lightbox-bottom">
        <div className="lightbox-info">
          <span>{info.join(' · ')}</span>
          {photo.exifAddr?.full && <small>{stripTags(photo.exifAddr.full)}</small>}
          {photo.exif?.gps && (
            <small>
              {photo.exif.gps.lat.toFixed(6)}, {photo.exif.gps.lng.toFixed(6)}
            </small>
          )}
        </div>
        <div className="lightbox-nav">
          {hasMap && (
            <button
              type="button"
              className="lightbox-btn tone-map"
              title="Lihat di peta"
              onClick={() => openMapModal(viewerIdx)}
            >
              <Icon name="map" />
            </button>
          )}
          <a
            className="lightbox-btn tone-download"
            href={photo.data}
            download={downloadName}
            title="Unduh foto"
          >
            <Icon name="download" />
          </a>
          <button
            type="button"
            className="lightbox-btn"
            onClick={() => navigateViewer(-1)}
            disabled={viewerIdx <= 0}
            aria-label="Foto sebelumnya"
          >
            <Icon name="chevronLeft" />
          </button>
          <button
            type="button"
            className="lightbox-btn"
            onClick={() => navigateViewer(1)}
            disabled={viewerIdx >= photos.length - 1}
            aria-label="Foto berikutnya"
          >
            <Icon name="chevronRight" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Peta ───────────────────────────────────────────────────────── */

function MapModal() {
  const { mapModal, closeMapModal } = useApp();

  useEffect(() => {
    if (!mapModal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMapModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mapModal, closeMapModal]);

  if (!mapModal) return null;

  const { lat, lng } = mapModal;
  const embed = `https://www.google.com/maps?q=${lat},${lng}&output=embed&z=17`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <div
      className="overlay"
      onClick={event => {
        if (event.target === event.currentTarget) closeMapModal();
      }}
    >
      <div className="dialog dialog-map" role="dialog" aria-modal="true" aria-label="Lokasi Foto">
        <div className="dialog-head">
          <h3>
            <Icon name="map" /> Lokasi Foto
          </h3>
          <button
            type="button"
            className="dialog-close static"
            onClick={closeMapModal}
            aria-label="Tutup"
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="dialog-msg map-meta" dangerouslySetInnerHTML={{ __html: mapModal.info }} />
        <div className="map-frame">
          <iframe
            src={embed}
            title="Peta lokasi foto"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
        <div className="dialog-actions">
          <button type="button" className="dialog-btn tone-ghost" onClick={closeMapModal}>
            Tutup
          </button>
          <a className="dialog-btn tone-primary" href={directions} target="_blank" rel="noreferrer">
            <Icon name="externalLink" /> Buka Maps
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Modals() {
  return (
    <>
      <LoadingOverlay />
      <AlertModal />
      <ConfirmModal />
      <LightboxViewer />
      <MapModal />
    </>
  );
}
