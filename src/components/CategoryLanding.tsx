import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BatikBackdrop from './layout/BatikBackdrop';
import Icon from './ui/Icon';
import { APP_NAME, APP_TAGLINE } from '@/lib/constants';
import { resolveKategoriImage, resolveKategoriImageOrNull } from '@/lib/kategoriImage';
import { getCategoryLogoSrc } from '@/lib/categoryLogo';
import { useTheme } from '@/lib/theme';
import { fetchConfigSWR, type DynamicCategory, type DynamicConfig, type DynamicSubcategory } from '@/lib/configCache';
import { getLastCatId, getLastSubSlug, setLastCatId, setLastSubSlug } from '@/lib/navMemory';

type DynSub = DynamicSubcategory;
type DynCat = DynamicCategory;

function compareOrder(a: DynCat | DynSub, b: DynCat | DynSub) {
  const orderA = Number.isFinite(a.order) ? a.order! : Number.POSITIVE_INFINITY;
  const orderB = Number.isFinite(b.order) ? b.order! : Number.POSITIVE_INFINITY;
  return orderA - orderB || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

export default function CategoryLanding() {
  const navigate = useNavigate();
  const { theme, toggleTheme, mounted: themeMounted } = useTheme();

  const [restoring, setRestoring] = useState(true);
  const [cats, setCats] = useState<DynCat[]>([]);
  const [subs, setSubs] = useState<DynSub[]>([]);
  const [selectedCat, setSelectedCat] = useState<DynCat | null>(null);
  const [cfgLoading, setCfgLoading] = useState(true);
  const [cfgError, setCfgError] = useState('');
  const [configRetry, setConfigRetry] = useState(0);
  const catsRef = useRef(cats); catsRef.current = cats;
  const subsRef = useRef(subs); subsRef.current = subs;

  useEffect(() => {
    let active = true;
    const fallback = setTimeout(() => { if (active) setRestoring(false); }, 1500);
    (async () => {
      try {
        const lastSlug = await getLastSubSlug();
        if (!active) return;
        if (lastSlug) {
          clearTimeout(fallback);
          navigate(`/${encodeURIComponent(lastSlug)}`, { replace: true });
          return;
        }
      } catch { /* IndexedDB tidak tersedia */ }
      if (active) { clearTimeout(fallback); setRestoring(false); }
    })();
    return () => { active = false; clearTimeout(fallback); };
  }, [navigate]);

  useEffect(() => {
    if (restoring) return;
    let off = false;

    const apply = (cfg: DynamicConfig) => {
      if (off) return;
      setCfgError('');
      const next = {
        categories: cfg.categories
          .filter(c => c.active !== false)
          .sort(compareOrder),
        subcategories: cfg.subcategories
          .filter(s => s.active !== false)
          .sort(compareOrder),
      };
      const sig =
        JSON.stringify(next.categories.map(c => [c.id, c.name, c.image, c.slug, c.description, c.order])) +
        '|' +
        JSON.stringify(next.subcategories.map(s => [s.id, s.name, s.image, s.slug, s.categoryId, s.active, s.description, s.order]));
      const cur =
        JSON.stringify(catsRef.current.map(c => [c.id, c.name, c.image, c.slug, c.description, c.order])) +
        '|' +
        JSON.stringify(subsRef.current.map(s => [s.id, s.name, s.image, s.slug, s.categoryId, s.active, s.description, s.order]));
      if (sig === cur) { setCfgLoading(false); return; }
      setCats(next.categories);
      setSubs(next.subcategories);
      setCfgLoading(false);
      getLastCatId().then(lastId => {
        if (!lastId || off) return;
        const found = next.categories.find(c => c.id === lastId);
        if (found) setSelectedCat(found);
      }).catch(() => {});
    };

    const refresh = (force = false) => {
      fetchConfigSWR({ force }).then(apply).catch((error: unknown) => {
        if (off) return;
        setCfgLoading(false);
        setCfgError(error instanceof Error ? error.message : 'Terjadi kesalahan saat memuat kategori laporan.');
      });
    };

    refresh(configRetry > 0);
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh(true);
    };
    const onFocus = () => refresh(true);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      off = true;
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [restoring, configRetry]);

  const handlePickCat = (cat: DynCat) => { setSelectedCat(cat); void setLastCatId(cat.id); };
  const handleBack = () => { setSelectedCat(null); void setLastCatId(''); };
  const handlePickSub = (slug: string) => { void setLastSubSlug(slug); };

  if (restoring) {
    return (
      <div className="landing-splash">
        <div className="landing-splash-glow" aria-hidden="true" />
        <img src="/assets/sadewa.svg" alt={APP_NAME} width={88} height={88} className="landing-splash-logo" />
        <h1 className="landing-splash-brand">{APP_NAME}</h1>
        <p className="landing-splash-sub">{APP_TAGLINE}</p>
        <span className="landing-splash-spinner" aria-label="Memuat…" />
      </div>
    );
  }

  const filteredSubs = selectedCat ? subs.filter(s => s.categoryId === selectedCat.id) : [];

  return (
    <main className="landing">
      <BatikBackdrop />
      <div className="landing-header">
        <div className="landing-header-actions">
          <button type="button" className="icon-btn theme-toggle-btn" onClick={toggleTheme} aria-label="Ganti tema terang/gelap">
            <Icon name={themeMounted ? (theme === 'light' ? 'sun' : 'moon') : 'moon'} />
          </button>
        </div>
      </div>
      <div className="landing-hero">
        <div className="landing-brand">
          <h1 className="landing-brand-lockup">
            <img src="/assets/sadewa-full.svg" alt={`${APP_NAME} — ${APP_TAGLINE}`} width={1940} height={440} draggable={false} className="landing-brand-lockup-img" />
          </h1>
          <p className="landing-brand-tagline">{APP_TAGLINE.toUpperCase()}</p>
        </div>
        <div className="landing-program">
          <h2 className="landing-heading">SATUAN POLISI PAMONG PRAJA</h2>
          <p className="landing-region">Kabupaten Ponorogo</p>
        </div>
      </div>

      {cfgLoading ? (
        <ul className="landing-grid" aria-label="Memuat kategori…" aria-busy="true">
          {[0, 1, 2].map(i => (
            <li key={i}>
              <div className="landing-card landing-skeleton" aria-hidden="true">
                <span className="landing-ico" />
                <div className="landing-skeleton-lines"><span /><span /><span /></div>
              </div>
            </li>
          ))}
        </ul>
      ) : selectedCat ? (
        <>
          <button type="button" className="landing-back-btn" onClick={handleBack}>
            <span className="landing-back-ico" aria-hidden="true">
              <img src={getCategoryLogoSrc(selectedCat)} alt="" width={22} height={22} />
            </span>
            <span>Kembali ke kategori</span>
          </button>
          {filteredSubs.length > 0 ? (
            <ul className="landing-grid">
              {filteredSubs.map(sub => {
                const subImg = resolveKategoriImageOrNull(sub.image) ?? resolveKategoriImage(sub.image);
                return (
                  <li key={sub.id}>
                    <Link className="landing-card" to={`/${encodeURIComponent(sub.slug)}`} onClick={() => handlePickSub(sub.slug)}>
                      <span className="landing-ico">
                        {subImg ? (
                          <img src={subImg} alt="" width={128} height={128} loading="eager" decoding="async"
                            className={subImg === '/assets/sadewa.svg' ? 'landing-ico-img is-default-logo' : 'landing-ico-img'}
                            onError={e => { e.currentTarget.style.opacity = '0'; }} />
                        ) : (
                          <Icon name="file" style={{ width: 32, height: 32, opacity: 0.5 }} />
                        )}
                      </span>
                      <span className="landing-copy">
                        <strong>{sub.name}</strong>
                        {sub.description && <span className="landing-copy-desc">{sub.description}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="landing-empty">Belum ada subkategori aktif untuk {selectedCat.name}.</p>
          )}
        </>
      ) : (
        <>
          {cats.length > 0 ? (
            <ul className="landing-grid">
              {cats.map(cat => (
                <li key={cat.id}>
                  <button type="button" className="landing-card" onClick={() => handlePickCat(cat)}>
                    <span className="landing-ico">
                      <img src={getCategoryLogoSrc(cat)} alt="" width={128} height={128} loading="eager" decoding="async" />
                    </span>
                    <span className="landing-copy">
                      <strong>{cat.name}</strong>
                      {cat.description && <span className="landing-copy-desc">{cat.description}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            cfgError ? (
              <div className="landing-empty" role="alert">
                <p>Gagal memuat kategori laporan: {cfgError}</p>
                <button type="button" className="landing-back-btn" onClick={() => {
                  setCfgLoading(true);
                  setCfgError('');
                  setConfigRetry(retry => retry + 1);
                }}>
                  Coba lagi
                </button>
              </div>
            ) : (
              <p className="landing-empty">Belum ada kategori aktif di konfigurasi laporan.</p>
            )
          )}
        </>
      )}
    </main>
  );
}
