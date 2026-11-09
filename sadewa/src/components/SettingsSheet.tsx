'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Download, Share } from 'lucide-react';
import Icon from './Icon';
import CustomScrollArea from './ui/CustomScrollArea';
import { useApp, useSettingsVisibility } from '@/features/core/AppContext';
import { useInstallPrompt } from './pwa/useInstallPrompt';
import {
  APP_CONTACT_WA,
  APP_NAME,
  APP_VERSION,
  APP_WILAYAH,
  DEVELOPER_NAME,
  DEVELOPER_PHOTO,
  DEVELOPER_ROLE,
} from '@/lib/constants';
import { defaultLocation } from '@/features/core/types';

type Section = 'tampilan' | 'foto' | 'lokasi' | 'panduan' | 'aplikasi' | 'sistem' | null;

function Toggle({
  icon,
  tone,
  label,
  description,
  checked,
  onChange,
}: {
  icon: ReactNode;
  tone?: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      className="toggle-row"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      <span className="toggle-info">
        <span className="toggle-ico" style={tone ? { color: `var(--${tone})` } : undefined}>
          {icon}
        </span>
        <span className="toggle-text">
          <strong>{label}</strong>
          <small>{description}</small>
        </span>
      </span>
      <span className={`switch${checked ? ' on' : ''}`} aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </div>
  );
}

function Group({
  title,
  id,
  open,
  onToggle,
  icon,
  children,
}: {
  title: string;
  id: Exclude<Section, null>;
  open: Section;
  onToggle: (id: Exclude<Section, null>) => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  const isOpen = open === id;
  return (
    <div className="set-group">
      <button
        type="button"
        className={`set-collapse${isOpen ? ' open' : ''}`}
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
      >
        {icon}
        <span>{title}</span>
        <Icon name="chevronDown" className="collapse-arrow" />
      </button>
      <div className={`collapse-body${isOpen ? ' open' : ''}`}>
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Panel pengaturan yang sama untuk seluruh kategori. */
export default function SettingsSheet() {
  const {
    settings,
    updateSettings,
    category,
    flow,
    location,
    updateLocation,
    coords,
    updateCoords,
  } = useApp();
  const { showSettings, setShowSettings } = useSettingsVisibility();
  const [open, setOpen] = useState<Section>(null);
  const [mounted, setMounted] = useState(false);
  const { showSettingsInstall, canPrompt, isiOS, installing, install } = useInstallPrompt();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!showSettings) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowSettings(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSettings, setShowSettings]);

  const toggle = (id: Exclude<Section, null>) => setOpen(current => (current === id ? null : id));

  return (
    <div
      className={`sheet-overlay${showSettings ? ' show' : ''}`}
      onClick={event => {
        if (event.target === event.currentTarget) setShowSettings(false);
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Pengaturan">
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>
            <Icon name="settings" /> Pengaturan
          </h2>
          <button
            type="button"
            className="sheet-close"
            onClick={() => setShowSettings(false)}
            aria-label="Tutup pengaturan"
          >
            <Icon name="x" />
          </button>
        </div>

        <CustomScrollArea
          id="settings-scroll"
          label="Konten pengaturan"
          className="sheet-scroll-area"
          viewportClassName="sheet-body"
        >
          <div className="set-card">
            <span className="set-card-ico">
              <Icon name={flow === 'sadewa' ? 'shield' : 'file'} />
            </span>
            <div>
              <strong>{category.name}</strong>
            </div>
          </div>

          <Group
            title="Tampilan"
            id="tampilan"
            open={open}
            onToggle={toggle}
            icon={<Icon name="map" />}
          >
            <Toggle
              icon={<Icon name="map" />}
              tone="green"
              label="Peta lokasi foto"
              description="Tampilkan peta dari koordinat EXIF atau OCR"
              checked={settings.minimap}
              onChange={minimap => updateSettings({ minimap })}
            />
          </Group>

          <Group
            title="Fitur Foto"
            id="foto"
            open={open}
            onToggle={toggle}
            icon={<Icon name="camera" />}
          >
            <Toggle
              icon={<Icon name="camera" />}
              tone="gold"
              label="Watermark foto kamera"
              description="Cap nama, waktu, alamat, dan QR lokasi"
              checked={settings.wmCam}
              onChange={wmCam => updateSettings({ wmCam })}
            />
            <Toggle
              icon={<Icon name="images" />}
              tone="blue"
              label="Watermark foto galeri"
              description="Cap otomatis untuk foto dari galeri"
              checked={settings.wmGal}
              onChange={wmGal => updateSettings({ wmGal })}
            />
            <Toggle
              icon={<Icon name="search" />}
              tone="amber"
              label="Deteksi lokasi foto galeri (OCR)"
              description="Baca koordinat dari teks pada gambar"
              checked={settings.ocrGal}
              onChange={ocrGal => updateSettings({ ocrGal })}
            />
          </Group>

          {flow === 'sadewa' && (
            <Group
              title="Lokasi Manual"
              id="lokasi"
              open={open}
              onToggle={toggle}
              icon={<Icon name="mapPin" />}
            >
              <p className="set-hint">
                Dipakai sebagai cap lokasi pada foto galeri yang tidak memiliki data GPS.
              </p>
              <div className="field-list">
                <MiniField
                  label="Jalan / gang"
                  value={location.jalan}
                  placeholder="Nama jalan atau gang"
                  onChange={jalan => updateLocation({ jalan })}
                />
                <MiniField
                  label="No / dukuh"
                  value={location.nodukuh}
                  placeholder="No. 12 / Dukuh Krajan"
                  onChange={nodukuh => updateLocation({ nodukuh })}
                />
                <MiniField
                  label="Desa / kelurahan"
                  value={location.desa}
                  onChange={desa => updateLocation({ desa })}
                />
                <MiniField
                  label="Kecamatan"
                  value={location.kec}
                  onChange={kec => updateLocation({ kec })}
                />
                <MiniField
                  label="Kabupaten"
                  value={location.kab}
                  onChange={kab => updateLocation({ kab })}
                />
                <MiniField
                  label="Provinsi"
                  value={location.prov}
                  onChange={prov => updateLocation({ prov })}
                />
                <MiniField
                  label="Latitude"
                  value={coords.lat}
                  placeholder="-7.865900"
                  inputMode="decimal"
                  onChange={lat => updateCoords({ lat })}
                />
                <MiniField
                  label="Longitude"
                  value={coords.lng}
                  placeholder="111.464900"
                  inputMode="decimal"
                  onChange={lng => updateCoords({ lng })}
                />
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  updateLocation({ ...defaultLocation });
                  updateCoords({ lat: '', lng: '' });
                }}
              >
                <Icon name="refresh" /> Reset semua field lokasi
              </button>
            </Group>
          )}

          <Group
            title="Panduan Penggunaan"
            id="panduan"
            open={open}
            onToggle={toggle}
            icon={<Icon name="file" />}
          >
            <ol className="guide">
              {(flow === 'sadewa' ? KEBAKARAN_GUIDE : STRUCTURED_GUIDE).map(step => (
                <li key={step.title}>
                  <span className="guide-num">{step.n}</span>
                  <span className="guide-text">
                    <strong>{step.title}</strong>
                    <p>{step.desc}</p>
                  </span>
                </li>
              ))}
            </ol>
          </Group>

          {mounted && showSettingsInstall ? (
            <Group
              title="Aplikasi"
              id="aplikasi"
              open={open}
              onToggle={toggle}
              icon={<Icon name="smartphone" />}
            >
              <p className="set-hint">
                Pasang {APP_NAME} ke layar utama agar akses lebih cepat dan nyaman.
              </p>
              {canPrompt ? (
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={installing}
                  onClick={() => void install()}
                >
                  <Download size={16} aria-hidden="true" />{' '}
                  {installing ? 'Memasang…' : 'Pasang Aplikasi'}
                </button>
              ) : isiOS ? (
                <p className="set-hint" style={{ marginTop: 4 }}>
                  Di iPhone/iPad: ketuk <Share size={13} style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden="true" />{' '}
                  <b>Bagikan</b>, lalu pilih <b>Tambah ke Layar Utama</b>.
                </p>
              ) : (
                <p className="set-hint" style={{ marginTop: 4 }}>
                  Buka menu browser lalu pilih <b>Pasang aplikasi</b> / <b>Tambah ke layar utama</b>.
                </p>
              )}
            </Group>
          ) : null}

          <Group
            title="Info Sistem"
            id="sistem"
            open={open}
            onToggle={toggle}
            icon={<Icon name="info" />}
          >
            <dl className="info-list">
              <div>
                <dt>Aplikasi</dt>
                <dd>
                  {APP_NAME} · {APP_VERSION}
                </dd>
              </div>
              <div>
                <dt>Alur laporan</dt>
                <dd>{category.name}</dd>
              </div>
              <div>
                <dt>Wilayah</dt>
                <dd>{APP_WILAYAH}</dd>
              </div>
            </dl>

            <a
              className="wa-link"
              href={`https://wa.me/${APP_CONTACT_WA}`}
              target="_blank"
              rel="noreferrer"
            >
              <WhatsAppIcon /> Hubungi WhatsApp
            </a>

            <div className="author">
              <img
                src={DEVELOPER_PHOTO}
                alt={DEVELOPER_NAME}
                width={52}
                height={52}
                loading="lazy"
              />
              <div>
                <strong>{DEVELOPER_NAME}</strong>
                <small>{DEVELOPER_ROLE}</small>
              </div>
            </div>

          </Group>
        </CustomScrollArea>
      </div>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path
        fill="#25D366"
        d="M16 2.4a13.4 13.4 0 0 0-11.5 20.3L2.8 29l6.5-1.7A13.4 13.4 0 1 0 16 2.4Z"
      />
      <path
        fill="#fff"
        d="M22.8 19.4c-.3-.2-2-1-2.3-1.1-.3-.1-.5-.2-.7.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.2-.7-1.8-1-2.4-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1.1 1-1.1 2.4 0 1.4 1.1 2.8 1.2 3 .2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2.1-1.4.3-.7.3-1.3.2-1.4 0-.2-.3-.3-.6-.5Z"
      />
    </svg>
  );
}

function MiniField({
  label,
  value,
  placeholder,
  inputMode,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  inputMode?: 'decimal' | 'text';
  onChange: (value: string) => void;
}) {
  return (
    <label className="mini-field">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={event => onChange(event.target.value)}
      />
    </label>
  );
}

const STRUCTURED_GUIDE = [
  {
    n: 1,
    title: 'Lengkapi data lokasi',
    desc: 'Pilih tanggal, kecamatan, lalu desa atau kelurahan. Kotak pencarian tersedia pada setiap kolom.',
  },
  {
    n: 2,
    title: 'Ambil foto dokumentasi',
    desc: 'Ambil foto dengan Kamera agar koordinat GPS dapat dibaca, atau pilih foto dari Galeri. Jika watermark aktif, sistem menempelkan waktu, lokasi, koordinat, nama kategori, dan QR lokasi.',
  },
  {
    n: 3,
    title: 'Kirim laporan',
    desc: 'Teks dan foto diproses di perangkat. Saat dikirim, laporan diteruskan ke penyimpanan dan Spreadsheet sesuai konfigurasi sistem.'
  },
  {
    n: 4,
    title: 'Tunggu konfirmasi',
    desc: 'Tunggu sampai proses pengiriman selesai. Jika koneksi terputus, periksa pesan status lalu coba kirim kembali.'
  },
];

const KEBAKARAN_GUIDE = [
  {
    n: 1,
    title: 'Isi teks laporan',
    desc: 'Tempel teks laporan dari WhatsApp atau gunakan template kosong. Periksa kembali isi laporan sebelum menambahkan foto.',
  },
  {
    n: 2,
    title: 'Tambahkan foto dokumentasi',
    desc: 'Ambil foto dengan Kamera agar koordinat GPS dapat dibaca, atau pilih foto dari Galeri. Watermark menampilkan DAMKAR PONOROGO dan nama kategori (Kebakaran/ODNK), waktu, lokasi, koordinat, serta QR lokasi.',
  },
  {
    n: 3,
    title: 'Atur lokasi bila diperlukan',
    desc: 'Untuk foto Galeri tanpa GPS, isi Lokasi Manual di Pengaturan. Aktifkan watermark kamera atau galeri sesuai kebutuhan.',
  },
  {
    n: 4,
    title: 'Kirim atau simpan draft',
    desc: 'Tekan KIRIM LAPORAN setelah teks dan foto siap. Jika belum selesai, tekan Simpan Draft; buka menu Draft untuk melanjutkan atau menghapus draft.',
  },
];
