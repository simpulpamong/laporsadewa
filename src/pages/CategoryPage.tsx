import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppProvider } from '@/features/core/AppContext';
import SadewaReportPage from '@/features/sadewa/SadewaReportPage';
import type { CategoryDef } from '@/lib/constants';
import { fetchConfigSWR, type DynamicFormat, type DynamicSubcategory } from '@/lib/configCache';
import NotFoundPage from './NotFoundPage';

export default function CategoryPage() {
  const { category: slug } = useParams<{ category: string }>();
  const [state, setState] = useState<{
    status: 'loading' | 'ready' | 'notfound';
    cat?: CategoryDef;
    template?: string;
    format?: DynamicFormat | null;
  }>({ status: 'loading' });

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const cfg = await fetchConfigSWR({ force: true });
        if (off) return;
        const sub = cfg.subcategories.find((subcategory: DynamicSubcategory) => subcategory.slug === slug || subcategory.id === slug);
        if (!sub) { setState({ status: 'notfound' }); return; }
        const cat = cfg.categories.find(category => category.id === sub.categoryId);
        const isDamkar = Boolean(
          cat?.slug?.toLowerCase().includes('damkar') ||
          cat?.name?.toLowerCase().includes('damkar') ||
          sub.slug?.toLowerCase().includes('damkar') ||
          sub.slug?.toLowerCase().includes('kebakaran') ||
          sub.name?.toLowerCase().includes('kebakaran') ||
          sub.name?.toLowerCase().includes('damkar') ||
          sub.name?.toLowerCase().includes('pemadam')
        );
        const categoryDef: CategoryDef = {
          slug: sub.slug,
          name: sub.name,
          description: sub.description || cat?.description || '',
          href: `/${sub.slug}`,
          flow: 'sadewa',
          photoHint: 'Foto lokasi dan dokumentasi',
          image: sub.image || cat?.image || '/assets/sadewa.svg',
          parentCategory: cat ? { id: cat.id, name: cat.name, slug: cat.slug, image: cat.image } : undefined,
          watermarkLogo: isDamkar ? 'damkar' : 'satpol',
          watermarkBrand: isDamkar ? 'DAMKAR PONOROGO' : 'SATPOL PP PONOROGO',
        };
        document.title = `SADEWA — ${sub.name}`;
        setState({ status: 'ready', cat: categoryDef, template: sub.format?.template || '', format: sub.format || null });
      } catch {
        if (!off) setState({ status: 'notfound' });
      }
    })();
    return () => { off = true; };
  }, [slug]);

  if (state.status === 'loading') {
    return (
      <main className="shell report-loading-screen" aria-busy="true">
        <div className="report-loading-spinner" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <span>Menyiapkan formulir laporan…</span>
        </div>
      </main>
    );
  }
  if (state.status === 'notfound' || !state.cat) return <NotFoundPage />;
  return (
    <AppProvider scope={state.cat.slug} category={state.cat}>
      <SadewaReportPage template={state.template || ''} format={state.format} />
    </AppProvider>
  );
}
