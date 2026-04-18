'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx-js-style';
import {
  Upload, FileText, Search, AlertCircle, CheckCircle, Box,
  FileSpreadsheet, Package, Truck, Printer, ChevronDown, ChevronRight,
  Filter, Calendar, X, ArrowRight
} from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

declare global {
  interface Window {
    pdfjsLib: any;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
  id?: string;
  numeroCliente: string;
  cliente: string;
  producto: string;
  contenedor?: string;
  lote?: string;
  pallets: number;
  cantidad: number;
  kilos: number;
}

interface PalletFromPdf {
  palletNumber: string;
  cajas: number;
  kilos: number;
}

interface ContainerGroup {
  contenedor: string;
  clientes: string[];
  items: {
    inventoryItem: InventoryItem;
    pdfPallets: PalletFromPdf[];
    isSearched: boolean;
  }[];
  totalPdfCajas: number;
  totalPdfKilos: number;
  totalInvKilos: number;
}

interface OrderItem {
  numeroCliente: string;
  producto: string;
  contenedor: string;
  lote: string;
  cajas: number;
  kilos: number;
  palletsRequested: number;
  observaciones: string;
}

interface Order {
  id: string;
  orderNumber: string;
  cliente: string;
  estado: 'PENDIENTE' | 'EN PREPARACIÓN' | 'LISTO' | 'DESPACHADO';
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
  observaciones: string;
}

interface DespachosRealProps {
  inventoryData: InventoryItem[];
  onUpdateInventory: (updatedData: InventoryItem[]) => void;
  onNavigateToPedidos?: () => void;
}

const ORDERS_CACHE_KEY = 'frimaral_orders_cache_v1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const loadOrders = (): Order[] => {
  try {
    const raw = localStorage.getItem(ORDERS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveOrders = (orders: Order[]) => {
  localStorage.setItem(ORDERS_CACHE_KEY, JSON.stringify(orders));
};

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  } catch {
    return '--';
  }
};

const formatDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return '--';
  }
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DespachosReal({
  inventoryData = [],
  onUpdateInventory,
  onNavigateToPedidos,
}: DespachosRealProps) {
  // ── State ──
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeSection, setActiveSection] = useState<'pdf' | 'queue' | 'history'>('pdf');

  // PDF Section
  const [pdfPallets, setPdfPallets] = useState<PalletFromPdf[]>([]);
  const [manualIds, setManualIds] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedPdfGroups, setExpandedPdfGroups] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState('');
  const [pdfResults, setPdfResults] = useState<{
    foundItems: { item: InventoryItem; pdfPallets: PalletFromPdf[] }[];
    missingPallets: PalletFromPdf[];
  } | null>(null);

  // Queue Section
  const [dispatchTarget, setDispatchTarget] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);

  // History Section
  const [historyFilter, setHistoryFilter] = useState<'hoy' | 'semana' | 'mes' | 'todos'>('todos');
  const [historySearch, setHistorySearch] = useState('');
  const [expandedHistoryOrders, setExpandedHistoryOrders] = useState<Set<string>>(new Set());

  const pdfFileRef = useRef<HTMLInputElement>(null);

  // ── Load orders on mount ──
  useEffect(() => {
    setOrders(loadOrders());
  }, []);

  // ── Load PDF.js CDN ──
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.pdfjsLib) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.async = true;
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      };
      document.body.appendChild(script);
    }
  }, []);

  // ─── PDF LOGIC ──────────────────────────────────────────────────────────────

  const containerGroups = useMemo<ContainerGroup[]>(() => {
    if (!pdfResults || pdfResults.foundItems.length === 0) return [];
    const groupMap = new Map<string, ContainerGroup>();
    const searchedKeysByContainer = new Map<string, Set<string>>();

    pdfResults.foundItems.forEach(({ item, pdfPallets: pdfs }) => {
      const key = item.contenedor || 'SIN CONTENEDOR';
      const itemKey = item.id || `${item.numeroCliente}|${item.producto}|${item.contenedor}`;

      if (!searchedKeysByContainer.has(key)) searchedKeysByContainer.set(key, new Set());
      searchedKeysByContainer.get(key)!.add(itemKey);

      if (groupMap.has(key)) {
        const group = groupMap.get(key)!;
        const existing = group.items.find(ei => {
          const eiKey = ei.inventoryItem.id || `${ei.inventoryItem.numeroCliente}|${ei.inventoryItem.producto}|${ei.inventoryItem.contenedor}`;
          return eiKey === itemKey;
        });
        if (existing) {
          existing.pdfPallets.push(...pdfs);
        } else {
          group.items.push({ inventoryItem: item, pdfPallets: pdfs, isSearched: true });
        }
        if (item.cliente && !group.clientes.includes(item.cliente)) group.clientes.push(item.cliente);
        pdfs.forEach(p => { group.totalPdfCajas += p.cajas; group.totalPdfKilos += p.kilos; });
        group.totalInvKilos += Number(item.kilos) || 0;
      } else {
        const newGroup: ContainerGroup = {
          contenedor: key,
          clientes: item.cliente ? [item.cliente] : [],
          items: [{ inventoryItem: item, pdfPallets: pdfs, isSearched: true }],
          totalPdfCajas: 0, totalPdfKilos: 0, totalInvKilos: Number(item.kilos) || 0,
        };
        pdfs.forEach(p => { newGroup.totalPdfCajas += p.cajas; newGroup.totalPdfKilos += p.kilos; });
        groupMap.set(key, newGroup);
      }
    });

    // Add ALL inventory items from matched containers (non-searched)
    inventoryData.forEach(invItem => {
      const containerKey = invItem.contenedor || 'SIN CONTENEDOR';
      if (!groupMap.has(containerKey)) return;
      const itemKey = invItem.id || `${invItem.numeroCliente}|${invItem.producto}|${invItem.contenedor}`;
      const searchedKeys = searchedKeysByContainer.get(containerKey);
      if (searchedKeys && searchedKeys.has(itemKey)) return;

      const group = groupMap.get(containerKey)!;
      const existing = group.items.find(ei => {
        const eiKey = ei.inventoryItem.id || `${ei.inventoryItem.numeroCliente}|${ei.inventoryItem.producto}|${ei.inventoryItem.contenedor}`;
        return eiKey === itemKey;
      });
      if (!existing) {
        group.items.push({ inventoryItem: invItem, pdfPallets: [], isSearched: false });
        if (invItem.cliente && !group.clientes.includes(invItem.cliente)) group.clientes.push(invItem.cliente);
        group.totalInvKilos += Number(invItem.kilos) || 0;
      }
    });

    groupMap.forEach(group => {
      group.items.sort((a, b) => {
        if (a.isSearched !== b.isSearched) return a.isSearched ? -1 : 1;
        return a.inventoryItem.numeroCliente.localeCompare(b.inventoryItem.numeroCliente, undefined, { numeric: true });
      });
    });

    return Array.from(groupMap.values());
  }, [pdfResults, inventoryData]);

  const extractPage2FromPdf = async (file: File): Promise<string> => {
    if (!window.pdfjsLib) throw new Error("PDF.js no ha cargado. Espera un segundo.");
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    if (pdf.numPages < 2) throw new Error("El PDF tiene menos de 2 páginas.");
    const page = await pdf.getPage(2);
    const textContent = await page.getTextContent();
    return textContent.items.map((item: any) => item.str).join(' ');
  };

  const parsePalletsFromText = (text: string): PalletFromPdf[] => {
    const pallets: PalletFromPdf[] = [];
    const palletRegex = /\b([2-9]\d{5}|1[0-9]{5})\b/g;
    const allNumbers: { num: string; index: number }[] = [];
    let match;
    while ((match = palletRegex.exec(text)) !== null) {
      allNumbers.push({ num: match[1], index: match.index });
    }

    for (let i = 0; i < allNumbers.length; i++) {
      const { num, index } = allNumbers[i];
      const afterText = text.substring(index + num.length);
      const numberPattern = /(\d+[\.,]?\d*)/g;
      const followingNumbers: number[] = [];
      let numMatch;
      while ((numMatch = numberPattern.exec(afterText)) !== null && followingNumbers.length < 2) {
        const val = parseFloat(numMatch[1].replace(',', '.'));
        if (!isNaN(val) && val > 0 && val < 100000) followingNumbers.push(val);
      }

      if (followingNumbers.length >= 2) {
        const cajas = Math.round(followingNumbers[0]);
        const kilos = followingNumbers[1];
        if (cajas <= 10000 && kilos <= 50000 && !pallets.some(p => p.palletNumber === num)) {
          pallets.push({ palletNumber: num, cajas, kilos });
        }
      } else if (followingNumbers.length === 1) {
        const cajas = Math.round(followingNumbers[0]);
        if (cajas <= 10000 && !pallets.some(p => p.palletNumber === num)) {
          pallets.push({ palletNumber: num, cajas, kilos: 0 });
        }
      }
    }
    return pallets;
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setPdfResults(null);
    setFileName(file.name);
    try {
      const text = await extractPage2FromPdf(file);
      const parsed = parsePalletsFromText(text);
      setPdfPallets(parsed);
      if (parsed.length === 0) alert("No se encontraron pallets en la segunda hoja del PDF.");
    } catch (error: any) {
      alert(error.message || "Error al procesar el PDF.");
    } finally {
      setIsProcessing(false);
      if (pdfFileRef.current) pdfFileRef.current.value = '';
    }
  };

  const processPdfData = () => {
    const manualIdsList = manualIds.split(/[\s,;]+/).filter(id => id.trim().length > 0).map(id => ({
      palletNumber: id.trim(), cajas: 0, kilos: 0,
    }));
    const allPallets = [...pdfPallets];
    manualIdsList.forEach(mp => {
      if (!allPallets.some(p => p.palletNumber === mp.palletNumber)) allPallets.push(mp);
    });

    if (allPallets.length === 0) { alert("No hay pallets para buscar."); return; }
    if (inventoryData.length === 0) { alert("No hay datos de inventario."); return; }

    const foundItems: { item: InventoryItem; pdfPallets: PalletFromPdf[] }[] = [];
    const missingPallets: PalletFromPdf[] = [];

    const normalizeId = (value: string | number | undefined | null) => {
      const raw = String(value ?? '').trim();
      const stripped = raw.replace(/[^0-9]/g, '');
      const tokens = (raw.match(/\d{5,}/g) || []).map(t => t.replace(/^0+/, '')).filter(Boolean);
      return { raw: raw.replace(/^0+/, ''), stripped: stripped.replace(/^0+/, ''), tokens };
    };

    allPallets.forEach(pallet => {
      const searchId = normalizeId(pallet.palletNumber);
      let matched = false;
      for (const invItem of inventoryData) {
        const candidates = [normalizeId(invItem.numeroCliente), normalizeId((invItem as any).lote)];
        const isMatch = candidates.some(c =>
          (c.stripped && c.stripped === searchId.stripped) ||
          (c.raw && c.raw === searchId.raw) ||
          c.tokens.includes(searchId.stripped)
        );
        if (isMatch) {
          const matchKey = invItem.id || `${invItem.numeroCliente}|${invItem.producto}|${invItem.contenedor}`;
          const existing = foundItems.find(f => {
            const fKey = f.item.id || `${f.item.numeroCliente}|${f.item.producto}|${f.item.contenedor}`;
            return fKey === matchKey;
          });
          if (existing) {
            if (!existing.pdfPallets.some(p => p.palletNumber === pallet.palletNumber)) existing.pdfPallets.push(pallet);
          } else {
            foundItems.push({ item: invItem, pdfPallets: [pallet] });
          }
          matched = true;
          break;
        }
      }
      if (!matched) missingPallets.push(pallet);
    });

    setPdfResults({ foundItems, missingPallets });
    if (foundItems.length > 0) {
      const allKeys = new Set<string>();
      foundItems.forEach(({ item }) => allKeys.add(item.contenedor || 'SIN CONTENEDOR'));
      setExpandedPdfGroups(allKeys);
    }
  };

  const handleCreateOrderFromPallets = () => {
    if (!pdfResults || pdfResults.foundItems.length === 0) return;

    // Save found items to staging localStorage key for the Pedidos page to pick up
    const stagingItems = pdfResults.foundItems.map(({ item, pdfPallets }) => ({
      numeroCliente: item.numeroCliente || '',
      producto: item.producto || '',
      contenedor: item.contenedor || '',
      lote: item.lote || '',
      cajas: item.cantidad || 0,
      kilos: item.kilos || 0,
      palletsRequested: pdfPallets.length,
      palletIds: pdfPallets.map(p => p.palletNumber),
      observaciones: '',
    }));

    localStorage.setItem('frimaral_pdf_to_pedido_v1', JSON.stringify(stagingItems));

    if (onNavigateToPedidos) {
      onNavigateToPedidos();
    }
  };

  const handleExportPdfResultsExcel = useCallback(() => {
    if (!pdfResults || pdfResults.foundItems.length === 0) return;
    try {
      const wb = XLSX.utils.book_new();

      // ═══ Shared styles ═══
      const thinBorder = {
        top: { style: 'thin' as const, color: { rgb: '000000' } },
        bottom: { style: 'thin' as const, color: { rgb: '000000' } },
        left: { style: 'thin' as const, color: { rgb: '000000' } },
        right: { style: 'thin' as const, color: { rgb: '000000' } },
      };

      // ═══ Sheet 1: Plan de Carga ═══
      // 7 columns: A=Contenedor, B=Cant., C=Bultos, D=Peso, E=Descripción, F=vacío, G=Pallet ID
      const wsData: any[][] = [
        ['PLANILLA DE CARGA', '', '', '', '', '', ''],
        [],
        ['Contenedor', 'Cant.', 'Bultos', 'Peso', 'Descripción', '', 'Pallet ID'],
      ];

      const cotesSet = new Set<string>();
      let totalPalletsBuscados = 0;
      let totalBultosBuscados = 0;
      let totalKgBuscados = 0;

      // Track which rows are "buscados" for yellow highlighting
      const buscadoRows = new Set<number>();

      // Use containerGroups which has ALL items per container (searched + non-searched)
      containerGroups.forEach((group) => {
        group.items.forEach((entry) => {
          const inv = entry.inventoryItem;
          const desc = inv.producto || '';

          if (entry.isSearched && entry.pdfPallets.length > 0) {
            // Searched items: one row per PDF pallet
            entry.pdfPallets.forEach((pallet) => {
              const bultos = pallet.cajas || 0;
              const peso = Number(pallet.kilos) || 0;
              const startRow = wsData.length; // track row index
              wsData.push([
                group.contenedor,
                1,
                bultos,
                peso,
                desc,
                '',
                pallet.palletNumber || '',
              ]);
              buscadoRows.add(startRow);
              totalPalletsBuscados++;
              totalBultosBuscados += bultos;
              totalKgBuscados += peso;
              // Extract COTES from producto description - ONLY "COTE P" + numbers
              const coteMatch = desc.match(/COTE\s+P\d+/gi) || [];
              coteMatch.forEach((c) => cotesSet.add(c.trim()));
            });
          } else {
            // Non-searched items: one row per inventory item
            const startRow = wsData.length;
            wsData.push([
              group.contenedor,
              inv.pallets || 1,
              inv.cantidad || 0,
              Number(inv.kilos) || 0,
              desc,
              '',
              '',
            ]);
            // NOT marked as buscado (no yellow)
          }
        });
        // Blank row between containers
        wsData.push(['', '', '', '', '', '', '']);
      });

      // Remove trailing empty row
      if (wsData.length > 0 && wsData[wsData.length - 1].every((c: any) => c === '' || c === undefined)) {
        wsData.pop();
      }

      // Summary section
      wsData.push(['', '', '', '', '', '', '']);
      wsData.push(['', '', '', '', 'RESUMEN TOTAL (SOLO BUSCADOS)', '', '']);
      wsData.push(['', '', '', '', 'TOTAL PALLETS', 'CAJAS', 'KG']);
      wsData.push(['', '', '', '', totalPalletsBuscados, totalBultosBuscados, totalKgBuscados]);

      // COTES UNICOS
      const sortedCotes = Array.from(cotesSet).sort();
      if (sortedCotes.length > 0) {
        wsData.push(['', '', '', '', '', '', '']);
        wsData.push(['', '', '', '', 'COTES DE INGRESO (UNICOS)', '', '']);
        sortedCotes.forEach((cote) => {
          wsData.push(['', '', '', '', cote, '', '']);
        });
      }

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Merge title A1:G1
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];

      // ── Apply styles cell by cell ──
      const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

      for (let R = 0; R < wsData.length; R++) {
        const rowData = wsData[R];
        const isDataHeader = R === 2; // row 3 (0-indexed = 2)
        const isEmptyRow = rowData.every((c: any) => c === '' || c === undefined);
        const isSummaryLabel = rowData[4] && typeof rowData[4] === 'string' &&
          (rowData[4].includes('RESUMEN') || rowData[4].includes('COTES'));
        const isTotalLabel = rowData[4] && typeof rowData[4] === 'string' && rowData[4].includes('TOTAL PALLETS');
        const isTotalValue = R > 0 && wsData[R - 1] && wsData[R - 1][4] === 'TOTAL PALLETS';
        const isCoteValue = R > 0 && wsData[R - 1] && typeof wsData[R - 1][4] === 'string' && wsData[R - 1][4].includes('UNICOS');
        const isBuscado = buscadoRows.has(R);

        for (let C = 0; C < 7; C++) {
          const ref = `${colLetters[C]}${R + 1}`;
          const cell = ws[ref];
          if (!cell) continue;

          if (R === 0) {
            // Title row: bold 14pt, yellow background, centered, borders
            cell.s = {
              font: { bold: true, sz: 14, name: 'Calibri' },
              fill: { fgColor: { rgb: 'FFFF00' } },
              border: thinBorder,
              alignment: { horizontal: 'center' as const, vertical: 'center' as const },
            };
          } else if (isDataHeader) {
            // Header row: gray background, bold, borders, centered
            cell.s = {
              fill: { fgColor: { rgb: 'E0E0E0' } },
              font: { bold: true, sz: 10, name: 'Calibri' },
              border: thinBorder,
              alignment: { horizontal: 'center' as const, vertical: 'center' as const },
            };
          } else if (isEmptyRow) {
            // Empty separator rows: borders (cuadriculado completo)
            cell.s = {
              font: { sz: 10, name: 'Calibri' },
              border: thinBorder,
            };
          } else if (isSummaryLabel) {
            // Summary/COTES label: bold + borders
            cell.s = {
              font: { bold: true, sz: 10, name: 'Calibri' },
              border: thinBorder,
            };
          } else if (isCoteValue) {
            // COTES values: bold + borders
            cell.s = {
              font: { bold: true, sz: 10, name: 'Calibri' },
              border: thinBorder,
            };
          } else if (isTotalLabel) {
            // Total header label: bold + borders
            cell.s = {
              font: { bold: true, sz: 10, name: 'Calibri' },
              border: thinBorder,
            };
          } else if (isTotalValue) {
            // Total values: bold + borders
            cell.s = {
              font: { bold: true, sz: 10, name: 'Calibri' },
              border: thinBorder,
            };
          } else if (isBuscado) {
            // BUSCADO row: yellow highlight + borders on entire row
            cell.s = {
              font: { bold: true, sz: 10, name: 'Calibri' },
              fill: { fgColor: { rgb: 'FFFF00' } },
              border: thinBorder,
            };
          } else {
            // Normal data row (non-buscado): borders (cuadriculado)
            cell.s = {
              font: { sz: 10, name: 'Calibri' },
              border: thinBorder,
            };
          }
        }
      }

      ws['!cols'] = [
        { wch: 21 }, // A: Contenedor
        { wch: 7 },  // B: Cant.
        { wch: 9 },  // C: Bultos
        { wch: 9 },  // D: Peso
        { wch: 60 }, // E: Descripción
        { wch: 3 },  // F: vacío
        { wch: 13 }, // G: Pallet ID
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Plan de Carga');

      // ═══ Sheet 2: No Encontrados ═══
      if (pdfResults.missingPallets.length > 0) {
        const missData: any[][] = [
          ['Pallets No Encontrados en Inventario'],
          [],
          ['Pallet', 'Cajas', 'Kilos'],
        ];
        pdfResults.missingPallets.forEach(mp => {
          missData.push([mp.palletNumber || '', mp.cajas || '', mp.kilos || '']);
        });
        const ws2 = XLSX.utils.aoa_to_sheet(missData);
        if (ws2['A1']) ws2['A1'].s = { font: { bold: true, sz: 12, name: 'Calibri' } };
        ws2['!cols'] = [{ wch: 21 }, { wch: 13 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, ws2, 'No Encontrados');
      }

      XLSX.writeFile(wb, `Planilla_de_Carga.xlsx`);
    } catch (error) {
      console.error('Error exportando planilla:', error);
    }
  }, [pdfResults, containerGroups, fileName]);

  const clearPdfAll = () => {
    setPdfResults(null);
    setPdfPallets([]);
    setManualIds('');
    setExpandedPdfGroups(new Set());
    setFileName('');
  };

  // ─── QUEUE LOGIC ────────────────────────────────────────────────────────────

  const readyOrders = useMemo(() =>
    orders.filter(o => o.estado === 'LISTO').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [orders]
  );

  const handleDispatch = useCallback(() => {
    if (!dispatchTarget) return;
    setIsDispatching(true);
    try {
      const targetOrder = orders.find(o => o.id === dispatchTarget);
      if (!targetOrder) { setIsDispatching(false); return; }

      // Update order status
      const dispatchedOrder = { ...targetOrder, estado: 'DESPACHADO' as const, updatedAt: new Date().toISOString() };
      const updatedOrders = orders.map(o =>
        o.id === dispatchTarget ? dispatchedOrder : o
      );
      setOrders(updatedOrders);
      saveOrders(updatedOrders);

      // Deduct inventory
      const itemsToDeduct = targetOrder.items;
      const updatedInventory = [...inventoryData];
      for (const orderItem of itemsToDeduct) {
        for (let i = 0; i < updatedInventory.length; i++) {
          const inv = updatedInventory[i];
          const matchKey = `${inv.contenedor || ''}|${inv.lote || ''}|${inv.producto}`;
          const orderKey = `${orderItem.contenedor}|${orderItem.lote}|${orderItem.producto}`;
          if (matchKey === orderKey && inv.pallets > 0) {
            const deduct = Math.min(orderItem.palletsRequested || 1, inv.pallets);
            inv.pallets = Math.max(0, inv.pallets - deduct);
            inv.cantidad = Math.max(0, (inv.cantidad || 0) - deduct * Math.round((inv.cantidad || 0) / Math.max(inv.pallets + deduct, 1)));
            inv.kilos = Math.max(0, (inv.kilos || 0) - deduct * Math.round((inv.kilos || 0) / Math.max(inv.pallets + deduct, 1)));
            break;
          }
        }
      }

      // Remove zero-pallet items
      const cleanedInventory = updatedInventory.filter(item => item.pallets > 0);
      onUpdateInventory(cleanedInventory);

      setDispatchTarget(null);

      // Auto-generate remito de dos vías after dispatch
      setTimeout(() => printRemito(dispatchedOrder), 300);
    } catch (error) {
      console.error("Error dispatching order:", error);
    } finally {
      setIsDispatching(false);
    }
  }, [dispatchTarget, orders, inventoryData, onUpdateInventory]);

  // ─── HISTORY LOGIC ──────────────────────────────────────────────────────────

  const dispatchedOrders = useMemo(() => {
    let filtered = orders.filter(o => o.estado === 'DESPACHADO');
    const now = new Date();

    if (historyFilter === 'hoy') {
      filtered = filtered.filter(o => {
        const d = new Date(o.updatedAt);
        return d.toDateString() === now.toDateString();
      });
    } else if (historyFilter === 'semana') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(o => new Date(o.updatedAt) >= weekAgo);
    } else if (historyFilter === 'mes') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(o => new Date(o.updatedAt) >= monthAgo);
    }

    if (historySearch.trim()) {
      const term = historySearch.toLowerCase();
      filtered = filtered.filter(o =>
        (o.orderNumber || '').toLowerCase().includes(term) ||
        (o.cliente || '').toLowerCase().includes(term)
      );
    }

    return filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [orders, historyFilter, historySearch]);

  // ─── EXCEL EXPORT ───────────────────────────────────────────────────────────

  const exportOrderExcel = (order: Order) => {
    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];
    const highlightedRows = new Set<number>();

    // Collect COTE codes
    const coteSet = new Set<string>();
    order.items.forEach(item => {
      const coteMatches = (item.producto || '').match(/COTE\s+P?\d+/gi) || [];
      coteMatches.forEach(c => { coteSet.add(c.replace(/COTE\s*P?/i, 'P')); });
    });

    wsData.push(['PLANILLA DE CARGA', '', '', '', '', '', '']);
    wsData.push([]);
    wsData.push(['Cliente:', order.cliente, '', 'Fecha:', formatDate(order.updatedAt), '', '']);
    wsData.push(['Orden:', order.orderNumber, '', '', '', '', '']);
    wsData.push([]);
    wsData.push(['Contenedor', 'Cant. Pallets', 'Bultos', 'Peso', 'Descripción', '', 'Pallet ID']);

    // Group items by container
    const groupedByContainer = new Map<string, typeof order.items>();
    order.items.forEach(item => {
      const key = item.contenedor || 'SIN CONTENEDOR';
      if (!groupedByContainer.has(key)) groupedByContainer.set(key, []);
      groupedByContainer.get(key)!.push(item);
    });

    let totalPallets = 0, totalCajas = 0, totalKilos = 0;
    groupedByContainer.forEach((items, container) => {
      items.forEach(item => {
        highlightedRows.add(wsData.length);
        wsData.push([
          container,
          item.palletsRequested || 1,
          item.cajas,
          item.kilos,
          item.producto || '',
          '',
          item.numeroCliente || item.lote || '',
        ]);
        totalPallets += item.palletsRequested || 1;
        totalCajas += item.cajas;
        totalKilos += item.kilos;
      });
      wsData.push([]);
    });

    wsData.push([]);
    wsData.push(['', '', '', '', 'RESUMEN TOTAL', '', '']);
    wsData.push(['', totalPallets, totalCajas, Math.round(totalKilos), '', '', '']);

    wsData.push([]);
    wsData.push(['', '', '', '', 'COTES ÚNICOS', '', '']);
    Array.from(coteSet).sort().forEach(cote => wsData.push(['', '', '', '', cote, '', '']));

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: wsData.length - 1, c: 6 } });
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];

    const thinBorder = {
      top: { style: "thin" as const, color: { rgb: "000000" } },
      bottom: { style: "thin" as const, color: { rgb: "000000" } },
      left: { style: "thin" as const, color: { rgb: "000000" } },
      right: { style: "thin" as const, color: { rgb: "000000" } },
    };

    if (ws['A1']) ws['A1'].s = { font: { bold: true, sz: 14 }, alignment: { horizontal: "center" as const, vertical: "center" as const } };

    const headerCols = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const headerRow = 5;
    headerCols.forEach(col => {
      const cellRef = `${col}${headerRow}`;
      if (ws[cellRef]) ws[cellRef].s = {
        fill: { fgColor: { rgb: "E0E0E0" } },
        font: { bold: true, sz: 10 },
        border: thinBorder,
        alignment: { horizontal: "center" as const, vertical: "center" as const },
      };
    });

    for (let i = 6; i < wsData.length; i++) {
      const row = i + 1;
      const rowData = wsData[i];
      if (!rowData || rowData.every(c => c === '' || c === null || c === undefined)) continue;
      const isHighlighted = highlightedRows.has(i);
      headerCols.forEach(col => {
        const cellRef = `${col}${row}`;
        if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
        if (isHighlighted && col === 'G') {
          ws[cellRef].s = { border: thinBorder, font: { sz: 10, bold: true }, fill: { fgColor: { rgb: "FFFF00" } } };
        } else {
          ws[cellRef].s = { border: thinBorder, font: { sz: 10 } };
        }
      });
    }

    ws['!cols'] = [
      { wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 55 }, { wch: 4 }, { wch: 14 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Plan de Carga");
    XLSX.writeFile(wb, `Planilla_${order.orderNumber}.xlsx`);
  };

  // ─── REMITO PRINT ───────────────────────────────────────────────────────────

  const buildRemitoBody = (order: Order, copyLabel: string, copyColor: string) => {
    const totalPallets = order.items.reduce((s, i) => s + (i.palletsRequested || 1), 0);
    const totalCajas = order.items.reduce((s, i) => s + i.cajas, 0);
    const totalKilos = order.items.reduce((s, i) => s + i.kilos, 0);

    const containers = [...new Set(order.items.map(i => i.contenedor).filter(Boolean))];

    const itemsRows = order.items.map((item, idx) => `
      <tr style="border-bottom:1px solid #ddd;">
        <td style="padding:6px 8px;font-size:11px;">${idx + 1}</td>
        <td style="padding:6px 8px;font-size:11px;font-family:monospace;">${item.contenedor || '-'}</td>
        <td style="padding:6px 8px;font-size:11px;">${item.producto || '-'}</td>
        <td style="padding:6px 8px;font-size:11px;text-align:center;">${item.palletsRequested || 1}</td>
        <td style="padding:6px 8px;font-size:11px;text-align:right;">${item.cajas}</td>
        <td style="padding:6px 8px;font-size:11px;text-align:right;">${Number(item.kilos).toFixed(1)} kg</td>
        <td style="padding:6px 8px;font-size:11px;font-family:monospace;">${item.numeroCliente || item.lote || '-'}</td>
      </tr>
    `).join('');

    return `
      <div style="border:2px solid ${copyColor};padding:18px;margin-bottom:10px;">
        <div class="header">
          <div>
            <h1>FRIMARAL</h1>
            <div class="sub">Centro Log&iacute;stico &middot; Remito de Despacho</div>
          </div>
          <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
            <div style="font-size:22px;font-weight:bold;font-family:monospace;">${order.orderNumber}</div>
            <div style="font-size:11px;color:#666;">${formatDateTime(order.updatedAt)}</div>
            <div style="margin-top:4px;padding:4px 16px;background:${copyColor};color:white;font-size:11px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;">${copyLabel}</div>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-box">
            <div class="label">Cliente</div>
            <div class="value">${order.cliente || '-'}</div>
          </div>
          <div class="meta-box">
            <div class="label">Contenedor(es)</div>
            <div class="value">${containers.join(', ') || '-'}</div>
          </div>
          <div class="meta-box">
            <div class="label">Fecha de Despacho</div>
            <div class="value">${formatDate(order.updatedAt)}</div>
          </div>
          <div class="meta-box">
            <div class="label">Observaciones</div>
            <div class="value">${order.observaciones || '-'}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr style="background:#111;color:white;">
              <th style="padding:8px;font-size:10px;text-align:left;">#</th>
              <th style="padding:8px;font-size:10px;text-align:left;">Contenedor</th>
              <th style="padding:8px;font-size:10px;text-align:left;">Descripci&oacute;n</th>
              <th style="padding:8px;font-size:10px;text-align:center;">Pallets</th>
              <th style="padding:8px;font-size:10px;text-align:right;">Bultos</th>
              <th style="padding:8px;font-size:10px;text-align:right;">Peso</th>
              <th style="padding:8px;font-size:10px;text-align:left;">Pallet ID</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>

        <div class="totals">
          <div class="t-item"><div class="t-label">Total Pallets</div><div class="t-val">${totalPallets}</div></div>
          <div class="t-item"><div class="t-label">Total Bultos</div><div class="t-val">${totalCajas}</div></div>
          <div class="t-item"><div class="t-label">Peso Total</div><div class="t-val">${totalKilos.toFixed(1)} kg</div></div>
        </div>

        <div class="signatures">
          <div class="sig"><div class="line">Firma Despachante</div></div>
          <div class="sig"><div class="line">Firma Receptor</div></div>
          <div class="sig"><div class="line">Control Calidad</div></div>
        </div>
      </div>
    `;
  };

  const printRemito = (order: Order) => {
    const originalBody = buildRemitoBody(order, 'ORIGINAL', '#111');
    const duplicadoBody = buildRemitoBody(order, 'DUPLICADO', '#555');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>REMITO - ${order.orderNumber}</title>
        <style>
          @page { size: A4; margin: 10mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 0; }
          table { width: 100%; border-collapse: collapse; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 3px solid #111; padding-bottom: 15px; }
          .header h1 { font-size: 20px; letter-spacing: 4px; text-transform: uppercase; margin: 0; }
          .header .sub { font-size: 10px; color: #666; letter-spacing: 2px; text-transform: uppercase; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
          .meta-box { border: 1px solid #ccc; padding: 10px 14px; }
          .meta-box .label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 2px; }
          .meta-box .value { font-size: 13px; font-weight: bold; }
          .totals { display: flex; gap: 30px; margin-top: 15px; padding: 12px; background: #f5f5f5; border: 1px solid #ddd; }
          .totals .t-item .t-label { font-size: 9px; text-transform: uppercase; color: #666; }
          .totals .t-item .t-val { font-size: 18px; font-weight: bold; }
          .signatures { margin-top: 60px; display: flex; justify-content: space-between; }
          .sig { width: 200px; text-align: center; }
          .sig .line { border-top: 1px solid #111; margin-top: 50px; padding-top: 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
          .page-break { page-break-after: always; }
          @media print {
            .page-break { page-break-after: always; }
          }
        </style>
      </head>
      <body>
        ${originalBody}
        <div class="page-break"></div>
        ${duplicadoBody}
      </body>
      </html>
    `;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 500);
    }
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-neutral-50">
      {/* Header */}
      <div className="p-6 pb-4 border-b border-neutral-200 flex-shrink-0">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-2xl font-light tracking-tight text-neutral-900 uppercase">Despachos</h2>
            <p className="text-xs font-mono text-neutral-500 mt-1 uppercase tracking-widest">
              Gestión de despachos &middot; {readyOrders.length} listos &middot; {dispatchedOrders.length} despachados
            </p>
          </div>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 border border-neutral-200 bg-white p-1 w-fit">
          {([
            { key: 'pdf' as const, label: '01. Localizador de Pallets', icon: <FileText className="w-3.5 h-3.5" /> },
            { key: 'queue' as const, label: '02. Cola de Despacho', icon: <Truck className="w-3.5 h-3.5" />, badge: readyOrders.length > 0 ? readyOrders.length : undefined },
            { key: 'history' as const, label: '03. Historial de Despachos', icon: <Package className="w-3.5 h-3.5" /> },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-widest transition-colors ${
                activeSection === tab.key
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.badge !== undefined && (
                <span className={`ml-1 px-1.5 py-0.5 text-[9px] font-mono ${
                  activeSection === tab.key ? 'bg-white text-neutral-900' : 'bg-neutral-900 text-white'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* ─── SECTION 1: PDF Pallet Locator ─── */}
        {activeSection === 'pdf' && (
          <div className="flex flex-col gap-6">
            {inventoryData.length === 0 && (
              <div className="border border-amber-200 bg-amber-50 p-4 text-xs font-mono text-amber-800 uppercase tracking-widest">
                ⚠ No hay inventario cargado. Ve a la sección &quot;02. Inventario&quot; y carga un archivo Excel primero.
              </div>
            )}

            {!pdfResults && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* PDF Upload */}
                <div className="border border-neutral-300 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="p-5 border-b border-neutral-200 bg-neutral-50">
                    <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 flex items-center gap-2">
                      <FileText className="w-4 h-4" /> Cargar PDF de Despacho
                    </h3>
                  </div>
                  <div className="p-5">
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
                        <input type="file" className="hidden" accept=".pdf" onChange={handlePdfUpload}
                          ref={pdfFileRef} disabled={isProcessing} />
                      </label>
                    </div>

                    {pdfPallets.length > 0 && (
                      <div className="mt-4">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-green-600 mb-2">
                          {pdfPallets.length} pallets extraídos de {fileName}
                        </p>
                        <div className="max-h-40 overflow-auto border border-neutral-200">
                          <table className="w-full text-left text-xs font-sans">
                            <thead className="bg-neutral-900 text-white text-[10px] font-mono uppercase tracking-widest sticky top-0">
                              <tr><th className="p-3">Pallet</th><th className="p-3 text-right">Cajas</th><th className="p-3 text-right">Kilos</th></tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-200">
                              {pdfPallets.map((p, i) => (
                                <tr key={i} className="hover:bg-neutral-50">
                                  <td className="p-3 font-mono font-medium text-neutral-900">{p.palletNumber}</td>
                                  <td className="p-3 text-right font-mono text-neutral-700">{p.cajas}</td>
                                  <td className="p-3 text-right font-mono text-neutral-700">{p.kilos.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Manual + Process */}
                <div className="border border-neutral-300 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                  <div className="p-5 border-b border-neutral-200 bg-neutral-50">
                    <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 flex items-center gap-2">
                      <Search className="w-4 h-4" /> Buscar en Inventario
                    </h3>
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <p className="text-[10px] font-sans text-neutral-500 mb-4">
                      Busca los pallets contra el inventario para ver a qué contenedor pertenecen.
                    </p>
                    <textarea
                      className="w-full flex-1 p-3 text-xs font-mono bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors resize-none mb-3"
                      placeholder={"O ingresa pallets manualmente (separados por comas o espacios):\n\nEjemplo: 286554, 287450, 288029"}
                      value={manualIds} onChange={(e) => setManualIds(e.target.value)} />
                    <button onClick={processPdfData}
                      disabled={isProcessing || (pdfPallets.length === 0 && manualIds.trim() === '') || inventoryData.length === 0}
                      className="w-full py-3 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors disabled:bg-neutral-300 disabled:cursor-not-allowed">
                      {pdfPallets.length > 0 ? `Buscar ${pdfPallets.length} pallets en Inventario` : 'Buscar en Inventario'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PDF Results */}
            {pdfResults && (
              <div className="flex flex-col gap-6">
                {/* Summary */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-neutral-200 border border-neutral-200">
                  <div className="bg-green-50 p-5 flex items-center gap-4">
                    <div className="p-3 bg-green-100 text-green-700 rounded-full"><CheckCircle className="w-6 h-6" /></div>
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-green-700">Encontrados</p>
                      <p className="text-2xl font-light text-green-900">{pdfResults.foundItems.reduce((s, fi) => s + fi.pdfPallets.length, 0)}</p>
                    </div>
                  </div>
                  <div className="bg-blue-50 p-5 flex items-center gap-4">
                    <div className="p-3 bg-blue-100 text-blue-700 rounded-full"><Box className="w-6 h-6" /></div>
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-blue-700">Contenedores</p>
                      <p className="text-2xl font-light text-blue-900">{containerGroups.length}</p>
                    </div>
                  </div>
                  <div className="bg-red-50 p-5 flex items-center gap-4">
                    <div className="p-3 bg-red-100 text-red-700 rounded-full"><AlertCircle className="w-6 h-6" /></div>
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-red-700">No Encontrados</p>
                      <p className="text-2xl font-light text-red-900">{pdfResults.missingPallets.length}</p>
                    </div>
                  </div>
                  <div className="bg-white p-5 flex items-center gap-4">
                    <div className="p-3 bg-neutral-200 text-neutral-700 rounded-full"><Package className="w-6 h-6" /></div>
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-700">Total Cajas</p>
                      <p className="text-2xl font-light text-neutral-900">{pdfResults.foundItems.reduce((s, fi) => s + (fi.item.cantidad || 0), 0)}</p>
                    </div>
                  </div>
                </div>

                {/* Missing */}
                {pdfResults.missingPallets.length > 0 && (
                  <div className="border border-red-200 bg-red-50 p-4">
                    <h4 className="text-xs font-mono uppercase tracking-widest text-red-900 mb-3">Pallets No Encontrados:</h4>
                    <div className="flex flex-wrap gap-2">
                      {pdfResults.missingPallets.map((p, i) => (
                        <span key={i} className="px-3 py-1 bg-red-100 text-red-800 text-[10px] font-mono border border-red-200">
                          {p.palletNumber}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Container Groups */}
                {containerGroups.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {containerGroups.map((group, groupIdx) => {
                      const groupKey = group.contenedor;
                      const isExpanded = expandedPdfGroups.has(groupKey);
                      return (
                        <div key={groupKey} className="border border-neutral-300 bg-white overflow-hidden shadow-sm">
                          <button
                            onClick={() => {
                              setExpandedPdfGroups(prev => {
                                const next = new Set(prev);
                                if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
                                return next;
                              });
                            }}
                            className="w-full flex items-center justify-between p-5 hover:bg-neutral-50 transition-colors text-left"
                          >
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              <div className={`w-5 h-5 flex items-center justify-center text-neutral-500 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 flex-wrap mb-1">
                                  <span className="text-sm font-mono uppercase tracking-wider text-neutral-900 font-bold">{group.contenedor}</span>
                                  <span className="px-2 py-0.5 bg-yellow-200 text-amber-800 text-[10px] font-mono uppercase tracking-widest">
                                    {group.items.filter(i => i.isSearched).reduce((s, i) => s + i.pdfPallets.length, 0)} buscados
                                  </span>
                                  <span className="px-2 py-0.5 bg-neutral-900 text-white text-[10px] font-mono uppercase tracking-widest">
                                    {group.items.length} PROD
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 text-[11px] font-mono text-neutral-600 truncate">
                                  <span className="text-neutral-400">CLIENTE:</span>
                                  <span className="font-medium">{group.clientes.join(', ')}</span>
                                </div>
                                <div className="flex items-center gap-5 mt-1 text-[10px] font-mono text-neutral-500">
                                  <span><span className="font-bold text-neutral-700">{group.totalPdfCajas}</span> CAJAS</span>
                                  <span><span className="font-bold text-neutral-700">{group.totalPdfKilos.toFixed(1)}</span> KG (PDF)</span>
                                  <span><span className="font-bold text-neutral-700">{group.totalInvKilos.toFixed(1)}</span> KG (INV)</span>
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
                                      <th className="p-3 w-8"></th>
                                      <th className="p-3">Pallet</th>
                                      <th className="p-3">Producto</th>
                                      <th className="p-3 text-right">Cajas</th>
                                      <th className="p-3 text-right">Kilos (PDF)</th>
                                      <th className="p-3 text-right">Kilos (Inv)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-neutral-200 bg-white">
                                    {group.items.map(({ inventoryItem, pdfPallets: pdfs, isSearched }, idx) => {
                                      if (isSearched && pdfs.length > 0) {
                                        return pdfs.map((pallet, pIdx) => (
                                          <tr key={`${idx}-${pIdx}`} className="bg-yellow-50 hover:bg-yellow-100">
                                            <td className="p-3 text-center"><span className="inline-block w-2 h-2 rounded-full bg-yellow-400" /></td>
                                            <td className="p-3 font-mono font-semibold text-amber-800">{pallet.palletNumber}</td>
                                            <td className="p-3">{inventoryItem.producto}</td>
                                            <td className="p-3 text-right font-mono font-semibold text-amber-800">{pallet.cajas}</td>
                                            <td className="p-3 text-right font-mono font-semibold text-amber-800">{pallet.kilos.toFixed(2)}</td>
                                            <td className="p-3 text-right font-mono text-neutral-500">{inventoryItem.kilos}</td>
                                          </tr>
                                        ));
                                      } else {
                                        return (
                                          <tr key={`${idx}-inv`} className="hover:bg-neutral-50 opacity-60">
                                            <td className="p-3 text-center"><span className="inline-block w-2 h-2 rounded-full bg-neutral-300" /></td>
                                            <td className="p-3 font-mono text-neutral-500">{inventoryItem.numeroCliente}</td>
                                            <td className="p-3 text-neutral-500">{inventoryItem.producto}</td>
                                            <td className="p-3 text-right font-mono text-neutral-500">{inventoryItem.cantidad}</td>
                                            <td className="p-3 text-right font-mono text-neutral-400">-</td>
                                            <td className="p-3 text-right font-mono text-neutral-500">{inventoryItem.kilos}</td>
                                          </tr>
                                        );
                                      }
                                    })}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-neutral-900 text-white border-t-2 border-neutral-300 font-bold">
                                      <td className="p-3 text-[10px] text-sm" colSpan={3}>
                                        SUBTOTAL ({group.items.filter(i => i.isSearched).reduce((s, i) => s + i.pdfPallets.length, 0)} buscados / {group.items.length} total)
                                      </td>
                                      <td className="p-3 text-right font-mono text-sm">{group.totalPdfCajas}</td>
                                      <td className="p-3 text-right font-mono text-sm">{group.totalPdfKilos.toFixed(1)}</td>
                                      <td className="p-3 text-right font-mono text-sm text-neutral-300">{group.totalInvKilos.toFixed(1)}</td>
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

                {/* Actions */}
                <div className="flex items-center gap-3">
                  {pdfResults && pdfResults.foundItems.length > 0 && (
                    <button onClick={handleExportPdfResultsExcel}
                      className="px-5 py-2.5 text-xs font-mono uppercase tracking-widest border border-neutral-300 hover:border-neutral-900 transition-colors">
                      Exportar Excel
                    </button>
                  )}
                  <button onClick={clearPdfAll}
                    className="px-5 py-2.5 text-xs font-mono uppercase tracking-widest border border-neutral-300 hover:border-neutral-900 transition-colors">
                    Limpiar
                  </button>
                  {pdfResults && pdfResults.foundItems.length > 0 && (
                    <button onClick={handleCreateOrderFromPallets}
                      className="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors">
                      <ArrowRight className="w-4 h-4" /> Crear Pedido Con Estos Pallets
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── SECTION 2: Dispatch Queue ─── */}
        {activeSection === 'queue' && (
          <div className="flex flex-col gap-6">
            {readyOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-neutral-300 bg-white p-16 text-center">
                <Truck className="w-12 h-12 text-neutral-300 mb-4" />
                <p className="text-sm font-mono uppercase tracking-widest text-neutral-500 mb-2">Sin pedidos listos para despachar</p>
                <p className="text-xs font-mono text-neutral-400">Los pedidos con estado &quot;LISTO&quot; aparecerán aquí.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {readyOrders.map(order => {
                  const totalPallets = order.items.reduce((s, i) => s + (i.palletsRequested || 1), 0);
                  const totalCajas = order.items.reduce((s, i) => s + i.cajas, 0);
                  const totalKilos = order.items.reduce((s, i) => s + i.kilos, 0);
                  const containers = [...new Set(order.items.map(i => i.contenedor).filter(Boolean))];

                  return (
                    <div key={order.id} className="border border-neutral-300 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      <div className="p-5">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-mono font-bold text-neutral-900">{order.orderNumber}</span>
                            <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] font-mono uppercase tracking-widest">
                              LISTO
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-neutral-400">{formatDate(order.createdAt)}</span>
                        </div>
                        <div className="mb-3">
                          <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">Cliente: </span>
                          <span className="text-xs font-mono text-neutral-900 font-medium">{order.cliente}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {containers.map(c => (
                            <span key={c} className="px-2 py-1 bg-neutral-100 border border-neutral-200 text-[10px] font-mono text-neutral-700">
                              {c}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-5 text-[10px] font-mono text-neutral-500 mb-4">
                          <span><span className="font-bold text-neutral-700">{totalPallets}</span> PAL</span>
                          <span><span className="font-bold text-neutral-700">{totalCajas}</span> CAJ</span>
                          <span><span className="font-bold text-neutral-700">{totalKilos.toFixed(1)}</span> KG</span>
                          <span><span className="font-bold text-neutral-700">{order.items.length}</span> ITEMS</span>
                        </div>

                        {/* Items summary */}
                        <div className="max-h-32 overflow-auto border border-neutral-200 mb-4">
                          <table className="w-full text-left text-[10px] font-sans">
                            <thead className="bg-neutral-50 text-neutral-500 font-mono uppercase tracking-widest sticky top-0">
                              <tr>
                                <th className="p-2">Producto</th>
                                <th className="p-2 text-right">Pallets</th>
                                <th className="p-2 text-right">Cajas</th>
                                <th className="p-2 text-right">Kg</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                              {order.items.map((item, idx) => (
                                <tr key={idx} className="hover:bg-neutral-50">
                                  <td className="p-2 max-w-[180px] truncate">{item.producto}</td>
                                  <td className="p-2 text-right font-mono">{item.palletsRequested || 1}</td>
                                  <td className="p-2 text-right font-mono">{item.cajas}</td>
                                  <td className="p-2 text-right font-mono">{Number(item.kilos).toFixed(1)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <button
                          onClick={() => setDispatchTarget(order.id)}
                          className="w-full py-2.5 bg-green-600 text-white text-xs font-mono uppercase tracking-widest hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <Truck className="w-4 h-4" /> Despachar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <ConfirmModal
              open={dispatchTarget !== null}
              title="Confirmar Despacho"
              message="¿Confirma el despacho de este pedido? El inventario será actualizado automáticamente y el estado cambiará a DESPACHADO. Esta acción no se puede deshacer."
              confirmLabel="Sí, Despachar"
              cancelLabel="Cancelar"
              variant="warning"
              loading={isDispatching}
              onConfirm={handleDispatch}
              onCancel={() => setDispatchTarget(null)}
            />
          </div>
        )}

        {/* ─── SECTION 3: Dispatch History ─── */}
        {activeSection === 'history' && (
          <div className="flex flex-col gap-6">
            {/* Filters */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex gap-1 border border-neutral-200 bg-white p-1">
                {([
                  { key: 'hoy' as const, label: 'Hoy' },
                  { key: 'semana' as const, label: 'Esta Semana' },
                  { key: 'mes' as const, label: 'Este Mes' },
                  { key: 'todos' as const, label: 'Todos' },
                ]).map(f => (
                  <button
                    key={f.key}
                    onClick={() => setHistoryFilter(f.key)}
                    className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                      historyFilter === f.key ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
                <Search className="w-4 h-4 text-neutral-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar cliente o pedido..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full py-1.5 text-xs font-mono bg-transparent border-b border-neutral-300 focus:border-neutral-900 outline-none transition-colors placeholder:text-neutral-400 uppercase"
                />
                {historySearch && (
                  <button onClick={() => setHistorySearch('')} className="text-neutral-400 hover:text-neutral-900">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
                {dispatchedOrders.length} despacho{dispatchedOrders.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Dispatched Orders List */}
            {dispatchedOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-neutral-300 bg-white p-16 text-center">
                <Package className="w-12 h-12 text-neutral-300 mb-4" />
                <p className="text-sm font-mono uppercase tracking-widest text-neutral-500 mb-2">Sin despachos registrados</p>
                <p className="text-xs font-mono text-neutral-400">Los pedidos despachados aparecerán aquí.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {dispatchedOrders.map(order => {
                  const isExpanded = expandedHistoryOrders.has(order.id);
                  const totalPallets = order.items.reduce((s, i) => s + (i.palletsRequested || 1), 0);
                  const totalCajas = order.items.reduce((s, i) => s + i.cajas, 0);
                  const totalKilos = order.items.reduce((s, i) => s + i.kilos, 0);
                  const containers = [...new Set(order.items.map(i => i.contenedor).filter(Boolean))];

                  return (
                    <div key={order.id} className="border border-neutral-300 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      <button
                        onClick={() => {
                          setExpandedHistoryOrders(prev => {
                            const next = new Set(prev);
                            if (next.has(order.id)) next.delete(order.id); else next.add(order.id);
                            return next;
                          });
                        }}
                        className="w-full flex items-center justify-between p-5 hover:bg-neutral-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className={`w-5 h-5 flex items-center justify-center text-neutral-500 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap mb-1">
                              <span className="text-sm font-mono uppercase tracking-wider text-neutral-900 font-bold">{order.orderNumber}</span>
                              <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 text-[10px] font-mono uppercase tracking-widest">DESPACHADO</span>
                              {containers.map(c => (
                                <span key={c} className="px-2 py-0.5 bg-neutral-900 text-white text-[10px] font-mono uppercase tracking-widest">
                                  {c}
                                </span>
                              ))}
                            </div>
                            <div className="flex items-center gap-4 text-[11px] font-mono text-neutral-600">
                              <span><span className="text-neutral-400">CLIENTE:</span> <span className="font-medium">{order.cliente}</span></span>
                              <span><span className="text-neutral-400">FECHA:</span> {formatDate(order.updatedAt)}</span>
                            </div>
                            <div className="flex items-center gap-5 mt-1 text-[10px] font-mono text-neutral-500">
                              <span><span className="font-bold text-neutral-700">{totalPallets}</span> PAL</span>
                              <span><span className="font-bold text-neutral-700">{totalCajas}</span> CAJ</span>
                              <span><span className="font-bold text-neutral-700">{totalKilos.toFixed(1)}</span> KG</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-4">
                          <button
                            onClick={(e) => { e.stopPropagation(); exportOrderExcel(order); }}
                            className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-mono uppercase tracking-widest bg-green-600 text-white hover:bg-green-700 transition-colors"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" /> Exportar Excel
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); printRemito(order); }}
                            className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-mono uppercase tracking-widest border border-neutral-900 text-neutral-900 hover:bg-neutral-900 hover:text-white transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" /> Reimprimir Remito
                          </button>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t-2 border-neutral-200 bg-neutral-50">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs font-sans">
                              <thead className="bg-neutral-900 text-white text-[10px] font-mono uppercase tracking-widest">
                                <tr>
                                  <th className="p-3">Contenedor</th>
                                  <th className="p-3">Producto</th>
                                  <th className="p-3">Lote</th>
                                  <th className="p-3 text-right">Pallets</th>
                                  <th className="p-3 text-right">Cajas</th>
                                  <th className="p-3 text-right">Kilos</th>
                                  <th className="p-3">Pallet ID</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-200 bg-white">
                                {order.items.map((item, idx) => (
                                  <tr key={idx} className="hover:bg-neutral-50">
                                    <td className="p-3 font-mono font-medium text-neutral-700 whitespace-nowrap">{item.contenedor || '-'}</td>
                                    <td className="p-3 max-w-[200px] truncate" title={item.producto}>{item.producto || '-'}</td>
                                    <td className="p-3 font-mono text-neutral-500 text-[10px] whitespace-nowrap">{item.lote || '-'}</td>
                                    <td className="p-3 text-right font-mono font-medium">{item.palletsRequested || 1}</td>
                                    <td className="p-3 text-right font-mono">{item.cajas}</td>
                                    <td className="p-3 text-right font-mono font-bold">{Number(item.kilos).toFixed(1)}</td>
                                    <td className="p-3 font-mono text-neutral-500 text-[10px] whitespace-nowrap">{item.numeroCliente || item.lote || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-neutral-900 text-white border-t-2 border-neutral-300 font-bold">
                                  <td className="p-3 font-mono uppercase tracking-widest text-[10px]" colSpan={3}>TOTAL</td>
                                  <td className="p-3 text-right font-mono text-sm">{totalPallets}</td>
                                  <td className="p-3 text-right font-mono text-sm">{totalCajas}</td>
                                  <td className="p-3 text-right font-mono text-sm">{totalKilos.toFixed(1)}</td>
                                  <td className="p-3"></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                          {order.observaciones && (
                            <div className="px-5 py-3 border-t border-neutral-200 text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                              OBS: {order.observaciones}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
