'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ShoppingBag, Search, Plus, Trash2, Package, ChevronDown, X, Truck } from 'lucide-react';

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

interface IngresoProps {
  inventoryData: InventoryItem[];
  onUpdateInventory: (updatedData: InventoryItem[]) => void;
}

interface NewLine {
  id: string;
  cliente: string;
  contenedor: string;
  producto: string;
  pallets: number;
  cajas: number;
  kilos: number;
  lote: string;
}

// ===== Reusable Searchable Dropdown =====
function SearchableDropdown({
  label, placeholder, options, selected, onSelect, onClear,
  allowCustom = false, onCustomAdd, badge, width = 'full',
}: {
  label: string;
  placeholder: string;
  options: { value: string; display: string; sub?: string }[];
  selected: string;
  onSelect: (value: string) => void;
  onClear?: () => void;
  allowCustom?: boolean;
  onCustomAdd?: (value: string) => void;
  badge?: string;
  width?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [listPos, setListPos] = useState<React.CSSProperties>({});
  const wrapperRef = useRef<HTMLDivElement>(null);

  const updateListPosition = useCallback(() => {
    if (!isOpen || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropHeight = 400;
    const style: React.CSSProperties = {
      position: 'fixed',
      zIndex: 99999,
      width: rect.width,
      maxHeight: `${dropHeight}px`,
    };
    if (spaceBelow >= dropHeight || spaceBelow >= spaceAbove) {
      style.top = rect.bottom + 4;
    } else {
      style.bottom = window.innerHeight - rect.top + 4;
    }
    style.left = rect.left;
    setListPos(style);
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const measure = () => requestAnimationFrame(() => updateListPosition());
    measure();
    const onScroll = () => measure();
    const onResize = () => measure();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [isOpen, updateListPosition]);

  const filteredOptions = useMemo(() => {
    if (!filter.trim()) return options;
    const term = filter.toLowerCase();
    return options.filter(o =>
      o.value.toLowerCase().includes(term) ||
      o.display.toLowerCase().includes(term) ||
      (o.sub || '').toLowerCase().includes(term)
    );
  }, [filter, options]);

  const selectedDisplay = useMemo(() => {
    if (!selected) return '';
    const found = options.find(o => o.value === selected);
    return found ? found.display : selected;
  }, [selected, options]);

  const hasCustomMatch = useMemo(() => {
    if (!allowCustom || !filter.trim()) return false;
    const term = filter.trim().toLowerCase();
    return !options.some(o => o.value.toLowerCase() === term);
  }, [filter, options, allowCustom]);

  const handleSelect = useCallback((value: string) => {
    onSelect(value);
    setFilter('');
    setIsOpen(false);
  }, [onSelect]);

  return (
    <div ref={wrapperRef} className="relative" style={{ width: width === 'full' ? '100%' : width }}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">{label}</label>
        {badge && <span className="text-[9px] font-mono text-neutral-400 uppercase">{badge}</span>}
      </div>

      <button type="button" onClick={() => { setIsOpen(!isOpen); setFilter(''); }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-mono bg-neutral-50 border border-neutral-200 hover:border-neutral-400 focus:border-neutral-900 outline-none transition-colors text-left">
        <span className={`truncate flex-1 ${selected ? 'text-neutral-900 font-medium' : 'text-neutral-400'}`}>
          {selectedDisplay || placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selected && onClear && (
            <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="p-0.5 text-neutral-400 hover:text-red-500 transition-colors cursor-pointer">
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div style={listPos} className="bg-white border border-neutral-200 shadow-lg overflow-hidden flex flex-col">
          <div className="p-2 border-b border-neutral-100 bg-neutral-50 shrink-0">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-neutral-200">
              <Search className="w-3 h-3 text-neutral-400 shrink-0" />
              <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)}
                placeholder={`Filtrar ${label.toLowerCase()}...`}
                className="flex-1 text-xs font-mono bg-transparent outline-none placeholder:text-neutral-400" autoFocus />
            </div>
          </div>

          <div className="overflow-auto flex-1">
            {filteredOptions.length === 0 && !hasCustomMatch ? (
              <div className="px-3 py-6 text-center text-[10px] font-mono text-neutral-400 uppercase">Sin resultados</div>
            ) : (
              <>
                {filteredOptions.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left px-3 py-2.5 text-xs font-mono hover:bg-neutral-50 border-b border-neutral-50 transition-colors flex items-center justify-between gap-2 ${
                      opt.value === selected ? 'bg-neutral-900 text-white hover:bg-neutral-800' : ''
                    }`}>
                    <span className="truncate flex-1">{opt.display}</span>
                    {opt.sub && (
                      <span className={`text-[9px] font-mono shrink-0 ${opt.value === selected ? 'text-neutral-300' : 'text-neutral-400'}`}>
                        {opt.sub}
                      </span>
                    )}
                  </button>
                ))}
                {allowCustom && hasCustomMatch && onCustomAdd && (
                  <button type="button" onClick={() => onCustomAdd(filter.trim())}
                    className="w-full text-left px-3 py-2.5 text-xs font-mono bg-green-50 hover:bg-green-100 border-b border-green-100 transition-colors flex items-center gap-2 text-green-800">
                    <Plus className="w-3 h-3 shrink-0" />
                    <span className="truncate flex-1">Agregar &quot;{filter.trim()}&quot;</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Main Component =====
export default function IngresoMercaderia({ inventoryData, onUpdateInventory }: IngresoProps) {
  const [lines, setLines] = useState<NewLine[]>([]);
  const [ingresoObservaciones, setIngresoObservaciones] = useState('');
  const [historial, setHistorial] = useState<{ lines: NewLine[]; fecha: string }[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const cached = localStorage.getItem('frimaral_ingreso_history_v1');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [activeTab, setActiveTab] = useState<'nuevo' | 'historial'>('nuevo');
  const [expandedHistorial, setExpandedHistorial] = useState<Set<number>>(new Set());

  useEffect(() => {
    try { localStorage.setItem('frimaral_ingreso_history_v1', JSON.stringify(historial)); } catch {}
  }, [historial]);

  // Dropdown options from existing inventory
  const clientOptions = useMemo(() => {
    const map = new Map<string, number>();
    inventoryData.forEach(item => {
      const cli = (item.cliente || '').trim();
      if (!cli) return;
      map.set(cli, (map.get(cli) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({
      value: name, display: name, sub: `${count} item${count !== 1 ? 's' : ''}`,
    }));
  }, [inventoryData]);

  const containerOptions = useMemo(() => {
    const map = new Map<string, number>();
    inventoryData.forEach(item => {
      const cont = (item.contenedor || '').trim();
      if (!cont) return;
      map.set(cont, (map.get(cont) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({
      value: name, display: name, sub: `${count} prod`,
    }));
  }, [inventoryData]);

  const productOptions = useMemo(() => {
    const map = new Map<string, number>();
    inventoryData.forEach(item => {
      const prod = (item.producto || '').trim();
      if (!prod) return;
      map.set(prod, (map.get(prod) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({
      value: name, display: name.length > 60 ? name.substring(0, 57) + '...' : name, sub: `${count} líneas`,
    }));
  }, [inventoryData]);

  const loteOptions = useMemo(() => {
    const map = new Set<string>();
    inventoryData.forEach(item => {
      const lote = item.lote || item.numeroCliente || '';
      if (lote) map.add(lote);
    });
    return Array.from(map).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(name => ({
      value: name, display: name,
    }));
  }, [inventoryData]);

  // Totals
  const totals = useMemo(() => lines.reduce((acc, l) => ({
    pallets: acc.pallets + (Number(l.pallets) || 0),
    cajas: acc.cajas + (Number(l.cajas) || 0),
    kilos: acc.kilos + (Number(l.kilos) || 0),
  }), { pallets: 0, cajas: 0, kilos: 0 }), [lines]);

  // Line CRUD
  const addLine = () => {
    setLines([...lines, {
      id: crypto.randomUUID(), cliente: '', contenedor: '',
      producto: '', pallets: 0, cajas: 0, kilos: 0, lote: '',
    }]);
  };

  const updateLine = (id: string, field: keyof NewLine, value: string | number) => {
    setLines(lines.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const removeLine = (id: string) => setLines(lines.filter(l => l.id !== id));

  const confirmIngreso = () => {
    const validLines = lines.filter(l => l.cliente.trim() && l.producto.trim() && (Number(l.pallets) > 0 || Number(l.cajas) > 0 || Number(l.kilos) > 0));
    if (validLines.length === 0) {
      alert('Agrega al menos una línea con cliente, producto y datos.');
      return;
    }

    // Build new inventory items and add/merge
    const updated = [...inventoryData];
    validLines.forEach(line => {
      const existingIdx = updated.findIndex(item =>
        (item.cliente || '').trim() === line.cliente.trim() &&
        (item.producto || '').trim() === line.producto.trim() &&
        (item.contenedor || '').trim() === line.contenedor.trim() &&
        (item.lote || '').trim() === line.lote.trim()
      );

      const newPallets = Number(line.pallets) || 0;
      const newCajas = Number(line.cajas) || 0;
      const newKilos = Number(line.kilos) || 0;

      if (existingIdx !== -1) {
        const existing = updated[existingIdx];
        updated[existingIdx] = {
          ...existing,
          pallets: existing.pallets + newPallets,
          cantidad: existing.cantidad + newCajas,
          kilos: Math.round((existing.kilos + newKilos) * 10) / 10,
        };
      } else {
        updated.push({
          id: crypto.randomUUID(),
          cliente: line.cliente.trim().toUpperCase(),
          numeroCliente: line.lote.trim() || '-',
          producto: line.producto.trim().toUpperCase(),
          contenedor: line.contenedor.trim().toUpperCase(),
          lote: line.lote.trim().toUpperCase(),
          pallets: newPallets,
          cantidad: newCajas,
          kilos: newKilos,
        });
      }
    });

    onUpdateInventory(updated);

    // Save to historial
    const entry = {
      lines: validLines.map(l => ({ ...l, cliente: l.cliente.toUpperCase(), contenedor: l.contenedor.toUpperCase(), producto: l.producto.toUpperCase() })),
      fecha: new Date().toISOString(),
    };
    const newHistorial = [entry, ...historial].slice(0, 50);
    setHistorial(newHistorial);

    setLines([]);
    setIngresoObservaciones('');
    alert(`Ingreso confirmado: ${validLines.length} línea(s) agregada(s) al stock.`);
  };

  const toggleHistorial = (idx: number) => {
    setExpandedHistorial(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  };

  return (
    <div className="flex flex-col h-full bg-neutral-50">
      {/* Header */}
      <div className="p-8 pb-4 border-b border-neutral-200 flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-2xl font-light tracking-tight text-neutral-900 uppercase">Ingreso de Mercadería</h2>
          <p className="text-xs font-mono text-neutral-500 mt-2 uppercase tracking-widest">
            Alta de stock &middot; {inventoryData.length} ítems en inventario
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setActiveTab('nuevo')}
            className={`px-4 py-2 text-[10px] font-mono uppercase tracking-widest transition-colors ${
              activeTab === 'nuevo' ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-900'
            }`}>
            Nuevo Ingreso
          </button>
          <button onClick={() => setActiveTab('historial')}
            className={`px-4 py-2 text-[10px] font-mono uppercase tracking-widest transition-colors ${
              activeTab === 'historial' ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-900'
            }`}>
            Historial ({historial.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">

        {/* ===== NUEVO INGRESO ===== */}
        {activeTab === 'nuevo' && (
          <div className="flex flex-col gap-6">
            {/* Lines */}
            <div className="border border-neutral-300 bg-white overflow-hidden shadow-sm">
              <div className="p-5 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
                <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 flex items-center gap-2">
                  <Truck className="w-4 h-4" /> Líneas de Ingreso ({lines.length})
                </h3>
                <button onClick={addLine}
                  className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 transition-colors">
                  [+] Nueva Línea
                </button>
              </div>

              <div className="p-5">
                {lines.length === 0 ? (
                  <div className="border-2 border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
                    <p className="text-xs font-mono text-neutral-400 uppercase tracking-widest mb-2">
                      Sin líneas de ingreso
                    </p>
                    <p className="text-[10px] font-mono text-neutral-300">
                      Hacé clic en &quot;[+] Nueva Línea&quot; para agregar mercadería
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {lines.map((line, idx) => (
                      <div key={line.id} className="border border-neutral-200 bg-white overflow-hidden">
                        {/* Line header */}
                        <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-50 border-b border-neutral-100">
                          <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                            Línea #{idx + 1}
                          </span>
                          <button onClick={() => removeLine(line.id)}
                            className="p-1 text-neutral-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Line body - dropdowns and fields */}
                        <div className="p-4">
                          {/* Row 1: Cliente + Contenedor */}
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <SearchableDropdown
                              label="Cliente"
                              placeholder="Buscar o crear cliente..."
                              options={clientOptions}
                              selected={line.cliente}
                              onSelect={(v) => updateLine(line.id, 'cliente', v)}
                              onClear={() => updateLine(line.id, 'cliente', '')}
                              allowCustom
                              onCustomAdd={(v) => updateLine(line.id, 'cliente', v)}
                              badge={`${clientOptions.length} existentes`}
                            />
                            <SearchableDropdown
                              label="Contenedor"
                              placeholder="Buscar o crear contenedor..."
                              options={containerOptions}
                              selected={line.contenedor}
                              onSelect={(v) => updateLine(line.id, 'contenedor', v)}
                              onClear={() => updateLine(line.id, 'contenedor', '')}
                              allowCustom
                              onCustomAdd={(v) => updateLine(line.id, 'contenedor', v)}
                              badge={`${containerOptions.length} existentes`}
                            />
                          </div>

                          {/* Row 2: Producto */}
                          <div className="mb-4">
                            <SearchableDropdown
                              label="Producto / Descripción"
                              placeholder="Buscar o crear producto..."
                              options={productOptions}
                              selected={line.producto}
                              onSelect={(v) => updateLine(line.id, 'producto', v)}
                              onClear={() => updateLine(line.id, 'producto', '')}
                              allowCustom
                              onCustomAdd={(v) => updateLine(line.id, 'producto', v)}
                              badge={`${productOptions.length} existentes`}
                            />
                          </div>

                          {/* Row 3: Lote + Pallets + Cajas + Kilos */}
                          <div className="grid grid-cols-4 gap-3">
                            <SearchableDropdown
                              label="Lote / Nro"
                              placeholder="Buscar o crear..."
                              options={loteOptions}
                              selected={line.lote}
                              onSelect={(v) => updateLine(line.id, 'lote', v)}
                              onClear={() => updateLine(line.id, 'lote', '')}
                              allowCustom
                              onCustomAdd={(v) => updateLine(line.id, 'lote', v)}
                            />
                            <div>
                              <label className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block mb-1.5">Pallets</label>
                              <input type="number" min="0" value={line.pallets || ''}
                                onChange={(e) => updateLine(line.id, 'pallets', Number(e.target.value))}
                                placeholder="0"
                                className="w-full px-3 py-2.5 text-xs font-mono bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors" />
                            </div>
                            <div>
                              <label className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block mb-1.5">Cajas</label>
                              <input type="number" min="0" value={line.cajas || ''}
                                onChange={(e) => updateLine(line.id, 'cajas', Number(e.target.value))}
                                placeholder="0"
                                className="w-full px-3 py-2.5 text-xs font-mono bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors" />
                            </div>
                            <div>
                              <label className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block mb-1.5">Kilos</label>
                              <input type="number" min="0" value={line.kilos || ''}
                                onChange={(e) => updateLine(line.id, 'kilos', Number(e.target.value))}
                                placeholder="0"
                                className="w-full px-3 py-2.5 text-xs font-mono bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Summary + Confirm */}
              {lines.length > 0 && (
                <div className="px-5 py-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between">
                  <div className="flex items-center gap-6 text-xs font-mono text-neutral-700">
                    <span><span className="font-bold text-neutral-900">{totals.pallets}</span> PALLETS</span>
                    <span><span className="font-bold text-neutral-900">{totals.cajas}</span> CAJAS</span>
                    <span><span className="font-bold text-neutral-900">{totals.kilos}</span> KG</span>
                    <span className="text-neutral-400">{lines.length} línea{lines.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Observations + Confirm */}
            <div className="border border-neutral-300 bg-white overflow-hidden shadow-sm">
              <div className="p-5">
                <textarea value={ingresoObservaciones}
                  onChange={(e) => setIngresoObservaciones(e.target.value)}
                  placeholder="Observaciones del ingreso (opcional)..."
                  className="w-full p-3 text-xs font-mono bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none mb-3 resize-none"
                  rows={2} />
                <button onClick={confirmIngreso}
                  disabled={lines.length === 0}
                  className="w-full py-3 bg-green-600 text-white text-xs font-mono uppercase tracking-widest hover:bg-green-700 transition-colors disabled:bg-neutral-300 disabled:cursor-not-allowed">
                  Confirmar Ingreso ({totals.pallets} pallets · {totals.cajas} cajas · {totals.kilos} kg)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== HISTORIAL ===== */}
        {activeTab === 'historial' && (
          <div className="flex flex-col gap-6">
            {historial.length === 0 ? (
              <div className="border-2 border-dashed border-neutral-300 bg-white p-12 text-center">
                <p className="text-sm font-mono uppercase tracking-widest text-neutral-500 mb-2">Sin historial de ingresos</p>
                <p className="text-xs font-mono text-neutral-400">Los ingresos confirmados aparecerán aquí</p>
              </div>
            ) : (
              historial.map((entry, idx) => {
                const isExpanded = expandedHistorial.has(idx);
                const entryTotals = entry.lines.reduce((acc, l) => ({
                  pallets: acc.pallets + (Number(l.pallets) || 0),
                  cajas: acc.cajas + (Number(l.cajas) || 0),
                  kilos: acc.kilos + (Number(l.kilos) || 0),
                }), { pallets: 0, cajas: 0, kilos: 0 });

                return (
                  <div key={idx} className="border border-neutral-300 bg-white overflow-hidden shadow-sm">
                    <button onClick={() => toggleHistorial(idx)}
                      className="w-full flex items-center justify-between p-5 hover:bg-neutral-50 transition-colors text-left">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={`w-6 h-6 flex items-center justify-center text-neutral-500 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap mb-1">
                            <span className="text-sm font-mono font-bold text-neutral-900">
                              {new Date(entry.fecha).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="px-2 py-0.5 bg-green-50 text-green-800 text-[10px] font-mono uppercase tracking-widest border border-green-200">
                              Confirmado
                            </span>
                          </div>
                          <div className="flex items-center gap-5 text-[11px] font-mono text-neutral-500">
                            <span>{entry.lines.length} línea{entry.lines.length !== 1 ? 's' : ''}</span>
                            <span><span className="font-bold text-neutral-700">{entryTotals.pallets}</span> PAL</span>
                            <span><span className="font-bold text-neutral-700">{entryTotals.cajas}</span> CAJ</span>
                            <span><span className="font-bold text-neutral-700">{entryTotals.kilos}</span> KG</span>
                          </div>
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t-2 border-neutral-200 bg-neutral-50">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs font-sans">
                            <thead className="bg-neutral-900 text-white text-[10px] font-mono uppercase tracking-widest">
                              <tr>
                                <th className="p-3">Cliente</th>
                                <th className="p-3">Contenedor</th>
                                <th className="p-3">Producto</th>
                                <th className="p-3">Lote</th>
                                <th className="p-3 text-right">Pallets</th>
                                <th className="p-3 text-right">Cajas</th>
                                <th className="p-3 text-right">Kilos</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-200 bg-white">
                              {entry.lines.map((l, lidx) => (
                                <tr key={lidx} className="hover:bg-neutral-50">
                                  <td className="p-3 font-mono">{l.cliente}</td>
                                  <td className="p-3 font-mono">{l.contenedor || '-'}</td>
                                  <td className="p-3 truncate max-w-48">{l.producto}</td>
                                  <td className="p-3 font-mono text-neutral-500">{l.lote || '-'}</td>
                                  <td className="p-3 text-right font-mono font-bold">{l.pallets}</td>
                                  <td className="p-3 text-right font-mono">{l.cajas}</td>
                                  <td className="p-3 text-right font-mono">{l.kilos}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-neutral-900 text-white font-bold">
                                <td className="p-3 font-mono uppercase tracking-widest text-[10px]" colSpan={4}>Subtotal</td>
                                <td className="p-3 text-right font-mono">{entryTotals.pallets}</td>
                                <td className="p-3 text-right font-mono">{entryTotals.cajas}</td>
                                <td className="p-3 text-right font-mono">{entryTotals.kilos}</td>
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
        )}
      </div>
    </div>
  );
}
