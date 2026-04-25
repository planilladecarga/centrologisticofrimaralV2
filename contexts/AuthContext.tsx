'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type Role = 'ADMIN' | 'OPERADOR' | 'LECTURA';

interface AuthContextType {
  role: Role;
  setRole: (role: Role) => void;
  operatorName: string;
  setOperatorName: (name: string) => void;
  canCreate: boolean;
  canDelete: boolean;
  canConfig: boolean;
  canReset: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>('ADMIN');
  const [operatorName, setOperatorNameState] = useState('');

  useEffect(() => {
    try {
      const savedRole = localStorage.getItem('frimaral_role') as Role;
      if (savedRole && ['ADMIN', 'OPERADOR', 'LECTURA'].includes(savedRole)) setRoleState(savedRole);
      const savedName = localStorage.getItem('frimaral_operator_name');
      if (savedName) setOperatorNameState(savedName);
    } catch {}
  }, []);

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    localStorage.setItem('frimaral_role', r);
  }, []);

  const setOperatorName = useCallback((name: string) => {
    setOperatorNameState(name);
    localStorage.setItem('frimaral_operator_name', name);
  }, []);

  const canCreate = role !== 'LECTURA';
  const canDelete = role === 'ADMIN';
  const canConfig = role === 'ADMIN';
  const canReset = role === 'ADMIN';

  return (
    <AuthContext.Provider value={{ role, setRole, operatorName, setOperatorName, canCreate, canDelete, canConfig, canReset }}>
      {children}
    </AuthContext.Provider>
  );
}
