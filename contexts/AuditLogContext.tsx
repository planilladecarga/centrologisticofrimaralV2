'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AuditEntry {
  id: string;
  timestamp: string;
  modulo: 'pedidos' | 'inventario' | 'ingresos' | 'despachos' | 'configuracion' | 'sistema';
  module?: string;
  accion: string;
  descripcion: string;
  operador: string;
}

interface AuditLogContextType {
  entries: AuditEntry[];
  logAction: (accion: string, descripcion: string, modulo: string) => void;
  clearLog: () => void;
}

const AUDIT_KEY = 'frimaral_audit_log_v1';

const AuditLogContext = createContext<AuditLogContextType | null>(null);

export function useAuditLog() {
  const ctx = useContext(AuditLogContext);
  if (!ctx) throw new Error('useAuditLog must be used within AuditLogProvider');
  return ctx;
}

export function AuditLogProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUDIT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setEntries(parsed);
      }
    } catch {}
  }, []);

  const persist = (data: AuditEntry[]) => {
    try {
      localStorage.setItem(AUDIT_KEY, JSON.stringify(data.slice(0, 500)));
    } catch {}
  };

  const logAction = useCallback((accion: string, descripcion: string, modulo: string) => {
    const operador = typeof window !== 'undefined' ? (localStorage.getItem('frimaral_operator_name') || 'SYSTEM') : 'SYSTEM';
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      modulo: modulo as AuditEntry['modulo'],
      module: modulo,
      accion,
      descripcion,
      operador,
    };
    setEntries(prev => {
      const updated = [entry, ...prev].slice(0, 500);
      persist(updated);
      return updated;
    });
  }, []);

  const clearLog = useCallback(() => {
    setEntries([]);
    localStorage.removeItem(AUDIT_KEY);
  }, []);

  return (
    <AuditLogContext.Provider value={{ entries, logAction, clearLog }}>
      {children}
    </AuditLogContext.Provider>
  );
}
