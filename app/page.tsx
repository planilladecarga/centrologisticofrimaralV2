'use client';

import React, { useState, useRef, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, writeBatch, doc, getDocs } from 'firebase/firestore';
import dynamic from 'next/dynamic';

const PdfProcessor = dynamic(() => import('../components/PdfProcessor'), { ssr: false });

export default function LogisticsDashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{text: string, type: 'success' | 'error'} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInventoryData(data);
    });
    return () => unsubscribe();
  }, []);

  const handleResetDatabase = async () => {
    setIsResetting(true);
    try {
      const snapshot = await getDocs(collection(db, 'inventory'));
      const deleteBatches = [];
      let currentDeleteBatch = writeBatch(db);
      let deleteCount = 0;
      
      snapshot.docs.forEach((document) => {
        currentDeleteBatch.delete(document.ref);
        deleteCount++;
        if (deleteCount === 490) {
          deleteBatches.push(currentDeleteBatch);
          currentDeleteBatch = writeBatch(db);
          deleteCount = 0;
        }
      });
      if (deleteCount > 0) deleteBatches.push(currentDeleteBatch);
      for (const batch of deleteBatches) await batch.commit();
      
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
    console.log("Archivo seleccionado:", file?.name);
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      console.log("Leyendo archivo Excel...");
      const XLSX = await import('xlsx');
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      
      const mappedData: any[] = [];
      let currentClienteNum = '-';
      let currentClienteName = '-';
      
      let colPallets = -1;
      let colCajas = -1;
      let colKilos = -1;
      let colContenido = -1;
      
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        if (!Array.isArray(row) || row.length === 0) continue;
        
        const cell0 = String(row[0] || '').trim().toLowerCase();
        const cell1 = String(row[1] || '').trim().toLowerCase();
        const cell2 = String(row[2] || '').trim().toLowerCase();
        
        // Detectar fila de Cliente (ej: "Cliente:", "121", "UREXPORT S.A.")
        if (cell0.includes('cliente') || cell0 === 'cliente:') {
          currentClienteNum = String(row[1] || '-').trim();
          currentClienteName = String(row[2] || '-').trim();
          continue;
        }
        
        // Ignorar filas de totales o metadatos
        if (cell0.includes('totales') || cell1.includes('totales') || cell2.includes('totales')) continue;
        if (cell0.includes('fecha') || cell0.includes('reporte')) continue;
        
        // Detectar fila de encabezados
        const rowString = row.map(c => String(c || '').toLowerCase()).join(' ');
        if (rowString.includes('pallets') && (rowString.includes('cajas') || rowString.includes('cantidad')) && (rowString.includes('kilos') || rowString.includes('peso'))) {
          colPallets = row.findIndex(c => String(c || '').toLowerCase().includes('pallet'));
          colCajas = row.findIndex(c => String(c || '').toLowerCase().includes('caja') || String(c || '').toLowerCase().includes('cantidad'));
          colKilos = row.findIndex(c => String(c || '').toLowerCase().includes('kilo') || String(c || '').toLowerCase().includes('peso'));
          colContenido = row.findIndex(c => String(c || '').toLowerCase().includes('contenido') || String(c || '').toLowerCase().includes('descrip') || String(c || '').toLowerCase().includes('producto') || String(c || '').toLowerCase().includes('articulo'));
          continue;
        }
        
        // Extraer datos si ya tenemos los encabezados identificados
        if (colContenido !== -1 && colCajas !== -1) {
          const producto = row[colContenido];
          const cajas = row[colCajas];
          
          // Una fila válida debe tener un producto y una cantidad
          if (producto && String(producto).trim() !== '' && cajas !== undefined && cajas !== '') {
            const parseNumber = (val: any) => {
              if (typeof val === 'number') return val;
              if (!val) return 0;
              // Manejar formato español "1.234,56" -> "1234.56"
              const strVal = String(val).replace(/\./g, '').replace(/,/g, '.');
              const num = parseFloat(strVal);
              return isNaN(num) ? 0 : num;
            };

            mappedData.push({
              cliente: currentClienteName,
              numeroCliente: currentClienteNum,
              producto: String(producto).trim(),
              pallets: parseNumber(row[colPallets]),
              cantidad: parseNumber(row[colCajas]),
              kilos: parseNumber(row[colKilos])
            });
          }
        }
      }

      setIsUploading(true);
      try {
        console.log("Iniciando subida a Firebase...", mappedData.length, "filas");
        
        // 1. Borrar inventario actual para reemplazarlo
        console.log("Borrando inventario anterior...");
        const snapshot = await getDocs(collection(db, 'inventory'));
        const deleteBatches = [];
        let currentDeleteBatch = writeBatch(db);
        let deleteCount = 0;
        
        snapshot.docs.forEach((document) => {
          currentDeleteBatch.delete(document.ref);
          deleteCount++;
          if (deleteCount === 490) {
            deleteBatches.push(currentDeleteBatch);
            currentDeleteBatch = writeBatch(db);
            deleteCount = 0;
          }
        });
        if (deleteCount > 0) deleteBatches.push(currentDeleteBatch);
        for (const batch of deleteBatches) await batch.commit();
        console.log("Borrado completado.");

        // 2. Subir nuevo inventario
        console.log("Subiendo nuevos datos...");
        const addBatches = [];
        let currentAddBatch = writeBatch(db);
        let addCount = 0;

        mappedData.forEach((item) => {
          const newDocRef = doc(collection(db, 'inventory'));
          currentAddBatch.set(newDocRef, item);
          addCount++;
          if (addCount === 490) {
            addBatches.push(currentAddBatch);
            currentAddBatch = writeBatch(db);
            addCount = 0;
          }
        });
        if (addCount > 0) addBatches.push(currentAddBatch);
        for (const batch of addBatches) await batch.commit();
        console.log("Subida completada con éxito.");
        setToastMessage({ text: "¡Inventario actualizado correctamente en la nube!", type: 'success' });

      } catch (error) {
        console.error("Error crítico al subir a Firebase:", error);
        setToastMessage({ text: "Hubo un error al subir los datos. Revisa la consola para más detalles.", type: 'error' });
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex text-neutral-900 font-sans selection:bg-neutral-900 selection:text-white relative">
      {/* Toast Message */}
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
        
        <nav className="flex-1 py-6 space-y-1">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full text-left px-6 py-3 text-xs font-mono uppercase tracking-widest transition-colors ${
              activeTab === 'dashboard' 
                ? 'text-white bg-neutral-900 border-l-2 border-white' 
                : 'hover:text-white hover:bg-neutral-900 border-l-2 border-transparent'
            }`}
          >
            01. Panel Principal
          </button>
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`w-full text-left px-6 py-3 text-xs font-mono uppercase tracking-widest transition-colors ${
              activeTab === 'inventory' 
                ? 'text-white bg-neutral-900 border-l-2 border-white' 
                : 'hover:text-white hover:bg-neutral-900 border-l-2 border-transparent'
            }`}
          >
            02. Inventario
          </button>
          <button 
            onClick={() => setActiveTab('despachos')}
            className={`w-full text-left px-6 py-3 text-xs font-mono uppercase tracking-widest transition-colors ${
              activeTab === 'despachos' 
                ? 'text-white bg-neutral-900 border-l-2 border-white' 
                : 'hover:text-white hover:bg-neutral-900 border-l-2 border-transparent'
            }`}
          >
            03. Despachos
          </button>
          <button className="w-full text-left px-6 py-3 text-xs font-mono uppercase tracking-widest hover:text-white hover:bg-neutral-900 border-l-2 border-transparent transition-colors">
            04. Personal
          </button>
          <button 
            onClick={() => setActiveTab('configuracion')}
            className={`w-full text-left px-6 py-3 text-xs font-mono uppercase tracking-widest transition-colors ${
              activeTab === 'configuracion' 
                ? 'text-white bg-neutral-900 border-l-2 border-white' 
                : 'hover:text-white hover:bg-neutral-900 border-l-2 border-transparent'
            }`}
          >
            05. Configuración
          </button>
        </nav>

        <div className="p-6 border-t border-neutral-900">
          <button className="w-full text-left text-xs font-mono uppercase tracking-widest hover:text-white transition-colors">
            Ayuda / Soporte
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-14 bg-white border-b border-neutral-200 flex items-center justify-between px-8">
          <div className="w-96">
            <input 
              type="text" 
              placeholder="BUSCAR REGISTRO, PLACA O GUÍA..." 
              className="w-full py-1 text-xs font-mono uppercase bg-transparent border-b border-neutral-300 focus:border-neutral-900 outline-none transition-colors placeholder:text-neutral-400"
            />
          </div>
          <div className="flex items-center gap-6 text-xs font-mono uppercase tracking-widest">
            <span className="text-neutral-500">Alertas: 0</span>
            <div className="px-3 py-1 bg-neutral-900 text-white">
              OP: ADMIN
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        {activeTab === 'dashboard' && (
          <div className="p-8 flex-1 overflow-auto">
            <div className="flex justify-between items-end mb-8 border-b border-neutral-200 pb-6">
              <div>
                <h2 className="text-2xl font-light tracking-tight text-neutral-900 uppercase">Resumen Operativo</h2>
                <p className="text-xs font-mono text-neutral-500 mt-2 uppercase tracking-widest" suppressHydrationWarning>
                  Actualizado: {new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </p>
              </div>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="px-5 py-2.5 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors"
              >
                [+] Nuevo Registro
              </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-neutral-200 border border-neutral-200 mb-10">
              <div className="bg-white p-8">
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-4">Envíos en Tránsito</p>
                <h3 className="text-5xl font-light tracking-tighter text-neutral-900">24</h3>
                <div className="mt-6 text-[10px] font-mono text-neutral-500 uppercase tracking-widest border-t border-neutral-100 pt-4">
                  <span>Variación: +12% vs ayer</span>
                </div>
              </div>

              <div className="bg-white p-8">
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-4">Carga Recibida (Ton)</p>
                <h3 className="text-5xl font-light tracking-tighter text-neutral-900">142.5</h3>
                <div className="mt-6 text-[10px] font-mono text-neutral-500 uppercase tracking-widest border-t border-neutral-100 pt-4">
                  <span>Variación: -4% vs ayer</span>
                </div>
              </div>

              <div className="bg-white p-8">
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-4">Vehículos en Patio</p>
                <h3 className="text-5xl font-light tracking-tighter text-neutral-900">08</h3>
                <div className="mt-6 text-[10px] font-mono text-neutral-500 uppercase tracking-widest border-t border-neutral-100 pt-4">
                  <span>Estado: 3 en espera de descarga</span>
                </div>
              </div>
            </div>

            {/* Recent Activity Data Grid */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900">Registro de Actividad</h3>
                <button className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 hover:text-neutral-900 underline underline-offset-4">
                  Ver Todo
                </button>
              </div>
              
              <div className="border border-neutral-200 bg-white">
                {/* Table Header */}
                <div className="grid grid-cols-5 border-b border-neutral-200 bg-neutral-50 p-4 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                  <div>ID Guía</div>
                  <div>Operación</div>
                  <div>Placa Vehículo</div>
                  <div>Estado</div>
                  <div className="text-right">Tiempo</div>
                </div>
                
                {/* Table Rows */}
                <div className="divide-y divide-neutral-100">
                  {[
                    { id: 'GR-4029', type: 'INGRESO', status: 'COMPLETADO', time: '10 MIN', truck: 'ABC-123' },
                    { id: 'GR-4030', type: 'DESPACHO', status: 'EN PROCESO', time: '25 MIN', truck: 'XYZ-987' },
                    { id: 'GR-4031', type: 'INGRESO', status: 'ESPERANDO', time: '01 HOR', truck: 'DEF-456' },
                    { id: 'GR-4032', type: 'DESPACHO', status: 'COMPLETADO', time: '02 HOR', truck: 'LMN-789' },
                  ].map((item, i) => (
                    <div key={i} className="grid grid-cols-5 p-4 text-xs font-mono uppercase tracking-wider text-neutral-900 hover:bg-neutral-50 transition-colors cursor-pointer">
                      <div className="font-medium">{item.id}</div>
                      <div>{item.type}</div>
                      <div className="text-neutral-500">{item.truck}</div>
                      <div>
                        <span className={`px-2 py-1 ${
                          item.status === 'COMPLETADO' ? 'bg-neutral-100 text-neutral-900' :
                          item.status === 'EN PROCESO' ? 'border border-neutral-900 text-neutral-900' :
                          'text-neutral-500 border border-neutral-300'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                      <div className="text-right text-neutral-500">{item.time}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Inventory Content */}
        {activeTab === 'inventory' && (
          <div className="p-8 flex-1 overflow-auto flex flex-col">
            <div className="flex justify-between items-end mb-8 border-b border-neutral-200 pb-6">
              <div>
                <h2 className="text-2xl font-light tracking-tight text-neutral-900 uppercase">Control de Inventario</h2>
                <p className="text-xs font-mono text-neutral-500 mt-2 uppercase tracking-widest">
                  Total Registros: {inventoryData.length}
                </p>
              </div>
              <div>
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                  className="hidden"
                  id="excel-upload"
                  disabled={isUploading}
                />
                <label 
                  htmlFor="excel-upload"
                  className={`px-5 py-2.5 text-xs font-mono uppercase tracking-widest transition-colors inline-block ${
                    isUploading 
                      ? 'bg-neutral-400 text-white cursor-not-allowed' 
                      : 'bg-neutral-900 text-white hover:bg-neutral-800 cursor-pointer'
                  }`}
                >
                  {isUploading ? '[...] Subiendo a la Nube...' : '[+] Cargar Excel'}
                </label>
              </div>
            </div>

            {inventoryData.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center">
                <p className="text-sm font-mono uppercase tracking-widest text-neutral-500 mb-4">
                  No hay datos en el inventario
                </p>
                <label 
                  htmlFor="excel-upload"
                  className="text-xs font-mono uppercase tracking-widest text-neutral-900 underline underline-offset-4 cursor-pointer hover:text-neutral-600"
                >
                  Cargar archivo .xlsx para comenzar
                </label>
              </div>
            ) : (
              <div className="border border-neutral-200 bg-white flex-1 overflow-hidden flex flex-col">
                {/* Table Header */}
                <div className="grid grid-cols-6 border-b border-neutral-200 bg-neutral-50 p-4 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                  <div className="col-span-1">No. Cliente</div>
                  <div className="col-span-1">Cliente</div>
                  <div className="col-span-2">Producto</div>
                  <div className="col-span-1 text-right">Pallets</div>
                  <div className="col-span-1 text-right">Cantidad / Kilos</div>
                </div>
                
                {/* Table Rows */}
                <div className="divide-y divide-neutral-100 overflow-auto flex-1">
                  {inventoryData.map((item, i) => (
                    <div key={i} className="grid grid-cols-6 p-4 text-xs font-mono uppercase tracking-wider text-neutral-900 hover:bg-neutral-50 transition-colors">
                      <div className="col-span-1 text-neutral-500">{item.numeroCliente}</div>
                      <div className="col-span-1 font-medium truncate pr-4" title={item.cliente}>{item.cliente}</div>
                      <div className="col-span-2 truncate pr-4" title={item.producto}>{item.producto}</div>
                      <div className="col-span-1 text-right">{item.pallets}</div>
                      <div className="col-span-1 text-right">
                        <div>{item.cantidad} UND</div>
                        <div className="text-[10px] text-neutral-500 mt-1">{item.kilos} KG</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Despachos Content */}
        {activeTab === 'despachos' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <PdfProcessor />
          </div>
        )}

        {/* Configuración Content */}
        {activeTab === 'configuracion' && (
          <div className="p-8 flex-1 overflow-auto flex flex-col">
            <div className="mb-8 border-b border-neutral-200 pb-6">
              <h2 className="text-2xl font-light tracking-tight text-neutral-900 uppercase">Configuración del Sistema</h2>
              <p className="text-xs font-mono text-neutral-500 mt-2 uppercase tracking-widest">
                Ajustes y mantenimiento de la plataforma
              </p>
            </div>

            <div className="max-w-3xl">
              <div className="border border-red-200 bg-red-50 p-8">
                <h3 className="text-sm font-mono uppercase tracking-widest text-red-900 mb-2">Zona de Peligro</h3>
                <p className="text-xs font-sans text-red-700 mb-6">
                  Las acciones en esta sección son irreversibles. Por favor, procede con precaución.
                </p>
                
                <div className="flex items-center justify-between border-t border-red-200 pt-6">
                  <div>
                    <h4 className="text-xs font-mono uppercase tracking-widest text-red-900">Reseteo Total de Fábrica</h4>
                    <p className="text-xs font-sans text-red-700 mt-1">
                      Borra toda la base de datos de inventario y deja la aplicación como nueva.
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsResetModalOpen(true)}
                    className="px-5 py-2.5 bg-red-600 text-white text-xs font-mono uppercase tracking-widest hover:bg-red-700 transition-colors"
                  >
                    Resetear Base de Datos
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Reseteo */}
        {isResetModalOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900/50 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md border border-neutral-200 shadow-2xl">
              <div className="flex items-center justify-between p-6 border-b border-neutral-200 bg-red-50">
                <h3 className="text-sm font-mono uppercase tracking-widest text-red-900">Confirmar Reseteo Total</h3>
                <button 
                  onClick={() => setIsResetModalOpen(false)}
                  className="text-red-900 hover:text-red-700 font-mono text-xl leading-none"
                  disabled={isResetting}
                >
                  &times;
                </button>
              </div>
              
              <div className="p-8">
                <p className="text-sm font-sans text-neutral-700 mb-4">
                  ¿Estás absolutamente seguro? Esta acción borrará <strong>TODOS</strong> los registros de inventario de forma permanente.
                </p>
                <p className="text-xs font-mono uppercase tracking-widest text-red-600">
                  Esta acción no se puede deshacer.
                </p>
              </div>

              <div className="flex items-center justify-end gap-4 p-6 border-t border-neutral-200 bg-neutral-50">
                <button 
                  onClick={() => setIsResetModalOpen(false)}
                  className="px-5 py-2.5 text-xs font-mono uppercase tracking-widest text-neutral-500 hover:text-neutral-900 transition-colors"
                  disabled={isResetting}
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleResetDatabase}
                  disabled={isResetting}
                  className={`px-5 py-2.5 text-white text-xs font-mono uppercase tracking-widest transition-colors ${
                    isResetting ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isResetting ? '[...] Borrando...' : 'Sí, Borrar Todo'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Nuevo Registro */}
        {isModalOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900/50 backdrop-blur-sm">
            <div className="bg-white w-full max-w-2xl border border-neutral-200 shadow-2xl">
              <div className="flex items-center justify-between p-6 border-b border-neutral-200 bg-neutral-50">
                <h3 className="text-sm font-mono uppercase tracking-widest text-neutral-900">Nuevo Registro Operativo</h3>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="text-neutral-500 hover:text-neutral-900 font-mono text-xl leading-none"
                >
                  &times;
                </button>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">Tipo de Operación</label>
                    <select className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors appearance-none">
                      <option>INGRESO (RECEPCIÓN)</option>
                      <option>DESPACHO (SALIDA)</option>
                      <option>TRASLADO INTERNO</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">Placa del Vehículo</label>
                    <input 
                      type="text" 
                      placeholder="EJ: ABC-123" 
                      className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors placeholder:text-neutral-400"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">ID de Guía / Documento</label>
                  <input 
                    type="text" 
                    placeholder="NÚMERO DE REFERENCIA" 
                    className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors placeholder:text-neutral-400"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">Observaciones</label>
                  <textarea 
                    rows={3}
                    placeholder="DETALLES ADICIONALES DE LA CARGA O ESTADO DEL VEHÍCULO..." 
                    className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors placeholder:text-neutral-400 resize-none"
                  ></textarea>
                </div>
              </div>

              <div className="flex items-center justify-end gap-4 p-6 border-t border-neutral-200 bg-neutral-50">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-xs font-mono uppercase tracking-widest text-neutral-500 hover:text-neutral-900 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors"
                >
                  Guardar Registro
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
