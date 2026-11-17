import { Navigate, useSearchParams } from 'react-router-dom';

export default function LaporRedirect() {
  const [sp] = useSearchParams();
  const sub = sp.get('sub')?.trim();
  if (sub) return <Navigate to={`/${encodeURIComponent(sub)}`} replace />;
  return <Navigate to="/" replace />;
}
