'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';

const PdfProcessor = dynamic(() => import('../components/PdfProcessor'), { ssr: false });
const TemperatureMonitor = dynamic(() => import('../components/TemperatureMonitor'), { ssr: false });

interface ActivityRecord {
  id?: string;
  guiaId: string;
  tipoOperacion: string;
  placaVehiculo: string;
  observaciones: string;
  estado: string;
  createdAt: any;
}

export default function LogisticsDashboard() {
  const INVENTORY_CACHE_KEY = 'frimaral_inventory_cache_v1';
  const ACTIVITY_CACHE_KEY = 'frimaral_activity_cache_v1';
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(new Set());
  const [isResetting, setIsResetting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{text: string, type: 'success' | 'error'} | null>(null);
  const [currentDate, setCurrentDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activityRecords, setActivityRecords] = useState<ActivityRecord[]>([]);
  const [isSavingRecord, setIsSavingRecord] = useState(false);

  // New record form state
  const [newRecord, setNewRecord] = useState({
    tipoOperacion: 'INGRESO (RECEPCIÓN)',
    placaVehiculo: '',
    guiaId: '',
    observaciones: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-hide toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  useEffect(() => {
    setCurrentDate(new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }));
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

  // KPIs computed from real data
  const kpis = useMemo(() => {
    // Envíos en Tránsito = despachos con estado EN PROCESO
    const enTransito = activityRecords.filter(r => r.estado === 'EN PROCESO').length;

    // Carga Recibida (Ton) = total kilos de inventario / 1000
    const totalKilos = inventoryData.reduce((sum, item) => sum + (Number(item.kilos) || 0), 0);
    const toneladas = (totalKilos / 1000).toFixed(1);

    // Vehículos en Patio = registros únicos con estado ESPERANDO
    const vehiculosEspera = [...new Set(
      activityRecords.filter(r => r.estado === 'ESPERANDO').map(r => r.placaVehiculo).filter(Boolean)
    )].length;

    return { enTransito, toneladas, vehiculosEspera };
  }, [inventoryData, activityRecords]);

  const handleSaveRecord = async () => {
    if (!newRecord.guiaId.trim()) {
      setToastMessage({ text: "El ID de Guía es obligatorio.", type: 'error' });
      return;
    }
    setIsSavingRecord(true);
    try {
      const newActivity: ActivityRecord = {
        id: Math.random().toString(36).substring(2, 15),
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

      setToastMessage({ text: "¡Registro guardado exitosamente!", type: 'success' });
      setIsModalOpen(false);
      setNewRecord({ tipoOperacion: 'INGRESO (RECEPCIÓN)', placaVehiculo: '', guiaId: '', observaciones: '' });
    } catch (error) {
      console.error("Error al guardar registro:", error);
      setToastMessage({ text: "Error al guardar el registro.", type: 'error' });
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
      setToastMessage({ text: `Estado actualizado a: ${newStatus}`, type: 'success' });
    } catch (error) {
      console.error("Error al actualizar estado:", error);
      setToastMessage({ text: "Error al actualizar estado.", type: 'error' });
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
      localStorage.removeItem(INVENTORY_CACHE_KEY);
      setToastMessage({ text: "¡Base de datos reseteada a fábrica exitosamente!", type: 'success' });
      setIsResetModalOpen(false);
    } catch (error) {
      console.error("Error al resetear la base de datos:", error);
      setToastMessage({ text: "Error al resetear la base de datos. Revisa la consola.", type: 'error' });
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
        setToastMessage({ text: "Inventario guardado localmente.", type: 'success' });
      } catch (error) {
        console.error("Error crítico al subir datos:", error);
        setToastMessage({ text: "Hubo un error al subir los datos.", type: 'error' });
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

  return (
    <div className="h-screen overflow-hidden bg-neutral-100 flex text-neutral-900 font-sans selection:bg-neutral-900 selection:text-white relative">
      {/* Toast */}
      {toastMessage && (
        <div className={`absolute top-4 right-4 z-50 px-6 py-3 shadow-lg text-xs font-mono uppercase tracking-widest ${
          toastMessage.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toastMessage.text}
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-64 bg-neutral-950 text-neutral-400 flex flex-col border-r border-neutral-900">
        <div className="p-6 border-b border-neutral-900">
          <h1 className="text-xl font-mono tracking-widest text-white uppercase">Frimaral</h1>
          <p className="text-[10px] font-mono uppercase tracking-widest mt-2 text-neutral-500">Centro Logístico</p>
        </div>
        <nav className="flex-1 py-6 space-y-1 overflow-y-auto">
          {[
            { key: 'dashboard', label: '01. Panel Principal' },
            { key: 'inventory', label: '02. Inventario' },
            { key: 'despachos', label: '03. Despachos' },
            { key: 'configuracion', label: '05. Configuración' },
          ].map(tab => (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`w-full text-left px-6 py-3 text-xs font-mono uppercase tracking-widest transition-colors ${
                activeTab === tab.key
                  ? 'text-white bg-neutral-900 border-l-2 border-white'
                  : 'hover:text-white hover:bg-neutral-900 border-l-2 border-transparent'
              }`}
            >{tab.label}</button>
          ))}
          <button
            onClick={() => setActiveTab('temperaturas')}
            className={`w-full text-left px-6 py-3 text-xs font-mono uppercase tracking-widest transition-colors ${
              activeTab === 'temperaturas'
                ? 'text-white bg-neutral-900 border-l-2 border-white'
                : 'hover:text-white hover:bg-neutral-900 border-l-2 border-transparent'
            }`}
          >04. Temperaturas</button>
        </nav>
        <div className="p-6 border-t border-neutral-900">
          <span className="w-full text-left text-xs font-mono uppercase tracking-widest text-neutral-600">
            Ayuda / Soporte
          </span>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-14 bg-white border-b border-neutral-200 flex items-center justify-between px-8">
          <div className="w-96">
            <input
              type="text"
              placeholder="BUSCAR REGISTRO, PLACA O GUÍA..."
              className="w-full py-1 text-xs font-mono uppercase bg-transparent border-b border-neutral-300 focus:border-neutral-900 outline-none transition-colors placeholder:text-neutral-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-6 text-xs font-mono uppercase tracking-widest">
            {searchTerm && (
              <span className="text-neutral-400 cursor-pointer hover:text-neutral-900 underline underline-offset-4"
                onClick={() => setSearchTerm('')}>
                ✕ LIMPIAR
              </span>
            )}
            <div className="px-3 py-1 bg-neutral-900 text-white">OP: ADMIN</div>
          </div>
        </header>

        {/* ===== DASHBOARD ===== */}
        {activeTab === 'dashboard' && (
          <div className="p-8 flex-1 overflow-auto">
            <div className="flex justify-between items-end mb-8 border-b border-neutral-200 pb-6">
              <div>
                <h2 className="text-2xl font-light tracking-tight text-neutral-900 uppercase">Resumen Operativo</h2>
                <p className="text-xs font-mono text-neutral-500 mt-2 uppercase tracking-widest">
                  Actualizado: {currentDate} &middot; {inventoryData.length} ítems en inventario &middot; {activityRecords.length} registros
                </p>
              </div>
              <button onClick={() => setIsModalOpen(true)}
                className="px-5 py-2.5 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors">
                [+] Nuevo Registro
              </button>
            </div>

            {/* KPIs from REAL data */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-neutral-200 border border-neutral-200 mb-10">
              <div className="bg-white p-8">
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-4">Envíos en Tránsito</p>
                <h3 className="text-5xl font-light tracking-tighter text-neutral-900">{kpis.enTransito}</h3>
                <div className="mt-6 text-[10px] font-mono text-neutral-500 uppercase tracking-widest border-t border-neutral-100 pt-4">
                  <span>Registros con estado EN PROCESO</span>
                </div>
              </div>
              <div className="bg-white p-8">
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-4">Carga Recibida (Ton)</p>
                <h3 className="text-5xl font-light tracking-tighter text-neutral-900">{kpis.toneladas}</h3>
                <div className="mt-6 text-[10px] font-mono text-neutral-500 uppercase tracking-widest border-t border-neutral-100 pt-4">
                  <span>Total del inventario actual</span>
                </div>
              </div>
              <div className="bg-white p-8">
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-4">Vehículos en Patio</p>
                <h3 className="text-5xl font-light tracking-tighter text-neutral-900">{String(kpis.vehiculosEspera).padStart(2, '0')}</h3>
                <div className="mt-6 text-[10px] font-mono text-neutral-500 uppercase tracking-widest border-t border-neutral-100 pt-4">
                  <span>Registros en espera de procesamiento</span>
                </div>
              </div>
            </div>

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
                          <span className={`px-2 py-1 ${
                            item.estado === 'COMPLETADO' ? 'bg-neutral-100 text-neutral-900' :
                            item.estado === 'EN PROCESO' ? 'border border-neutral-900 text-neutral-900' :
                            item.estado === 'CANCELADO' ? 'bg-red-50 text-red-700 border border-red-200' :
                            'text-neutral-500 border border-neutral-300'
                          }`}>{item.estado}</span>
                        </div>
                        <div className="text-right text-neutral-500">{getTimeAgo(item.createdAt)}</div>
                        <div className="text-center">
                          {item.estado === 'ESPERANDO' && (
                            <button onClick={() => handleUpdateActivityStatus(item.id!, 'EN PROCESO')}
                              className="px-2 py-1 text-[9px] border border-neutral-900 text-neutral-900 hover:bg-neutral-900 hover:text-white transition-colors">
                              INICIAR
                            </button>
                          )}
                          {item.estado === 'EN PROCESO' && (
                            <button onClick={() => handleUpdateActivityStatus(item.id!, 'COMPLETADO')}
                              className="px-2 py-1 text-[9px] bg-neutral-100 text-neutral-900 hover:bg-green-100 hover:text-green-800 transition-colors">
                              COMPLETAR
                            </button>
                          )}
                          {item.estado === 'COMPLETADO' && (
                            <span className="text-[9px] text-neutral-400">✔</span>
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

        {/* ===== DESPACHOS ===== */}
        {activeTab === 'despachos' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <PdfProcessor inventoryData={inventoryData} />
          </div>
        )}

        {/* ===== TEMPERATURAS ===== */}
        {activeTab === 'temperaturas' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <TemperatureMonitor />
          </div>
        )}

        {/* ===== CONFIGURACIÓN ===== */}
        {activeTab === 'configuracion' && (
          <div className="p-8 flex-1 overflow-auto flex flex-col">
            <div className="mb-8 border-b border-neutral-200 pb-6">
              <h2 className="text-2xl font-light tracking-tight text-neutral-900 uppercase">Configuración del Sistema</h2>
              <p className="text-xs font-mono text-neutral-500 mt-2 uppercase tracking-widest">Ajustes y mantenimiento de la plataforma</p>
            </div>
            <div className="max-w-3xl">
              <div className="border border-red-200 bg-red-50 p-8">
                <h3 className="text-sm font-mono uppercase tracking-widest text-red-900 mb-2">Zona de Peligro</h3>
                <p className="text-xs font-sans text-red-700 mb-6">Las acciones en esta sección son irreversibles.</p>
                <div className="flex items-center justify-between border-t border-red-200 pt-6">
                  <div>
                    <h4 className="text-xs font-mono uppercase tracking-widest text-red-900">Reseteo Total de Fábrica</h4>
                    <p className="text-xs font-sans text-red-700 mt-1">Borra toda la base de datos de inventario ({inventoryData.length} registros actuales).</p>
                  </div>
                  <button onClick={() => setIsResetModalOpen(true)}
                    className="px-5 py-2.5 bg-red-600 text-white text-xs font-mono uppercase tracking-widest hover:bg-red-700 transition-colors">
                    Resetear Base de Datos
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== MODAL RESETEO ===== */}
        {isResetModalOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900/50 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md border border-neutral-200 shadow-2xl">
              <div className="flex items-center justify-between p-6 border-b border-neutral-200 bg-red-50">
                <h3 className="text-sm font-mono uppercase tracking-widest text-red-900">Confirmar Reseteo Total</h3>
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
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900/50 backdrop-blur-sm">
            <div className="bg-white w-full max-w-2xl border border-neutral-200 shadow-2xl">
              <div className="flex items-center justify-between p-6 border-b border-neutral-200 bg-neutral-50">
                <h3 className="text-sm font-mono uppercase tracking-widest text-neutral-900">Nuevo Registro Operativo</h3>
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
