'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx-js-style';
import { Upload, FileText, Search, Download, AlertCircle, CheckCircle, Box, FileSpreadsheet } from 'lucide-react';

declare global {
  interface Window {
    pdfjsLib: any;
  }
}

interface StockItem {
  id: string;
  palletId: string;
  lot: string;
  containerId: string;
  product: string;
  boxes: number;
  weight: number;
}

// Mock data for demonstration
const MOCK_STOCK: StockItem[] = [
  { id: '1', palletId: 'PAL-12345', lot: 'L-999', containerId: 'CONT-001', product: 'Manzanas', boxes: 50, weight: 1000 },
  { id: '2', palletId: 'PAL-12346', lot: 'L-999', containerId: 'CONT-001', product: 'Manzanas', boxes: 50, weight: 1000 },
  { id: '3', palletId: '005678', lot: 'L-888', containerId: 'CONT-002', product: 'Peras', boxes: 40, weight: 800 },
  { id: '4', palletId: 'PAL-9012', lot: 'L-777', containerId: 'CONT-002', product: 'Uvas', boxes: 60, weight: 1200 },
  { id: '5', palletId: '112233', lot: 'L-666', containerId: 'CONT-003', product: 'Naranjas', boxes: 45, weight: 900 },
];

export default function PdfProcessor({ stock = MOCK_STOCK }: { stock?: StockItem[] }) {
  const [extractedIds, setExtractedIds] = useState<string[]>([]);
  const [manualIds, setManualIds] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [results, setResults] = useState<{
    foundPallets: StockItem[];
    containerPallets: StockItem[];
    missingIds: string[];
    containers: string[];
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

  const fuzzyMatch = (searchId: string, targetId: string) => {
    if (!searchId || !targetId) return false;
    
    const s = String(searchId).toLowerCase();
    const t = String(targetId).toLowerCase();
    
    if (s === t) return true;
    
    const sNoZeros = s.replace(/^0+/, '');
    const tNoZeros = t.replace(/^0+/, '');
    if (sNoZeros === tNoZeros && sNoZeros.length > 0) return true;
    
    if (t.includes(s) || s.includes(t)) return true;
    
    const sStripped = s.replace(/[^a-z0-9]/g, '');
    const tStripped = t.replace(/[^a-z0-9]/g, '');
    if (sStripped.length >= 4 && tStripped.length >= 4) {
      if (sStripped === tStripped || tStripped.includes(sStripped) || sStripped.includes(tStripped)) {
        return true;
      }
    }
    
    return false;
  };

  const extractTextFromPdf = async (file: File) => {
    if (!window.pdfjsLib) {
      throw new Error("PDF.js no ha cargado todavía. Por favor, espera un segundo e intenta de nuevo.");
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

      const regex = /\b[A-Za-z0-9]*\d{4,}[A-Za-z0-9]*\b/g;
      const matches = allText.match(regex) || [];
      const uniqueIds = Array.from(new Set(matches));
      
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
    const manualIdsList = manualIds.split(/[\s,]+/).filter(id => id.trim().length > 0);
    const allSearchIds = Array.from(new Set([...extractedIds, ...manualIdsList]));
    
    if (allSearchIds.length === 0) {
      alert("No hay IDs para buscar.");
      return;
    }

    const foundPallets: StockItem[] = [];
    const missingIds: string[] = [];
    const foundContainerIds = new Set<string>();

    allSearchIds.forEach(searchId => {
      const match = stock.find(item => 
        fuzzyMatch(searchId, item.palletId) || fuzzyMatch(searchId, item.lot)
      );

      if (match) {
        if (!foundPallets.some(p => p.id === match.id)) {
          foundPallets.push(match);
        }
        if (match.containerId) {
          foundContainerIds.add(match.containerId);
        }
      } else {
        missingIds.push(searchId);
      }
    });

    // Get ALL pallets for the identified containers
    const containerPallets = stock.filter(item => 
      item.containerId && foundContainerIds.has(item.containerId)
    );

    setResults({
      foundPallets,
      containerPallets,
      missingIds,
      containers: Array.from(foundContainerIds)
    });
  };

  const exportToExcel = () => {
    if (!results) return;

    const wb = XLSX.utils.book_new();

    // 1. Hoja "Planilla de Carga"
    const wsData: any[][] = [];
    
    // Fila 1: Título
    wsData.push(["PLANILLA DE CARGA", "", "", "", "", ""]);
    // Fila 2: Vacía
    wsData.push([]);
    // Fila 3: Encabezados
    wsData.push(['Contenedor', 'Cant.', 'Bultos', 'Peso', 'Descripción', 'Pallet ID']);

    // Agrupar por contenedor y ordenar alfabéticamente
    const palletsByContainer: Record<string, StockItem[]> = {};
    results.containerPallets.forEach(p => {
      if (!palletsByContainer[p.containerId]) palletsByContainer[p.containerId] = [];
      palletsByContainer[p.containerId].push(p);
    });

    const sortedContainers = Object.keys(palletsByContainer).sort();
    
    // Para aplicar estilos, necesitamos saber qué filas son de datos y cuáles están resaltadas
    const highlightRows: number[] = []; // 0-indexed row numbers
    let currentRow = 3; // Start after headers (0, 1, 2)

    sortedContainers.forEach(containerId => {
      const pallets = palletsByContainer[containerId];
      pallets.forEach(p => {
        const isSearched = results.foundPallets.some(fp => fp.id === p.id);
        wsData.push([
          p.containerId,
          1,
          p.boxes,
          p.weight,
          p.product,
          p.lot || p.palletId
        ]);
        if (isSearched) {
          highlightRows.push(currentRow);
        }
        currentRow++;
      });
      // Fila vacía después de cada contenedor
      wsData.push([]);
      currentRow++;
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Aplicar estilos
    // Fila 1: Título (combinar A1:F1, negrita, centrado, tamaño 14)
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    ws['A1'].s = {
      font: { bold: true, sz: 14 },
      alignment: { horizontal: "center", vertical: "center" }
    };

    // Estilos para encabezados (Fila 3 -> index 2)
    const headerStyle = {
      fill: { fgColor: { rgb: "E0E0E0" } },
      font: { bold: true },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } }
      },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const cols = ['A', 'B', 'C', 'D', 'E', 'F'];
    cols.forEach(col => {
      const cellRef = `${col}3`;
      if (ws[cellRef]) ws[cellRef].s = headerStyle;
    });

    // Estilos para datos
    const dataBorderStyle = {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } }
    };

    for (let r = 3; r < wsData.length; r++) {
      if (wsData[r].length === 0) continue; // Skip empty rows
      
      cols.forEach((col, cIdx) => {
        const cellRef = XLSX.utils.encode_cell({ r, c: cIdx });
        if (!ws[cellRef]) {
          ws[cellRef] = { t: 's', v: '' }; // Create empty cell if missing
        }
        
        ws[cellRef].s = { border: dataBorderStyle };
        
        // Resaltar Pallet ID (columna F -> index 5) si fue buscado
        if (cIdx === 5 && highlightRows.includes(r)) {
          ws[cellRef].s = {
            ...ws[cellRef].s,
            fill: { fgColor: { rgb: "FFFF00" } }
          };
        }
      });
    }

    // Anchos de columna
    ws['!cols'] = [
      { wch: 18 }, // Contenedor
      { wch: 8 },  // Cant.
      { wch: 10 }, // Bultos
      { wch: 10 }, // Peso
      { wch: 60 }, // Descripción
      { wch: 20 }  // Pallet ID
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Planilla de Carga");

    // 2. Hoja "No Encontrados"
    if (results.missingIds.length > 0) {
      const wsMissingData = [['IDs No Encontrados']];
      results.missingIds.forEach(id => wsMissingData.push([id]));
      const wsMissing = XLSX.utils.aoa_to_sheet(wsMissingData);
      
      wsMissing['A1'].s = { font: { bold: true } };
      wsMissing['!cols'] = [{ wch: 30 }];
      
      XLSX.utils.book_append_sheet(wb, wsMissing, "No Encontrados");
    }

    XLSX.writeFile(wb, "Planilla_de_Carga.xlsx");
  };

  return (
    <div className="flex flex-col h-full bg-white border border-neutral-200">
      <div className="p-6 border-b border-neutral-200 bg-neutral-50 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-mono uppercase tracking-widest text-neutral-900">Procesador de Órdenes (PDF)</h2>
          <p className="text-xs font-sans text-neutral-500 mt-1">Extrae IDs de PDFs, cruza con inventario y exporta a Excel.</p>
        </div>
        {results && (
          <button 
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-xs font-mono uppercase tracking-widest hover:bg-green-700 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Excel
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
        {/* Input Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border border-neutral-200 p-6 bg-white">
            <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              1. Cargar PDFs
            </h3>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-neutral-300 border-dashed bg-neutral-50 hover:bg-neutral-100 cursor-pointer transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-6 h-6 text-neutral-400 mb-2" />
                  <p className="text-xs font-mono text-neutral-500 uppercase tracking-widest">
                    {isProcessing ? 'Procesando...' : 'Click para subir PDFs'}
                  </p>
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  multiple 
                  accept=".pdf" 
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                  disabled={isProcessing}
                />
              </label>
            </div>
            {extractedIds.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-green-600">
                  {extractedIds.length} IDs extraídos de PDFs
                </p>
                <div className="mt-2 flex flex-wrap gap-1 max-h-24 overflow-y-auto p-2 border border-neutral-100 bg-neutral-50">
                  {extractedIds.map((id, i) => (
                    <span key={i} className="text-[10px] font-mono bg-white border border-neutral-200 px-1 py-0.5">{id}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border border-neutral-200 p-6 bg-white flex flex-col">
            <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 mb-4 flex items-center gap-2">
              <Search className="w-4 h-4" />
              2. Búsqueda Manual / Procesar
            </h3>
            <textarea
              className="w-full flex-1 p-3 text-xs font-mono bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors resize-none mb-4"
              placeholder="Ingresa IDs manualmente (separados por comas o espacios)..."
              value={manualIds}
              onChange={(e) => setManualIds(e.target.value)}
            />
            <button 
              onClick={processData}
              disabled={isProcessing || (extractedIds.length === 0 && manualIds.trim() === '')}
              className="w-full py-3 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors disabled:bg-neutral-300 disabled:cursor-not-allowed"
            >
              Cruzar con Inventario
            </button>
          </div>
        </div>

        {/* Results Section */}
        {results && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-green-200 bg-green-50 p-4 flex items-center gap-4">
                <div className="p-3 bg-green-100 text-green-700 rounded-full">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-green-700">Pallets Encontrados</p>
                  <p className="text-2xl font-light text-green-900">{results.foundPallets.length}</p>
                </div>
              </div>
              <div className="border border-blue-200 bg-blue-50 p-4 flex items-center gap-4">
                <div className="p-3 bg-blue-100 text-blue-700 rounded-full">
                  <Box className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-blue-700">Contenedores Afectados</p>
                  <p className="text-2xl font-light text-blue-900">{results.containers.length}</p>
                </div>
              </div>
              <div className="border border-red-200 bg-red-50 p-4 flex items-center gap-4">
                <div className="p-3 bg-red-100 text-red-700 rounded-full">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-red-700">No Encontrados</p>
                  <p className="text-2xl font-light text-red-900">{results.missingIds.length}</p>
                </div>
              </div>
            </div>

            {/* Missing IDs Alert */}
            {results.missingIds.length > 0 && (
              <div className="border border-red-200 bg-red-50 p-4">
                <h4 className="text-xs font-mono uppercase tracking-widest text-red-900 mb-2">IDs Faltantes en Inventario:</h4>
                <div className="flex flex-wrap gap-2">
                  {results.missingIds.map((id, i) => (
                    <span key={i} className="text-[10px] font-mono bg-white border border-red-200 text-red-700 px-2 py-1">
                      {id}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Grouped Table */}
            <div className="border border-neutral-200 bg-white overflow-hidden">
              <div className="p-4 border-b border-neutral-200 bg-neutral-50">
                <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900">Detalle por Contenedor</h3>
                <p className="text-[10px] font-sans text-neutral-500 mt-1">
                  Mostrando todos los pallets de los contenedores identificados. Los pallets buscados están resaltados.
                </p>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead className="bg-neutral-100 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                    <tr>
                      <th className="p-3 border-b border-neutral-200">Contenedor</th>
                      <th className="p-3 border-b border-neutral-200">Pallet ID</th>
                      <th className="p-3 border-b border-neutral-200">Lote</th>
                      <th className="p-3 border-b border-neutral-200">Producto</th>
                      <th className="p-3 border-b border-neutral-200 text-right">Bultos</th>
                      <th className="p-3 border-b border-neutral-200 text-right">Peso</th>
                      <th className="p-3 border-b border-neutral-200 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {results.containers.sort().map((containerId) => {
                      const pallets = results.containerPallets.filter(p => p.containerId === containerId);
                      return (
                        <React.Fragment key={containerId}>
                          {pallets.map((pallet, idx) => {
                            const isSearched = results.foundPallets.some(fp => fp.id === pallet.id);
                            return (
                              <tr key={pallet.id} className={`${isSearched ? 'bg-yellow-50' : 'hover:bg-neutral-50'} transition-colors`}>
                                <td className="p-3 font-mono text-neutral-900">
                                  {idx === 0 ? containerId : ''}
                                </td>
                                <td className="p-3 font-mono">{pallet.palletId}</td>
                                <td className="p-3 font-mono text-neutral-500">{pallet.lot}</td>
                                <td className="p-3">{pallet.product}</td>
                                <td className="p-3 text-right font-mono">{pallet.boxes}</td>
                                <td className="p-3 text-right font-mono">{pallet.weight}</td>
                                <td className="p-3 text-center">
                                  {isSearched ? (
                                    <span className="inline-block px-2 py-1 bg-yellow-200 text-yellow-800 text-[10px] font-mono uppercase tracking-widest rounded-sm">
                                      Buscado
                                    </span>
                                  ) : (
                                    <span className="inline-block px-2 py-1 bg-neutral-100 text-neutral-500 text-[10px] font-mono uppercase tracking-widest rounded-sm">
                                      Resto Carga
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          {/* Separator row */}
                          <tr className="bg-neutral-50 h-2">
                            <td colSpan={7}></td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
