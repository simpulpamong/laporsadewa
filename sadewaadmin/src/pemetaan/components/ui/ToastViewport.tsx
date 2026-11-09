'use client';

import { Alert } from './Alert';
import { useApp } from '@/pemetaan/lib/store';

export function ToastViewport() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-4 right-4 z-[1200] flex flex-col items-end gap-2 sm:left-auto sm:w-96"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="animate-fade-rise w-full max-w-sm">
          <Alert
            type={toast.type}
            title={toast.title}
            description={toast.description}
            onClose={() => dismissToast(toast.id)}
          />
        </div>
      ))}
    </div>
  );
}
