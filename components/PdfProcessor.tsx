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

interface PalletFromPdf {
  palletNumber: string;
  cajas: number;
  kilos: number;
}

interface ContainerGroup {
  cliente: string;
  items: {
    inventoryItem: InventoryItem;
    pdfPallets: PalletFromPdf[];
  }[];
  totalPdfCajas: number;
  totalPdfKilos: number;
  totalInvKilos: number;
}

export default function PdfProcessor({ inventoryData = [] }: PdfProcessorProps) {
  const [pdfPallets, setPdfPallets] = useState<PalletFromPdf[]>([]);
  const [manualIds, setManualIds] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState('');

  const [results, setResults] = useState<{
    foundItems: { item: InventoryItem; pdfPallets: PalletFromPdf[] }[];
    missingPallets: PalletFromPdf[];
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

  // Group found items by container (cliente)
  const containerGroups = useMemo<ContainerGroup[]>(() => {
    if (!results || results.foundItems.length === 0) return [];

    const groupMap = new Map<string, ContainerGroup>();

    results.foundItems.forEach(({ item, pdfPallets: pdfs }) => {
      const key = item.cliente;
      if (groupMap.has(key)) {
        const group = groupMap.get(key)!;
        // Check if we already have this exact item
        const existing = group.items.find(ei => (ei.inventoryItem.id || '') === (item.id || ''));
        if (existing) {
          existing.pdfPallets.push(...pdfs);
        } else {
          group.items.push({ inventoryItem: item, pdfPallets: pdfs });
        }
        pdfs.forEach(p => {
          group.totalPdfCajas += p.cajas;
          group.totalPdfKilos += p.kilos;
        });
        group.totalInvKilos += Number(item.kilos) || 0;
      } else {
        const newGroup: ContainerGroup = {
          cliente: key,
          items: [{ inventoryItem: item, pdfPallets: pdfs }],
          totalPdfCajas: 0,
          totalPdfKilos: 0,
          totalInvKilos: Number(item.kilos) || 0,
        };
        pdfs.forEach(p => {
          newGroup.totalPdfCajas += p.cajas;
          newGroup.totalPdfKilos += p.kilos;
        });
        groupMap.set(key, newGroup);
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

  // Extract text from PDF page 2 only
  const extractPage2FromPdf = async (file: File): Promise<string> => {
    if (!window.pdfjsLib) {
      throw new Error("PDF.js no ha cargado todavía. Por favor, espera un segundo.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    if (pdf.numPages < 2) {
      throw new Error("El PDF tiene menos de 2 páginas. Se necesita la segunda hoja con los pallets.");
    }

    const page = await pdf.getPage(2); // Page 2 only
    const textContent = await page.getTextContent();
    return textContent.items.map((item: any) => item.str).join(' ');
  };

  // Parse pallet numbers, cajas and kilos from PDF text
  const parsePalletsFromText = (text: string): PalletFromPdf[] => {
    const pallets: PalletFromPdf[] = [];

    // Pattern: 6-digit pallet number followed by numbers (cajas and kilos)
    // The text looks like: "286554 69 1032,89" or "286554                             69  1032,89"
    // We match 6-digit numbers that are NOT years (2000-2099) followed by numeric data
    const palletRegex = /\b([2-9]\d{5}|1[0-9]{5})\b/g;
    const allNumbers: { num: string; index: number }[] = [];

    let match;
    while ((match = palletRegex.exec(text)) !== null) {
      const num = match[1];
      const parsedNum = parseInt(num);
      // Skip years (2000-2099 have only 4 digits, so 6-digit numbers won't match)
      allNumbers.push({ num, index: match.index });
    }

    // For each 6-digit number, check if it's followed by 2 numbers (cajas, kilos)
    // Extract all numbers after each potential pallet
    for (let i = 0; i < allNumbers.length; i++) {
      const { num, index } = allNumbers[i];
      // Get the text after this pallet number
      const afterText = text.substring(index + num.length);

      // Find the next 2 numbers after this pallet (cajas and kilos)
      const numberPattern = /(\d+[\.,]?\d*)/g;
      const followingNumbers: number[] = [];
      let numMatch;
      let searchOffset = 0;

      while ((numMatch = numberPattern.exec(afterText)) !== null && followingNumbers.length < 2) {
        const val = parseFloat(numMatch[1].replace(',', '.'));
        if (!isNaN(val) && val > 0 && val < 100000) {
          followingNumbers.push(val);
        }
        searchOffset = numMatch.index + numMatch[0].length;
      }

      if (followingNumbers.length >= 2) {
        const cajas = Math.round(followingNumbers[0]);
        const kilos = followingNumbers[1];

        // Skip if kilos seem unreasonably large (> 50000) or cajas > 10000
        if (cajas <= 10000 && kilos <= 50000) {
          // Check it's not a duplicate
          if (!pallets.some(p => p.palletNumber === num)) {
            pallets.push({ palletNumber: num, cajas, kilos });
          }
        }
      } else if (followingNumbers.length === 1) {
        // Only one number found — use as cajas, no kilos
        const cajas = Math.round(followingNumbers[0]);
        if (cajas <= 10000 && !pallets.some(p => p.palletNumber === num)) {
          pallets.push({ palletNumber: num, cajas, kilos: 0 });
        }
      }
    }

    return pallets;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setResults(null);
    setFileName(file.name);
    try {
      const text = await extractPage2FromPdf(file);
      console.log('PDF Page 2 text:', text.substring(0, 2000));
      const parsed = parsePalletsFromText(text);
      console.log('Parsed pallets:', parsed);
      setPdfPallets(parsed);

      if (parsed.length === 0) {
        alert("No se encontraron pallets en la segunda hoja del PDF. Verifica que el formato sea: Número de Pallet, Cajas, Kilos.");
      }
    } catch (error: any) {
      console.error("Error processing PDF:", error);
      alert(error.message || "Error al procesar el archivo PDF.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const processData = () => {
    const manualIdsList = manualIds.split(/[\s,;]+/).filter(id => id.trim().length > 0).map(id => ({
      palletNumber: id.trim(),
      cajas: 0,
      kilos: 0,
    }));

    const allPallets = [...pdfPallets];
    // Add manual IDs that aren't already from PDF
    manualIdsList.forEach(mp => {
      if (!allPallets.some(p => p.palletNumber === mp.palletNumber)) {
        allPallets.push(mp);
      }
    });

    if (allPallets.length === 0) {
      alert("No hay pallets para buscar. Carga un PDF o ingresa números manualmente.");
      return;
    }

    if (inventoryData.length === 0) {
      alert("No hay datos de inventario. Carga el inventario primero en la sección 'Inventario'.");
      return;
    }

    const foundItems: { item: InventoryItem; pdfPallets: PalletFromPdf[] }[] = [];
    const missingPallets: PalletFromPdf[] = [];
    const foundInventoryKeys = new Set<string>();

    allPallets.forEach(pallet => {
      const normalizeId = (value: string | number | undefined | null) => {
        const raw = String(value ?? '').trim();
        const stripped = raw.replace(/[^0-9]/g, '');
        const tokens = (raw.match(/\d{5,}/g) || []).map(token => token.replace(/^0+/, '')).filter(Boolean);
        return {
          raw: raw.replace(/^0+/, ''),
          stripped: stripped.replace(/^0+/, ''),
          tokens,
        };
      };

      const searchId = normalizeId(pallet.palletNumber);
      let matched = false;

      // Match against numeroCliente and lote (muchos pallets vienen en "Nro Lote")
      for (const invItem of inventoryData) {
        const candidates = [
          normalizeId(invItem.numeroCliente),
          normalizeId((invItem as any).lote),
        ];

        const isMatch = candidates.some(candidate =>
          (candidate.stripped && candidate.stripped === searchId.stripped) ||
          (candidate.raw && candidate.raw === searchId.raw) ||
          candidate.tokens.includes(searchId.stripped)
        );

        if (isMatch) {
          const key = invItem.id || `${invItem.numeroCliente}-${invItem.producto}`;
          const existing = foundItems.find(f => (f.item.id || '') === (invItem.id || ''));
          if (existing) {
            if (!existing.pdfPallets.some(p => p.palletNumber === pallet.palletNumber)) {
              existing.pdfPallets.push(pallet);
            }
          } else {
            foundItems.push({ item: invItem, pdfPallets: [pallet] });
          }
          foundInventoryKeys.add(key);
          matched = true;
          break;
        }
      }

      if (!matched) {
        missingPallets.push(pallet);
      }
    });

    setResults({ foundItems, missingPallets });

    // Auto-expand all groups
    if (foundItems.length > 0) {
      const allKeys = new Set<string>();
      foundItems.forEach(({ item }) => allKeys.add(item.cliente));
      setExpandedGroups(allKeys);
    }
  };

  const exportToExcel = () => {
    if (!results || containerGroups.length === 0) return;

    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];
    let currentRow = 0;

    // Title
    wsData.push([`PLANILLA DE CARGA${fileName ? ' — ' + fileName : ''}`, '', '', '', '']);
    currentRow++;
    wsData.push([]);
    currentRow++;

    const containerStyle = {
      fill: { fgColor: { rgb: "1A1A1A" } },
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      border: { top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } }, left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } } },
    };
    const headerStyle = {
      fill: { fgColor: { rgb: "E0E0E0" } },
      font: { bold: true, sz: 10 },
      border: { top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } }, left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } } },
      alignment: { horizontal: "center", vertical: "center" }
    };
    const dataBorder = {
      top: { style: "thin", color: { rgb: "CCCCCC" } }, bottom: { style: "thin", color: { rgb: "CCCCCC" } },
      left: { style: "thin", color: { rgb: "CCCCCC" } }, right: { style: "thin", color: { rgb: "CCCCCC" } }
    };

    containerGroups.forEach((group, groupIdx) => {
      // Container header
      wsData.push([`CONTENEDOR ${groupIdx + 1}: ${group.cliente}`, '', '', '', '']);
      currentRow++;

      // Column headers
      wsData.push(['No. Pallet', 'Producto', 'Cajas (PDF)', 'Kilos (PDF)', 'Kilos (Inv)']);
      currentRow++;

      // Items
      group.items.forEach(({ inventoryItem, pdfPallets }) => {
        pdfPallets.forEach(pallet => {
          wsData.push([pallet.palletNumber, inventoryItem.producto, pallet.cajas, pallet.kilos, inventoryItem.kilos]);
          currentRow++;
        });
      });

      // Subtotal
      wsData.push(['SUBTOTAL', `${group.items.length} pallets`, group.totalPdfCajas, `${group.totalPdfKilos.toFixed(2)} KG`, `${group.totalInvKilos.toFixed(2)} KG`]);
      currentRow++;
      wsData.push([]);
      currentRow++;
    });

    // Grand total
    const grandCajas = containerGroups.reduce((s, g) => s + g.totalPdfCajas, 0);
    const grandKilosPdf = containerGroups.reduce((s, g) => s + g.totalPdfKilos, 0);
    const grandKilosInv = containerGroups.reduce((s, g) => s + g.totalInvKilos, 0);
    wsData.push(['RESUMEN TOTAL', `${containerGroups.length} Contenedores`, grandCajas, `${grandKilosPdf.toFixed(2)} KG`, `${grandKilosInv.toFixed(2)} KG`]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    ws['A1'].s = { font: { bold: true, sz: 14, color: { rgb: "1A1A1A" } }, alignment: { horizontal: "center", vertical: "center" } };

    // Apply styles
    let rowIdx = 0;
    let groupCounter = 0;
    containerGroups.forEach((group) => {
      // Container header row
      const colKeys = ['A', 'B', 'C', 'D', 'E'];
      colKeys.forEach(col => {
        const cellRef = `${col}${rowIdx + 1}`;
        if (ws[cellRef]) ws[cellRef].s = containerStyle;
      });
      rowIdx++;
      // Column header row
      colKeys.forEach(col => {
        const cellRef = `${col}${rowIdx + 1}`;
        if (ws[cellRef]) ws[cellRef].s = headerStyle;
      });
      rowIdx++;
      // Data rows
      group.items.forEach(({ pdfPallets }) => {
        pdfPallets.forEach(() => {
          colKeys.forEach(col => {
            const cellRef = `${col}${rowIdx + 1}`;
            if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
            ws[cellRef].s = { border: dataBorder };
          });
          rowIdx++;
        });
      });
      // Subtotal row
      colKeys.forEach(col => {
        const cellRef = `${col}${rowIdx + 1}`;
        if (ws[cellRef]) ws[cellRef].s = { ...dataBorder, font: { bold: true } };
      });
      rowIdx += 2; // subtotal + empty row
      groupCounter++;
    });

    ws['!cols'] = [{ wch: 16 }, { wch: 35 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, "Planilla de Carga");

    // Missing pallets
    if (results.missingPallets.length > 0) {
      const wsMissingData = [['Pallets No Encontrados en Inventario'], [''], ['Pallet', 'Cajas', 'Kilos']];
      results.missingPallets.forEach(p => wsMissingData.push([p.palletNumber, String(p.cajas), String(p.kilos)]));
      const wsMissing = XLSX.utils.aoa_to_sheet(wsMissingData);
      wsMissing['A1'].s = { font: { bold: true, sz: 12 } };
      wsMissing['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsMissing, "No Encontrados");
    }

    XLSX.writeFile(wb, "Planilla_de_Carga.xlsx");
  };

  const clearAll = () => {
    setResults(null);
    setPdfPallets([]);
    setManualIds('');
    setExpandedGroups(new Set());
    setFileName('');
  };

  return (
    <div className="flex flex-col h-full bg-white border border-neutral-200">
      {/* Header */}
      <div className="p-6 border-b border-neutral-200 bg-neutral-50 flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-lg font-mono uppercase tracking-widest text-neutral-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-neutral-600" />
            Despachos
          </h2>
          <p className="text-xs font-sans text-neutral-500 mt-1">
            Carga PDF → extrae pallets de la 2da hoja → cruza con inventario. Inventario: {inventoryData.length} ítems.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {results && (
            <>
              <button onClick={clearAll}
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

        {/* Upload + Search */}
        {!results && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PDF Upload */}
            <div className="border border-neutral-200 p-6 bg-white">
              <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" /> 1. Cargar PDF de Despacho
              </h3>
              <p className="text-[10px] font-sans text-neutral-500 mb-4">
                Se lee la SEGUNDA HOJA del PDF para extraer los pallets.
              </p>
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-neutral-300 border-dashed bg-neutral-50 hover:bg-neutral-100 cursor-pointer transition-colors">
                  <div className="flex flex-col items-center justify-center pt-4 pb-4">
                    <Upload className="w-6 h-6 text-neutral-400 mb-2" />
                    <p className="text-xs font-mono text-neutral-500 uppercase tracking-widest">
                      {isProcessing ? 'Extrayendo pallets...' : 'Click para subir PDF'}
                    </p>
                  </div>
                  <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload}
                    ref={fileInputRef} disabled={isProcessing} />
                </label>
              </div>

              {/* Extracted pallets preview */}
              {pdfPallets.length > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-green-600 mb-2">
                    {pdfPallets.length} pallets extraídos de {fileName}
                  </p>
                  <div className="max-h-40 overflow-auto border border-neutral-200">
                    <table className="w-full text-left text-[10px] font-mono">
                      <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-widest sticky top-0">
                        <tr>
                          <th className="p-2 border-b border-neutral-200">Pallet</th>
                          <th className="p-2 border-b border-neutral-200 text-right">Cajas</th>
                          <th className="p-2 border-b border-neutral-200 text-right">Kilos</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {pdfPallets.map((p, i) => (
                          <tr key={i} className="hover:bg-neutral-50">
                            <td className="p-2 font-medium text-neutral-900">{p.palletNumber}</td>
                            <td className="p-2 text-right">{p.cajas}</td>
                            <td className="p-2 text-right">{p.kilos.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Manual + Process */}
            <div className="border border-neutral-200 p-6 bg-white flex flex-col">
              <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 mb-2 flex items-center gap-2">
                <Search className="w-4 h-4" /> 2. Buscar en Inventario
              </h3>
              <p className="text-[10px] font-sans text-neutral-500 mb-4">
                Busca los pallets contra el inventario para ver a qué contenedor pertenecen.
              </p>
              <textarea
                className="w-full flex-1 p-3 text-xs font-mono bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors resize-none mb-3"
                placeholder={"O ingresa pallets manualmente (separados por comas o espacios):\n\nEjemplo: 286554, 287450, 288029"}
                value={manualIds} onChange={(e) => setManualIds(e.target.value)} />
              <button onClick={processData}
                disabled={isProcessing || (pdfPallets.length === 0 && manualIds.trim() === '') || inventoryData.length === 0}
                className="w-full py-3 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors disabled:bg-neutral-300 disabled:cursor-not-allowed">
                {pdfPallets.length > 0
                  ? `Buscar ${pdfPallets.length} pallets en Inventario`
                  : 'Buscar en Inventario'}
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="flex flex-col gap-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="border border-green-200 bg-green-50 p-4 flex items-center gap-4">
                <div className="p-3 bg-green-100 text-green-700 rounded-full"><CheckCircle className="w-6 h-6" /></div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-green-700">Pallets Encontrados</p>
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
                  <p className="text-2xl font-light text-red-900">{results.missingPallets.length}</p>
                </div>
              </div>
              <div className="border border-neutral-200 bg-neutral-50 p-4 flex items-center gap-4">
                <div className="p-3 bg-neutral-200 text-neutral-700 rounded-full"><Package className="w-6 h-6" /></div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-700">Total Cajas</p>
                  <p className="text-2xl font-light text-neutral-900">{containerGroups.reduce((s, g) => s + g.totalPdfCajas, 0)}</p>
                </div>
              </div>
            </div>

            {/* Missing Pallets */}
            {results.missingPallets.length > 0 && (
              <div className="border border-red-200 bg-red-50 p-4">
                <h4 className="text-xs font-mono uppercase tracking-widest text-red-900 mb-3">Pallets No Encontrados en Inventario:</h4>
                <div className="max-h-32 overflow-auto">
                  <table className="w-full text-left text-[10px] font-mono">
                    <thead className="text-red-700 uppercase tracking-widest sticky top-0 bg-red-50">
                      <tr>
                        <th className="p-2">Pallet</th>
                        <th className="p-2 text-right">Cajas</th>
                        <th className="p-2 text-right">Kilos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-100">
                      {results.missingPallets.map((p, i) => (
                        <tr key={i}>
                          <td className="p-2 text-red-800">{p.palletNumber}</td>
                          <td className="p-2 text-right text-red-600">{p.cajas}</td>
                          <td className="p-2 text-right text-red-600">{p.kilos.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                    {containerGroups.length} contenedor{containerGroups.length !== 1 ? 'es' : ''} — Click para expandir/colapsar
                  </p>
                </div>

                <div className="divide-y divide-neutral-200">
                  {containerGroups.map((group, groupIdx) => {
                    const groupKey = group.cliente;
                    const isExpanded = expandedGroups.has(groupKey);
                    return (
                      <div key={groupKey}>
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
                                  {group.items.length} pallet{group.items.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-[10px] font-mono text-neutral-500">
                                <span>{group.totalPdfCajas} cajas</span>
                                <span>{group.totalPdfKilos.toFixed(2)} kg (PDF)</span>
                                <span>{group.totalInvKilos.toFixed(2)} kg (Inv)</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
                            #{groupIdx + 1}
                          </div>
                        </button>

                        {/* Expanded Detail */}
                        {isExpanded && (
                          <div className="border-t border-neutral-200">
                            <table className="w-full text-left text-xs font-sans">
                              <thead className="bg-neutral-100/50 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                                <tr>
                                  <th className="p-3">Pallet</th>
                                  <th className="p-3">Producto</th>
                                  <th className="p-3 text-right">Cajas</th>
                                  <th className="p-3 text-right">Kilos (PDF)</th>
                                  <th className="p-3 text-right">Kilos (Inv)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-100">
                                {group.items.map(({ inventoryItem, pdfPallets }, idx) => (
                                  pdfPallets.map((pallet, pIdx) => (
                                    <tr key={`${idx}-${pIdx}`} className="hover:bg-yellow-50 transition-colors">
                                      <td className="p-3 font-mono font-medium text-blue-700">{pallet.palletNumber}</td>
                                      <td className="p-3">{inventoryItem.producto}</td>
                                      <td className="p-3 text-right font-mono">{pallet.cajas}</td>
                                      <td className="p-3 text-right font-mono">{pallet.kilos.toFixed(2)}</td>
                                      <td className="p-3 text-right font-mono text-neutral-500">{inventoryItem.kilos}</td>
                                    </tr>
                                  ))
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-neutral-50 border-t-2 border-neutral-300">
                                  <td className="p-3 font-mono uppercase tracking-widest text-[10px] text-neutral-600 font-medium" colSpan={2}>
                                    Subtotal ({group.items.length} pallets)
                                  </td>
                                  <td className="p-3 text-right font-mono font-medium">{group.totalPdfCajas}</td>
                                  <td className="p-3 text-right font-mono font-medium">{group.totalPdfKilos.toFixed(2)}</td>
                                  <td className="p-3 text-right font-mono font-medium text-neutral-500">{group.totalInvKilos.toFixed(2)}</td>
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

            {results.foundItems.length === 0 && results.missingPallets.length > 0 && (
              <div className="border border-neutral-200 bg-neutral-50 p-8 text-center">
                <p className="text-sm font-mono uppercase tracking-widest text-neutral-500">
                  Ningún pallet encontrado en el inventario.
                </p>
                <p className="text-xs font-mono text-neutral-400 mt-2">
                  Verifica que los números de pallet coincidan con el campo &quot;No. Cliente&quot; del inventario.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
