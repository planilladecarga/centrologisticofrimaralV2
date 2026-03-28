'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../lib/firebase';
import { collection, onSnapshot, writeBatch, doc, getDocs } from 'firebase/firestore';

export default function LogisticsDashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{text: string, type: 'success' | 'error'} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inventorySearch, setInventorySearch] = useState('');
  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(new Set());

  const toggleContainer = (key: string) => {
    setExpandedContainers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const [despachosInputMode, setDespachosInputMode] = useState<'pdf' | 'manual'>('pdf');
  const [despachosOE, setDespachosOE] = useState('');
  const [despachosCliente, setDespachosCliente] = useState('');
  const [despachosPallets, setDespachosPallets] = useState<Array<{numeroPallet: string; cajas: number; kilos: number; contenedor: string; producto: string; cliente: string; encontrado: boolean}>>([]);
  const [despachosProcessing, setDespachosProcessing] = useState(false);
  const [manualPalletInput, setManualPalletInput] = useState('');
  const pdfInputRef = useRef<HTMLInputElement>(null);

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

  // Función para extraer el lote de la descripción del producto
  const extractLote = (descripcion: string): string => {
    if (!descripcion) return '';
    // Buscar patrones de lote al final: PXXXXX o COTE PXXXXX
    const loteMatch = descripcion.match(/(?:COTE\s*)?(P\d{5,6})\s*$/i);
    if (loteMatch) return loteMatch[1].toUpperCase();
    // También buscar CPTE PXXXXX
    const cpteMatch = descripcion.match(/(?:CPTE\s*)?(P\d{5,6})\s*$/i);
    if (cpteMatch) return cpteMatch[1].toUpperCase();
    return '';
  };

  // Función para limpiar el producto (quitar el lote del final)
  const cleanProducto = (descripcion: string): string => {
    if (!descripcion) return '';
    // Quitar el lote del final
    return descripcion.replace(/\s*(?:COTE|CPTE)?\s*P\d{5,6}\s*$/i, '').trim();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log("Archivo seleccionado:", file?.name);
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      console.log("Leyendo archivo Excel...");
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      
      const mappedData: any[] = [];
      let currentClienteNum = '-';
      let currentClienteName = '-';
      
      // Para el formato de STOCK (el más común)
      // Columnas: Fec Com | Fec Ent | Contenedor | Pallets | Cajas | Kilos | Contenido | empty | Nro Lote | DUA | F. Venc. | L/E
      const COL_CONTENEDOR = 2;
      const COL_PALLETS = 3;
      const COL_CAJAS = 4;
      const COL_KILOS = 5;
      const COL_CONTENIDO = 6;
      const COL_LOTE = 8;

      const parseNumber = (val: any) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        const strVal = String(val).replace(/\./g, '').replace(/,/g, '.');
        const num = parseFloat(strVal);
        return isNaN(num) ? 0 : num;
      };

      // Detectar el formato del archivo
      let isStockFormat = false;
      let foundHeader = false;
      
      for (let i = 0; i < Math.min(20, rawData.length); i++) {
        const row = rawData[i];
        if (!Array.isArray(row)) continue;
        const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
        if (rowStr.includes('contenedor') && rowStr.includes('pallets') && rowStr.includes('cajas') && rowStr.includes('kilos')) {
          isStockFormat = true;
          foundHeader = true;
          console.log("Detectado formato STOCK en fila", i);
          break;
        }
      }
      
      // También detectar formato Planilla de Carga
      const headerRowPlanilla = rawData.find((row: any[]) => {
        const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
        return rowStr.includes('contenedor') && rowStr.includes('bultos') && rowStr.includes('pallet id');
      });
      
      const isPlanillaCarga = !!headerRowPlanilla && !isStockFormat;
      
      if (isStockFormat) {
        // Formato de STOCK: Cliente: xxx, luego datos con Contenedor, Pallets (count), Cajas, Kilos, Contenido, Nro Lote
        for (let i = 0; i < rawData.length; i++) {
          const row = rawData[i];
          if (!Array.isArray(row) || row.length === 0) continue;
          
          const cell0 = String(row[0] || '').trim().toLowerCase();
          const cell1 = String(row[1] || '').trim();
          
          // Detectar cambio de cliente
          if (cell0 === 'cliente:') {
            currentClienteNum = String(row[1] || '-').trim();
            currentClienteName = String(row[2] || '-').trim();
            console.log(`Cliente detectado: ${currentClienteNum} - ${currentClienteName}`);
            continue;
          }
          
          // Saltar filas de metadata y totales
          if (cell0.includes('fecha') || cell0.includes('reporte') || cell0.includes('fec com')) continue;
          if (cell0 === 'nan' || cell0 === '') continue;
          if (cell1.includes('totales')) continue;
          
          // Procesar fila de datos
          const contenedor = String(row[COL_CONTENEDOR] || '').trim();
          const pallets = parseNumber(row[COL_PALLETS]);
          const cajas = parseNumber(row[COL_CAJAS]);
          const kilos = parseNumber(row[COL_KILOS]);
          const contenido = String(row[COL_CONTENIDO] || '').trim();
          const lote = String(row[COL_LOTE] || '').trim();
          
          // Validar que tenga contenedor y datos
          if (contenedor && contenedor.length > 3 && !contenedor.toLowerCase().includes('contenedor')) {
            mappedData.push({
              cliente: currentClienteName,
              numeroCliente: currentClienteNum,
              contenedor: contenedor.toUpperCase(),
              producto: contenido,
              lote: lote,
              pallets: pallets,
              cantidad: cajas,
              kilos: kilos,
            });
          }
        }
      } else if (isPlanillaCarga && headerRowPlanilla) {
        // Formato Planilla de Carga (con Pallet ID individual)
        let colContenedor = headerRowPlanilla.findIndex(c => String(c || '').toLowerCase().includes('contenedor'));
        let colCajas = headerRowPlanilla.findIndex(c => String(c || '').toLowerCase().includes('bultos'));
        let colKilos = headerRowPlanilla.findIndex(c => String(c || '').toLowerCase().includes('peso'));
        let colContenido = headerRowPlanilla.findIndex(c => String(c || '').toLowerCase().includes('descrip'));
        let colNroPallet = headerRowPlanilla.findIndex(c => String(c || '').toLowerCase().includes('pallet') && String(c || '').toLowerCase().includes('id'));
        if (colNroPallet === -1) colNroPallet = headerRowPlanilla.length - 1;
        
        for (let i = 0; i < rawData.length; i++) {
          const row = rawData[i];
          if (!Array.isArray(row) || row.length === 0) continue;
          
          const cell0 = String(row[0] || '').trim().toLowerCase();
          
          // Detectar cambio de cliente
          if (cell0 === 'cliente:') {
            currentClienteNum = String(row[1] || '-').trim();
            currentClienteName = String(row[2] || '-').trim();
            continue;
          }
          
          // Saltar filas no válidas
          if (cell0.includes('planilla') || cell0.includes('totales') || cell0.includes('resumen')) continue;
          if (cell0.includes('fecha') || cell0.includes('reporte') || cell0.includes('cotes')) continue;
          if (cell0.includes('contenedor') || cell0 === '') continue;
          
          const contenedor = String(row[colContenedor] || '').trim();
          const descripcion = colContenido !== -1 ? String(row[colContenido] || '').trim() : '';
          const palletId = colNroPallet !== -1 ? String(row[colNroPallet] || '').trim() : '';
          const bultos = colCajas !== -1 ? parseNumber(row[colCajas]) : 0;
          const peso = colKilos !== -1 ? parseNumber(row[colKilos]) : 0;
          
          // Solo procesar si tiene contenedor válido y pallet ID
          if (contenedor && palletId && /^\d{5,8}$/.test(palletId)) {
            const lote = extractLote(descripcion);
            const productoLimpio = cleanProducto(descripcion);
            
            mappedData.push({
              cliente: currentClienteName,
              numeroCliente: currentClienteNum,
              producto: productoLimpio || descripcion,
              lote: lote,
              pallets: 1,
              cantidad: bultos,
              kilos: peso,
              numeroPallet: palletId,
              contenedor: contenedor.toUpperCase(),
            });
          }
        }
      } else {
        // Formato genérico anterior
        let colPallets = -1;
        let colCajas = -1;
        let colKilos = -1;
        let colContenido = -1;
        let colNroPallet = -1;
        let colContenedor = -1;
        let colLote = -1;
        
        for (let i = 0; i < rawData.length; i++) {
          const row = rawData[i];
          if (!Array.isArray(row) || row.length === 0) continue;
          
          const cell0 = String(row[0] || '').trim().toLowerCase();
          const cell1 = String(row[1] || '').trim().toLowerCase();
          const cell2 = String(row[2] || '').trim().toLowerCase();
          
          if (cell0 === 'cliente:') {
            currentClienteNum = String(row[1] || '-').trim();
            currentClienteName = String(row[2] || '-').trim();
            continue;
          }
          
          if (cell0.includes('totales') || cell1.includes('totales') || cell2.includes('totales')) continue;
          if (cell0.includes('fecha') || cell0.includes('reporte')) continue;
          
          const rowString = row.map(c => String(c || '').toLowerCase()).join(' ');
          
          // Detectar encabezados
          if (rowString.includes('contenedor') && (rowString.includes('pallet') || rowString.includes('cajas'))) {
            colContenedor = row.findIndex(c => String(c || '').toLowerCase().includes('contenedor'));
            colPallets = row.findIndex(c => String(c || '').toLowerCase() === 'pallets' || String(c || '').toLowerCase().includes('pallet'));
            colCajas = row.findIndex(c => String(c || '').toLowerCase().includes('cajas') || String(c || '').toLowerCase().includes('caja'));
            colKilos = row.findIndex(c => String(c || '').toLowerCase().includes('kilo') || String(c || '').toLowerCase().includes('peso'));
            colContenido = row.findIndex(c => String(c || '').toLowerCase().includes('contenido') || String(c || '').toLowerCase().includes('descrip') || String(c || '').toLowerCase().includes('producto'));
            colLote = row.findIndex(c => String(c || '').toLowerCase().includes('lote'));
            continue;
          }
          
          // Procesar datos
          if (colContenedor !== -1) {
            const contenedor = String(row[colContenedor] || '').trim();
            const producto = colContenido !== -1 ? String(row[colContenido] || '').trim() : '';
            const lote = colLote !== -1 ? String(row[colLote] || '').trim() : '';
            const pallets = colPallets !== -1 ? parseNumber(row[colPallets]) : 1;
            const cajas = colCajas !== -1 ? parseNumber(row[colCajas]) : 0;
            const kilos = colKilos !== -1 ? parseNumber(row[colKilos]) : 0;
            
            if (contenedor && contenedor.length > 3) {
              mappedData.push({
                cliente: currentClienteName,
                numeroCliente: currentClienteNum,
                contenedor: contenedor.toUpperCase(),
                producto: producto,
                lote: lote,
                pallets: pallets,
                cantidad: cajas,
                kilos: kilos,
              });
            }
          }
        }
      }

      console.log("Total registros mapeados:", mappedData.length);
      if (mappedData.length > 0) {
        console.log("Ejemplo primer registro:", mappedData[0]);
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
        setToastMessage({ text: `¡Inventario actualizado! ${mappedData.length} registros cargados.`, type: 'success' });

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

  const lookupPalletsInInventory = async (pallets: Array<{numeroPallet: string; cajas: number; kilos: number; contenedor: string; producto: string; cliente: string; encontrado: boolean}>) => {
    const snap = await getDocs(collection(db, 'inventory'));
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
    const enriched = pallets.map(pallet => {
      const found = items.find(item => String(item.numeroPallet || '').trim() === pallet.numeroPallet);
      if (found) {
        return { ...pallet, contenedor: found.contenedor || '', producto: found.producto || '', cliente: found.cliente || '', encontrado: true };
      }
      return pallet;
    });
    setDespachosPallets(enriched);
  };

  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDespachosProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let raw = '';
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        raw += (b >= 32 && b < 127) ? String.fromCharCode(b) : (b === 10 || b === 13 ? '\n' : ' ');
      }
      const oeMatch = raw.match(/ORDEN\s+DE\s+EMBARQUE\s+NRO\.\s*(\d+)/i);
      if (oeMatch) setDespachosOE(oeMatch[1]);
      const palletRegex = /(\d{6})\s+(\d+)\s+([\d.,]+)/g;
      const extractedPallets: Array<{numeroPallet: string; cajas: number; kilos: number; contenedor: string; producto: string; cliente: string; encontrado: boolean}> = [];
      const seen = new Set<string>();
      let match;
      while ((match = palletRegex.exec(raw)) !== null) {
        const numeroPallet = match[1];
        const num = parseInt(numeroPallet);
        if (!seen.has(numeroPallet) && num > 100000 && num < 9999999) {
          seen.add(numeroPallet);
          const kilosRaw = match[3].replace(/\./g, '').replace(',', '.');
          extractedPallets.push({
            numeroPallet,
            cajas: parseInt(match[2]),
            kilos: parseFloat(kilosRaw),
            contenedor: '', producto: '', cliente: '', encontrado: false
          });
        }
      }
      if (extractedPallets.length === 0) {
        setToastMessage({ text: 'No se detectaron pallets. Usá la entrada manual.', type: 'error' });
      } else {
        await lookupPalletsInInventory(extractedPallets);
        setToastMessage({ text: `${extractedPallets.length} pallets detectados desde el PDF.`, type: 'success' });
      }
    } catch (error) {
      console.error('Error al leer PDF:', error);
      setToastMessage({ text: 'Error al leer el PDF. Usá la entrada manual.', type: 'error' });
    } finally {
      setDespachosProcessing(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const processManualPallets = async () => {
    const numbers = manualPalletInput.split(/[\s,;\n\-–]+/).map(s => s.trim()).filter(s => /^\d{5,8}$/.test(s));
    if (numbers.length === 0) { setToastMessage({ text: 'Ingresá al menos un número de pallet válido.', type: 'error' }); return; }
    const pallets = numbers.map(n => ({ numeroPallet: n, cajas: 0, kilos: 0, contenedor: '', producto: '', cliente: '', encontrado: false }));
    setDespachosProcessing(true);
    await lookupPalletsInInventory(pallets);
    setDespachosProcessing(false);
  };

  const exportDespachosExcel = () => {
    if (despachosPallets.length === 0) return;
    const totalCajas = despachosPallets.reduce((s, p) => s + (p.cajas || 0), 0);
    const totalKilos = despachosPallets.reduce((s, p) => s + (p.kilos || 0), 0);
    const wsData: any[][] = [
      [`PLAN DE CARGA — ORDEN DE EMBARQUE NRO. ${despachosOE}`],
      [`Cliente: ${despachosCliente}`, '', `Fecha: ${new Date().toLocaleDateString('es-ES')}`],
      [],
      ['Nro. Pallet', 'Cajas', 'Kilos', 'Contenedor', 'Producto', 'Cliente', 'Estado'],
      ...despachosPallets.map(p => [
        p.numeroPallet,
        p.cajas || '',
        p.kilos ? p.kilos.toFixed(2) : '',
        p.contenedor || 'SIN ASIGNAR',
        p.producto || '',
        p.cliente || despachosCliente,
        p.encontrado ? 'EN INVENTARIO' : 'NO ENCONTRADO'
      ]),
      [],
      ['TOTALES', totalCajas, totalKilos.toFixed(2), '', '', '', `${despachosPallets.length} pallets`]
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 15 }, { wch: 8 }, { wch: 12 }, { wch: 18 }, { wch: 30 }, { wch: 20 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plan de Carga');
    XLSX.writeFile(wb, `plan_de_carga_OE${despachosOE || 'nuevo'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
        {activeTab === 'dashboard' && (() => {
          const totalPallets = inventoryData.reduce((sum, item) => sum + (Number(item.pallets) || 0), 0);
          const totalKilos = inventoryData.reduce((sum, item) => sum + (Number(item.kilos) || 0), 0);
          const totalToneladas = (totalKilos / 1000).toFixed(1);
          const totalClientes = new Set(inventoryData.map(item => item.numeroCliente).filter(Boolean)).size;
          const totalProductos = inventoryData.length;
          const recentItems = inventoryData.slice(0, 5);

          return (
          <div className="p-8 flex-1 overflow-auto">
            <div className="flex justify-between items-end mb-8 border-b border-neutral-200 pb-6">
              <div>
                <h2 className="text-2xl font-light tracking-tight text-neutral-900 uppercase">Resumen Operativo</h2>
                <p className="text-xs font-mono text-neutral-500 mt-2 uppercase tracking-widest">
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
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-4">Total Pallets en Stock</p>
                <h3 className="text-5xl font-light tracking-tighter text-neutral-900">{totalPallets}</h3>
                <div className="mt-6 text-[10px] font-mono text-neutral-500 uppercase tracking-widest border-t border-neutral-100 pt-4">
                  <span>{totalProductos} productos registrados</span>
                </div>
              </div>

              <div className="bg-white p-8">
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-4">Carga en Bodega (Ton)</p>
                <h3 className="text-5xl font-light tracking-tighter text-neutral-900">{totalToneladas}</h3>
                <div className="mt-6 text-[10px] font-mono text-neutral-500 uppercase tracking-widest border-t border-neutral-100 pt-4">
                  <span>{totalKilos.toLocaleString('es-CL')} kg totales</span>
                </div>
              </div>

              <div className="bg-white p-8">
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-4">Clientes en Bodega</p>
                <h3 className="text-5xl font-light tracking-tighter text-neutral-900">{String(totalClientes).padStart(2, '0')}</h3>
                <div className="mt-6 text-[10px] font-mono text-neutral-500 uppercase tracking-widest border-t border-neutral-100 pt-4">
                  <span>{totalProductos} líneas de inventario</span>
                </div>
              </div>
            </div>

            {/* Recent Inventory */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900">Últimos Registros de Inventario</h3>
                <button onClick={() => setActiveTab('inventory')} className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 hover:text-neutral-900 underline underline-offset-4">
                  Ver Todo
                </button>
              </div>
              
              <div className="border border-neutral-200 bg-white">
                <div className="grid grid-cols-4 border-b border-neutral-200 bg-neutral-50 p-4 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                  <div>Cliente</div>
                  <div className="col-span-2">Producto</div>
                  <div className="text-right">Pallets / Kilos</div>
                </div>
                
                <div className="divide-y divide-neutral-100">
                  {inventoryData.length === 0 ? (
                    <div className="p-8 text-center text-xs font-mono uppercase tracking-widest text-neutral-400">
                      No hay datos — carga un archivo Excel en la sección Inventario
                    </div>
                  ) : (
                    recentItems.map((item, i) => (
                      <div key={i} className="grid grid-cols-4 p-4 text-xs font-mono uppercase tracking-wider text-neutral-900 hover:bg-neutral-50 transition-colors cursor-pointer">
                        <div className="text-neutral-500 truncate pr-2" title={item.cliente}>{item.cliente || '-'}</div>
                        <div className="col-span-2 truncate pr-4" title={item.producto}>{item.producto}</div>
                        <div className="text-right">
                          <div>{item.pallets} plt</div>
                          <div className="text-[10px] text-neutral-500 mt-1">{item.kilos} kg</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
          );
        })()}

        {/* Inventory Content */}
        {activeTab === 'inventory' && (
          <div className="p-8 flex-1 overflow-auto flex flex-col">
            <div className="flex justify-between items-end mb-6 border-b border-neutral-200 pb-6">
              <div>
                <h2 className="text-2xl font-light tracking-tight text-neutral-900 uppercase">Control de Inventario</h2>
                <p className="text-xs font-mono text-neutral-500 mt-2 uppercase tracking-widest">
                  Total Registros: {inventoryData.length}
                </p>
              </div>
              <div>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} ref={fileInputRef} className="hidden" id="excel-upload" disabled={isUploading} />
                <label htmlFor="excel-upload" className={`px-5 py-2.5 text-xs font-mono uppercase tracking-widest transition-colors inline-block ${isUploading ? 'bg-neutral-400 text-white cursor-not-allowed' : 'bg-neutral-900 text-white hover:bg-neutral-800 cursor-pointer'}`}>
                  {isUploading ? '[...] Subiendo a la Nube...' : '[+] Cargar Excel'}
                </label>
              </div>
            </div>

            {/* Buscador */}
            <div className="mb-6">
              <input
                type="text"
                value={inventorySearch}
                onChange={e => { setInventorySearch(e.target.value); setExpandedContainers(new Set()); }}
                placeholder="Buscar por cliente, contenedor, lote o número de cliente..."
                className="w-full p-3 text-xs font-mono bg-white border border-neutral-200 focus:border-neutral-900 outline-none transition-colors uppercase tracking-widest"
              />
            </div>

            {inventoryData.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center">
                <p className="text-sm font-mono uppercase tracking-widest text-neutral-500 mb-4">No hay datos en el inventario</p>
                <label htmlFor="excel-upload" className="text-xs font-mono uppercase tracking-widest text-neutral-900 underline underline-offset-4 cursor-pointer hover:text-neutral-600">
                  Cargar archivo .xlsx para comenzar
                </label>
              </div>
            ) : (() => {
              const searchTerm = inventorySearch.trim().toLowerCase();
              const filtered = searchTerm
                ? inventoryData.filter(item => {
                    const clienteLower = (item.cliente || '').toLowerCase();
                    const numCliente = String(item.numeroCliente || '');
                    const numClienteSinPunto = numCliente.replace(/\./g, '');
                    const contenedorLower = (item.contenedor || '').toLowerCase();
                    const loteLower = (item.lote || '').toLowerCase();
                    return clienteLower.includes(searchTerm) ||
                      numCliente.includes(searchTerm) ||
                      numClienteSinPunto.includes(searchTerm) ||
                      contenedorLower.includes(searchTerm) ||
                      loteLower.includes(searchTerm);
                  })
                : inventoryData;

              // Vista agrupada por contenedor (SIEMPRE)
              const sorted = [...filtered].sort((a, b) => {
                const ca = (a.contenedor || 'SIN CONTENEDOR').toUpperCase();
                const cb = (b.contenedor || 'SIN CONTENEDOR').toUpperCase();
                return ca.localeCompare(cb);
              });

              const grouped: Record<string, typeof sorted> = {};
              for (const item of sorted) {
                const key = (item.contenedor || 'SIN CONTENEDOR').toUpperCase().trim();
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(item);
              }

              const uniqueClientes = [...new Set(filtered.map(i => i.cliente).filter(Boolean))];
              const totalPallets = filtered.reduce((s, i) => s + (Number(i.pallets) || 0), 0);
              const totalCajas = filtered.reduce((s, i) => s + (Number(i.cantidad) || 0), 0);
              const totalKilos = filtered.reduce((s, i) => s + (Number(i.kilos) || 0), 0);
              const isSingleClient = searchTerm && uniqueClientes.length === 1;

              return (
                <div className="flex-1 overflow-auto flex flex-col gap-0">
                  {/* Resumen */}
                  <div className="border border-neutral-200 bg-neutral-50 p-4 mb-4 grid grid-cols-5 gap-4">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                        {isSingleClient ? 'Cliente' : 'Clientes en vista'}
                      </div>
                      <div className="text-sm font-mono font-medium uppercase mt-1 truncate">
                        {isSingleClient ? uniqueClientes[0] : `${uniqueClientes.length} clientes`}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                        Contenedores
                      </div>
                      <div className="text-sm font-mono font-medium mt-1">
                        {Object.keys(grouped).length}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Total Pallets</div>
                      <div className="text-sm font-mono font-medium mt-1">{totalPallets.toLocaleString('es-AR')}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Total Cajas</div>
                      <div className="text-sm font-mono font-medium mt-1">{totalCajas.toLocaleString('es-AR')}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Total Kilos</div>
                      <div className="text-sm font-mono font-medium mt-1">{totalKilos.toLocaleString('es-AR')} KG</div>
                    </div>
                  </div>

                  {/* Contenedores */}
                  {Object.entries(grouped).map(([contenedor, items]) => {
                    const isOpen = expandedContainers.has(contenedor);
                    const pTotal = items.reduce((s, i) => s + (Number(i.pallets) || 0), 0);
                    const cTotal = items.reduce((s, i) => s + (Number(i.cantidad) || 0), 0);
                    const kTotal = items.reduce((s, i) => s + (Number(i.kilos) || 0), 0);

                    // Agrupar por lote dentro del contenedor
                    const byLote: Record<string, typeof items> = {};
                    for (const item of items) {
                      const l = (item.lote || 'SIN LOTE').toUpperCase().trim();
                      if (!byLote[l]) byLote[l] = [];
                      byLote[l].push(item);
                    }

                    return (
                      <div key={contenedor} className="border border-neutral-200 bg-white mb-2">
                        {/* Header del contenedor */}
                        <button
                          onClick={() => toggleContainer(contenedor)}
                          className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-[10px] font-mono text-neutral-400">{isOpen ? '▼' : '▶'}</span>
                            <span className="text-xs font-mono font-medium uppercase tracking-widest text-neutral-900">{contenedor}</span>
                            <span className="text-[10px] font-mono text-neutral-500 bg-neutral-100 px-2 py-0.5">{pTotal} pallets</span>
                          </div>
                          <div className="flex gap-6 text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                            <span>{cTotal.toLocaleString('es-AR')} cajas</span>
                            <span>{kTotal.toLocaleString('es-AR')} kg</span>
                          </div>
                        </button>

                        {/* Detalle expandido */}
                        {isOpen && (
                          <div className="border-t border-neutral-100">
                            {/* Header de columnas */}
                            <div className="grid grid-cols-12 px-4 py-2 bg-neutral-50 text-[10px] font-mono uppercase tracking-widest text-neutral-400 border-b border-neutral-100">
                              <div className="col-span-1">Pallets</div>
                              <div className="col-span-6">Producto</div>
                              <div className="col-span-2">Lote</div>
                              <div className="col-span-2 text-right">Cajas</div>
                              <div className="col-span-1 text-right">Kilos</div>
                            </div>

                            {/* Filas por lote */}
                            {Object.entries(byLote).map(([lote, itemsLote], li) => (
                              <div key={lote}>
                                {li > 0 && <div className="border-t border-neutral-200 mx-4" />}
                                {/* Items del lote */}
                                {itemsLote.map((item, j) => (
                                  <div key={j} className="grid grid-cols-12 px-4 py-2.5 text-xs font-mono text-neutral-700 hover:bg-neutral-50 border-b border-neutral-50 last:border-0 transition-colors">
                                    <div className="col-span-1 text-neutral-500">{item.pallets || '—'}</div>
                                    <div className="col-span-6 text-neutral-600 uppercase tracking-wider truncate" title={item.producto}>{item.producto || '—'}</div>
                                    <div className="col-span-2 text-neutral-400 text-[10px] truncate" title={item.lote}>{item.lote || '—'}</div>
                                    <div className="col-span-2 text-right">{item.cantidad?.toLocaleString('es-AR') || '—'}</div>
                                    <div className="col-span-1 text-right">{Number(item.kilos || 0).toLocaleString('es-AR')}</div>
                                  </div>
                                ))}
                                {/* Subtotal por lote */}
                                <div className="grid grid-cols-12 px-4 py-2 bg-neutral-50 border-t border-neutral-200 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                                  <div className="col-span-7 font-medium">Subtotal Lote {lote}</div>
                                  <div className="col-span-2"></div>
                                  <div className="col-span-2 text-right font-medium">{itemsLote.reduce((s, i) => s + (Number(i.cantidad) || 0), 0).toLocaleString('es-AR')}</div>
                                  <div className="col-span-1 text-right font-medium">{itemsLote.reduce((s, i) => s + (Number(i.kilos) || 0), 0).toLocaleString('es-AR')}</div>
                                </div>
                              </div>
                            ))}

                            {/* Total del contenedor */}
                            <div className="grid grid-cols-12 px-4 py-3 bg-neutral-900 text-[10px] font-mono uppercase tracking-widest text-white">
                              <div className="col-span-7 font-medium">Total {contenedor}</div>
                              <div className="col-span-2"></div>
                              <div className="col-span-2 text-right font-medium">{cTotal.toLocaleString('es-AR')}</div>
                              <div className="col-span-1 text-right font-medium">{kTotal.toLocaleString('es-AR')}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* Despachos Content */}
        {activeTab === 'despachos' && (
          <div className="p-8 flex-1 overflow-auto flex flex-col">
            <div className="flex justify-between items-end mb-8 border-b border-neutral-200 pb-6">
              <div>
                <h2 className="text-2xl font-light tracking-tight text-neutral-900 uppercase">Gestión de Despachos</h2>
                <p className="text-xs font-mono text-neutral-500 mt-2 uppercase tracking-widest">
                  Orden de Embarque → Búsqueda de Pallets → Plan de Carga
                </p>
              </div>
              {despachosPallets.length > 0 && (
                <button onClick={exportDespachosExcel} className="px-5 py-2.5 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors">
                  [↓] Exportar Plan de Carga Excel
                </button>
              )}
            </div>

            {/* Datos de la Orden */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1">Nro. Orden de Embarque</label>
                <input type="text" value={despachosOE} onChange={e => setDespachosOE(e.target.value)} placeholder="Ej: 26416"
                  className="w-full p-3 text-xs font-mono bg-white border border-neutral-200 focus:border-neutral-900 outline-none transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1">Cliente</label>
                <input type="text" value={despachosCliente} onChange={e => setDespachosCliente(e.target.value)} placeholder="Ej: San Jacinto"
                  className="w-full p-3 text-xs font-mono bg-white border border-neutral-200 focus:border-neutral-900 outline-none transition-colors" />
              </div>
            </div>

            {/* Selector de modo */}
            <div className="flex gap-0 mb-6 border border-neutral-200 bg-white w-fit">
              <button onClick={() => setDespachosInputMode('pdf')}
                className={`px-6 py-2.5 text-xs font-mono uppercase tracking-widest transition-colors ${despachosInputMode === 'pdf' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'}`}>
                [PDF] Subir Orden de Embarque
              </button>
              <button onClick={() => setDespachosInputMode('manual')}
                className={`px-6 py-2.5 text-xs font-mono uppercase tracking-widest transition-colors ${despachosInputMode === 'manual' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'}`}>
                [Manual] Ingresar Pallets
              </button>
            </div>

            {/* Input PDF */}
            {despachosInputMode === 'pdf' && (
              <div className="mb-6">
                <input type="file" accept=".pdf" onChange={handlePDFUpload} ref={pdfInputRef} className="hidden" id="pdf-upload" disabled={despachosProcessing} />
                <label htmlFor="pdf-upload" className={`flex flex-col items-center justify-center border-2 border-dashed p-12 cursor-pointer transition-colors ${despachosProcessing ? 'border-neutral-200 bg-neutral-50 cursor-not-allowed' : 'border-neutral-300 hover:border-neutral-900 bg-white hover:bg-neutral-50'}`}>
                  {despachosProcessing ? (
                    <p className="text-xs font-mono uppercase tracking-widest text-neutral-500">Procesando PDF...</p>
                  ) : (
                    <>
                      <p className="text-xs font-mono uppercase tracking-widest text-neutral-900 mb-2">Arrastrar PDF aquí o hacer clic</p>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">Orden de Embarque — hoja 2 con lista de pallets</p>
                    </>
                  )}
                </label>
              </div>
            )}

            {/* Input Manual */}
            {despachosInputMode === 'manual' && (
              <div className="mb-6 flex gap-4">
                <div className="flex-1">
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1">
                    Números de Pallet (separados por coma, espacio o línea)
                  </label>
                  <textarea value={manualPalletInput} onChange={e => setManualPalletInput(e.target.value)} rows={4}
                    placeholder="292491, 292528, 292848&#10;293144 293221 293288&#10;..." 
                    className="w-full p-3 text-xs font-mono bg-white border border-neutral-200 focus:border-neutral-900 outline-none transition-colors resize-none" />
                </div>
                <div className="flex items-end">
                  <button onClick={processManualPallets} disabled={despachosProcessing || !manualPalletInput.trim()}
                    className="px-5 py-3 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors disabled:bg-neutral-300 disabled:cursor-not-allowed">
                    {despachosProcessing ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
              </div>
            )}

            {/* Resultados */}
            {despachosPallets.length > 0 && (
              <div>
                {/* Resumen */}
                <div className="grid grid-cols-3 gap-px bg-neutral-200 border border-neutral-200 mb-6">
                  <div className="bg-white p-4">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Total Pallets</p>
                    <p className="text-2xl font-light mt-1">{despachosPallets.length}</p>
                  </div>
                  <div className="bg-white p-4">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Total Cajas</p>
                    <p className="text-2xl font-light mt-1">{despachosPallets.reduce((s, p) => s + (p.cajas || 0), 0).toLocaleString('es-CL')}</p>
                  </div>
                  <div className="bg-white p-4">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Total Kilos</p>
                    <p className="text-2xl font-light mt-1">{despachosPallets.reduce((s, p) => s + (p.kilos || 0), 0).toLocaleString('es-CL', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                  </div>
                </div>

                {/* Tabla de Pallets */}
                <div className="border border-neutral-200 bg-white">
                  <div className="grid grid-cols-6 border-b border-neutral-200 bg-neutral-50 p-4 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                    <div>Nro. Pallet</div>
                    <div className="text-right">Cajas</div>
                    <div className="text-right">Kilos</div>
                    <div>Contenedor</div>
                    <div className="col-span-1">Producto</div>
                    <div className="text-center">Estado</div>
                  </div>
                  <div className="divide-y divide-neutral-100 max-h-96 overflow-auto">
                    {despachosPallets.map((pallet, i) => (
                      <div key={i} className="grid grid-cols-6 p-4 text-xs font-mono uppercase tracking-wider text-neutral-900 hover:bg-neutral-50 transition-colors">
                        <div className="font-medium">{pallet.numeroPallet}</div>
                        <div className="text-right">{pallet.cajas || '—'}</div>
                        <div className="text-right text-neutral-600">{pallet.kilos ? pallet.kilos.toFixed(2) : '—'}</div>
                        <div className="text-neutral-500">{pallet.contenedor || '—'}</div>
                        <div className="text-neutral-500 truncate pr-2" title={pallet.producto}>{pallet.producto || '—'}</div>
                        <div className="text-center">
                          <span className={`px-2 py-1 text-[10px] ${pallet.encontrado ? 'bg-green-100 text-green-800' : 'border border-neutral-300 text-neutral-400'}`}>
                            {pallet.encontrado ? 'EN STOCK' : 'NO ENCONTRADO'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex justify-between items-center">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                    {despachosPallets.filter(p => p.encontrado).length} de {despachosPallets.length} encontrados en inventario
                  </p>
                  <button onClick={() => { setDespachosPallets([]); setManualPalletInput(''); setDespachosOE(''); }}
                    className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 hover:text-neutral-900 underline underline-offset-4">
                    Limpiar y nueva búsqueda
                  </button>
                </div>
              </div>
            )}
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
