import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';

export type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

interface ToastContextValue {
  push: (title: string, options?: { kind?: ToastKind; detail?: string }) => void;
}

const ToastContext = createContext<ToastContextValue>({ push: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((title: string, options?: { kind?: ToastKind; detail?: string }) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, kind: options?.kind ?? 'success', title, detail: options?.detail }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast ${item.kind}`}>
            <Icon
              name={item.kind === 'error' ? 'alert' : item.kind === 'info' ? 'info' : 'check-circle'}
              size={17}
              style={{ color: item.kind === 'error' ? 'var(--rose)' : item.kind === 'info' ? 'var(--sky)' : 'var(--teal)' }}
            />
            <div>
              <strong>{item.title}</strong>
              {item.detail ? <span className="small muted">{item.detail}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
