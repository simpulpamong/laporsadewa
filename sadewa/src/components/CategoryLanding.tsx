'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BatikBackdrop from './BatikBackdrop';
import Icon from './Icon';
import { APP_NAME, APP_TAGLINE } from '@/lib/constants';
import { resolveKategoriImage, resolveKategoriImageOrNull } from '@/lib/kategoriImage';
import { getCategoryLogoSrc } from '@/lib/categoryLogo';
import { useTheme } from '@/lib/theme';
import { fetchConfigSWR } from '@/lib/configCache';
import { getLastCatId, getLastSubSlug, setLastCatId, setLastSubSlug } from '@/lib/navMemory';

type DynSub = {
  id: string; categoryId: string; name: string; slug: string;
  description?: string; image?: string; active?: boolean;
};
type DynCat = {
  id: string; name: string; slug: string;
  description?: string; image?: string; active?: boolean;
};

/**
 * Menu utama SADEWA.
 *
 * Alur:
 *  1. Render splash sebentar sambil cek IndexedDB apakah ada lastSubSlug.
 *  2. Jika ada → redirect ke /:slug (halaman laporan terakhir).
 *  3. Jika tidak ada → tampilkan menu kategori normal.
 *  4. Dari halaman laporan, tombol "Menu kategori" clear lastSubSlug
 *     sehingga saat balik ke / tidak redirect lagi.
 */
export default function CategoryLanding() {
  const router = useRouter();
  const { theme, toggleTheme, mounted: themeMounted } = useTheme();

  // restoring = true saat baru buka, cek IndexedDB untuk lastSubSlug
  const [restoring, setRestoring] = useState(true);
  const [cats, setCats] = useState<DynCat[]>([]);
  const [subs, setSubs] = useState<DynSub[]>([]);
  const [selectedCat, setSelectedCat] = useState<DynCat | null>(null);
  const [cfgLoading, setCfgLoading] = useState(true);
  const catsRef = useRef(cats); catsRef.current = cats;
  const subsRef = useRef(subs); subsRef.current = subs;

  // ── Step 1: cek lastSubSlug, redirect kalau ada ─────────────────
  useEffect(() => {
    let active = true;
    // Timeout fallback: kalau IndexedDB lambat, tetap tampil menu setelah 1.5s
    const fallback = setTimeout(() => { if (active) setRestoring(false); }, 1500);

    (async () => {
      try {
        const lastSlug = await getLastSubSlug();
        if (!active) return;
        if (lastSlug) {
          clearTimeout(fallback);
          // Redirect ke subkategori terakhir — replace agar back button tetap ke /
          router.replace(`/${encodeURIComponent(lastSlug)}`);
          return;
        }
      } catch { /* IndexedDB tidak tersedia */ }
      if (active) { clearTimeout(fallback); setRestoring(false); }
    })();

    return () => { active = false; clearTimeout(fallback); };
  }, [router]);

  // ── Step 2: muat kategori & subkategori dari Firestore ──────────
  useEffect(() => {
    if (restoring) return;
    let off = false;

    const apply = (cfg: any) => {
      if (off || !cfg?.success) return;
      const next = {
        categories: ((cfg.categories || []) as DynCat[])
          .filter(c => c.active !== false)
          .sort((a, b) => (a as any).order - (b as any).order),
        subcategories: ((cfg.subcategories || []) as DynSub[])
          .filter(s => s.active !== false)
          .sort((a, b) => (a as any).order - (b as any).order),
      };

      // Signature untuk deteksi perubahan — termasuk image & description
      const sig =
        JSON.stringify(next.categories.map(c => [c.id, c.name, c.image, c.slug, c.description])) +
        '|' +
        JSON.stringify(next.subcategories.map(s => [s.id, s.name, s.image, s.slug, s.categoryId, s.active, s.description]));
      const cur =
        JSON.stringify(catsRef.current.map(c => [c.id, c.name, c.image, c.slug, c.description])) +
        '|' +
        JSON.stringify(subsRef.current.map(s => [s.id, s.name, s.image, s.slug, s.categoryId, s.active, s.description]));

      if (sig === cur) { setCfgLoading(false); return; }
      setCats(next.categories);
      setSubs(next.subcategories);
      setCfgLoading(false);

      // Restore kategori terakhir yang dipilih (level kategori, bukan subkategori)
      getLastCatId().then(lastId => {
        if (!lastId || off) return;
        const found = next.categories.find(c => c.id === lastId);
        if (found) setSelectedCat(found);
      }).catch(() => {});
    };

    fetchConfigSWR().then(apply).catch(() => { if (!off) setCfgLoading(false); });

    // Re-apply saat tab aktif kembali — sinkronisasi dengan perubahan admin
    const onVis = () => {
      if (document.visibilityState === 'visible')
        fetchConfigSWR({ force: true }).then(apply).catch(() => {});
    };
    const onFocus = () => fetchConfigSWR({ force: true }).then(apply).catch(() => {});
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      off = true;
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [restoring]);

  const handlePickCat = (cat: DynCat) => {
    setSelectedCat(cat);
    void setLastCatId(cat.id);
  };

  const handleBack = () => {
    setSelectedCat(null);
    void setLastCatId(''); // clear agar tidak restore ke sub-level
  };

  const handlePickSub = (slug: string) => {
    void setLastSubSlug(slug);
  };

  // ── Splash ──────────────────────────────────────────────────────
  if (restoring) {
    return (
      <div className="landing-splash">
        <div className="landing-splash-glow" aria-hidden="true" />
        <Image
          src="/assets/sadewa.svg"
          alt={APP_NAME}
          width={88}
          height={88}
          priority
          className="landing-splash-logo"
        />
        <h1 className="landing-splash-brand">{APP_NAME}</h1>
        <p className="landing-splash-sub">{APP_TAGLINE}</p>
        <span className="landing-splash-spinner" aria-label="Memuat…" />
      </div>
    );
  }

  const filteredSubs = selectedCat
    ? subs.filter(s => s.categoryId === selectedCat.id)
    : [];

  return (
    <main className="landing">
      <BatikBackdrop />

      {/* ── Header ── */}
      <div className="landing-header">
        <div className="landing-header-actions">
          <button
            type="button"
            className="icon-btn theme-toggle-btn"
            onClick={toggleTheme}
            aria-label="Ganti tema terang/gelap"
          >
            <Icon name={themeMounted ? (theme === 'light' ? 'sun' : 'moon') : 'moon'} />
          </button>
        </div>
      </div>

      {/* ── Hero: brand lockup + kepanjangan nama ── */}
      <div className="landing-hero">
        <div className="landing-brand">
          <h1 className="landing-brand-lockup">
            <Image
              src="/assets/sadewa-full.svg"
              alt={`${APP_NAME} — ${APP_TAGLINE}`}
              width={1940}
              height={440}
              priority
              draggable={false}
              className="landing-brand-lockup-img"
            />
          </h1>
          <p className="landing-brand-tagline">{APP_TAGLINE.toUpperCase()}</p>
        </div>
        <div className="landing-program">
          <h2 className="landing-heading">SATUAN POLISI PAMONG PRAJA</h2>
          <p className="landing-region">Kabupaten Ponorogo</p>
        </div>
      </div>

      {/* ── Grid konten ── */}
      {cfgLoading ? (
        /* Skeleton loading */
        <ul className="landing-grid" aria-label="Memuat kategori…" aria-busy="true">
          {[0, 1, 2].map(i => (
            <li key={i}>
              <div className="landing-card landing-skeleton" aria-hidden="true">
                <span className="landing-ico" />
                <div className="landing-skeleton-lines">
                  <span /><span /><span />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : selectedCat ? (
        /* ── Sub-kategori view ── */
        <>
          <button type="button" className="landing-back-btn" onClick={handleBack}>
            <span className="landing-back-ico" aria-hidden="true">
              <img
                src={getCategoryLogoSrc(selectedCat)}
                alt=""
                width={22}
                height={22}
              />
            </span>
            <span>Kembali ke kategori</span>
          </button>

          {filteredSubs.length > 0 ? (
            <ul className="landing-grid">
              {filteredSubs.map(sub => {
                // Resolusi ikon subkategori dari field `image` di Firestore
                // "1"–"10" → /assets/kategori/{n}.webp
                // URL lengkap atau path → as-is
                const subImg = resolveKategoriImageOrNull(sub.image)
                  ?? resolveKategoriImage(sub.image);
                return (
                  <li key={sub.id}>
                    <Link
                      className="landing-card"
                      href={`/${encodeURIComponent(sub.slug)}`}
                      onClick={() => handlePickSub(sub.slug)}
                    >
                      <span className="landing-ico">
                        {subImg ? (
                          <img
                            src={subImg}
                            alt=""
                            width={128}
                            height={128}
                            loading="eager"
                            decoding="async"
                            onError={e => { e.currentTarget.style.opacity = '0'; }}
                          />
                        ) : (
                          <Icon name="file" style={{ width: 32, height: 32, opacity: 0.5 }} />
                        )}
                      </span>
                      <span className="landing-copy">
                        <strong>{sub.name}</strong>
                        {sub.description && (
                          <span className="landing-copy-desc">{sub.description}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="landing-empty">
              Belum ada subkategori aktif untuk {selectedCat.name}.
            </p>
          )}
        </>
      ) : (
        /* ── Kategori view ── */
        <>
          {cats.length > 0 ? (
            <ul className="landing-grid">
              {cats.map(cat => (
                <li key={cat.id}>
                  <button
                    type="button"
                    className="landing-card"
                    onClick={() => handlePickCat(cat)}
                  >
                    <span className="landing-ico">
                      <img
                        src={getCategoryLogoSrc(cat)}
                        alt=""
                        width={128}
                        height={128}
                        loading="eager"
                        decoding="async"
                      />
                    </span>
                    <span className="landing-copy">
                      <strong>{cat.name}</strong>
                      {cat.description && (
                        <span className="landing-copy-desc">{cat.description}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="landing-empty">
              Belum ada kategori laporan. Hubungi administrator untuk konfigurasi data.
            </p>
          )}
        </>
      )}
    </main>
  );
}
