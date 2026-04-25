'use client';

import React, { useState, useEffect, useCallback } from 'react';

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
  requireConfirmText?: boolean;
}

export default function ConfirmModal({
  open, title, message,
  confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
  variant = 'danger', loading = false,
  onConfirm, onCancel,
  requireConfirmText = false,
}: ConfirmModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (!open) setConfirmText('');
  }, [open]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !loading) {
      onCancel();
    }
  }, [loading, onCancel]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  const isConfirmEnabled = requireConfirmText
    ? confirmText === 'CONFIRMAR'
    : true;

  const handleConfirm = () => {
    if (requireConfirmText && confirmText !== 'CONFIRMAR') {
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      return;
    }
    onConfirm();
  };

  if (!open) return null;

  const variantStyles = {
    danger: { header: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800', title: 'text-red-900 dark:text-red-300', btn: 'bg-red-600 hover:bg-red-700', border: 'border-red-200 dark:border-red-800' },
    warning: { header: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800', title: 'text-amber-900 dark:text-amber-300', btn: 'bg-amber-600 hover:bg-amber-700', border: 'border-amber-200 dark:border-amber-800' },
    info: { header: 'bg-neutral-50 border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700', title: 'text-neutral-900 dark:text-neutral-100', btn: 'bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200', border: 'border-neutral-200 dark:border-neutral-700' },
  };
  const vs = variantStyles[variant];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}
    >
      <div className="bg-white dark:bg-neutral-800 w-full max-w-md border border-neutral-200 dark:border-neutral-700 shadow-2xl animate-modal-in">
        <div className={`flex items-center justify-between p-6 border-b ${vs.header}`}>
          <h3 className={`text-sm font-mono uppercase tracking-widest ${vs.title}`}>{title}</h3>
          <button onClick={onCancel} className={`${vs.title} hover:opacity-70 font-mono text-xl leading-none`} disabled={loading}>&times;</button>
        </div>
        <div className="p-6">
          <p className="text-sm font-sans text-neutral-700 dark:text-neutral-300 leading-relaxed">{message}</p>
          {requireConfirmText && (
            <div className="mt-4">
              <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500 dark:text-neutral-400 mb-2">
                Escribí <span className="font-bold text-red-600 dark:text-red-400">CONFIRMAR</span> para continuar
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="CONFIRMAR"
                className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-600 focus:border-red-500 dark:focus:border-red-500 outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-600"
                autoFocus
              />
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-4 p-6 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50">
          <button onClick={onCancel} className="px-5 py-2.5 text-xs font-mono uppercase tracking-widest text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors" disabled={loading}>
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !isConfirmEnabled}
            className={`px-5 py-2.5 text-white text-xs font-mono uppercase tracking-widest transition-colors ${
              loading || !isConfirmEnabled ? 'bg-neutral-400 dark:bg-neutral-600 cursor-not-allowed' : vs.btn
            } ${shaking ? 'animate-shake' : ''}`}
          >
            {loading ? '[...] Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
