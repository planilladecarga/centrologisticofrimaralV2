'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx-js-style';
import ConfirmModal from './ConfirmModal';

interface InventoryItem {
  id?: string;
  cliente: string;
  numeroCliente?: string;
  producto: string;
  contenedor: string;
  lote: string;
  pallets: number;
  cantidad: number;
  kilos: number;
}

interface IngresoLine {
  contenedor: string;
  producto: string;
  lote: string;
  dua: string;
  pallets: number;
  cajas: number;
  kilos: number;
  esCarne: boolean;
  mgap: string;
}

interface IngresoRecord {
  id: string;
  fecha: string;
  cliente: string;
  contenedor: string;
  lineas: IngresoLine[];
  observaciones: string;
  createdAt: string;
}

interface Props {
  inventoryData: InventoryItem[];
}

const INGRESO_HISTORY_KEY = 'frimaral_ingreso_history_v1';
const PRODUCT_CATALOG_KEY = 'frimaral_product_catalog_v1';

interface CatalogEntry {
  cliente: string;
  producto: string;
  lote: string;
  dua: string;
  cajas: number;
  kilos: number;
  pallets: number;
  contenedor: string;
  esCarne: boolean;
}

const emptyLine = (): IngresoLine => ({
  contenedor: '',
  producto: '',
  lote: '',
  dua: '',
  pallets: 0,
  cajas: 0,
  kilos: 0,
  esCarne: false,
  mgap: '',
});

/* ─── Autocomplete Dropdown Component ─── */
function AutocompleteDropdown({
  value,
  onChange,
  placeholder,
  suggestions,
  onSelect,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  suggestions: string[];
  onSelect?: (val: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!value.trim()) return suggestions;
    const term = value.toUpperCase();
    return suggestions.filter(s => s.toUpperCase().includes(term));
  }, [value, suggestions]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightIdx(0);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightIdx >= 0 && highlightIdx < filtered.length) {
      e.preventDefault();
      const selected = filtered[highlightIdx];
      onChange(selected);
      setIsOpen(false);
      setHighlightIdx(-1);
      onSelect?.(selected);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightIdx(-1);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setHighlightIdx(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors placeholder:text-neutral-400 pr-8"
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-neutral-300 shadow-lg max-h-52 overflow-auto">
          {filtered.map((s, idx) => (
            <button
              key={`${s}-${idx}`}
              className={`w-full text-left px-3 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors ${
                idx === highlightIdx
                  ? 'bg-neutral-900 text-white'
                  : 'hover:bg-neutral-100 text-neutral-900'
              }`}
              onClick={() => {
                onChange(s);
                setIsOpen(false);
                setHighlightIdx(-1);
                onSelect?.(s);
              }}
              onMouseEnter={() => setHighlightIdx(idx)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {isOpen && filtered.length === 0 && value.trim() && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-neutral-200 shadow p-3 text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
          Sin resultados &middot; escribe libremente
        </div>
      )}
    </div>
  );
}

/* ─── Product Dropdown for table rows ─── */
function ProductDropdown({
  value,
  onChange,
  placeholder,
  productSuggestions,
  onProductSelect,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  productSuggestions: CatalogEntry[];
  onProductSelect: (item: CatalogEntry) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 320 });
  const [mounted, setMounted] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!value.trim()) return productSuggestions;
    const term = value.toUpperCase();
    return productSuggestions.filter(s => s.producto.toUpperCase().includes(term));
  }, [value, productSuggestions]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = Math.min(280, filtered.length * 48 + 32);
    const shouldDropUp = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    setDropdownPos({
      top: shouldDropUp ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
      left: rect.left,
      width: Math.max(680, rect.width),
    });
  }, [isOpen, filtered.length]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideInput = wrapperRef.current && wrapperRef.current.contains(target);
      const insideDropdown = dropdownRef.current && dropdownRef.current.contains(target);
      if (!insideInput && !insideDropdown) {
        setIsOpen(false);
        setHighlightIdx(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightIdx(0);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightIdx >= 0 && highlightIdx < filtered.length) {
      e.preventDefault();
      const item = filtered[highlightIdx];
      onProductSelect(item);
      setIsOpen(false);
      setHighlightIdx(-1);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightIdx(-1);
    }
  };

  const selectItem = (item: CatalogEntry) => {
    // Only call onProductSelect — it handles setting producto + esCarne
    // Do NOT call onChange to avoid stale-state conflicts
    onProductSelect(item);
    setIsOpen(false);
    setHighlightIdx(-1);
  };

  const dropdownContent = isOpen && filtered.length > 0 && mounted ? (
    <div
      ref={dropdownRef}
      className="bg-white border border-neutral-300 shadow-xl max-h-72 overflow-auto"
      style={{
        position: 'fixed',
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        zIndex: 9999,
      }}
    >
      {/* Header row */}
      <div className="sticky top-0 z-10 bg-neutral-900 text-white grid grid-cols-12 gap-0 text-[9px] font-mono uppercase tracking-widest px-2 py-1.5">
        <div className="col-span-3">Contenedor</div>
        <div className="col-span-4">Producto</div>
        <div className="col-span-2">Lote</div>
        <div className="col-span-2">DUA</div>
        <div className="col-span-1 text-right">Kilos</div>
      </div>
      {filtered.map((item, idx) => (
        <button
          key={`${item.producto}-${item.lote}-${idx}`}
          type="button"
          className={`w-full text-left grid grid-cols-12 gap-0 text-[10px] font-mono border-b border-neutral-100 last:border-0 transition-colors ${
            idx === highlightIdx
              ? 'bg-neutral-900 text-white'
              : 'hover:bg-neutral-100 text-neutral-900'
          }`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => selectItem(item)}
          onMouseEnter={() => setHighlightIdx(idx)}
        >
          <div className="col-span-3 px-2 py-1.5 truncate">{item.contenedor || '-'}</div>
          <div className="col-span-4 px-2 py-1.5 truncate font-medium">
            {item.producto}
            {item.esCarne && <span className="ml-1 text-[7px] px-1 py-0.5 bg-red-100 text-red-700 uppercase">CARNE</span>}
          </div>
          <div className="col-span-2 px-2 py-1.5 truncate">{item.lote || '-'}</div>
          <div className="col-span-2 px-2 py-1.5 truncate">{item.dua || '-'}</div>
          <div className="col-span-1 px-2 py-1.5 text-right font-bold">{item.kilos.toFixed(0)}</div>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setHighlightIdx(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full p-2 text-[11px] font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none placeholder:text-neutral-300"
      />
      {dropdownContent && createPortal(dropdownContent, document.body)}
    </div>
  );
}

/* ─── Main Component ─── */
export default function IngresoMercaderia({ inventoryData }: Props) {
  const [history, setHistory] = useState<IngresoRecord[]>([]);
  const [productCatalog, setProductCatalog] = useState<CatalogEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; message: string; onConfirm: () => void }>({
    open: false,
    message: '',
    onConfirm: () => {},
  });
  const [isExporting, setIsExporting] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());

  const [formCliente, setFormCliente] = useState('');
  const [formContenedor, setFormContenedor] = useState('');
  const [formObservaciones, setFormObservaciones] = useState('');
  const [formLineas, setFormLineas] = useState<IngresoLine[]>([emptyLine()]);

  const historyRef = useRef<HTMLDivElement>(null);

  // Auto-hide toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Load history from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(INGRESO_HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {}
  }, []);

  // Load product catalog from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRODUCT_CATALOG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setProductCatalog(parsed);
      }
    } catch {}
  }, []);

  // Build and persist product catalog from inventory + history
  useEffect(() => {
    const catalogMap = new Map<string, CatalogEntry>();

    // From inventory
    inventoryData.forEach(item => {
      const cli = (item.cliente || '').trim().toUpperCase();
      if (!cli || cli === '-') return;
      const prod = (item.producto || '').trim();
      if (!prod) return;
      const key = `${cli}|${prod}`;
      if (!catalogMap.has(key)) {
        catalogMap.set(key, {
          cliente: cli,
          producto: prod,
          lote: (item.lote || '').trim(),
          dua: '',
          cajas: Number(item.cantidad) || 0,
          kilos: Number(item.kilos) || 0,
          pallets: Number(item.pallets) || 0,
          contenedor: (item.contenedor || '').trim(),
          esCarne: detectarCarne(prod),
        });
      } else {
        const existing = catalogMap.get(key)!;
        if (!existing.lote && item.lote) existing.lote = (item.lote || '').trim();
        if (!existing.contenedor && item.contenedor) existing.contenedor = (item.contenedor || '').trim();
      }
    });

    // From ingreso history
    history.forEach(record => {
      const cli = (record.cliente || '').trim().toUpperCase();
      if (!cli) return;
      record.lineas.forEach(line => {
        const prod = (line.producto || '').trim();
        if (!prod) return;
        const key = `${cli}|${prod}`;
        const isCarne = line.esCarne || detectarCarne(prod);
        if (!catalogMap.has(key)) {
          catalogMap.set(key, {
            cliente: cli,
            producto: prod,
            lote: (line.lote || '').trim(),
            dua: (line.dua || '').trim(),
            cajas: Number(line.cajas) || 0,
            kilos: Number(line.kilos) || 0,
            pallets: Number(line.pallets) || 0,
            contenedor: (line.contenedor || '').trim(),
            esCarne: isCarne,
          });
        } else {
          const existing = catalogMap.get(key)!;
          if (isCarne) existing.esCarne = true;
          if (!existing.dua && line.dua) existing.dua = (line.dua || '').trim();
          if (!existing.lote && line.lote) existing.lote = (line.lote || '').trim();
        }
      });
    });

    const catalog = Array.from(catalogMap.values());
    setProductCatalog(catalog);
    try {
      localStorage.setItem(PRODUCT_CATALOG_KEY, JSON.stringify(catalog));
    } catch {}
  }, [inventoryData, history]);

  // Detect if a product is carne based on keywords
  const detectarCarne = (producto: string): boolean => {
    const keywords = ['CARNE', 'VACUNO', 'VACUNA', 'BOVINO', 'RES', 'NOVILLO', 'TERNERO', 'TERNERA', 'PORK', 'CERDO', 'PORCINO', 'POLLO', 'GALLINA', 'CORDERO', 'OVEJA', 'OVINO', 'LOMO', 'COSTILLA', 'CHORIZO', 'MORTADELA', 'JAMON', 'SALCHICHA', 'HAMBURGUESA', 'FILETE', 'BIFE', 'ROAST', 'MEAT', 'BEEF', 'PORK', 'CHICKEN'];
    const upper = producto.toUpperCase();
    return keywords.some(kw => upper.includes(kw));
  };

  // ─── Derive unique clients from catalog ───
  const uniqueClients = useMemo(() => {
    const clientMap = new Map<string, { name: string; num: string }>();

    // From inventory (has numeroCliente)
    inventoryData.forEach(item => {
      const name = (item.cliente || '').trim();
      const num = String(item.numeroCliente || '').trim();
      if (!name || name === '-') return;
      const key = name.toUpperCase();
      if (!clientMap.has(key)) {
        clientMap.set(key, { name, num });
      } else {
        const existing = clientMap.get(key)!;
        if (num && (!existing.num || num < existing.num)) {
          existing.num = num;
        }
      }
    });

    // From catalog (catch clients only in history)
    productCatalog.forEach(entry => {
      const name = entry.cliente.trim();
      if (!name) return;
      const key = name.toUpperCase();
      if (!clientMap.has(key)) {
        clientMap.set(key, { name, num: '' });
      }
    });

    return Array.from(clientMap.values())
      .map(c => c.num ? `${c.num} - ${c.name}` : c.name)
      .sort((a, b) => a.localeCompare(b));
  }, [inventoryData, productCatalog]);

  // ─── Extract selected client name ───
  const selectedClientName = useMemo(() => {
    if (!formCliente.trim()) return '';
    const term = formCliente.toUpperCase();
    const found = uniqueClients.find(c => c.toUpperCase() === term);
    if (found) {
      const dashIdx = found.indexOf(' - ');
      return dashIdx > -1 ? found.substring(dashIdx + 3) : found;
    }
    // Try partial match
    const partial = uniqueClients.find(c => c.toUpperCase().includes(term));
    if (partial) {
      const dashIdx = partial.indexOf(' - ');
      return dashIdx > -1 ? partial.substring(dashIdx + 3) : partial;
    }
    // Fallback: use formCliente as-is if no uniqueClients match
    return formCliente.trim().toUpperCase();
  }, [formCliente, uniqueClients]);

  // ─── Derive products for selected client from catalog ───
  const clientProducts = useMemo(() => {
    if (!selectedClientName) return [];
    const clientUpper = selectedClientName.toUpperCase();
    return productCatalog.filter(entry => entry.cliente.toUpperCase() === clientUpper);
  }, [selectedClientName, productCatalog]);

  const saveHistory = (records: IngresoRecord[]) => {
    setHistory(records);
    localStorage.setItem(INGRESO_HISTORY_KEY, JSON.stringify(records));
  };

  const handleAddLine = () => {
    setFormLineas([...formLineas, emptyLine()]);
  };

  const handleRemoveLine = (idx: number) => {
    if (formLineas.length <= 1) return;
    setFormLineas(formLineas.filter((_, i) => i !== idx));
  };

  const handleLineChange = (idx: number, field: keyof IngresoLine, value: any) => {
    const updated = [...formLineas];
    updated[idx] = { ...updated[idx], [field]: value };
    // If product changes, auto-detect carne
    if (field === 'producto') {
      updated[idx].esCarne = detectarCarne(value);
      if (!updated[idx].esCarne) {
        updated[idx].mgap = '';
      }
    }
    setFormLineas(updated);
  };

  // Strip DUA reference from product name (e.g. "(DUA 26117)" or "DUA 26117")
  const cleanProductName = (name: string): string => {
    return name
      .replace(/\s*\(?\s*DUA\s+\d+\s*\)?\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const handleProductSelect = (idx: number, item: CatalogEntry) => {
    const updated = [...formLineas];
    updated[idx] = {
      ...updated[idx],
      producto: cleanProductName(item.producto),
      esCarne: item.esCarne || detectarCarne(item.producto),
      // No auto-fill: contenedor, lote, dua, pallets, cajas, kilos remain as-is (manual)
    };
    if (!updated[idx].esCarne) {
      updated[idx].mgap = '';
    }
    setFormLineas(updated);
  };

  const handleClientSelect = (selected: string) => {
    setFormCliente(selected);
    setFormLineas([emptyLine()]);
  };

  const resetForm = () => {
    setFormCliente('');
    setFormContenedor('');
    setFormObservaciones('');
    setFormLineas([emptyLine()]);
    setShowForm(false);
  };

  const hasValidLines = formLineas.some(l => l.producto.trim() !== '' || l.contenedor.trim() !== '');

  const handleConfirmIngreso = () => {
    if (!formCliente.trim()) {
      setToastMessage({ text: 'El cliente es obligatorio.', type: 'error' });
      return;
    }
    if (!hasValidLines) {
      setToastMessage({ text: 'Agrega al menos una línea con datos.', type: 'error' });
      return;
    }

    const validLines = formLineas.filter(l => l.producto.trim() !== '' || l.contenedor.trim() !== '');
    const totalPallets = validLines.reduce((s, l) => s + (Number(l.pallets) || 0), 0);
    const totalCajas = validLines.reduce((s, l) => s + (Number(l.cajas) || 0), 0);
    const totalKilos = validLines.reduce((s, l) => s + (Number(l.kilos) || 0), 0);

    let displayCliente = formCliente.trim().toUpperCase();
    const dashIdx = displayCliente.indexOf(' - ');
    if (dashIdx > -1) {
      displayCliente = displayCliente.substring(dashIdx + 3);
    }

    const summary = `¿Confirmar ingreso para ${displayCliente}?\n\n${validLines.length} línea(s) · ${totalPallets} pallets · ${totalCajas} cajas · ${totalKilos.toFixed(1)} kg`;

    setConfirmModal({
      open: true,
      message: summary,
      onConfirm: () => {
        setIsSaving(true);
        try {
          const newRecord: IngresoRecord = {
            id: crypto.randomUUID(),
            fecha: new Date().toISOString(),
            cliente: displayCliente,
            contenedor: formContenedor.trim().toUpperCase(),
            lineas: validLines.map(l => ({
              contenedor: (l.contenedor || formContenedor).trim().toUpperCase(),
              producto: l.producto.trim().toUpperCase(),
              lote: l.lote.trim().toUpperCase(),
              dua: l.dua.trim().toUpperCase(),
              pallets: Number(l.pallets) || 0,
              cajas: Number(l.cajas) || 0,
              kilos: Number(l.kilos) || 0,
              esCarne: l.esCarne || false,
              mgap: l.mgap.trim().toUpperCase(),
            })),
            observaciones: formObservaciones.trim().toUpperCase(),
            createdAt: new Date().toISOString(),
          };
          const updated = [newRecord, ...history].slice(0, 100);
          saveHistory(updated);
          setToastMessage({ text: '¡Ingreso confirmado exitosamente!', type: 'success' });
          resetForm();
        } catch (error) {
          console.error('Error guardando ingreso:', error);
          setToastMessage({ text: 'Error al guardar el ingreso.', type: 'error' });
        } finally {
          setIsSaving(false);
        }
      },
    });
  };

  const handleDeleteRecord = (id: string) => {
    setConfirmModal({
      open: true,
      message: '¿Eliminar este registro de ingreso de forma permanente?',
      onConfirm: () => {
        const updated = history.filter(r => r.id !== id);
        saveHistory(updated);
        setToastMessage({ text: 'Registro eliminado.', type: 'success' });
      },
    });
  };

  const toggleHistoryItem = (id: string) => {
    setExpandedHistory(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportHistoryExcel = useCallback(() => {
    if (history.length === 0) {
      setToastMessage({ text: 'No hay registros para exportar.', type: 'error' });
      return;
    }
    setIsExporting(true);
    try {
      const wb = XLSX.utils.book_new();
      const wsData: any[][] = [['Fecha', 'Cliente', 'Contenedor', 'Producto', 'Lote', 'DUA', 'Pallets', 'Cajas', 'Kilos', 'Carne', 'MGAP', 'Observaciones']];

      history.forEach(record => {
        const fecha = new Date(record.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        record.lineas.forEach(line => {
          wsData.push([
            fecha,
            record.cliente || '',
            line.contenedor || record.contenedor || '',
            line.producto || '',
            line.lote || '',
            line.dua || '',
            Number(line.pallets) || 0,
            Number(line.cajas) || 0,
            Number(line.kilos) || 0,
            (line as any).esCarne ? 'SI' : 'NO',
            (line as any).mgap || '',
            record.observaciones || '',
          ]);
        });
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: wsData.length - 1, c: 11 } });

      const thinBorder = {
        top: { style: 'thin' as const, color: { rgb: '000000' } },
        bottom: { style: 'thin' as const, color: { rgb: '000000' } },
        left: { style: 'thin' as const, color: { rgb: '000000' } },
        right: { style: 'thin' as const, color: { rgb: '000000' } },
      };

      const headerStyle = {
        fill: { fgColor: { rgb: '171717' } },
        font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
        border: thinBorder,
        alignment: { horizontal: 'center' as const, vertical: 'center' as const },
      };
      const normalStyle = { border: thinBorder, font: { sz: 10 } };

      const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
      colLetters.forEach(col => {
        if (ws[`${col}1`]) ws[`${col}1`].s = headerStyle;
      });

      for (let i = 1; i < wsData.length; i++) {
        colLetters.forEach(col => {
          const ref = `${col}${i + 1}`;
          if (!ws[ref]) ws[ref] = { t: 's', v: '' };
          ws[ref].s = normalStyle;
        });
      }

      ws['!cols'] = [
        { wch: 14 }, { wch: 25 }, { wch: 20 }, { wch: 40 }, { wch: 18 },
        { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 8 },
        { wch: 20 }, { wch: 35 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Historial Ingresos');
      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `ingresos_frimaral_${dateStr}.xlsx`);
      setToastMessage({ text: 'Historial exportado a Excel.', type: 'success' });
    } catch (error) {
      console.error('Error exportando historial:', error);
      setToastMessage({ text: 'Error al exportar historial.', type: 'error' });
    } finally {
      setIsExporting(false);
    }
  }, [history]);

  const formatDate = (fecha: string) => {
    try {
      return new Date(fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return fecha;
    }
  };

  const totalRecords = history.length;
  const totalPalletsAll = history.reduce((s, r) => s + r.lineas.reduce((ls, l) => ls + (Number(l.pallets) || 0), 0), 0);
  const totalCajasAll = history.reduce((s, r) => s + r.lineas.reduce((ls, l) => ls + (Number(l.cajas) || 0), 0), 0);
  const totalKilosAll = history.reduce((s, r) => s + r.lineas.reduce((ls, l) => ls + (Number(l.kilos) || 0), 0), 0);

  return (
    <div className="flex flex-col h-full bg-neutral-50">
      {/* Toast */}
      {toastMessage && (
        <div className={`absolute top-4 right-4 z-50 px-6 py-3 shadow-lg text-xs font-mono uppercase tracking-widest ${
          toastMessage.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toastMessage.text}
        </div>
      )}

      {/* Header */}
      <div className="p-8 pb-4 border-b border-neutral-200 flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-2xl font-light tracking-tight text-neutral-900 uppercase">Ingreso Mercadería</h2>
          <p className="text-xs font-mono text-neutral-500 mt-2 uppercase tracking-widest">
            Registro de ingresos &middot; {totalRecords} registros &middot; {totalPalletsAll} pallets &middot; {totalKilosAll.toFixed(0)} kg total
          </p>
        </div>
        <div className="flex items-center gap-3">
          {history.length > 0 && (
            <button
              onClick={handleExportHistoryExcel}
              disabled={isExporting}
              className={`flex items-center gap-2 px-5 py-2.5 bg-green-700 text-white text-xs font-mono uppercase tracking-widest hover:bg-green-800 transition-colors ${
                isExporting ? 'bg-neutral-400 cursor-not-allowed' : ''
              }`}
            >
              {isExporting ? '[...] EXPORTANDO...' : 'EXPORTAR HISTORIAL A EXCEL'}
            </button>
          )}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-5 py-2.5 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors"
            >
              [+] NUEVO INGRESO
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8 flex flex-col gap-6">
        {/* New Ingreso Form */}
        {showForm && (
          <div className="bg-white">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900">Nuevo Registro de Ingreso</h3>
              <button onClick={resetForm} className="text-neutral-400 hover:text-neutral-900 font-mono text-xl leading-none">&times;</button>
            </div>
            <div className="space-y-5">
              {/* Client & Container & DUA & Observaciones */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div className="space-y-2">
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                    Cliente *
                    <span className="text-neutral-300 ml-1">({uniqueClients.length} disponibles)</span>
                  </label>
                  <AutocompleteDropdown
                    value={formCliente}
                    onChange={setFormCliente}
                    placeholder="BUSCAR CLIENTE..."
                    suggestions={uniqueClients}
                    onSelect={handleClientSelect}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">Contenedor</label>
                  <input
                    type="text"
                    value={formContenedor}
                    onChange={(e) => setFormContenedor(e.target.value)}
                    placeholder="EJ: TCLU1234567"
                    className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors placeholder:text-neutral-400"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">DUA (Documento Unico Aduanero)</label>
                  <input
                    type="text"
                    value={formObservaciones}
                    onChange={(e) => setFormObservaciones(e.target.value)}
                    placeholder="EJ: 24ABC1234567"
                    className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors placeholder:text-neutral-400"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">Observaciones</label>
                  <input
                    type="text"
                    value={formLineas[0]?.mgap || ''}
                    onChange={(e) => {
                      if (formLineas.length > 0) {
                        const updated = [...formLineas];
                        updated[0] = { ...updated[0], mgap: e.target.value };
                        setFormLineas(updated);
                      }
                    }}
                    placeholder="NOTAS ADICIONALES"
                    className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors placeholder:text-neutral-400"
                  />
                </div>
              </div>

              {/* Lines */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                    Líneas de Ingreso
                    {selectedClientName && clientProducts.length > 0 && (
                      <span className="text-green-700 ml-2">
                        ({clientProducts.length} productos de {selectedClientName})
                      </span>
                    )}
                    {selectedClientName && clientProducts.length === 0 && (
                      <span className="text-amber-600 ml-2">
                        (sin productos en catálogo — escribir manualmente)
                      </span>
                    )}
                  </label>
                  <button onClick={handleAddLine} className="text-[10px] font-mono uppercase tracking-widest text-neutral-900 underline underline-offset-4 hover:text-green-700">
                    [+ Agregar Línea]
                  </button>
                </div>
                <div className="max-h-72 overflow-auto border border-neutral-200">
                  <table className="w-full text-left text-xs font-sans">
                    <thead className="bg-neutral-900 text-white text-[10px] font-mono uppercase tracking-widest sticky top-0 z-10">
                      <tr>
                        <th className="p-3">Contenedor</th>
                        <th className="p-3 min-w-[200px]">Producto</th>
                        <th className="p-3">Lote</th>
                        <th className="p-3">DUA</th>
                        <th className="p-3 text-right">Pallets</th>
                        <th className="p-3 text-right">Cajas</th>
                        <th className="p-3 text-right">Kilos</th>
                        <th className="p-3 text-center">Carne</th>
                        <th className="p-3 min-w-[120px]">MGAP</th>
                        <th className="p-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {formLineas.map((line, idx) => (
                        <tr key={idx} className="bg-white">
                          <td className="p-2">
                            <input
                              type="text"
                              value={line.contenedor}
                              onChange={(e) => handleLineChange(idx, 'contenedor', e.target.value)}
                              placeholder={idx === 0 ? formContenedor || 'CONT' : 'CONT'}
                              className="w-full p-2 text-[11px] font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none placeholder:text-neutral-300"
                            />
                          </td>
                          <td className="p-2">
                            {clientProducts.length > 0 ? (
                              <ProductDropdown
                                value={line.producto}
                                onChange={(val) => handleLineChange(idx, 'producto', val)}
                                placeholder="BUSCAR PRODUCTO..."
                                productSuggestions={clientProducts}
                                onProductSelect={(item) => handleProductSelect(idx, item)}
                              />
                            ) : (
                              <input
                                type="text"
                                value={line.producto}
                                onChange={(e) => handleLineChange(idx, 'producto', e.target.value)}
                                placeholder={selectedClientName ? 'SIN PRODUCTOS EN CATÁLOGO' : 'SELECCIONA CLIENTE PRIMERO'}
                                className="w-full p-2 text-[11px] font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none placeholder:text-neutral-300"
                              />
                            )}
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={line.lote}
                              onChange={(e) => handleLineChange(idx, 'lote', e.target.value)}
                              placeholder="LOTE"
                              className="w-full p-2 text-[11px] font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none placeholder:text-neutral-300"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={line.dua}
                              onChange={(e) => handleLineChange(idx, 'dua', e.target.value)}
                              placeholder="DUA"
                              className="w-full p-2 text-[11px] font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none placeholder:text-neutral-300"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={line.pallets || ''}
                              onChange={(e) => handleLineChange(idx, 'pallets', Number(e.target.value))}
                              placeholder="0"
                              min={0}
                              className="w-full p-2 text-[11px] font-mono text-right bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none placeholder:text-neutral-300"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={line.cajas || ''}
                              onChange={(e) => handleLineChange(idx, 'cajas', Number(e.target.value))}
                              placeholder="0"
                              min={0}
                              className="w-full p-2 text-[11px] font-mono text-right bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none placeholder:text-neutral-300"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={line.kilos || ''}
                              onChange={(e) => handleLineChange(idx, 'kilos', Number(e.target.value))}
                              placeholder="0"
                              min={0}
                              step={0.1}
                              className="w-full p-2 text-[11px] font-mono text-right bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none placeholder:text-neutral-300"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={line.esCarne}
                                onChange={(e) => {
                                  const updated = [...formLineas];
                                  updated[idx] = {
                                    ...updated[idx],
                                    esCarne: e.target.checked,
                                    mgap: e.target.checked ? updated[idx].mgap : '',
                                  };
                                  setFormLineas(updated);
                                }}
                                className="w-4 h-4 accent-red-600 cursor-pointer"
                              />
                              <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-500">Carne</span>
                            </label>
                          </td>
                          <td className="p-2">
                            {line.esCarne ? (
                              <input
                                type="text"
                                value={line.mgap}
                                onChange={(e) => handleLineChange(idx, 'mgap', e.target.value)}
                                placeholder="NRO. MGAP"
                                className="w-full p-2 text-[11px] font-mono uppercase bg-red-50 border border-red-200 focus:border-red-600 outline-none placeholder:text-red-300"
                              />
                            ) : (
                              <div className="w-full p-2 text-[10px] font-mono text-neutral-300 uppercase tracking-widest border border-neutral-100 bg-neutral-50 text-center">
                                N/A
                              </div>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {formLineas.length > 1 && (
                              <button
                                onClick={() => handleRemoveLine(idx)}
                                className="text-red-400 hover:text-red-700 font-mono text-sm"
                                title="Eliminar línea"
                              >
                                &times;
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Line totals */}
                <div className="flex items-center gap-6 mt-3 text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                  <span>{formLineas.length} Línea(s)</span>
                  <span>{formLineas.reduce((s, l) => s + (Number(l.pallets) || 0), 0)} Pallets</span>
                  <span>{formLineas.reduce((s, l) => s + (Number(l.cajas) || 0), 0)} Cajas</span>
                  <span>{formLineas.reduce((s, l) => s + (Number(l.kilos) || 0), 0).toFixed(1)} Kg</span>
                  {formLineas.some(l => l.esCarne) && (
                    <span className="text-red-600">{formLineas.filter(l => l.esCarne).length} Carne</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-4 pt-2">
                <button onClick={resetForm} className="px-5 py-2.5 text-xs font-mono uppercase tracking-widest text-neutral-500 hover:text-neutral-900 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmIngreso}
                  disabled={isSaving || !formCliente.trim() || !hasValidLines}
                  className={`px-5 py-2.5 text-xs font-mono uppercase tracking-widest transition-colors ${
                    isSaving || !formCliente.trim() || !hasValidLines
                      ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                      : 'bg-neutral-900 text-white hover:bg-neutral-800'
                  }`}
                >
                  {isSaving ? '[...] CONFIRMANDO...' : 'CONFIRMAR INGRESO'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {history.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-neutral-200 border border-neutral-200">
            <div className="bg-white p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Total Registros</p>
              <p className="text-3xl font-light text-neutral-900 mt-1">{totalRecords}</p>
            </div>
            <div className="bg-white p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Total Pallets</p>
              <p className="text-3xl font-light text-neutral-900 mt-1">{totalPalletsAll}</p>
            </div>
            <div className="bg-white p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Total Cajas</p>
              <p className="text-3xl font-light text-neutral-900 mt-1">{totalCajasAll}</p>
            </div>
            <div className="bg-white p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Total Kilos</p>
              <p className="text-3xl font-light text-neutral-900 mt-1">{totalKilosAll.toFixed(0)}</p>
            </div>
          </div>
        )}

        {/* History */}
        <div ref={historyRef}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900">
              Historial de Ingresos
            </h3>
          </div>
          <div className="flex flex-col gap-3">
            {history.length === 0 ? (
              <div className="border border-neutral-200 bg-white p-12 text-center">
                <p className="text-sm font-mono uppercase tracking-widest text-neutral-400">
                  No hay registros de ingreso
                </p>
                <p className="text-xs font-mono text-neutral-400 mt-2">
                  Haz clic en [+ NUEVO INGRESO] para comenzar
                </p>
              </div>
            ) : (
              history.map((record) => {
                const isExpanded = expandedHistory.has(record.id);
                const recordPallets = record.lineas.reduce((s, l) => s + (Number(l.pallets) || 0), 0);
                const recordCajas = record.lineas.reduce((s, l) => s + (Number(l.cajas) || 0), 0);
                const recordKilos = record.lineas.reduce((s, l) => s + (Number(l.kilos) || 0), 0);
                const recordCarne = record.lineas.some(l => l.esCarne);
                return (
                  <div key={record.id} className="border border-neutral-300 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between p-5">
                      <button
                        onClick={() => toggleHistoryItem(record.id)}
                        className="flex items-center gap-4 flex-1 min-w-0 text-left hover:bg-neutral-50 transition-colors -m-5 p-5"
                      >
                        <div className={`w-4 h-4 flex items-center justify-center text-neutral-500 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7-7" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="text-sm font-mono uppercase tracking-wider text-neutral-900 font-bold whitespace-nowrap">
                              {record.cliente}
                            </span>
                            {record.contenedor && (
                              <span className="px-2 py-0.5 bg-neutral-100 text-neutral-700 text-[10px] font-mono uppercase tracking-widest">
                                {record.contenedor}
                              </span>
                            )}
                            <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] font-mono uppercase tracking-widest">
                              {record.lineas.length} LÍN
                            </span>
                            {recordCarne && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-mono uppercase tracking-widest">
                                CARNE
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-5 text-[10px] font-mono text-neutral-500">
                            <span className="text-neutral-400">{formatDate(record.fecha)}</span>
                            <span><span className="font-bold text-neutral-700">{recordPallets}</span> PAL</span>
                            <span><span className="font-bold text-neutral-700">{recordCajas}</span> CAJ</span>
                            <span><span className="font-bold text-neutral-700">{recordKilos.toFixed(1)}</span> KG</span>
                            {record.observaciones && <span className="text-neutral-400 truncate max-w-xs">· DUA: {record.observaciones}</span>}
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => handleDeleteRecord(record.id)}
                        className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-widest text-red-500 border border-red-200 hover:bg-red-50 hover:text-red-700 transition-colors shrink-0 ml-2"
                      >
                        Eliminar
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="border-t-2 border-neutral-200 bg-neutral-50">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs font-sans">
                            <thead className="bg-neutral-900 text-white text-[10px] font-mono uppercase tracking-widest">
                              <tr>
                                <th className="p-3">Contenedor</th>
                                <th className="p-3">Producto</th>
                                <th className="p-3">Lote</th>
                                <th className="p-3">DUA</th>
                                <th className="p-3 text-right">Pallets</th>
                                <th className="p-3 text-right">Cajas</th>
                                <th className="p-3 text-right">Kilos</th>
                                <th className="p-3 text-center">Carne</th>
                                <th className="p-3">MGAP</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-200 bg-white">
                              {record.lineas.map((line, idx) => (
                                <tr key={idx} className="hover:bg-neutral-50 transition-colors">
                                  <td className="p-3 font-mono font-medium text-neutral-700 whitespace-nowrap">{(line as any).contenedor || '-'}</td>
                                  <td className="p-3 max-w-sm" title={(line as any).producto}>
                                    <span className="line-clamp-2 text-xs leading-snug text-neutral-800">{(line as any).producto}</span>
                                  </td>
                                  <td className="p-3 font-mono text-neutral-500 whitespace-nowrap">{(line as any).lote || '-'}</td>
                                  <td className="p-3 font-mono text-neutral-500 whitespace-nowrap">{(line as any).dua || '-'}</td>
                                  <td className="p-3 text-right font-mono text-neutral-700">{Number((line as any).pallets) || 0}</td>
                                  <td className="p-3 text-right font-mono text-neutral-700">{Number((line as any).cajas) || 0}</td>
                                  <td className="p-3 text-right font-mono font-bold text-neutral-900">{(Number((line as any).kilos) || 0).toFixed(1)}</td>
                                  <td className="p-3 text-center">
                                    {(line as any).esCarne ? (
                                      <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[9px] font-mono uppercase tracking-widest">SI</span>
                                    ) : (
                                      <span className="text-neutral-300 text-[9px] font-mono">-</span>
                                    )}
                                  </td>
                                  <td className="p-3 font-mono text-neutral-500 whitespace-nowrap">{(line as any).mgap || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-neutral-900 text-white border-t-2 border-neutral-300 font-bold">
                                <td className="p-3 font-mono uppercase tracking-widest text-[10px]" colSpan={4}>TOTAL INGRESO</td>
                                <td className="p-3 text-right font-mono text-sm">{recordPallets}</td>
                                <td className="p-3 text-right font-mono text-sm">{recordCajas}</td>
                                <td className="p-3 text-right font-mono text-sm">{recordKilos.toFixed(1)}</td>
                                <td className="p-3" colSpan={2}></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      <ConfirmModal
        open={confirmModal.open}
        title="Confirmar Acción"
        message={confirmModal.message}
        confirmLabel="Confirmar"
        cancelLabel="Cancelar"
        variant="warning"
        loading={isSaving}
        onConfirm={() => {
          confirmModal.onConfirm();
          setConfirmModal({ ...confirmModal, open: false });
        }}
        onCancel={() => setConfirmModal({ ...confirmModal, open: false })}
      />
    </div>
  );
}
