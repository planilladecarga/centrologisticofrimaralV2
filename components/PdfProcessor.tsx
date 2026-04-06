'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx-js-style';
import { Upload, FileText, Search, AlertCircle, CheckCircle, Box, FileSpreadsheet, ChevronDown, ChevronRight, Package } from 'lucide-react';

declare global {
  interface Window {
    pdfjsLib: any;
  }
}

interface InventoryItem {
  id?: string;
  numeroCliente: string;
  cliente: string;
  producto: string;
  pallets: number;
  cantidad: number;
  kilos: number;
}

interface PdfProcessorProps {
  inventoryData?: InventoryItem[];
}

interface ContainerGroup {
  cliente: string;
  numeroCliente: string;
  items: InventoryItem[];
  totalPallets: number;
  totalCantidad: number;
  totalKilos: number;
}

export default function PdfProcessor({ inventoryData = [] }: PdfProcessorProps) {
  const [extractedIds, setExtractedIds] = useState<string[]>([]);
  const [manualIds, setManualIds] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const [results, setResults] = useState<{
    foundItems: InventoryItem[];
    missingIds: string[];
    matchedIds: { id: string; matchedField: string }[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.pdfjsLib) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.async = true;
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      };
      document.body.appendChild(script);
    }
  }, []);

  // Group found items by container (cliente + numeroCliente)
  const containerGroups = useMemo<ContainerGroup[]>(() => {
    if (!results || results.foundItems.length === 0) return [];

    const groupMap = new Map<string, ContainerGroup>();
    const groupKey = (item: InventoryItem) => `${item.cliente}|||${item.numeroCliente}`;

    results.foundItems.forEach(item => {
      const key = groupKey(item);
      if (groupMap.has(key)) {
        const group = groupMap.get(key)!;
        group.items.push(item);
        group.totalPallets += Number(item.pallets) || 0;
        group.totalCantidad += Number(item.cantidad) || 0;
        group.totalKilos += Number(item.kilos) || 0;
      } else {
        groupMap.set(key, {
          cliente: item.cliente,
          numeroCliente: item.numeroCliente,
          items: [item],
          totalPallets: Number(item.pallets) || 0,
          totalCantidad: Number(item.cantidad) || 0,
          totalKilos: Number(item.kilos) || 0,
        });
      }
    });

    return Array.from(groupMap.values());
  }, [results]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Check if a string looks like a year (4 digits between 2000-2099)
  const isLikelyYear = (str: string) => {
    const cleaned = str.replace(/[^0-9]/g, '');
    if (cleaned.length === 4 && /^[2][0-9]{3}$/.test(cleaned)) {
      const year = parseInt(cleaned);
      return year >= 2000 && year <= 2099;
    }
    return false;
  };

  const fuzzyMatch = (searchId: string, targetId: string, field?: string): boolean => {
    if (!searchId || !targetId) return false;
    const s = String(searchId).trim();
    const t = String(targetId).trim();
    if (!s || !t) return false;

    // Exact match
    if (s.toLowerCase() === t.toLowerCase()) return true;

    // Strip leading zeros and compare
    const sNoZeros = s.replace(/^0+/, '');
    const tNoZeros = t.replace(/^0+/, '');
    if (sNoZeros && sNoZeros.toLowerCase() === tNoZeros.toLowerCase()) return true;

    // For numeric-only search terms: only match if it's not a year OR the target is also numeric-only
    const sIsNumeric = /^\d+$/.test(sNoZeros);
    if (sIsNumeric && isLikelyYear(s)) {
      // Year-like searches should only match numeroCliente fields that are the exact year
      // NOT match inside product descriptions or client names
      if (field === 'numeroCliente' && tNoZeros === sNoZeros) return true;
      return false; // Don't match years against other fields
    }

    // For short numeric searches (< 5 digits): prefer exact or near-exact matches only
    if (sIsNumeric && sNoZeros.length < 5) {
      if (tNoZeros === sNoZeros) return true;
      // Only do contains if the target is a pure number (numeroCliente, pallets, etc.)
      if (/^\d+$/.test(tNoZeros) && tNoZeros.includes(sNoZeros)) return true;
      // For non-numeric targets, don't do substring matching on short numbers
      return false;
    }

    // For longer alphanumeric searches (>= 5 chars): allow substring matching on all fields
    const sLow = s.toLowerCase();
    const tLow = t.toLowerCase();
    if (sLow.length >= 5) {
      if (tLow.includes(sLow) || sLow.includes(tLow)) return true;
      // Strip non-alphanumeric and compare
      const sStripped = s.replace(/[^a-z0-9]/gi, '');
      const tStripped = t.replace(/[^a-z0-9]/gi, '');
      if (sStripped.length >= 5 && tStripped.length >= 5) {
        if (tStripped.includes(sStripped) || sStripped.includes(tStripped)) return true;
      }
    }

    return false;
  };

  const extractTextFromPdf = async (file: File) => {
    if (!window.pdfjsLib) {
      throw new Error("PDF.js no ha cargado todavía. Por favor, espera un segundo.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + ' ';
    }
    return fullText;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    try {
      let allText = '';
      for (let i = 0; i < files.length; i++) {
        const text = await extractTextFromPdf(files[i]);
        allText += text + ' ';
      }
      // Extract alphanumeric tokens that have at least 4 characters and some digits
      const regex = /\b[A-Za-z0-9]*\d{4,}[A-Za-z0-9]*\b/g;
      const matches = allText.match(regex) || [];
      const uniqueIds = Array.from(new Set(matches)).filter(id => !isLikelyYear(id));
      setExtractedIds(prev => Array.from(new Set([...prev, ...uniqueIds])));
    } catch (error) {
      console.error("Error processing PDFs:", error);
      alert("Error al procesar los archivos PDF.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const processData = () => {
    const manualIdsList = manualIds.split(/[\s,;]+/).filter(id => id.trim().length > 0);
    const allSearchIds = Array.from(new Set([...extractedIds, ...manualIdsList]));

    if (allSearchIds.length === 0) {
      alert("No hay IDs para buscar.");
      return;
    }

    if (inventoryData.length === 0) {
      alert("No hay datos de inventario. Carga el inventario primero en la sección 'Inventario'.");
      return;
    }

    const foundItems: InventoryItem[] = [];
    const missingIds: string[] = [];
    const matchedIds: { id: string; matchedField: string }[] = [];
    const foundKeys = new Set<string>();

    allSearchIds.forEach(searchId => {
      let matchFound = false;

      // Priority 1: Match against numeroCliente (lot number) — most important
      for (const item of inventoryData) {
        if (fuzzyMatch(searchId, item.numeroCliente, 'numeroCliente')) {
          const key = item.id || `${item.numeroCliente}-${item.producto}`;
          if (!foundKeys.has(key)) {
            foundKeys.add(key);
            foundItems.push(item);
            matchedIds.push({ id: searchId, matchedField: 'numeroCliente' });
          }
          matchFound = true;
          break;
        }
      }
      if (matchFound) return;

      // Priority 2: Match against cliente name
      for (const item of inventoryData) {
        if (fuzzyMatch(searchId, item.cliente, 'cliente')) {
          const key = item.id || `${item.numeroCliente}-${item.producto}`;
          if (!foundKeys.has(key)) {
            foundKeys.add(key);
            foundItems.push(item);
            matchedIds.push({ id: searchId, matchedField: 'cliente' });
          }
          matchFound = true;
          break;
        }
      }
      if (matchFound) return;

      // Priority 3: Match against producto (longer strings, more context)
      for (const item of inventoryData) {
        if (fuzzyMatch(searchId, item.producto, 'producto')) {
          const key = item.id || `${item.numeroCliente}-${item.producto}`;
          if (!foundKeys.has(key)) {
            foundKeys.add(key);
            foundItems.push(item);
            matchedIds.push({ id: searchId, matchedField: 'producto' });
          }
          matchFound = true;
          break;
        }
      }
      if (matchFound) return;

      // Priority 4: Match against pallets number (strict numeric only)
      for (const item of inventoryData) {
        if (fuzzyMatch(searchId, String(item.pallets), 'pallets')) {
          const key = item.id || `${item.numeroCliente}-${item.producto}`;
          if (!foundKeys.has(key)) {
            foundKeys.add(key);
            foundItems.push(item);
            matchedIds.push({ id: searchId, matchedField: 'pallets' });
          }
          matchFound = true;
          break;
        }
      }

      if (!matchFound) {
        missingIds.push(searchId);
      }
    });

    setResults({ foundItems, missingIds, matchedIds });

    // Auto-expand all groups when results come in
    if (foundItems.length > 0) {
      const allKeys = new Set<string>();
      foundItems.forEach(item => allKeys.add(`${item.cliente}|||${item.numeroCliente}`));
      setExpandedGroups(allKeys);
    }
  };

  const exportToExcel = () => {
    if (!results || containerGroups.length === 0) return;

    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];
    const highlightRows: number[] = [];
    let currentRow = 0;

    // Title
    wsData.push(["PLANILLA DE CARGA — DESPACHOS POR CONTENEDOR", "", "", "", "", ""]);
    highlightRows.push(currentRow);
    currentRow++;
    wsData.push([]);
    currentRow++;

    containerGroups.forEach((group, groupIdx) => {
      // Container header
      wsData.push([`CONTENEDOR ${groupIdx + 1}: ${group.cliente}`, `LOTE: ${group.numeroCliente}`, '', '', `Total Pallets: ${group.totalPallets}`, `${group.totalKilos.toFixed(1)} KG`]);
      highlightRows.push(currentRow);
      currentRow++;

      // Column headers
      wsData.push(['Producto', 'Pallets', 'Cantidad', 'Kilos', '', '']);
      const headerRow = currentRow;
      highlightRows.push(currentRow);
      currentRow++;

      // Items
      group.items.forEach(item => {
        wsData.push([item.producto, item.pallets, item.cantidad, `${item.kilos} KG`, '', '']);
        currentRow++;
      });

      // Subtotal
      wsData.push(['SUBTOTAL', group.totalPallets, group.totalCantidad, `${group.totalKilos.toFixed(1)} KG`, '', '']);
      currentRow++;
      wsData.push([]);
      currentRow++;
    });

    // Summary
    const grandTotalPallets = containerGroups.reduce((s, g) => s + g.totalPallets, 0);
    const grandTotalKilos = containerGroups.reduce((s, g) => s + g.totalKilos, 0);
    wsData.push(['RESUMEN TOTAL', `${containerGroups.length} Contenedores`, `${grandTotalPallets} Pallets`, `${grandTotalKilos.toFixed(1)} KG`, '', '']);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    ws['A1'].s = { font: { bold: true, sz: 14, color: { rgb: "1A1A1A" } }, alignment: { horizontal: "center", vertical: "center" } };

    const containerHeaderStyle = {
      fill: { fgColor: { rgb: "1A1A1A" } },
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      border: { top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } }, left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } } },
    };

    const dataBorderStyle = {
      top: { style: "thin", color: { rgb: "CCCCCC" } }, bottom: { style: "thin", color: { rgb: "CCCCCC" } },
      left: { style: "thin", color: { rgb: "CCCCCC" } }, right: { style: "thin", color: { rgb: "CCCCCC" } }
    };

    for (let r = 0; r < wsData.length; r++) {
      for (let c = 0; c < 6; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };

        if (highlightRows.includes(r)) {
          // Check if it's a container header (even index in highlightRows after title)
          ws[cellRef].s = { ...containerHeaderStyle };
        } else {
          ws[cellRef].s = { border: dataBorderStyle };
        }
      }
    }

    ws['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "Planilla de Carga");

    // Missing IDs sheet
    if (results.missingIds.length > 0) {
      const wsMissingData = [['IDs No Encontrados'], [''], ['ID', 'Observación']];
      results.missingIds.forEach(id => {
        const isYear = isLikelyYear(id);
        wsMissingData.push([id, isYear ? '(parece ser un año, no un lote)' : '']);
      });
      const wsMissing = XLSX.utils.aoa_to_sheet(wsMissingData);
      wsMissing['A1'].s = { font: { bold: true, sz: 12 } };
      wsMissing['!cols'] = [{ wch: 30 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, wsMissing, "No Encontrados");
    }

    XLSX.writeFile(wb, "Planilla_de_Carga.xlsx");
  };

  const clearResults = () => {
    setResults(null);
    setExtractedIds([]);
    setManualIds('');
    setExpandedGroups(new Set());
  };

  return (
    <div className="flex flex-col h-full bg-white border border-neutral-200">
      <div className="p-6 border-b border-neutral-200 bg-neutral-50 flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-lg font-mono uppercase tracking-widest text-neutral-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-neutral-600" />
            Despachos — Búsqueda por Contenedor
          </h2>
          <p className="text-xs font-sans text-neutral-500 mt-1">
            Busca lotes/pallets en el inventario. Resultados agrupados por contenedor. Inventario: {inventoryData.length} ítems.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {results && (
            <>
              <button onClick={clearResults}
                className="px-4 py-2 text-xs font-mono uppercase tracking-widest border border-neutral-300 hover:border-neutral-900 transition-colors">
                Limpiar
              </button>
              <button onClick={exportToExcel}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-xs font-mono uppercase tracking-widest hover:bg-green-700 transition-colors">
                <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
        {inventoryData.length === 0 && (
          <div className="border border-amber-200 bg-amber-50 p-4 text-xs font-mono text-amber-800 uppercase tracking-widest">
            ⚠ No hay inventario cargado. Ve a la sección &quot;02. Inventario&quot; y carga un archivo Excel primero.
          </div>
        )}

        {!results && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="border border-neutral-200 p-6 bg-white">
              <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4" /> 1. Cargar PDFs (opcional)
              </h3>
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-neutral-300 border-dashed bg-neutral-50 hover:bg-neutral-100 cursor-pointer transition-colors">
                  <div className="flex flex-col items-center justify-center pt-4 pb-4">
                    <Upload className="w-6 h-6 text-neutral-400 mb-2" />
                    <p className="text-xs font-mono text-neutral-500 uppercase tracking-widest">
                      {isProcessing ? 'Procesando...' : 'Click para subir PDFs'}
                    </p>
                  </div>
                  <input type="file" className="hidden" multiple accept=".pdf" onChange={handleFileUpload}
                    ref={fileInputRef} disabled={isProcessing} />
                </label>
              </div>
              {extractedIds.length > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-green-600">
                    {extractedIds.length} IDs extraídos de PDFs
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1 max-h-24 overflow-y-auto p-2 border border-neutral-100 bg-neutral-50">
                    {extractedIds.map((id, i) => (
                      <span key={i} className="text-[10px] font-mono bg-white border border-neutral-200 px-1.5 py-0.5">{id}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border border-neutral-200 p-6 bg-white flex flex-col">
              <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 mb-4 flex items-center gap-2">
                <Search className="w-4 h-4" /> 2. Buscar Lotes / Pallets
              </h3>
              <textarea
                className="w-full flex-1 p-3 text-xs font-mono bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors resize-none mb-3"
                placeholder={"Ingresa números de lote/pallet separados por comas, espacios o punto y coma.\n\nEjemplo: 259519, 259520, ABC-123\n\nNota: Los años (ej: 2025) se excluyen automáticamente de la búsqueda."}
                value={manualIds} onChange={(e) => setManualIds(e.target.value)} />
              <button onClick={processData}
                disabled={isProcessing || (extractedIds.length === 0 && manualIds.trim() === '') || inventoryData.length === 0}
                className="w-full py-3 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors disabled:bg-neutral-300 disabled:cursor-not-allowed">
                Buscar en Inventario
              </button>
            </div>
          </div>
        )}

        {results && (
          <div className="flex flex-col gap-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-green-200 bg-green-50 p-4 flex items-center gap-4">
                <div className="p-3 bg-green-100 text-green-700 rounded-full"><CheckCircle className="w-6 h-6" /></div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-green-700">Ítems Encontrados</p>
                  <p className="text-2xl font-light text-green-900">{results.foundItems.length}</p>
                </div>
              </div>
              <div className="border border-blue-200 bg-blue-50 p-4 flex items-center gap-4">
                <div className="p-3 bg-blue-100 text-blue-700 rounded-full"><Box className="w-6 h-6" /></div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-blue-700">Contenedores</p>
                  <p className="text-2xl font-light text-blue-900">{containerGroups.length}</p>
                </div>
              </div>
              <div className="border border-red-200 bg-red-50 p-4 flex items-center gap-4">
                <div className="p-3 bg-red-100 text-red-700 rounded-full"><AlertCircle className="w-6 h-6" /></div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-red-700">No Encontrados</p>
                  <p className="text-2xl font-light text-red-900">{results.missingIds.length}</p>
                </div>
              </div>
            </div>

            {/* Missing IDs */}
            {results.missingIds.length > 0 && (
              <div className="border border-red-200 bg-red-50 p-4">
                <h4 className="text-xs font-mono uppercase tracking-widest text-red-900 mb-2">IDs No Encontrados:</h4>
                <div className="flex flex-wrap gap-2">
                  {results.missingIds.map((id, i) => (
                    <span key={i} className="text-[10px] font-mono bg-white border border-red-200 text-red-700 px-2 py-1">
                      {id}
                      {isLikelyYear(id) && <span className="text-red-400 ml-1">(año)</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Container Groups */}
            {containerGroups.length > 0 && (
              <div className="border border-neutral-200 bg-white overflow-hidden">
                <div className="p-4 border-b border-neutral-200 bg-neutral-50">
                  <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900">
                    Resultados por Contenedor
                  </h3>
                  <p className="text-[10px] font-sans text-neutral-500 mt-1">
                    {containerGroups.length} contenedor{containerGroups.length !== 1 ? 'es' : ''} encontrado{containerGroups.length !== 1 ? 's' : ''} — Click en un contenedor para expandir/colapsar
                  </p>
                </div>

                <div className="divide-y divide-neutral-200">
                  {containerGroups.map((group, groupIdx) => {
                    const groupKey = `${group.cliente}|||${group.numeroCliente}`;
                    const isExpanded = expandedGroups.has(groupKey);
                    return (
                      <div key={groupKey} className="border-b border-neutral-200 last:border-b-0">
                        {/* Container Header */}
                        <button
                          onClick={() => toggleGroup(groupKey)}
                          className="w-full flex items-center justify-between p-4 bg-neutral-50 hover:bg-neutral-100 transition-colors text-left"
                        >
                          <div className="flex items-center gap-4">
                            {isExpanded
                              ? <ChevronDown className="w-4 h-4 text-neutral-500" />
                              : <ChevronRight className="w-4 h-4 text-neutral-500" />
                            }
                            <div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-mono uppercase tracking-widest text-neutral-900 font-medium">
                                  {group.cliente}
                                </span>
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-mono uppercase tracking-widest">
                                  LOTE: {group.numeroCliente}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-[10px] font-mono text-neutral-500">
                                <span>{group.items.length} producto{group.items.length !== 1 ? 's' : ''}</span>
                                <span>{group.totalPallets} pallets</span>
                                <span>{group.totalCantidad} und</span>
                                <span>{group.totalKilos.toFixed(1)} kg</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
                            #{groupIdx + 1}
                          </div>
                        </button>

                        {/* Expanded Items */}
                        {isExpanded && (
                          <div className="border-t border-neutral-200">
                            <table className="w-full text-left text-xs font-sans">
                              <thead className="bg-neutral-100/50 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                                <tr>
                                  <th className="p-3">Producto</th>
                                  <th className="p-3 text-right">Pallets</th>
                                  <th className="p-3 text-right">Cantidad</th>
                                  <th className="p-3 text-right">Kilos</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-100">
                                {group.items.map((item, idx) => (
                                  <tr key={item.id || idx} className="hover:bg-yellow-50 transition-colors">
                                    <td className="p-3">{item.producto}</td>
                                    <td className="p-3 text-right font-mono">{item.pallets}</td>
                                    <td className="p-3 text-right font-mono">{item.cantidad}</td>
                                    <td className="p-3 text-right font-mono">{item.kilos} KG</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-neutral-50 border-t-2 border-neutral-300">
                                  <td className="p-3 font-mono uppercase tracking-widest text-[10px] text-neutral-600 font-medium">Subtotal</td>
                                  <td className="p-3 text-right font-mono font-medium">{group.totalPallets}</td>
                                  <td className="p-3 text-right font-mono font-medium">{group.totalCantidad}</td>
                                  <td className="p-3 text-right font-mono font-medium">{group.totalKilos.toFixed(1)} KG</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {results.foundItems.length === 0 && results.missingIds.length > 0 && (
              <div className="border border-neutral-200 bg-neutral-50 p-8 text-center">
                <p className="text-sm font-mono uppercase tracking-widest text-neutral-500">
                  No se encontraron ítems para los IDs buscados.
                </p>
                <p className="text-xs font-mono text-neutral-400 mt-2">
                  Verifica que los números de lote/pallet sean correctos. Recuerda que años como &quot;2025&quot; se excluyen automáticamente.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
