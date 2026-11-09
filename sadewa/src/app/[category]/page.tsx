import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppProvider } from '@/features/core/AppContext';
import SadewaReportPage from '@/features/sadewa/SadewaReportPage';
import type { CategoryDef } from '@/lib/constants';
import { loadDynamicConfig } from '@/lib/server/dynamicConfig';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category: slug } = await params;
  try {
    const cfg = await loadDynamicConfig({ force: true });
    const sub = cfg.subcategories.find(s => s.slug === slug || s.id === slug);
    if (sub) return { title: `SADEWA — ${sub.name}`, description: sub.description || '' };
  } catch {}
  return { title: 'Kategori tidak ditemukan' };
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category: slug } = await params;
  try {
    const cfg = await loadDynamicConfig({ force: true });
    const sub = cfg.subcategories.find(s => s.slug === slug || s.id === slug);
    if (sub) {
      const cat = cfg.categories.find(c => c.id === sub.categoryId);
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
        image: (sub as any).image || (cat as any)?.image || '/assets/sadewa.svg',
        parentCategory: cat ? { id: cat.id, name: cat.name, slug: cat.slug, image: (cat as any)?.image } : undefined,
        watermarkLogo: isDamkar ? 'damkar' : 'satpol',
        watermarkBrand: isDamkar ? 'DAMKAR PONOROGO' : 'SATPOL PP PONOROGO',
      };
      return (
        <AppProvider scope={sub.slug} category={categoryDef}>
          <SadewaReportPage template={sub.format?.template || ''} format={sub.format || null} />
        </AppProvider>
      );
    }
  } catch {}
  notFound();
}
