import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ThemeFrameSync from './components/layout/ThemeFrameSync';
import PwaInstall from './components/pwa/PwaInstall';

const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const LaporRedirect = lazy(() => import('./pages/LaporRedirect'));

function RouteFallback() {
  return (
    <main className="shell report-loading-screen" aria-busy="true">
      <div className="report-loading-spinner" role="status">
        <span className="loading-spinner" aria-hidden="true" />
        <span>Memuat…</span>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <>
      <ThemeFrameSync />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/lapor" element={<LaporRedirect />} />
          <Route path="/laporan" element={<Navigate to="/" replace />} />
          <Route path="/:category" element={<CategoryPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <PwaInstall />
    </>
  );
}
