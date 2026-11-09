import { redirect } from 'next/navigation';

/**
 * /lapor?sub=<slug> → /<slug>
 * Rute ini menangani URL yang disebarkan lewat CategoryLanding (href="/lapor?sub=...").
 * Langsung redirect ke rute dinamis [category] yang menangani subkategori.
 */
export default async function LaporPage({
  searchParams,
}: {
  searchParams: Promise<{ sub?: string }>;
}) {
  const { sub } = await searchParams;
  const slug = sub?.trim();
  if (slug) {
    redirect(`/${encodeURIComponent(slug)}`);
  }
  // Tidak ada sub param → kembali ke landing
  redirect('/');
}
