import { useEffect } from 'react';
import CategoryLanding from '@/components/CategoryLanding';
import { APP_NAME, APP_TAGLINE } from '@/lib/constants';

export default function HomePage() {
  useEffect(() => {
    document.title = `${APP_NAME} - ${APP_TAGLINE}`;
  }, []);
  return <CategoryLanding />;
}
