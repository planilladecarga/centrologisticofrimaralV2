'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface Toast {
  id: string;
  text: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (text: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
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

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, text, type }]);
    // Auto-dismiss: 3s for success/info/warning, 6s for errors
    const delay = type === 'error' ? 6000 : 3000;
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, delay);
  }, []);

  // Dismiss last toast with Enter key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && toasts.length > 0) {
        dismissToast(toasts[toasts.length - 1].id);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toasts, dismissToast]);

  const typeStyles: Record<string, string> = {
    success: 'bg-emerald-600/95 text-white',
    error: 'bg-red-600/95 text-white',
    warning: 'bg-amber-500/95 text-white',
    info: 'bg-blue-600/95 text-white',
  };

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      {/* Toast Container - bottom right, out of the way */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg shadow-2xl text-[11px] font-mono uppercase tracking-wider animate-toast-in backdrop-blur-sm ${typeStyles[toast.type]}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse-soft flex-shrink-0" />
            <span className="flex-1">{toast.text}</span>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-white/70 hover:text-white font-mono text-sm leading-none flex-shrink-0 ml-2"
            >
              &times;
            </button>
          </div>
        ))}
        {toasts.length > 0 && (
          <p className="text-[8px] font-mono text-neutral-400 text-right uppercase tracking-widest select-none">
            Enter para cerrar
          </p>
        )}
      </div>
    </ToastContext.Provider>
  );
}
