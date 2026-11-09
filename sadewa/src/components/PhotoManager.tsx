'use client';

import { useRef, useState, type DragEvent, type ReactNode, type MouseEvent } from 'react';
import Icon from './Icon';
import { useApp } from '@/features/core/AppContext';
import { usePhotoProcessor, type BuildContext } from '@/features/core/usePhotoProcessor';
import { MAX_PHOTOS } from '@/lib/constants';
import { formatSizeKB, stampCompact } from '@/lib/format';
import type { PhotoData } from '@/features/core/types';

export interface PhotoManagerProps {
  /** Membangun konteks watermark (beda per alur). */
  buildContext: BuildContext;
  /** Slot aksi tambahan di bawah grid (mis. Transfer / Load draft). */
  children?: ReactNode;
  showDownload?: boolean;
  /** Kelas tambahan pada kartu, mis. "slot-photos" untuk urutan grid. */
  className?: string;
}

/**
 * Galeri foto seragam: pilih kamera/galeri, kompresi + watermark otomatis,
 * urutan bisa digeser, dan setiap foto punya aksi cepat.
 */
export default function PhotoManager({
  buildContext,
  children,
  showDownload = true,
  className = '',
}: PhotoManagerProps) {
  const { photos, removePhoto, reorderPhotos, openViewer, openMapModal, settings, showConfirm } =
    useApp();
  const { handleFiles } = usePhotoProcessor();

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const full = photos.length >= MAX_PHOTOS;

  const onDragStart = (event: DragEvent, index: number) => {
    if (photos[index].processing) {
      event.preventDefault();
      return;
    }
    setDragFrom(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  };

  const onDragOver = (event: DragEvent, index: number) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dragFrom !== null && dragFrom !== index) setDragOver(index);
  };

  const onDrop = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (dragFrom !== null && dragFrom !== index) reorderPhotos(dragFrom, index);
    setDragFrom(null);
    setDragOver(null);
  };

  const onDragEnd = () => {
    setDragFrom(null);
    setDragOver(null);
  };

  const download = (photo: PhotoData, index: number, event: MouseEvent) => {
    event.stopPropagation();
    if (!photo.data) return;
    const anchor = document.createElement('a');
    anchor.href = photo.data;
    anchor.download = `SADEWA_Foto${index + 1}_${stampCompact()}.jpg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <section className={className ? `card ${className}` : 'card'}>
      <div className="card-head">
        <span className="card-ico tone-gold">
          <Icon name="camera" />
        </span>
        <h3>Dokumentasi Foto</h3>
        <span className="badge">
          {photos.length} / {MAX_PHOTOS}
        </span>
      </div>

      <div className="card-body">
        <div className="upload-grid">
          <button
            type="button"
            className="upload-btn tone-camera"
            onClick={() => cameraRef.current?.click()}
            disabled={full}
          >
            <Icon name="camera" />
            <span className="upload-main">Kamera</span>
          </button>
          <button
            type="button"
            className="upload-btn tone-gallery"
            onClick={() => galleryRef.current?.click()}
            disabled={full}
          >
            <Icon name="images" />
            <span className="upload-main">Galeri</span>
          </button>
        </div>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={event => {
            if (event.target.files) void handleFiles(event.target.files, 'camera', buildContext);
            event.target.value = '';
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={event => {
            if (event.target.files) void handleFiles(event.target.files, 'gallery', buildContext);
            event.target.value = '';
          }}
        />

        <div className="photo-status">
        {photos.length === 0 ? (
          <span>Belum ada foto</span>
        ) : (
          <span>
            <b>{photos.length}</b> foto dipilih{full && <em> (maksimal)</em>}
          </span>
        )}
      </div>

        <div className="photo-grid">
          {photos.length === 0 && (
            <div className="photo-empty">
              <Icon name="image" />
              <span>Foto yang dipilih tampil di sini</span>
            </div>
          )}

          {photos.map((photo, index) => {
            const hasMap = Boolean(photo.exif?.gps) && settings.minimap;
            return (
              <figure
                key={photo.id}
                className={`photo-item${dragFrom === index ? ' is-dragging' : ''}${
                  dragOver === index ? ' is-over' : ''
                }`}
                draggable={!photo.processing}
                role="button"
                tabIndex={photo.processing ? -1 : 0}
                aria-label={`Buka pratinjau foto ${index + 1}`}
                onDragStart={event => onDragStart(event, index)}
                onDragOver={event => onDragOver(event, index)}
                onDrop={event => onDrop(event, index)}
                onDragEnd={onDragEnd}
                onKeyDown={event => {
                  if ((event.key === 'Enter' || event.key === ' ') && !photo.processing) {
                    event.preventDefault();
                    openViewer(index);
                  }
                }}
                onClick={() => {
                  if (!photo.processing) openViewer(index);
                }}
              >
                {photo.processing ? (
                  <div className="photo-busy">
                    <Icon name="loader" className="spin" />
                    <span>{photo.procLabel || 'Memproses…'}</span>
                  </div>
                ) : (
                  <>
                    <img src={photo.data ?? ''} alt={`Foto ${index + 1}`} loading="lazy" />
                    <span className="photo-zoom">
                      <Icon name="expand" />
                    </span>
                    <span className="photo-index">{index + 1}</span>
                    <span className="photo-size">{formatSizeKB(photo.sizeKB)}</span>
                    <button
                      type="button"
                      className="photo-btn photo-del"
                      title="Hapus foto"
                      aria-label={`Hapus foto ${index + 1}`}
                      onClick={event => {
                        event.stopPropagation();
                        showConfirm({
                          title: 'Hapus Foto',
                          message: 'Yakin ingin menghapus foto ini dari daftar?',
                          onConfirm: () => removePhoto(photo.id),
                        });
                      }}
                    >
                      <Icon name="x" />
                    </button>
                    {showDownload && (
                      <button
                        type="button"
                        className="photo-btn photo-download"
                        title="Unduh foto"
                        aria-label={`Unduh foto ${index + 1}`}
                        onClick={event => download(photo, index, event)}
                      >
                        <Icon name="download" />
                      </button>
                    )}
                    {hasMap && (
                      <button
                        type="button"
                        className="photo-btn photo-map"
                        title="Lihat di peta"
                        aria-label={`Lihat lokasi foto ${index + 1}`}
                        onClick={event => {
                          event.stopPropagation();
                          openMapModal(index);
                        }}
                      >
                        <Icon name="map" />
                      </button>
                    )}
                  </>
                )}
              </figure>
            );
          })}
        </div>

        {children}
      </div>
    </section>
  );
}
