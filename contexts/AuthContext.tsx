'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type Role = 'ADMIN' | 'OPERADOR' | 'LECTURA';

export interface User {
  id: string;
  username: string;
  password: string;
  displayName: string;
  role: Role;
  createdAt: string;
}

interface AuthContextType {
  // Session
  currentUser: User | null;
  isLoggedIn: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  // Current user shortcuts
  role: Role;
  operatorName: string;
  setOperatorName: (name: string) => void;
  // Permissions
  canCreate: boolean;
  canDelete: boolean;
  canConfig: boolean;
  canReset: boolean;
  // User management (admin only)
  users: User[];
  createUser: (username: string, password: string, displayName: string, role: Role) => { ok: boolean; error?: string };
  deleteUser: (userId: string) => { ok: boolean; error?: string };
  updateUserRole: (userId: string, newRole: Role) => { ok: boolean; error?: string };
  updatePassword: (userId: string, newPassword: string) => { ok: boolean; error?: string };
}

const AuthContext = createContext<AuthContextType | null>(null);

const USERS_KEY = 'frimaral_users';
const SESSION_KEY = 'frimaral_session';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadUsers(): User[] {
  try {
    const data = localStorage.getItem(USERS_KEY);
    if (data) return JSON.parse(data);
  } catch {}
  return [];
}

function saveUsers(users: User[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function loadSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function saveSession(userId: string | null) {
  if (userId) {
    localStorage.setItem(SESSION_KEY, userId);
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>(() => {
    if (typeof window === 'undefined') return [];
    // Initialize default admin on first load
    const existing = loadUsers();
    if (existing.length > 0) return existing;
    const defaultAdmin: User = {
      id: 'admin_default',
      username: 'admin',
      password: 'admin123',
      displayName: 'Administrador',
      role: 'ADMIN',
      createdAt: new Date().toISOString(),
    };
    saveUsers([defaultAdmin]);
    return [defaultAdmin];
  });

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [operatorName, setOperatorNameState] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Restore session on mount
  useEffect(() => {
    const sessionId = loadSession();
    if (sessionId) {
      const allUsers = loadUsers();
      const found = allUsers.find(u => u.id === sessionId);
      if (found) {
        setCurrentUser(found);
        setOperatorNameState(found.displayName);
      }
    }
    setInitialized(true);
  }, []);

  const role = currentUser?.role ?? 'LECTURA';
  const canCreate = role !== 'LECTURA';
  const canDelete = role === 'ADMIN';
  const canConfig = role === 'ADMIN';
  const canReset = role === 'ADMIN';

  const login = useCallback((username: string, password: string): boolean => {
    const allUsers = loadUsers();
    const user = allUsers.find(
      u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );
    if (user) {
      setCurrentUser(user);
      setOperatorNameState(user.displayName);
      saveSession(user.id);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    setOperatorNameState('');
    saveSession(null);
  }, []);

  const setOperatorName = useCallback((name: string) => {
    setOperatorNameState(name);
    if (currentUser) {
      const allUsers = loadUsers();
      const updated = allUsers.map(u =>
        u.id === currentUser.id ? { ...u, displayName: name } : u
      );
      saveUsers(updated);
      setUsers(updated);
      setCurrentUser(prev => prev ? { ...prev, displayName: name } : null);
    }
  }, [currentUser]);

  const createUser = useCallback((username: string, password: string, displayName: string, newRole: Role): { ok: boolean; error?: string } => {
    if (!username.trim() || !password.trim() || !displayName.trim()) {
      return { ok: false, error: 'Todos los campos son obligatorios' };
    }
    if (password.length < 4) {
      return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres' };
    }
    if (username.length < 3) {
      return { ok: false, error: 'El usuario debe tener al menos 3 caracteres' };
    }

    const allUsers = loadUsers();
    if (allUsers.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      return { ok: false, error: 'Ya existe un usuario con ese nombre' };
    }

    const newUser: User = {
      id: generateId(),
      username: username.trim().toLowerCase(),
      password,
      displayName: displayName.trim(),
      role: newRole,
      createdAt: new Date().toISOString(),
    };
    allUsers.push(newUser);
    saveUsers(allUsers);
    setUsers([...allUsers]);
    return { ok: true };
  }, []);

  const deleteUser = useCallback((userId: string): { ok: boolean; error?: string } => {
    if (userId === currentUser?.id) {
      return { ok: false, error: 'No puedes eliminar tu propio usuario' };
    }
    if (userId === 'admin_default') {
      return { ok: false, error: 'No se puede eliminar el administrador principal' };
    }

    const allUsers = loadUsers();
    const filtered = allUsers.filter(u => u.id !== userId);
    if (filtered.length === allUsers.length) {
      return { ok: false, error: 'Usuario no encontrado' };
    }
    saveUsers(filtered);
    setUsers([...filtered]);
    return { ok: true };
  }, [currentUser]);

  const updateUserRole = useCallback((userId: string, newRole: Role): { ok: boolean; error?: string } => {
    const allUsers = loadUsers();
    const idx = allUsers.findIndex(u => u.id === userId);
    if (idx === -1) return { ok: false, error: 'Usuario no encontrado' };

    allUsers[idx].role = newRole;
    saveUsers(allUsers);
    setUsers([...allUsers]);

    // If updating current user, update session
    if (userId === currentUser?.id) {
      setCurrentUser({ ...currentUser, role: newRole });
    }
    return { ok: true };
  }, [currentUser]);

  const updatePassword = useCallback((userId: string, newPassword: string): { ok: boolean; error?: string } => {
    if (!newPassword || newPassword.length < 4) {
      return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres' };
    }
    const allUsers = loadUsers();
    const idx = allUsers.findIndex(u => u.id === userId);
    if (idx === -1) return { ok: false, error: 'Usuario no encontrado' };

    allUsers[idx].password = newPassword;
    saveUsers(allUsers);
    setUsers([...allUsers]);
    return { ok: true };
  }, []);

  // Don't render children until session is restored
  if (!initialized) {
    return null;
  }

  return (
    <AuthContext.Provider value={{
      currentUser, isLoggedIn: !!currentUser, login, logout,
      role, operatorName, setOperatorName,
      canCreate, canDelete, canConfig, canReset,
      users, createUser, deleteUser, updateUserRole, updatePassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
