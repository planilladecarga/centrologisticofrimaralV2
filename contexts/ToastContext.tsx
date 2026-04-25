'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

interface Toast {
  id: string;
  text: string;
  type: 'success' | 'error' | 'warning' | 'info';
  persistent?: boolean;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (text: string, type?: 'success' | 'error' | 'warning' | 'info', persistent?: boolean) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'warning' | 'info' = 'success', persistent?: boolean) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, text, type, persistent: persistent || type === 'error' }]);
    if (!persistent && type !== 'error') {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 4000);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const typeStyles: Record<string, string> = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-red-600 text-white',
    warning: 'bg-amber-500 text-white',
    info: 'bg-blue-600 text-white',
  };

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl text-xs font-mono uppercase tracking-wider animate-toast-in ${typeStyles[toast.type]}`}
          >
            <span className="w-2 h-2 rounded-full bg-white/80 animate-pulse-soft flex-shrink-0" />
            <span className="flex-1">{toast.text}</span>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-white/70 hover:text-white font-mono text-base leading-none flex-shrink-0"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
