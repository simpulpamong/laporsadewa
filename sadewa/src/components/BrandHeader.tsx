'use client';

import Image from 'next/image';
import Link from 'next/link';
import Icon from './Icon';
import { getCategoryLogoSrc, isDamkarCategory } from '@/lib/categoryLogo';
import { useApp, useSettingsVisibility } from '@/features/core/AppContext';
import { APP_NAME, APP_TAGLINE } from '@/lib/constants';

/**
 * Header aplikasi — seragam untuk semua kategori.
 * Klik ikon/logo SADEWA → kembali ke menu kategori.
 * Logo kategori otomatis (Damkar/Satpol) — tanpa Lucide.
 */
export default function BrandHeader() {
  const { category, settings, toggleTheme, online } = useApp();
  const { setShowSettings } = useSettingsVisibility();
  const categoryLabel = category.slug === 'odnk' ? 'ODNK' : category.name;
  const parentCat = (category as any).parentCategory || { name: categoryLabel, slug: category.slug, id: category.slug };
  const catLogo = getCategoryLogoSrc(parentCat);

  return (
    <header className="header">
      <div className="hdr-bar">
        <div className="hdr-start">

          {!online && (
            <span className="net-badge" role="status">
              <Icon name="wifiOff" /> Offline
            </span>
          )}
        </div>
        <div className="hdr-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => toggleTheme()}
            title={settings.theme === 'dark' ? 'Tema terang' : 'Tema gelap'}
            aria-label="Ganti tema"
          >
            <Icon name={settings.theme === 'dark' ? 'moon' : 'sun'} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setShowSettings(true)}
            title="Pengaturan"
            aria-label="Pengaturan"
          >
            <Icon name="settings" />
          </button>
        </div>
      </div>

      <div className="hdr-brand">
        <Link href="/" className="brand-emblem" aria-label="Kembali ke menu kategori">
          <Image src="/assets/sadewa-favicon.svg" className="brand-emblem-img" alt={APP_NAME} width={30} height={30} priority style={{ height: 'auto' }} />
        </Link>
        <div className="brand-text">
          <div className="brand-line">
            <span className="brand-name">{APP_NAME}</span>
            <span
              className={`flow-pill ${isDamkarCategory(parentCat) ? 'flow-pill-damkar' : 'flow-pill-satpol'}`}
              title="Kategori aktif"
            >
              <img src={catLogo} alt="" width={14} height={14} className="flow-pill-logo" style={{ objectFit: 'contain', borderRadius: 3 }} />
              <span>{categoryLabel}</span>
            </span>
          </div>
          <span className="hdr-tagline-text">{APP_TAGLINE}</span>
        </div>
      </div>
    </header>
  );
}
