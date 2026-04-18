'use client';

import React from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open, title, message,
  confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
  variant = 'danger', loading = false,
  onConfirm, onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  const variantStyles = {
    danger: { header: 'bg-red-50 border-red-200', title: 'text-red-900', btn: 'bg-red-600 hover:bg-red-700', border: 'border-red-200' },
    warning: { header: 'bg-amber-50 border-amber-200', title: 'text-amber-900', btn: 'bg-amber-600 hover:bg-amber-700', border: 'border-amber-200' },
    info: { header: 'bg-neutral-50 border-neutral-200', title: 'text-neutral-900', btn: 'bg-neutral-900 hover:bg-neutral-800', border: 'border-neutral-200' },
  };
  const vs = variantStyles[variant];

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900/50 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="bg-white w-full max-w-md border border-neutral-200 shadow-2xl">
        <div className={`flex items-center justify-between p-6 border-b ${vs.header}`}>
          <h3 className={`text-sm font-mono uppercase tracking-widest ${vs.title}`}>{title}</h3>
          <button onClick={onCancel} className={`${vs.title} hover:opacity-70 font-mono text-xl leading-none`} disabled={loading}>&times;</button>
        </div>
        <div className="p-8">
          <p className="text-sm font-sans text-neutral-700 leading-relaxed">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-4 p-6 border-t border-neutral-200 bg-neutral-50">
          <button onClick={onCancel} className="px-5 py-2.5 text-xs font-mono uppercase tracking-widest text-neutral-500 hover:text-neutral-900 transition-colors" disabled={loading}>
            {cancelLabel}
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={`px-5 py-2.5 text-white text-xs font-mono uppercase tracking-widest transition-colors ${loading ? 'bg-neutral-400 cursor-not-allowed' : vs.btn}`}>
            {loading ? '[...] Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
