import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DialogProvider } from './components/ui';
import Login from './pages/Login';
import Layout from './components/Layout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Rekap = lazy(() => import('./pages/Rekap'));
const InputLaporan = lazy(() => import('./pages/InputLaporan'));
const Kategori = lazy(() => import('./pages/Kategori'));
const FormatParser = lazy(() => import('./pages/FormatParser'));
const Storage = lazy(() => import('./pages/Storage'));
const Peta = lazy(() => import('./pages/Peta'));
const Sampah = lazy(() => import('./pages/Sampah'));
const DrivePage = lazy(() => import('./pages/Drive'));
const Pengaturan = lazy(() => import('./pages/Pengaturan'));

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[app] gagal merender halaman:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-screen grid place-items-center bg-[#0B1120] px-5 text-slate-100">
          <section role="alert" className="w-full max-w-lg rounded-2xl border border-rose-500/30 bg-slate-900 p-6 shadow-xl">
            <h1 className="text-lg font-bold">Halaman gagal dimuat</h1>
            <p className="mt-2 text-sm text-slate-300">{this.state.error.message || 'Terjadi kesalahan saat aplikasi dijalankan.'}</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
              Muat ulang aplikasi
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

function Guard({ children, superOnly = false }: { children: React.ReactNode; superOnly?: boolean }) {
  const { user, loading, isSuper } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center bg-[#0B1120] text-slate-400">Memuat…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (superOnly && !isSuper) return <Navigate to="/beranda" replace />;
  return <>{children}</>;
}

function RoutesInner() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center bg-[#0B1120] text-slate-400">Memuat…</div>;
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/beranda" replace /> : <Login />} />
      <Route element={<Guard><Layout /></Guard>}>
        <Route index element={<Navigate to="/beranda" replace />} />
        <Route path="beranda" element={<Dashboard />} />
        <Route path="input" element={<InputLaporan />} />
        <Route path="rekap" element={<Rekap />} />
        <Route path="peta" element={<Peta initialTab="peta" />} />
        <Route path="pemetaan" element={<Peta initialTab="pemetaan" />} />
        <Route path="kategori" element={<Kategori />} />
        <Route path="format" element={<Guard superOnly><FormatParser /></Guard>} />
        <Route path="storage" element={<Guard superOnly><Storage /></Guard>} />
        <Route path="drive" element={<DrivePage />} />
        <Route path="sampah" element={<Sampah />} />
        <Route path="pengaturan" element={<Pengaturan />} />
        <Route path="pengguna" element={<Navigate to="/pengaturan" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/beranda" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <DialogProvider>
          <Suspense fallback={<div className="min-h-screen grid place-items-center bg-[#0B1120] text-slate-400">Memuat halaman…</div>}>
            <RoutesInner />
          </Suspense>
        </DialogProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
