'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { MeResponse } from '@/types/api';

/* ---------------- Auth context ---------------- */

export interface SessionValue {
  user: MeResponse['user'];
  organization?: MeResponse['organization'];
}

const AuthContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useSession must be used within SessionProvider');
  return value;
}

export function SessionProvider({
  value,
  children,
}: {
  value: SessionValue;
  children: React.ReactNode;
}) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ---------------- Toast system ---------------- */

export interface ToastItem {
  id: number;
  message: string;
  variant: 'success' | 'error' | 'info';
}

interface ToastValue {
  toasts: ToastItem[];
  push: (message: string, variant?: ToastItem['variant']) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used within Providers');
  return value;
}

let toastCounter = 0;

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastItem['variant'] = 'info') => {
      const id = ++toastCounter;
      setToasts((current) => [...current.slice(-3), { id, message, variant }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-5 left-1/2 z-[100] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2"
      >
        {value.toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`animate-fade-in-up flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
              toast.variant === 'success'
                ? 'bg-emerald-700'
                : toast.variant === 'error'
                  ? 'bg-red-700'
                  : 'bg-navy-900'
            }`}
          >
            <span className="flex-1 leading-6">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="إغلاق التنبيه"
              className="rounded p-0.5 text-white/70 hover:text-white"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------------- Root providers ---------------- */

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 20_000 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

export { AuthContext };
