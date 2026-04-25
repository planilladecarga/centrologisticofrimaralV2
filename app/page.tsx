'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth, type Role } from '../contexts/AuthContext';
import { useAuditLog, type AuditEntry } from '../contexts/AuditLogContext';
import { exportInventoryExcel, exportDashboardSummary, exportAuditLogExcel } from '../lib/exportUtils';
import { printContent } from '../lib/printUtils';
import LoadingScreen from '../components/LoadingScreen';
import ConfirmModal from '../components/ConfirmModal';

const PdfProcessor = dynamic(() => import('../components/PdfProcessor'), { ssr: false });
const TemperatureMonitor = dynamic(() => import('../components/TemperatureMonitor'), { ssr: false });
const DespachosReal = dynamic(() => import('../components/DespachosReal'), { ssr: false });
const Pedidos = dynamic(() => import('../components/Pedidos'), { ssr: false });
const IngresoMercaderia = dynamic(() => import('../components/IngresoMercaderia'), { ssr: false });

interface ActivityRecord {
  id?: string;
  guiaId: string;
  tipoOperacion: string;
  placaVehiculo: string;
  observaciones: string;
  estado: string;
  createdAt: string;
}

const ORDERS_CACHE_KEY = 'frimaral_orders_v2';

export default function DashboardInner() {
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const { currentUser, isLoggedIn, login, logout, role, setOperatorName, canCreate, canDelete, canReset, canConfig, users, createUser, deleteUser, updateUserRole, updatePassword } = useAuth();
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [newUser, setNewUser] = useState({ username: '', password: '', displayName: '', role: 'OPERADOR' as Role });
  const [userMgmtError, setUserMgmtError] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingPassword, setEditingPassword] = useState('');
  const { entries: auditEntries, logAction, clearLog } = useAuditLog();
  const INVENTORY_CACHE_KEY = 'frimaral_inventory_cache_v1';
  const ACTIVITY_CACHE_KEY = 'frimaral_activity_cache_v1';
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(new Set());
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [isResetting, setIsResetting] = useState(false);
  const [currentDate, setCurrentDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activityRecords, setActivityRecords] = useState<ActivityRecord[]>([]);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHighlightIdx, setSearchHighlightIdx] = useState(0);
  const [operatorName, setOperatorNameLocal] = useState('');
  const [auditModuleFilter, setAuditModuleFilter] = useState('todos');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  // New record form state
  const [newRecord, setNewRecord] = useState({
    tipoOperacion: 'INGRESO (RECEPCIÓN)',
    placaVehiculo: '',
    guiaId: '',
    observaciones: ''
  });

  // Sync operator name from auth
  useEffect(() => {
    if (currentUser) setOperatorNameLocal(currentUser.displayName);
  }, [currentUser]);

  // Mark loading done after first data load
  useEffect(() => {
    setCurrentDate(new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }));
    const t = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(t);
  }, []);

  // Clean dots from numeroCliente
  const cleanNum = (num: string) => String(num || '').replace(/\./g, '');

  // Load cached inventory
  useEffect(() => {
    try {
      const cachedRaw = localStorage.getItem(INVENTORY_CACHE_KEY);
      if (!cachedRaw) return;
      const parsed = JSON.parse(cachedRaw);
      if (Array.isArray(parsed)) {
        setInventoryData(parsed);
      }
    } catch (error) {
      console.warn('No se pudo leer caché local de inventario:', error);
    }
  }, []);

  // Load cached activity records
  useEffect(() => {
    try {
      const cachedRaw = localStorage.getItem(ACTIVITY_CACHE_KEY);
      if (!cachedRaw) return;
      const parsed = JSON.parse(cachedRaw);
      if (Array.isArray(parsed)) {
        setActivityRecords(parsed);
      }
    } catch (error) {
      console.warn('No se pudo leer caché local de actividad:', error);
    }
  }, []);

  // KPIs computed from real inventory data
  const kpis = useMemo(() => {
    const totalKilos = inventoryData.reduce((sum, item) => sum + (Number(item.kilos) || 0), 0);
    const totalPallets = inventoryData.reduce((sum, item) => sum + (Number(item.pallets) || 0), 0);
    const uniqueContainers = [...new Set(inventoryData.map(i => (i.contenedor || '').trim()).filter(Boolean))];
    const uniqueClients = [...new Set(inventoryData.map(i => (i.cliente || '').trim()).filter(Boolean))];
    const totalCajas = inventoryData.reduce((sum, item) => sum + (Number(item.cantidad) || 0), 0);

    return {
      containers: uniqueContainers.length,
      clients: uniqueClients.length,
      pallets: totalPallets,
      kilos: totalKilos,
      toneladas: (totalKilos / 1000).toFixed(1),
      cajas: totalCajas,
      containerCapacity: 500,
      occupiedPercent: ((uniqueContainers.length / 500) * 100).toFixed(1),
    };
  }, [inventoryData]);

  // Client breakdown: containers, pallets, kilos per client
  const clientBreakdown = useMemo(() => {
    const map = new Map<string, {
      cliente: string;
      containers: Set<string>;
      pallets: number;
      cajas: number;
      kilos: number;
    }>();

    inventoryData.forEach(item => {
      const cli = (item.cliente || '-').trim();
      const cont = (item.contenedor || '').trim();
      if (!cont) return;

      if (!map.has(cli)) {
        map.set(cli, { cliente: cli, containers: new Set(), pallets: 0, cajas: 0, kilos: 0 });
      }
      const entry = map.get(cli)!;
      if (cont) entry.containers.add(cont);
      entry.pallets += Number(item.pallets) || 0;
      entry.cajas += Number(item.cantidad) || 0;
      entry.kilos += Number(item.kilos) || 0;
    });

    return Array.from(map.values())
      .map(e => ({ ...e, containersArr: Array.from(e.containers).sort() }))
      .sort((a, b) => b.kilos - a.kilos);
  }, [inventoryData]);

  const handleSaveRecord = async () => {
    if (!newRecord.guiaId.trim()) {
      showToast('El ID de Guía es obligatorio.', 'error');
      return;
    }
    setIsSavingRecord(true);
    try {
      const newActivity: ActivityRecord = {
        id: crypto.randomUUID(),
        guiaId: newRecord.guiaId.trim().toUpperCase(),
        tipoOperacion: newRecord.tipoOperacion,
        placaVehiculo: newRecord.placaVehiculo.trim().toUpperCase(),
        observaciones: newRecord.observaciones.trim().toUpperCase(),
        estado: 'ESPERANDO',
        createdAt: new Date().toISOString()
      };
      const updatedRecords = [newActivity, ...activityRecords].slice(0, 50);
      setActivityRecords(updatedRecords);
      localStorage.setItem(ACTIVITY_CACHE_KEY, JSON.stringify(updatedRecords));

      showToast('¡Registro guardado exitosamente!', 'success');
      logAction('REGISTRO_CREADO', `Guía: ${newActivity.guiaId}`, 'sistema');
      setIsModalOpen(false);
      setNewRecord({ tipoOperacion: 'INGRESO (RECEPCIÓN)', placaVehiculo: '', guiaId: '', observaciones: '' });
    } catch (error) {
      console.error("Error al guardar registro:", error);
      showToast('Error al guardar el registro.', 'error');
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleUpdateActivityStatus = async (recordId: string, newStatus: string) => {
    try {
      const updatedRecords = activityRecords.map(r => 
        r.id === recordId ? { ...r, estado: newStatus } : r
      );
      setActivityRecords(updatedRecords);
      localStorage.setItem(ACTIVITY_CACHE_KEY, JSON.stringify(updatedRecords));
      showToast(`Estado actualizado a: ${newStatus}`, 'success');
      logAction('ESTADO_ACTUALIZADO', `Guía: ${recordId} → ${newStatus}`, 'sistema');
    } catch (error) {
      console.error("Error al actualizar estado:", error);
      showToast('Error al actualizar estado.', 'error');
    }
  };

  const getTimeAgo = (createdAt: any) => {
    if (!createdAt) return '--';
    const date = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${String(diffMin).padStart(2, '0')} MIN`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${String(diffHrs).padStart(2, '0')} HOR`;
    return `${Math.floor(diffHrs / 24)} DÍA${Math.floor(diffHrs / 24) > 1 ? 'S' : ''}`;
  };

  const handleResetDatabase = async () => {
    setIsResetting(true);
    try {
      setInventoryData([]);
      setActivityRecords([]);
      localStorage.removeItem(INVENTORY_CACHE_KEY);
      localStorage.removeItem(ACTIVITY_CACHE_KEY);
      showToast('¡Base de datos reseteada a fábrica exitosamente!', 'success');
      logAction('BASE_RESET', 'Reset completo de inventario y actividad', 'configuracion');
      setIsResetModalOpen(false);
    } catch (error) {
      console.error("Error al resetear la base de datos:", error);
      showToast('Error al resetear la base de datos. Revisa la consola.', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const XLSX = await import('xlsx');
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      const mappedData: any[] = [];
      let currentClienteNum = '-';
      let currentClienteName = '-';
      let colPallets = -1, colCajas = -1, colKilos = -1, colContenido = -1, colContenedor = -1, colLote = -1;

      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        if (!Array.isArray(row) || row.length === 0) continue;
        const cell0 = String(row[0] || '').trim().toLowerCase();
        const cell1 = String(row[1] || '').trim().toLowerCase();
        const cell2 = String(row[2] || '').trim().toLowerCase();

        if (cell0.includes('cliente') || cell0 === 'cliente:') {
          currentClienteNum = String(row[1] || '-').trim();
          currentClienteName = String(row[2] || '-').trim();
          continue;
        }
        if (cell0.includes('totales') || cell1.includes('totales') || cell2.includes('totales')) continue;
        if (cell0.includes('fecha') || cell0.includes('reporte')) continue;

        const rowString = row.map(c => String(c || '').toLowerCase()).join(' ');
        if (rowString.includes('pallets') && (rowString.includes('cajas') || rowString.includes('cantidad')) && (rowString.includes('kilos') || rowString.includes('peso'))) {
          colPallets = row.findIndex(c => String(c || '').toLowerCase().includes('pallet'));
          colCajas = row.findIndex(c => String(c || '').toLowerCase().includes('caja') || String(c || '').toLowerCase().includes('cantidad'));
          colKilos = row.findIndex(c => String(c || '').toLowerCase().includes('kilo') || String(c || '').toLowerCase().includes('peso'));
          colContenido = row.findIndex(c => String(c || '').toLowerCase().includes('contenido') || String(c || '').toLowerCase().includes('descrip') || String(c || '').toLowerCase().includes('producto') || String(c || '').toLowerCase().includes('articulo'));
          colContenedor = row.findIndex(c => String(c || '').toLowerCase().includes('contenedor'));
          colLote = row.findIndex(c => String(c || '').toLowerCase().includes('lote'));
          continue;
        }

        if (colContenido !== -1 && colCajas !== -1) {
          const producto = row[colContenido];
          const cajas = row[colCajas];
          if (producto && String(producto).trim() !== '' && cajas !== undefined && cajas !== '') {
            const parseNumber = (val: any) => {
              if (typeof val === 'number') return val;
              if (!val) return 0;
              const strVal = String(val).replace(/\./g, '').replace(/,/g, '.');
              const num = parseFloat(strVal);
              return isNaN(num) ? 0 : num;
            };
            const contenedorVal = colContenedor !== -1 ? String(row[colContenedor] || '').trim() : '';
            const loteVal = colLote !== -1 ? String(row[colLote] || '').trim() : '';
            mappedData.push({
              id: crypto.randomUUID(),
              cliente: currentClienteName,
              numeroCliente: String(currentClienteNum).replace(/\./g, ''),
              producto: String(producto).trim(),
              contenedor: contenedorVal,
              lote: loteVal,
              pallets: parseNumber(row[colPallets]),
              cantidad: parseNumber(row[colCajas]),
              kilos: parseNumber(row[colKilos])
            });
          }
        }
      }

      setIsUploading(true);
      try {
        setInventoryData(mappedData);
        localStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(mappedData));
        showToast('Inventario guardado localmente.', 'success');
        logAction('INVENTARIO_UPLOAD', `${mappedData.length} ítems cargados`, 'inventario');
      } catch (error) {
        console.error("Error crítico al subir datos:", error);
        showToast('Hubo un error al subir los datos.', 'error');
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // Search filter for activity + inventory
  const filteredActivity = useMemo(() => {
    if (!searchTerm.trim()) return activityRecords.slice(0, 20);
    const term = searchTerm.toLowerCase();
    return activityRecords.filter(r =>
      (r.guiaId || '').toLowerCase().includes(term) ||
      (r.placaVehiculo || '').toLowerCase().includes(term) ||
      (r.tipoOperacion || '').toLowerCase().includes(term) ||
      (r.observaciones || '').toLowerCase().includes(term)
    ).slice(0, 50);
  }, [searchTerm, activityRecords]);

  // Group inventory by contenedor, aggregate pallets with same description/lote/kilos
  const groupedInventory = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const source = inventoryData.map(item => ({ ...item, numeroCliente: cleanNum(item.numeroCliente) }));
    const filtered = term
      ? source.filter(item =>
          cleanNum(item.numeroCliente).toLowerCase().includes(term) ||
          (item.cliente || '').toLowerCase().includes(term) ||
          (item.producto || '').toLowerCase().includes(term) ||
          (item.contenedor || '').toLowerCase().includes(term) ||
          (item.lote || '').toLowerCase().includes(term)
        )
      : source;

    // Aggregate: merge identical lines (mismo contenedor + lote + producto + kilos)
    const aggMap = new Map<string, any>();
    filtered.forEach(item => {
      const aggKey = `${item.contenedor || ''}|${item.lote || ''}|${item.producto}|${item.kilos}`;
      if (aggMap.has(aggKey)) {
        const agg = aggMap.get(aggKey)!;
        agg.pallets += Number(item.pallets) || 0;
        agg.cantidad += Number(item.cantidad) || 0;
      } else {
        aggMap.set(aggKey, {
          cliente: item.cliente,
          numeroCliente: cleanNum(item.numeroCliente),
          producto: item.producto,
          contenedor: item.contenedor || '',
          lote: item.lote || '',
          pallets: Number(item.pallets) || 0,
          cantidad: Number(item.cantidad) || 0,
          kilos: Number(item.kilos) || 0,
          id: item.id,
        });
      }
    });
    const aggregatedItems = Array.from(aggMap.values());

    // Group aggregated items by contenedor
    const containerMap = new Map<string, any[]>();
    aggregatedItems.forEach(item => {
      const key = String(item.contenedor || 'SIN CONTENEDOR').trim();
      if (!containerMap.has(key)) containerMap.set(key, []);
      containerMap.get(key)!.push(item);
    });

    return Array.from(containerMap.entries()).map(([contenedor, items]) => {
      const clientes = [...new Set(items.map(i => i.cliente).filter(Boolean))];
      const totalPallets = items.reduce((s, i) => s + i.pallets, 0);
      const totalCajas = items.reduce((s, i) => s + i.cantidad, 0);
      const totalKilos = items.reduce((s, i) => s + i.kilos, 0);
      return { contenedor, clientes, items, totalPallets, totalCajas, totalKilos };
    });
  }, [searchTerm, inventoryData]);

  const toggleContainer = (key: string) => {
    setExpandedContainers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleClient = (key: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Navigate from dashboard to inventory, showing a specific container expanded
  const navigateToContainer = (contenedor: string) => {
    setSearchTerm(contenedor);
    setExpandedContainers(prev => {
      const next = new Set(prev);
      next.add(contenedor);
      return next;
    });
    setActiveTab('inventory');
  };

  // Global search results
  const globalSearchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    const results: { category: string; items: { label: string; tab: string; id?: string }[] }[] = [];
    // Pedidos
    try {
      const ordersRaw = localStorage.getItem(ORDERS_CACHE_KEY);
      if (ordersRaw) {
        const orders = JSON.parse(ordersRaw);
        const pedidos = orders.filter((o: any) =>
          (o.numero || '').toLowerCase().includes(term) || (o.cliente || '').toLowerCase().includes(term)
        ).slice(0, 5).map((o: any) => ({ label: `${o.numero} - ${o.cliente}`, tab: 'pedidos', id: o.id }));
        if (pedidos.length > 0) results.push({ category: 'Pedidos', items: pedidos });
      }
    } catch {}
    // Inventario
    const inv = inventoryData.filter(i =>
      (i.producto || '').toLowerCase().includes(term) ||
      (i.contenedor || '').toLowerCase().includes(term) ||
      (i.cliente || '').toLowerCase().includes(term)
    ).slice(0, 5).map(i => ({ label: `${i.producto} - ${i.contenedor || ''}`, tab: 'inventory', id: i.id }));
    if (inv.length > 0) results.push({ category: 'Inventario', items: inv });
    return results;
  }, [searchTerm, inventoryData]);

  const totalSearchItems = globalSearchResults.reduce((s, r) => s + r.items.length, 0);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '8') {
        e.preventDefault();
        const tabs = ['dashboard', 'inventory', 'ingresos', 'despachos', 'pedidos', 'configuracion', 'temperaturas', 'historial'];
        setActiveTab(tabs[parseInt(e.key) - 1]);
      }
      if (e.key === 'Escape') {
        setSearchTerm('');
        setSearchFocused(false);
        setIsModalOpen(false);
        setMobileSidebarOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const TABS = [
    { key: 'dashboard', label: 'Panel Principal' },
    { key: 'inventory', label: 'Inventario' },
    { key: 'ingresos', label: 'Ingresos' },
    { key: 'despachos', label: 'Despachos' },
    { key: 'pedidos', label: 'Pedidos' },
    ...(canConfig ? [{ key: 'configuracion', label: 'Configuración' }] : []),
    { key: 'temperaturas', label: 'Temperaturas' },
    { key: 'historial', label: 'Historial' },
  ];

  // Count pedidos pendientes
  const pedidosPendientes = useMemo(() => {
    try {
      const raw = localStorage.getItem(ORDERS_CACHE_KEY);
      if (!raw) return 0;
      const orders = JSON.parse(raw);
      return Array.isArray(orders) ? orders.filter((o: any) => o.estado === 'PENDIENTE').length : 0;
    } catch { return 0; }
  }, []);

  // Movimientos hoy
  const movimientosHoy = useMemo(() => {
    const today = new Date().toDateString();
    return activityRecords.filter(r => new Date(r.createdAt).toDateString() === today).length;
  }, [activityRecords]);

  const filteredAudit = useMemo(() => {
    let result = auditEntries;
    if (auditModuleFilter !== 'todos') {
      result = result.filter(e => e.module === auditModuleFilter);
    }
    return result.slice(0, 100);
  }, [auditEntries, auditModuleFilter]);

  const handleBackup = () => {
    const allData: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('frimaral_')) {
        allData[key] = localStorage.getItem(key);
      }
    }
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frimaral_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup exportado exitosamente.', 'success');
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string);
        Object.entries(data).forEach(([key, value]) => {
          if (typeof value === 'string') {
            localStorage.setItem(key, value);
          }
        });
        showToast('Backup restaurado. Recargá la página.', 'success');
        logAction('BACKUP_RESTORE', 'Backup restaurado desde archivo', 'configuracion');
        setTimeout(() => window.location.reload(), 1000);
      } catch {
        showToast('Error al restaurar backup.', 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleSaveOperatorName = () => {
    if (operatorName.trim()) {
      setOperatorName(operatorName.trim());
      showToast('Nombre de operador guardado.', 'success');
    }
  };

  const handleLogin = () => {
    const ok = login(loginUsername, loginPassword);
    if (ok) {
      setLoginUsername('');
      setLoginPassword('');
      setLoginError('');
      showToast('Sesión iniciada correctamente.', 'success');
    } else {
      setLoginError('Usuario o contraseña incorrectos');
    }
  };

  const handleCreateUser = () => {
    const result = createUser(newUser.username, newUser.password, newUser.displayName, newUser.role);
    if (result.ok) {
      showToast(`Usuario "${newUser.username}" creado con rol ${newUser.role}.`, 'success');
      setNewUser({ username: '', password: '', displayName: '', role: 'OPERADOR' });
      setUserMgmtError('');
    } else {
      setUserMgmtError(result.error || 'Error al crear usuario');
    }
  };

  const handleDeleteUser = (userId: string, username: string) => {
    const result = deleteUser(userId);
    if (result.ok) {
      showToast(`Usuario "${username}" eliminado.`, 'success');
    } else {
      showToast(result.error || 'Error al eliminar', 'error');
    }
  };

  const handleChangeRole = (userId: string, newRole: Role) => {
    updateUserRole(userId, newRole);
    showToast('Rol actualizado.', 'success');
  };

  const handleChangePassword = (userId: string) => {
    if (!editingPassword || editingPassword.length < 4) {
      setUserMgmtError('La contraseña debe tener al menos 4 caracteres');
      return;
    }
    const result = updatePassword(userId, editingPassword);
    if (result.ok) {
      showToast('Contraseña actualizada.', 'success');
      setEditingUserId(null);
      setEditingPassword('');
      setUserMgmtError('');
    } else {
      setUserMgmtError(result.error || 'Error al cambiar contraseña');
    }
  };

  // Login screen
  if (!isLoggedIn) {
    return (
      <div className="h-screen bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 p-8 shadow-lg">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              </div>
              <h1 className="text-xl font-mono tracking-widest text-neutral-900 dark:text-neutral-100 uppercase">Frimaral</h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mt-1">Centro Logistico</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1.5">Usuario</label>
                <input type="text" value={loginUsername} onChange={e => setLoginUsername(e.target.value.toLowerCase())}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="USUARIO"
                  className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 focus:border-blue-500 outline-none placeholder:text-neutral-400 rounded-lg" />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1.5">Contrasena</label>
                <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="CONTRASENA"
                  className="w-full p-3 text-xs font-mono bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 focus:border-blue-500 outline-none placeholder:text-neutral-400 rounded-lg" />
              </div>

              {loginError && <p className="text-xs font-mono text-red-600 dark:text-red-400 animate-shake">{loginError}</p>}

              <button onClick={handleLogin}
                className="w-full p-3 bg-blue-600 text-white text-xs font-mono uppercase tracking-widest hover:bg-blue-700 transition-colors rounded-lg">
                Iniciar Sesion
              </button>
            </div>
          </div>
          <p className="mt-4 text-center text-[9px] font-mono uppercase tracking-widest text-neutral-400">Frimaral Centro Logistico v2.2</p>
        </div>
      </div>
    );
  }

  if (isLoading) return <LoadingScreen />;

  const sidebarContent = (
    <>
      <div className="h-0.5 bg-gradient-to-r from-blue-600 via-blue-400 to-cyan-400" />
      <div className="p-5 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
          </div>
          <div>
            <h1 className="text-base font-mono tracking-widest text-white uppercase">Frimaral</h1>
            <p className="text-[9px] font-mono uppercase tracking-widest text-neutral-500">Centro Logistico</p>
          </div>
          <button className="md:hidden ml-auto text-neutral-400 hover:text-white" onClick={() => setMobileSidebarOpen(false)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto px-3">
        {TABS.map((tab, i) => (
          <button key={tab.key}
            onClick={() => { setActiveTab(tab.key); setMobileSidebarOpen(false); }}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-[11px] font-mono uppercase tracking-wider flex items-center gap-3 transition-all duration-200 ${
              activeTab === tab.key
                ? 'text-white bg-blue-600/20 border-l-2 border-blue-500 shadow-sm'
                : 'hover:text-neutral-200 hover:bg-neutral-800/60 border-l-2 border-transparent'
            }`}
          >
            <span className={`flex-shrink-0 w-5 h-5 flex items-center justify-center ${activeTab === tab.key ? 'text-blue-400' : 'text-neutral-600'}`}>
              <span className="text-sm font-bold">{String(i + 1).padStart(2, '0')}</span>
            </span>
            <span className="flex-1">{tab.label}</span>
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-neutral-800 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 truncate max-w-[120px]">{currentUser?.displayName}</p>
            <p className="text-[8px] font-mono uppercase tracking-widest text-neutral-700">{role}</p>
          </div>
          <button onClick={logout} className="text-neutral-500 hover:text-red-400 transition-colors" title="Cerrar sesion">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          </button>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-mono uppercase tracking-widest text-neutral-700">v2.2</p>
          <button onClick={toggleTheme} className="text-neutral-500 hover:text-white transition-colors" title={theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}>
            {theme === 'dark' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="h-screen overflow-hidden bg-neutral-100 dark:bg-neutral-900 flex text-neutral-900 dark:text-neutral-100 font-sans selection:bg-neutral-900 selection:text-white relative">

      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* Sidebar - desktop */}
      <aside className="hidden md:flex w-64 bg-neutral-950 text-neutral-400 flex-col border-r border-neutral-800 relative">
        {sidebarContent}
      </aside>

      {/* Sidebar - mobile overlay */}
      {mobileSidebarOpen && (
        <aside className="fixed inset-y-0 left-0 z-40 w-64 bg-neutral-950 text-neutral-400 flex flex-col border-r border-neutral-800 animate-slide-in-left">
          {sidebarContent}
        </aside>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="h-14 bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between px-4 md:px-8 gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Hamburger */}
            <button className="md:hidden text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100" onClick={() => setMobileSidebarOpen(true)}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div className="flex-1 max-w-md relative">
              <svg className="w-4 h-4 text-neutral-400 absolute left-0 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar (Ctrl+K)..."
                className="w-full pl-6 py-1.5 text-xs font-mono uppercase bg-neutral-50 dark:bg-neutral-700 rounded-lg border border-neutral-200 dark:border-neutral-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder:text-neutral-400"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setSearchHighlightIdx(0); }}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              />
              {/* Search Dropdown */}
              {searchFocused && searchTerm.trim() && globalSearchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-2xl z-50 max-h-64 overflow-auto">
                  {globalSearchResults.map((group, gi) => (
                    <div key={group.category}>
                      <div className="px-4 py-2 text-[9px] font-mono uppercase tracking-widest text-neutral-400 dark:text-neutral-500 bg-neutral-50 dark:bg-neutral-900 sticky top-0 border-b border-neutral-100 dark:border-neutral-700">
                        {group.category} ({group.items.length})
                      </div>
                      {group.items.map((item, ii) => (
                        <button key={`${group.category}-${ii}`}
                          className="w-full text-left px-4 py-2 text-xs font-mono hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors flex items-center gap-2"
                          onClick={() => { setActiveTab(item.tab); setSearchTerm(''); setSearchFocused(false); }}
                        >
                          <span className="text-neutral-400">→</span>
                          <span className="truncate">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-widest flex-shrink-0">
            {searchTerm && (
              <button className="text-neutral-400 cursor-pointer hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors flex items-center gap-1.5"
                onClick={() => setSearchTerm('')}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                <span className="hidden sm:inline">Limpiar</span>
              </button>
            )}
            {/* Shortcuts hint */}
            <div className="relative group">
              <button className="w-6 h-6 rounded-full border border-neutral-300 dark:border-neutral-600 text-neutral-400 dark:text-neutral-500 flex items-center justify-center text-[10px] font-bold hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">?</button>
              <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <p className="text-[9px] font-mono uppercase tracking-widest text-neutral-500 dark:text-neutral-400 mb-2">Atajos de Teclado</p>
                <div className="space-y-1 text-[10px] font-mono text-neutral-600 dark:text-neutral-300">
                  <div><kbd className="bg-neutral-100 dark:bg-neutral-700 px-1 rounded text-[9px]">Ctrl+K</kbd> Buscar</div>
                  <div><kbd className="bg-neutral-100 dark:bg-neutral-700 px-1 rounded text-[9px]">Ctrl+1-8</kbd> Pestañas</div>
                  <div><kbd className="bg-neutral-100 dark:bg-neutral-700 px-1 rounded text-[9px]">Esc</kbd> Cerrar</div>
                </div>
              </div>
            </div>
            {/* Role Badge */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
              role === 'ADMIN' ? 'bg-neutral-900 text-white' :
              role === 'OPERADOR' ? 'bg-amber-600 text-white' :
              'bg-neutral-400 text-neutral-900'
            }`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              {role}
            </div>
          </div>
        </header>

        {/* ===== DASHBOARD ===== */}
        {activeTab === 'dashboard' && (
          <div className="p-8 flex-1 overflow-auto">
            <div className="flex justify-between items-end mb-8 border-b border-neutral-200 pb-6">
              <div>
                <h2 className="text-2xl font-light tracking-tight text-neutral-900 uppercase">Resumen Operativo</h2>
                <p className="text-xs font-mono text-neutral-500 mt-2 uppercase tracking-widest">
                  Actualizado: {currentDate} &middot; {inventoryData.length} ítems en inventario
                </p>
              </div>
              <button onClick={() => setIsModalOpen(true)}
                className="px-5 py-2.5 bg-blue-600 text-white text-xs font-mono uppercase tracking-wider rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/25">
                [+ Nuevo Registro
              </button>
              <button onClick={() => printContent('FRIMARAL - Resumen Operativo', '')}
                className="px-5 py-2.5 bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 text-white dark:text-neutral-900 text-xs font-mono uppercase tracking-wider rounded-xl hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-all">
                🖨 Imprimir
              </button>
            </div>

            {/* Quick Actions */}
            <div className="mb-8 p-4 bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm">
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 dark:text-neutral-400 mb-3">Acciones Rápidas</h3>
              <div className="flex flex-wrap gap-2">
                {canCreate && (
                  <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-blue-600 text-white text-[10px] font-mono uppercase tracking-widest rounded-lg hover:bg-blue-700 transition-colors">[+] Nuevo Registro</button>
                )}
                <button onClick={() => setActiveTab('pedidos')} className="px-4 py-2 bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 text-white dark:text-neutral-900 text-[10px] font-mono uppercase tracking-widest rounded-lg hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors">[+] Nuevo Pedido</button>
                <button onClick={() => exportInventoryExcel(inventoryData)} className="px-4 py-2 bg-emerald-700 text-white text-[10px] font-mono uppercase tracking-widest rounded-lg hover:bg-emerald-800 transition-colors">📥 Exportar Inventario</button>
                <button onClick={() => exportDashboardSummary(kpis, clientBreakdown)} className="px-4 py-2 bg-violet-700 text-white text-[10px] font-mono uppercase tracking-widest rounded-lg hover:bg-violet-800 transition-colors">📊 Exportar Resumen</button>
              </div>
            </div>

            {/* KPIs - Top row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 animate-fade-in">
              <div className="bg-white dark:bg-neutral-800 p-5 rounded-xl border border-blue-100/50 dark:border-blue-900/50 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 dark:text-neutral-400">Pedidos Pendientes</p>
                  <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                </div>
                <h3 className="text-4xl font-light tracking-tighter text-neutral-900 dark:text-neutral-100">{pedidosPendientes}</h3>
                <div className="mt-2 text-[10px] font-mono text-neutral-400 uppercase tracking-widest">En espera de confirmación</div>
              </div>
              <div className="bg-white dark:bg-neutral-800 p-5 rounded-xl border border-emerald-100/50 dark:border-emerald-900/50 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 dark:text-neutral-400">Movimientos Hoy</p>
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </div>
                </div>
                <h3 className="text-4xl font-light tracking-tighter text-neutral-900 dark:text-neutral-100">{movimientosHoy}</h3>
                <div className="mt-2 text-[10px] font-mono text-neutral-400 uppercase tracking-widest">Registros del día</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6 animate-fade-in">
              {/* Ocupacion de Camara */}
              <div className="bg-white dark:bg-neutral-800 p-6 md:col-span-2 rounded-xl border border-blue-100/50 dark:border-blue-900/50 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Ocupacion de Camara</p>
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                  </div>
                </div>
                <div className="flex items-end gap-3">
                  <h3 className="text-5xl font-light tracking-tighter text-neutral-900 animate-progress">{kpis.containers}</h3>
                  <span className="text-xl font-light text-neutral-400 mb-1">/ {kpis.containerCapacity}</span>
                </div>
                <div className="mt-4 w-full bg-blue-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full animate-progress ${Number(kpis.occupiedPercent) > 80 ? 'bg-gradient-to-r from-red-500 to-red-400' : Number(kpis.occupiedPercent) > 50 ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-gradient-to-r from-blue-600 to-blue-400'}`}
                    style={{ width: `${Math.min(Number(kpis.occupiedPercent), 100)}%` }}
                  />
                </div>
                <div className="mt-2 text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
                  {kpis.occupiedPercent}% ocupado · 20 PIES
                </div>
              </div>

              {/* Clientes Activos */}
              <div className="bg-gradient-to-br from-white to-emerald-50/50 p-6 rounded-xl border border-emerald-100/50 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Clientes Activos</p>
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  </div>
                </div>
                <h3 className="text-5xl font-light tracking-tighter text-neutral-900">{kpis.clients}</h3>
                <div className="mt-4 text-[10px] font-mono text-neutral-400 uppercase tracking-widest border-t border-emerald-100 pt-3">
                  En camara
                </div>
              </div>

              {/* Total Pallets */}
              <div className="bg-gradient-to-br from-white to-amber-50/50 p-6 rounded-xl border border-amber-100/50 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Total Pallets</p>
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                  </div>
                </div>
                <h3 className="text-5xl font-light tracking-tighter text-neutral-900">{kpis.pallets.toLocaleString()}</h3>
                <div className="mt-4 text-[10px] font-mono text-neutral-400 uppercase tracking-widest border-t border-amber-100 pt-3">
                  {kpis.cajas.toLocaleString()} cajas
                </div>
              </div>

              {/* Peso Total */}
              <div className="bg-gradient-to-br from-white to-violet-50/50 p-6 rounded-xl border border-violet-100/50 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Peso Total</p>
                  <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
                  </div>
                </div>
                <h3 className="text-5xl font-light tracking-tighter text-neutral-900">{kpis.toneladas}</h3>
                <div className="mt-4 text-[10px] font-mono text-neutral-400 uppercase tracking-widest border-t border-violet-100 pt-3">
                  Toneladas
                </div>
              </div>
            </div>

            {/* Client Breakdown */}
            {clientBreakdown.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900">
                    Desglose por Cliente
                  </h3>
                  <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
                    {clientBreakdown.length} clientes &middot; click para expandir
                  </span>
                </div>
                <div className="border border-neutral-200 bg-white divide-y divide-neutral-200 rounded-xl overflow-hidden shadow-sm">
                  {clientBreakdown.map((client, idx) => {
                    const isExpanded = expandedClients.has(client.cliente);
                    const maxKilos = clientBreakdown[0]?.kilos || 1;
                    const barWidth = (client.kilos / maxKilos * 100).toFixed(1);
                    return (
                      <div key={client.cliente}>
                        <button
                          onClick={() => toggleClient(client.cliente)}
                          className={`w-full flex items-center gap-4 p-4 transition-all text-left ${isExpanded ? 'bg-blue-50/50 border-l-2 border-blue-500' : 'hover:bg-neutral-50 border-l-2 border-transparent'}`}
                        >
                          <div className={`w-4 h-4 flex items-center justify-center text-neutral-500 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                              <span className="text-sm font-mono font-medium text-neutral-900 truncate">{client.cliente}</span>
                              <span className="px-1.5 py-0.5 bg-neutral-900 text-white text-[9px] font-mono shrink-0">
                                #{idx + 1}
                              </span>
                            </div>
                            <div className="flex items-center gap-5 text-xs font-mono text-neutral-500">
                              <span><span className="font-bold text-neutral-700">{client.containersArr.length}</span> CONT</span>
                              <span><span className="font-bold text-neutral-700">{client.pallets}</span> PAL</span>
                              <span><span className="font-bold text-neutral-700">{client.cajas}</span> CAJ</span>
                              <span><span className="font-bold text-neutral-700">{(client.kilos / 1000).toFixed(1)}</span> TON</span>
                            </div>
                          </div>
                          <div className="w-32 h-1.5 bg-neutral-100 shrink-0 hidden md:block">
                            <div className="h-full bg-neutral-900" style={{ width: `${barWidth}%` }} />
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-neutral-200 bg-neutral-50 px-8 py-3">
                            <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 mb-2">Contenedores ({client.containersArr.length})</p>
                            <div className="flex flex-wrap gap-2">
                              {client.containersArr.map(cont => (
                                <button
                                  key={cont}
                                  onClick={() => navigateToContainer(cont)}
                                  className="px-3 py-1.5 bg-white border border-neutral-200 text-[10px] font-mono text-neutral-700 hover:border-blue-500 hover:bg-blue-600 hover:text-white transition-all cursor-pointer rounded-lg shadow-sm hover:shadow-md"
                                  title={`Ver contenido de ${cont} en Inventario`}
                                >
                                  {cont}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Activity Log */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900">
                  Registro de Actividad
                  {searchTerm && <span className="text-neutral-400 ml-2">({filteredActivity.length} resultados)</span>}
                </h3>
              </div>
              <div className="border border-neutral-200 bg-white">
                <div className="grid grid-cols-6 border-b border-neutral-200 bg-neutral-50 p-4 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                  <div>ID Guía</div>
                  <div>Operación</div>
                  <div>Placa Vehículo</div>
                  <div>Estado</div>
                  <div className="text-right">Tiempo</div>
                  <div className="text-center">Acción</div>
                </div>
                <div className="divide-y divide-neutral-100 max-h-96 overflow-auto">
                  {filteredActivity.length === 0 ? (
                    <div className="p-8 text-center text-xs font-mono text-neutral-400 uppercase tracking-widest">
                      {searchTerm ? 'Sin resultados para la búsqueda' : 'No hay registros de actividad. Crea uno con [+ Nuevo Registro]'}
                    </div>
                  ) : (
                    filteredActivity.map((item) => (
                      <div key={item.id} className="grid grid-cols-6 p-4 text-xs font-mono uppercase tracking-wider text-neutral-900 hover:bg-neutral-50 transition-colors">
                        <div className="font-medium">{item.guiaId}</div>
                        <div className="truncate">{item.tipoOperacion}</div>
                        <div className="text-neutral-500">{item.placaVehiculo || '-'}</div>
                        <div>
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-semibold inline-flex items-center gap-1.5 ${
                            item.estado === 'COMPLETADO' ? 'bg-emerald-100 text-emerald-800' :
                            item.estado === 'EN PROCESO' ? 'bg-blue-100 text-blue-800' :
                            item.estado === 'CANCELADO' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              item.estado === 'COMPLETADO' ? 'bg-emerald-500' :
                              item.estado === 'EN PROCESO' ? 'bg-blue-500 animate-pulse-soft' :
                              item.estado === 'CANCELADO' ? 'bg-red-500' :
                              'bg-amber-500'
                            }`} />
                            {item.estado}
                          </span>
                        </div>
                        <div className="text-right text-neutral-500">{getTimeAgo(item.createdAt)}</div>
                        <div className="text-center">
                          {item.estado === 'ESPERANDO' && (
                            <button onClick={() => handleUpdateActivityStatus(item.id!, 'EN PROCESO')}
                              className="px-3 py-1 text-[9px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm">
                              INICIAR
                            </button>
                          )}
                          {item.estado === 'EN PROCESO' && (
                            <button onClick={() => handleUpdateActivityStatus(item.id!, 'COMPLETADO')}
                              className="px-3 py-1 text-[9px] font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all shadow-sm">
                              COMPLETAR
                            </button>
                          )}
                          {item.estado === 'COMPLETADO' && (
                            <span className="w-5 h-5 inline-flex items-center justify-center rounded-full bg-emerald-100">
                              <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== INVENTORY ===== */}
        {activeTab === 'inventory' && (
          <div className="p-8 flex-1 overflow-auto flex flex-col bg-neutral-50">
            <div className="flex justify-between items-end mb-6 pb-4">
              <div>
                <h2 className="text-2xl font-light tracking-tight text-neutral-900 uppercase">Control de Inventario</h2>
                <p className="text-xs font-mono text-neutral-500 mt-2 uppercase tracking-widest">
                  {groupedInventory.length} contenedor{groupedInventory.length !== 1 ? 'es' : ''} · {inventoryData.length} ítems totales{searchTerm ? ' (filtrado)' : ''}
                </p>
              </div>
              <div>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload}
                  ref={fileInputRef} className="hidden" id="excel-upload" disabled={isUploading} />
                <label htmlFor="excel-upload"
                  className={`px-5 py-2.5 text-xs font-mono uppercase tracking-widest transition-colors inline-block ${
                    isUploading ? 'bg-neutral-400 text-white cursor-not-allowed' : 'bg-neutral-900 text-white hover:bg-neutral-800 cursor-pointer'
                  }`}>
                  {isUploading ? '[...] Subiendo a la Nube...' : '[+] Cargar Excel'}
                </label>
              </div>
            </div>

            {inventoryData.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-neutral-300 bg-white p-12 text-center">
                <p className="text-sm font-mono uppercase tracking-widest text-neutral-500 mb-4">No hay datos en el inventario</p>
                <label htmlFor="excel-upload"
                  className="text-xs font-mono uppercase tracking-widest text-neutral-900 underline underline-offset-4 cursor-pointer hover:text-neutral-600">
                  Cargar archivo .xlsx para comenzar
                </label>
              </div>
            ) : groupedInventory.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center border border-neutral-200 bg-white p-12 text-center">
                <p className="text-sm font-mono uppercase tracking-widest text-neutral-400 mb-2">Sin resultados</p>
                <p className="text-xs font-mono text-neutral-400">No se encontraron ítems que coincidan con &quot;{searchTerm}&quot;</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 pb-4">
                {groupedInventory.sort((a, b) => a.contenedor.localeCompare(b.contenedor)).map((group, groupIdx) => {
                  const isExpanded = expandedContainers.has(group.contenedor);
                  return (
                    <div key={group.contenedor || groupIdx} className="border border-neutral-300 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      <button
                        onClick={() => toggleContainer(group.contenedor)}
                        className="w-full flex items-center justify-between p-5 hover:bg-neutral-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className={`w-6 h-6 flex items-center justify-center text-neutral-500 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap mb-2">
                              <span className="text-base font-mono uppercase tracking-wider text-neutral-900 font-bold whitespace-nowrap">
                                {group.contenedor}
                              </span>
                              <span className="px-2 py-0.5 bg-neutral-900 text-white text-[10px] font-mono uppercase tracking-widest">
                                {group.items.length} PROD
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] font-mono text-neutral-600 truncate">
                              <span className="text-neutral-400">CLIENTE:</span>
                              <span className="font-medium">{group.clientes.join(', ')}</span>
                            </div>
                            <div className="flex items-center gap-5 mt-2 text-[10px] font-mono text-neutral-500">
                              <div className="flex items-center gap-1">
                                <span className="font-bold text-neutral-700">{group.totalPallets}</span>
                                <span>PALLETS</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="font-bold text-neutral-700">{group.totalCajas}</span>
                                <span>CAJAS</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="font-bold text-neutral-700">{group.totalKilos.toFixed(1)}</span>
                                <span>KG</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest shrink-0 ml-4 bg-neutral-100 px-3 py-1">
                          #{String(groupIdx + 1).padStart(2, '0')}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t-2 border-neutral-200 bg-neutral-50">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs font-sans">
                              <thead className="bg-neutral-900 text-white text-[10px] font-mono uppercase tracking-widest">
                                <tr>
                                  <th className="p-3 text-center">Pallets</th>
                                  <th className="p-3">Lote</th>
                                  <th className="p-3">Descripción</th>
                                  <th className="p-3 text-right">Cajas</th>
                                  <th className="p-3 text-right">Kilos</th>
                                  <th className="p-3">Cliente</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-200 bg-white">
                                {group.items.map((item, idx) => (
                                  <tr key={item.id || idx} className="hover:bg-neutral-50 transition-colors">
                                    <td className="p-3 text-center">
                                      <span className={`inline-block px-3 py-1 font-mono font-bold text-sm ${item.pallets > 1 ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-700'}`}>
                                        {item.pallets}
                                      </span>
                                    </td>
                                    <td className="p-3 font-mono font-medium text-neutral-700 whitespace-nowrap">{item.lote || '-'}</td>
                                    <td className="p-3 max-w-sm" title={item.producto}>
                                      <span className="line-clamp-2 text-xs leading-snug text-neutral-800">{item.producto}</span>
                                    </td>
                                    <td className="p-3 text-right font-mono text-neutral-700 font-medium">{item.cantidad}</td>
                                    <td className="p-3 text-right font-mono font-bold text-neutral-900">{Number(item.kilos).toFixed(1)}</td>
                                    <td className="p-3 font-mono text-neutral-500 text-[10px] whitespace-nowrap">{item.cliente}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-neutral-900 text-white border-t-2 border-neutral-300 font-bold">
                                  <td className="p-3 text-center font-mono text-sm">{group.totalPallets}</td>
                                  <td className="p-3 font-mono uppercase tracking-widest text-[10px]" colSpan={2}>TOTAL CONTENEDOR</td>
                                  <td className="p-3 text-right font-mono text-sm">{group.totalCajas}</td>
                                  <td className="p-3 text-right font-mono text-sm">{group.totalKilos.toFixed(1)}</td>
                                  <td className="p-3"></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== INGRESOS ===== */}
        {activeTab === 'ingresos' && (
          <IngresoMercaderia inventoryData={inventoryData} />
        )}

        {/* ===== DESPACHOS ===== */}
        {activeTab === 'despachos' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <DespachosReal
              inventoryData={inventoryData}
              onUpdateInventory={(data: any[]) => { setInventoryData(data); localStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(data)); }}
              onNavigateToPedidos={() => setActiveTab('pedidos')}
            />
          </div>
        )}

        {/* ===== PEDIDOS ===== */}
        {activeTab === 'pedidos' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <Pedidos
              inventoryData={inventoryData}
              onUpdateInventory={(data: any[]) => { setInventoryData(data); localStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(data)); }}
            />
          </div>
        )}

        {/* ===== TEMPERATURAS ===== */}
        {activeTab === 'temperaturas' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <TemperatureMonitor />
          </div>
        )}

        {/* ===== CONFIGURACIÓN ===== */}
        {activeTab === 'configuracion' && canConfig && (
          <div className="p-8 flex-1 overflow-auto">
            <h2 className="text-2xl font-light tracking-tight text-neutral-900 dark:text-neutral-100 uppercase mb-8">Configuración del Sistema</h2>

            <div className="max-w-2xl space-y-8">
              {/* Operator */}
              <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
                <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 dark:text-neutral-100 mb-4 border-b border-neutral-200 dark:border-neutral-700 pb-3">Operador</h3>
                <div className="flex gap-3">
                  <input type="text" value={operatorName} onChange={(e) => setOperatorName(e.target.value)}
                    placeholder="NOMBRE DEL OPERADOR"
                    className="flex-1 p-3 text-xs font-mono uppercase bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 focus:border-blue-500 outline-none placeholder:text-neutral-400" />
                  <button onClick={handleSaveOperatorName} className="px-4 py-3 bg-blue-600 text-white text-xs font-mono uppercase hover:bg-blue-700 transition-colors">Guardar</button>
                </div>
              </div>

              {/* Usuarios */}
              <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
                <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 dark:text-neutral-100 mb-4 border-b border-neutral-200 dark:border-neutral-700 pb-3">Gestion de Usuarios</h3>

                {/* Lista de usuarios */}
                <div className="space-y-2 mb-6">
                  {users.map(u => (
                    <div key={u.id} className={`flex items-center justify-between p-3 rounded-lg border ${u.id === currentUser?.id ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/20' : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-700/30'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono uppercase tracking-wider text-neutral-900 dark:text-neutral-100">{u.username}</span>
                          <span className={`px-1.5 py-0.5 text-[8px] font-mono uppercase rounded ${
                            u.role === 'ADMIN' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                            u.role === 'OPERADOR' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                            'bg-neutral-200 dark:bg-neutral-600 text-neutral-600 dark:text-neutral-300'
                          }`}>{u.role}</span>
                          {u.id === currentUser?.id && <span className="text-[8px] font-mono text-blue-500">(vos)</span>}
                        </div>
                        <p className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 truncate">{u.displayName}</p>
                        {editingUserId === u.id && (
                          <div className="flex gap-2 mt-2">
                            <input type="password" value={editingPassword} onChange={e => setEditingPassword(e.target.value)} placeholder="Nueva contrasena"
                              className="flex-1 p-1.5 text-[10px] font-mono bg-white dark:bg-neutral-600 border border-neutral-200 dark:border-neutral-500 outline-none rounded" />
                            <button onClick={() => handleChangePassword(u.id)} className="px-2 py-1.5 text-[10px] font-mono bg-blue-600 text-white rounded hover:bg-blue-700">Guardar</button>
                            <button onClick={() => { setEditingUserId(null); setEditingPassword(''); }} className="px-2 py-1.5 text-[10px] font-mono bg-neutral-300 dark:bg-neutral-600 text-neutral-700 dark:text-neutral-200 rounded hover:bg-neutral-400">X</button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        <select value={u.role} onChange={e => handleChangeRole(u.id, e.target.value as Role)}
                          className="text-[9px] font-mono bg-white dark:bg-neutral-600 border border-neutral-200 dark:border-neutral-500 rounded px-1 py-1 outline-none">
                          <option value="ADMIN">ADMIN</option>
                          <option value="OPERADOR">OPERADOR</option>
                          <option value="LECTURA">LECTURA</option>
                        </select>
                        {editingUserId !== u.id && (
                          <button onClick={() => { setEditingUserId(u.id); setEditingPassword(''); setUserMgmtError(''); }} className="p-1 text-neutral-400 hover:text-blue-600 transition-colors" title="Cambiar contrasena">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                        )}
                        <button onClick={() => handleDeleteUser(u.id, u.username)}
                          className={`p-1 transition-colors ${u.id === 'admin_default' || u.id === currentUser?.id ? 'text-neutral-300 dark:text-neutral-600 cursor-not-allowed' : 'text-neutral-400 hover:text-red-600'}`}
                          disabled={u.id === 'admin_default' || u.id === currentUser?.id} title="Eliminar usuario">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Crear nuevo usuario */}
                <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4">
                  <h4 className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-3">Crear Nuevo Usuario</h4>
                  {userMgmtError && <p className="text-[10px] font-mono text-red-600 dark:text-red-400 mb-2 animate-shake">{userMgmtError}</p>}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="block text-[9px] font-mono uppercase tracking-widest text-neutral-500 mb-1">Usuario</label>
                      <input type="text" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value.toLowerCase()})}
                        placeholder="USUARIO" className="w-full p-2 text-[10px] font-mono uppercase bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 outline-none rounded" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-mono uppercase tracking-widest text-neutral-500 mb-1">Contrasena</label>
                      <input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})}
                        placeholder="****" className="w-full p-2 text-[10px] font-mono bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 outline-none rounded" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <label className="block text-[9px] font-mono uppercase tracking-widest text-neutral-500 mb-1">Nombre</label>
                      <input type="text" value={newUser.displayName} onChange={e => setNewUser({...newUser, displayName: e.target.value})}
                        placeholder="NOMBRE COMPLETO" className="w-full p-2 text-[10px] font-mono uppercase bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 outline-none rounded" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-mono uppercase tracking-widest text-neutral-500 mb-1">Rol</label>
                      <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as Role})}
                        className="w-full p-2 text-[10px] font-mono bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 outline-none rounded">
                        <option value="ADMIN">ADMIN</option>
                        <option value="OPERADOR">OPERADOR</option>
                        <option value="LECTURA">LECTURA</option>
                      </select>
                    </div>
                  </div>
                  <button onClick={handleCreateUser} className="w-full px-4 py-2 bg-blue-600 text-white text-[10px] font-mono uppercase tracking-widest hover:bg-blue-700 transition-colors rounded-lg">
                    + Crear Usuario
                  </button>
                </div>
              </div>

              {/* Backup/Restore */}
              <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
                <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 dark:text-neutral-100 mb-4 border-b border-neutral-200 dark:border-neutral-700 pb-3">Backup / Restaurar</h3>
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleBackup} className="px-4 py-2 bg-emerald-700 text-white text-xs font-mono uppercase hover:bg-emerald-800 transition-colors">📥 Exportar Backup</button>
                  <input type="file" accept=".json" onChange={handleRestore} ref={backupInputRef} className="hidden" id="restore-input" />
                  <label htmlFor="restore-input" className="px-4 py-2 bg-amber-600 text-white text-xs font-mono uppercase hover:bg-amber-700 transition-colors cursor-pointer">📤 Restaurar Backup</label>
                </div>
                <p className="mt-3 text-[10px] font-mono text-neutral-500 dark:text-neutral-400">Exporta/Importa todos los datos del sistema como archivo JSON.</p>
              </div>

              {/* Dark Mode */}
              <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
                <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 dark:text-neutral-100 mb-4 border-b border-neutral-200 dark:border-neutral-700 pb-3">Apariencia</h3>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-widest text-neutral-700 dark:text-neutral-300">Modo Oscuro</span>
                  <button onClick={toggleTheme} className={`w-12 h-6 rounded-full transition-colors ${theme === 'dark' ? 'bg-blue-600' : 'bg-neutral-300 dark:bg-neutral-600'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              {/* Reset */}
              {canReset && (
                <div className="bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-800 p-6">
                  <h3 className="text-xs font-mono uppercase tracking-widest text-red-800 dark:text-red-300 mb-4 border-b border-red-200 dark:border-red-800 pb-3">Zona de Peligro</h3>
                  <button onClick={() => setIsResetModalOpen(true)}
                    className="px-4 py-2 bg-red-600 text-white text-xs font-mono uppercase hover:bg-red-700 transition-colors">
                    🗑 Resetear Base de Datos
                  </button>
                  <p className="mt-3 text-[10px] font-mono text-red-600 dark:text-red-400">Elimina TODOS los datos del sistema. Esta acción no se puede deshacer.</p>
                </div>
              )}
            </div>

            <p className="mt-8 text-[9px] font-mono uppercase tracking-widest text-neutral-400 dark:text-neutral-600">Frimaral Centro Logístico v2.2</p>
          </div>
        )}

        {activeTab === 'configuracion' && !canConfig && (
          <div className="p-8 flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm font-mono uppercase tracking-widest text-neutral-400 mb-2">Acceso Restringido</p>
              <p className="text-xs font-mono text-neutral-400">Tu rol ({role}) no tiene permiso para acceder a la configuración.</p>
            </div>
          </div>
        )}

        {/* ===== HISTORIAL ===== */}
        {activeTab === 'historial' && (
          <div className="p-8 flex-1 overflow-auto">
            <div className="flex justify-between items-end mb-6 pb-4 border-b border-neutral-200 dark:border-neutral-700">
              <div>
                <h2 className="text-2xl font-light tracking-tight text-neutral-900 dark:text-neutral-100 uppercase">Historial de Cambios</h2>
                <p className="text-xs font-mono text-neutral-500 dark:text-neutral-400 mt-2 uppercase tracking-widest">
                  {auditEntries.length} registros de actividad
                </p>
              </div>
              <div className="flex items-center gap-3">
                <select value={auditModuleFilter} onChange={(e) => setAuditModuleFilter(e.target.value)}
                  className="p-2 text-[11px] font-mono uppercase bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 outline-none">
                  <option value="todos">Todos los módulos</option>
                  <option value="pedidos">Pedidos</option>
                  <option value="inventario">Inventario</option>
                  <option value="ingresos">Ingresos</option>
                  <option value="despachos">Despachos</option>
                  <option value="configuracion">Configuración</option>
                </select>
                <button onClick={() => exportAuditLogExcel(filteredAudit)} disabled={filteredAudit.length === 0}
                  className="px-4 py-2 bg-emerald-700 text-white text-[10px] font-mono uppercase tracking-widest rounded-lg hover:bg-emerald-800 disabled:bg-neutral-400 disabled:cursor-not-allowed transition-colors">
                  Exportar a Excel
                </button>
                {canDelete && (
                  <button onClick={() => { if (confirm('¿Borrar todo el historial?')) clearLog(); }}
                    className="px-4 py-2 bg-red-600 text-white text-[10px] font-mono uppercase tracking-widest rounded-lg hover:bg-red-700 transition-colors">
                    Limpiar
                  </button>
                )}
              </div>
            </div>
            <div className="border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
              <div className="grid grid-cols-5 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-3 text-[10px] font-mono uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                <div>Fecha</div>
                <div>Acción</div>
                <div>Descripción</div>
                <div>Módulo</div>
                <div>Usuario</div>
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-700 max-h-[60vh] overflow-auto">
                {filteredAudit.length === 0 ? (
                  <div className="p-8 text-center text-xs font-mono text-neutral-400 uppercase tracking-widest">Sin registros.</div>
                ) : (
                  filteredAudit.map((entry: AuditEntry) => (
                    <div key={entry.id} className="grid grid-cols-5 p-3 text-xs font-mono text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors">
                      <div className="text-[10px] text-neutral-500 dark:text-neutral-400">{new Date(entry.timestamp).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      <div><span className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-700 text-[9px] rounded font-mono">{entry.accion}</span></div>
                      <div className="truncate">{entry.descripcion}</div>
                      <div><span className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-700 text-[9px] rounded font-mono">{entry.modulo}</span></div>
                      <div className="truncate">{entry.operador}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {isResetModalOpen && (
          <ConfirmModal
            open={isResetModalOpen}
            title="⚠️ Resetear Base de Datos"
            message="Esta acción eliminará TODOS los datos de inventario y actividad. No se puede deshacer. Se requiere escribir CONFIRMAR para continuar."
            confirmLabel="Resetear Todo"
            variant="danger"
            loading={isResetting}
            requireConfirmText={true}
            onConfirm={handleResetDatabase}
            onCancel={() => setIsResetModalOpen(false)}
          />
        )}

        {isModalOpen && (          <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="reset-modal-title">
            <div className="bg-white w-full max-w-md border border-neutral-200 shadow-2xl">
              <div className="flex items-center justify-between p-6 border-b border-neutral-200 bg-red-50">
                <h3 id="reset-modal-title" className="text-sm font-mono uppercase tracking-widest text-red-900">Confirmar Reseteo Total</h3>
                <button onClick={() => setIsResetModalOpen(false)} className="text-red-900 hover:text-red-700 font-mono text-xl leading-none" disabled={isResetting}>&times;</button>
              </div>
              <div className="p-8">
                <p className="text-sm font-sans text-neutral-700 mb-4">
                  ¿Estás absolutamente seguro? Esta acción borrará <strong>TODOS</strong> los registros de inventario de forma permanente.
                </p>
                <p className="text-xs font-mono uppercase tracking-widest text-red-600">Esta acción no se puede deshacer.</p>
              </div>
              <div className="flex items-center justify-end gap-4 p-6 border-t border-neutral-200 bg-neutral-50">
                <button onClick={() => setIsResetModalOpen(false)} className="px-5 py-2.5 text-xs font-mono uppercase tracking-widest text-neutral-500 hover:text-neutral-900 transition-colors" disabled={isResetting}>Cancelar</button>
                <button onClick={handleResetDatabase} disabled={isResetting}
                  className={`px-5 py-2.5 text-white text-xs font-mono uppercase tracking-widest transition-colors ${isResetting ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}>
                  {isResetting ? '[...] Borrando...' : 'Sí, Borrar Todo'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== MODAL NUEVO REGISTRO ===== */}
        {isModalOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="new-record-modal-title">
            <div className="bg-white w-full max-w-2xl border border-neutral-200 shadow-2xl">
              <div className="flex items-center justify-between p-6 border-b border-neutral-200 bg-neutral-50">
                <h3 id="new-record-modal-title" className="text-sm font-mono uppercase tracking-widest text-neutral-900">Nuevo Registro Operativo</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-neutral-500 hover:text-neutral-900 font-mono text-xl leading-none">&times;</button>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">Tipo de Operación</label>
                    <select value={newRecord.tipoOperacion}
                      onChange={(e) => setNewRecord({...newRecord, tipoOperacion: e.target.value})}
                      className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors appearance-none">
                      <option>INGRESO (RECEPCIÓN)</option>
                      <option>DESPACHO (SALIDA)</option>
                      <option>TRASLADO INTERNO</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">Placa del Vehículo</label>
                    <input type="text" placeholder="EJ: ABC-123" value={newRecord.placaVehiculo}
                      onChange={(e) => setNewRecord({...newRecord, placaVehiculo: e.target.value.toUpperCase()})}
                      className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors placeholder:text-neutral-400" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">ID de Guía / Documento *</label>
                  <input type="text" placeholder="NÚMERO DE REFERENCIA" value={newRecord.guiaId}
                    onChange={(e) => setNewRecord({...newRecord, guiaId: e.target.value.toUpperCase()})}
                    className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors placeholder:text-neutral-400" />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">Observaciones</label>
                  <textarea rows={3} placeholder="DETALLES ADICIONALES..." value={newRecord.observaciones}
                    onChange={(e) => setNewRecord({...newRecord, observaciones: e.target.value.toUpperCase()})}
                    className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors placeholder:text-neutral-400 resize-none"></textarea>
                </div>
              </div>
              <div className="flex items-center justify-end gap-4 p-6 border-t border-neutral-200 bg-neutral-50">
                <button onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-xs font-mono uppercase tracking-widest text-neutral-500 hover:text-neutral-900 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleSaveRecord} disabled={isSavingRecord || !newRecord.guiaId.trim()}
                  className={`px-5 py-2.5 text-xs font-mono uppercase tracking-widest transition-colors ${
                    isSavingRecord || !newRecord.guiaId.trim() ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed' : 'bg-neutral-900 text-white hover:bg-neutral-800'
                  }`}>
                  {isSavingRecord ? '[...] Guardando...' : 'Guardar Registro'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
