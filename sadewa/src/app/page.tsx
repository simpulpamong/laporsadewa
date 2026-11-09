import type { Metadata } from 'next';
import CategoryLanding from '@/components/CategoryLanding';

export const metadata: Metadata = {
  title: 'SADEWA - Sistem Aksi dan Evaluasi Praja Wibawa',
};

export default function HomePage() {
  return <CategoryLanding />;
}
