'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

interface InventoryItem {
  id: string;
  cliente: string;
  numeroCliente: string;
  producto: string;
  contenedor: string;
  lote: string;
  pallets: number;
  cantidad: number;
  kilos: number;
}

interface OrderItem {
  id: string;
  cliente: string;
  numeroCliente: string;
  contenedor: string;
  producto: string;
  lote: string;
  cantidad: number;
  kilos: number;
  pallets: number;
  dua: string;
}

interface PedidosProps {
  inventoryData: InventoryItem[];
}

// Clean DUA from product name: "PRODUCTO NAME (DUA 15UXXXX)" -> "PRODUCTO NAME"
function cleanProductName(raw: string): string {
  return raw.replace(/\s*\(DUA\s+[\w]+\)\s*/gi, '').trim();
}

// Extract DUA from product name
function extractDUA(raw: string): string {
  const match = raw.match(/\(DUA\s+([\w]+)\)/i);
  return match ? match[1] : '';
}

// ===== SearchableDropdown with FIXED positioning =====
function SearchableDropdown({
  label,
  placeholder,
  options,
  value,
  onChange,
  onSearch,
  allowCreate = false,
  onCreate,
  disabled = false,
}: {
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (val: string) => void;
  onSearch: (term: string) => void;
  allowCreate?: boolean;
  onCreate?: (val: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = searchTerm
    ? options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  // Position the list with fixed positioning
  const [listStyle, setListStyle] = useState<React.CSSProperties>({});
  const updateListPosition = useCallback(() => {
    if (!isOpen || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const listHeight = Math.min(filtered.length * 36 + 40, 300);
    // If list would go below viewport, show it above
    if (rect.bottom + listHeight > window.innerHeight) {
      setListStyle({
        position: 'fixed',
        top: `${rect.top - listHeight - 4}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        maxHeight: '300px',
        zIndex: 99999,
      });
    } else {
      setListStyle({
        position: 'fixed',
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        maxHeight: '300px',
        zIndex: 99999,
      });
    }
  }, [isOpen, filtered.length]);

  useEffect(() => {
    if (isOpen) {
      updateListPosition();
      window.addEventListener('resize', updateListPosition);
      window.addEventListener('scroll', updateListPosition, true);
    }
    return () => {
      window.removeEventListener('resize', updateListPosition);
      window.removeEventListener('scroll', updateListPosition, true);
    };
  }, [isOpen, updateListPosition]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        listRef.current && !listRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Keyboard support
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && allowCreate && onCreate && searchTerm.trim() && filtered.length === 0) {
      onCreate(searchTerm.trim());
      setSearchTerm('');
      setIsOpen(false);
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const selectedOption = options.find(o => o.value === value);

  return (
    <div className="space-y-1" ref={containerRef}>
      <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">{label}</label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          placeholder={disabled ? '—' : placeholder}
          value={isOpen ? searchTerm : (selectedOption?.label || value)}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            onSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearchTerm('');
            onSearch('');
          }}
          onKeyDown={handleKeyDown}
          className={`w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors ${
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text'
          }`}
        />
        {value && !isOpen && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
              setSearchTerm('');
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900 text-sm"
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && !disabled && (
        <div ref={listRef} style={listStyle} className="bg-white border border-neutral-300 shadow-2xl overflow-auto">
          {filtered.length === 0 && searchTerm && !allowCreate && (
            <div className="p-3 text-xs font-mono text-neutral-400 uppercase">Sin resultados</div>
          )}
          {filtered.length === 0 && searchTerm && allowCreate && (
            <div
              className="p-3 text-xs font-mono uppercase text-green-700 bg-green-50 cursor-pointer hover:bg-green-100"
              onMouseDown={(e) => {
                e.preventDefault();
                onCreate?.(searchTerm.trim());
                setSearchTerm('');
                setIsOpen(false);
              }}
            >
              + Crear &quot;{searchTerm.trim()}&quot;
            </div>
          )}
          {filtered.map((opt, idx) => (
            <div
              key={opt.value + idx}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt.value);
                setSearchTerm('');
                setIsOpen(false);
              }}
              className={`px-3 py-2.5 text-xs font-mono uppercase cursor-pointer transition-colors ${
                opt.value === value ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100 text-neutral-900'
              }`}
            >
              {opt.label}
            </div>
          ))}
          {allowCreate && filtered.length > 0 && searchTerm && (
            <div
              className="px-3 py-2.5 text-xs font-mono uppercase text-green-700 bg-green-50 cursor-pointer hover:bg-green-100 border-t border-neutral-200"
              onMouseDown={(e) => {
                e.preventDefault();
                onCreate?.(searchTerm.trim());
                setSearchTerm('');
                setIsOpen(false);
              }}
            >
              + Crear &quot;{searchTerm.trim()}&quot;
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Pedidos({ inventoryData }: PedidosProps) {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form fields
  const [selectedCliente, setSelectedCliente] = useState('');
  const [selectedContenedor, setSelectedContenedor] = useState('');
  const [selectedProducto, setSelectedProducto] = useState('');
  const [selectedLote, setSelectedLote] = useState('');
  const [orderCantidad, setOrderCantidad] = useState('');
  const [orderKilos, setOrderKilos] = useState('');
  const [orderPallets, setOrderPallets] = useState('');
  const [orderDUA, setOrderDUA] = useState('');
  const [orderObservaciones, setOrderObservaciones] = useState('');

  const [viewingOrder, setViewingOrder] = useState<OrderItem | null>(null);

  // Toast auto-hide
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Load orders from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('frimaral_orders_cache_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setOrders(parsed);
      }
    } catch {}
  }, []);

  // Save orders
  const saveOrders = (newOrders: OrderItem[]) => {
    setOrders(newOrders);
    localStorage.setItem('frimaral_orders_cache_v1', JSON.stringify(newOrders));
  };

  // ===== Client options: search by name or numeroCliente =====
  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    inventoryData.forEach(item => {
      const num = String(item.numeroCliente || '').replace(/\./g, '');
      const key = `${item.cliente}|||${num}`;
      if (!map.has(key)) {
        map.set(key, `${item.cliente} (${num})`);
      }
    });
    return Array.from(map.entries()).map(([key, label]) => ({
      value: key,
      label,
    }));
  }, [inventoryData]);

  const selectedClienteName = selectedCliente.split('|||')[0] || '';
  const selectedClienteNum = selectedCliente.split('|||')[1] || '';

  // ===== Container options: filtered by selected client =====
  const contenedorOptions = useMemo(() => {
    if (!selectedClienteName) return [];
    const set = new Set<string>();
    inventoryData.forEach(item => {
      if (item.cliente === selectedClienteName && item.contenedor) {
        set.add(item.contenedor.trim());
      }
    });
    return Array.from(set).sort().map(c => ({ value: c, label: c }));
  }, [inventoryData, selectedClienteName]);

  // ===== Product options: ONLY from selected client AND selected contenedor =====
  const productoOptions = useMemo(() => {
    if (!selectedClienteName) return [];
    const set = new Map<string, string>();
    inventoryData.forEach(item => {
      if (item.cliente === selectedClienteName && (!selectedContenedor || item.contenedor === selectedContenedor)) {
        const cleaned = cleanProductName(item.producto);
        if (cleaned && !set.has(cleaned)) {
          set.set(cleaned, cleaned);
        }
      }
    });
    return Array.from(set.entries()).map(([value, label]) => ({ value, label }));
  }, [inventoryData, selectedClienteName, selectedContenedor]);

  // ===== Lote options: filtered by client + contenedor + product =====
  const loteOptions = useMemo(() => {
    if (!selectedClienteName || !selectedProducto) return [];
    const set = new Set<string>();
    inventoryData.forEach(item => {
      if (
        item.cliente === selectedClienteName &&
        (!selectedContenedor || item.contenedor === selectedContenedor) &&
        cleanProductName(item.producto) === selectedProducto &&
        item.lote
      ) {
        set.add(item.lote.trim());
      }
    });
    return Array.from(set).sort().map(l => ({ value: l, label: l }));
  }, [inventoryData, selectedClienteName, selectedContenedor, selectedProducto]);

  // Auto-fill DUA when product is selected
  const handleProductChange = (val: string) => {
    setSelectedProducto(val);
    setOrderDUA('');
    setSelectedLote('');
    setOrderCantidad('');
    setOrderKilos('');
    setOrderPallets('');
    // Try to auto-fill DUA from the original product name
    if (val) {
      const match = inventoryData.find(item =>
        item.cliente === selectedClienteName &&
        cleanProductName(item.producto) === val
      );
      if (match) {
        const dua = extractDUA(match.producto);
        if (dua) setOrderDUA(dua);
      }
    }
  };

  // Auto-fill quantities when lote is selected
  const handleLoteChange = (val: string) => {
    setSelectedLote(val);
    setOrderCantidad('');
    setOrderKilos('');
    setOrderPallets('');
    if (val && selectedProducto && selectedClienteName) {
      const match = inventoryData.find(item =>
        item.cliente === selectedClienteName &&
        cleanProductName(item.producto) === selectedProducto &&
        item.lote === val
      );
      if (match) {
        setOrderCantidad(String(match.cantidad || ''));
        setOrderKilos(String(match.kilos || ''));
        setOrderPallets(String(match.pallets || ''));
      }
    }
  };

  const handleCreateProduct = (name: string) => {
    setToast({ text: `Producto nuevo creado: ${name}`, type: 'success' });
  };

  // Reset form
  const resetForm = () => {
    setSelectedCliente('');
    setSelectedContenedor('');
    setSelectedProducto('');
    setSelectedLote('');
    setOrderCantidad('');
    setOrderKilos('');
    setOrderPallets('');
    setOrderDUA('');
    setOrderObservaciones('');
  };

  // Confirm order
  const handleConfirmOrder = () => {
    if (!selectedClienteName || !selectedProducto) {
      setToast({ text: 'Debe seleccionar cliente y producto', type: 'error' });
      return;
    }
    const newOrder: OrderItem = {
      id: crypto.randomUUID(),
      cliente: selectedClienteName,
      numeroCliente: selectedClienteNum,
      contenedor: selectedContenedor || '-',
      producto: selectedProducto,
      lote: selectedLote || '-',
      cantidad: Number(orderCantidad) || 0,
      kilos: Number(orderKilos) || 0,
      pallets: Number(orderPallets) || 0,
      dua: orderDUA,
    };
    const updated = [newOrder, ...orders];
    saveOrders(updated);
    setToast({ text: 'Pedido confirmado exitosamente', type: 'success' });
    resetForm();
  };

  // Delete order
  const handleDeleteOrder = (id: string) => {
    const updated = orders.filter(o => o.id !== id);
    saveOrders(updated);
    setToast({ text: 'Pedido eliminado', type: 'success' });
    if (viewingOrder?.id === id) setViewingOrder(null);
  };

  // Export Excel
  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const rows = orders.map(o => ({
        'Cliente': o.cliente,
        'N° Cliente': o.numeroCliente,
        'Contenedor': o.contenedor,
        'Producto': o.producto,
        'Lote': o.lote,
        'Pallets': o.pallets,
        'Cajas': o.cantidad,
        'Kilos': o.kilos,
        'DUA': o.dua,
        'Fecha': new Date().toLocaleDateString('es-ES'),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
      XLSX.writeFile(wb, `Pedidos_Frimaral_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setToast({ text: 'Excel exportado', type: 'success' });
    } catch {
      setToast({ text: 'Error al exportar Excel', type: 'error' });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full relative">
      {/* Toast */}
      {toast && (
        <div className={`absolute top-4 right-4 z-[99999] px-6 py-3 shadow-lg text-xs font-mono uppercase tracking-widest ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.text}
        </div>
      )}

      <div className="p-8 flex-1 overflow-auto">
        <div className="flex justify-between items-end mb-8 border-b border-neutral-200 pb-6">
          <div>
            <h2 className="text-2xl font-light tracking-tight text-neutral-900 uppercase">Gestión de Pedidos</h2>
            <p className="text-xs font-mono text-neutral-500 mt-2 uppercase tracking-widest">
              {orders.length} pedido{orders.length !== 1 ? 's' : ''} registrado{orders.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-3">
            {orders.length > 0 && (
              <button onClick={handleExportExcel}
                className="px-5 py-2.5 border border-neutral-900 text-neutral-900 text-xs font-mono uppercase tracking-widest hover:bg-neutral-900 hover:text-white transition-colors">
                Exportar Excel
              </button>
            )}
          </div>
        </div>

        {/* Order Form */}
        <div className="bg-white border border-neutral-200 p-6 mb-8">
          <h3 className="text-sm font-mono uppercase tracking-widest text-neutral-900 mb-6">Nuevo Pedido</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <SearchableDropdown
              label="Cliente (buscar por nombre o número)"
              placeholder="Buscar cliente..."
              options={clientOptions}
              value={selectedCliente}
              onChange={(val) => {
                setSelectedCliente(val);
                setSelectedContenedor('');
                setSelectedProducto('');
                setSelectedLote('');
                setOrderDUA('');
              }}
              onSearch={() => {}}
            />
            <SearchableDropdown
              label="Contenedor"
              placeholder={selectedCliente ? "Seleccionar contenedor..." : "Seleccione cliente primero"}
              options={contenedorOptions}
              value={selectedContenedor}
              onChange={(val) => {
                setSelectedContenedor(val);
                setSelectedProducto('');
                setSelectedLote('');
              }}
              onSearch={() => {}}
              disabled={!selectedCliente}
            />
            <SearchableDropdown
              label="Buscar o Crear Producto"
              placeholder={selectedCliente ? "Buscar producto..." : "Seleccione cliente primero"}
              options={productoOptions}
              value={selectedProducto}
              onChange={handleProductChange}
              onSearch={() => {}}
              allowCreate={!!selectedCliente}
              onCreate={handleCreateProduct}
              disabled={!selectedCliente}
            />
            <SearchableDropdown
              label="Lote / Pallet"
              placeholder={selectedProducto ? "Seleccionar lote..." : "Seleccione producto primero"}
              options={loteOptions}
              value={selectedLote}
              onChange={handleLoteChange}
              onSearch={() => {}}
              disabled={!selectedProducto}
            />
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">DUA (Documento Único Aduanero)</label>
              <input
                type="text"
                placeholder="Ej: 15UXXXX"
                value={orderDUA}
                onChange={(e) => setOrderDUA(e.target.value.toUpperCase())}
                className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">Pallets</label>
              <input
                type="number"
                placeholder="0"
                value={orderPallets}
                onChange={(e) => setOrderPallets(e.target.value)}
                className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">Cajas / Cantidad</label>
              <input
                type="number"
                placeholder="0"
                value={orderCantidad}
                onChange={(e) => setOrderCantidad(e.target.value)}
                className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">Kilos</label>
              <input
                type="number"
                placeholder="0.0"
                value={orderKilos}
                onChange={(e) => setOrderKilos(e.target.value)}
                className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500">Observaciones</label>
              <input
                type="text"
                placeholder="Opcional..."
                value={orderObservaciones}
                onChange={(e) => setOrderObservaciones(e.target.value.toUpperCase())}
                className="w-full p-3 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-6 pt-6 border-t border-neutral-200">
            <button onClick={handleConfirmOrder}
              className="px-8 py-3 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors">
              Confirmar Pedido
            </button>
            <button onClick={resetForm}
              className="px-5 py-3 border border-neutral-300 text-neutral-500 text-xs font-mono uppercase tracking-widest hover:border-neutral-900 hover:text-neutral-900 transition-colors">
              Limpiar
            </button>
          </div>
        </div>

        {/* Orders List */}
        <div>
          <h3 className="text-sm font-mono uppercase tracking-widest text-neutral-900 mb-4">Pedidos Realizados</h3>
          {orders.length === 0 ? (
            <div className="border border-neutral-200 bg-white p-12 text-center">
              <p className="text-xs font-mono uppercase tracking-widest text-neutral-400">No hay pedidos registrados</p>
            </div>
          ) : (
            <div className="border border-neutral-200 bg-white divide-y divide-neutral-100">
              <div className="grid grid-cols-8 gap-2 p-4 bg-neutral-50 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                <div>Cliente</div>
                <div>Contenedor</div>
                <div>Producto</div>
                <div>Lote</div>
                <div className="text-right">Pallets</div>
                <div className="text-right">Cajas</div>
                <div>DUA</div>
                <div className="text-center">Acción</div>
              </div>
              {orders.map(order => (
                <div key={order.id} className="grid grid-cols-8 gap-2 p-4 text-xs font-mono uppercase hover:bg-neutral-50 transition-colors items-center">
                  <div className="font-medium text-neutral-900 truncate" title={order.cliente}>{order.cliente}</div>
                  <div className="text-neutral-600 truncate" title={order.contenedor}>{order.contenedor}</div>
                  <div className="text-neutral-800 truncate" title={order.producto}>{order.producto}</div>
                  <div className="text-neutral-600">{order.lote}</div>
                  <div className="text-right font-bold text-neutral-900">{order.pallets}</div>
                  <div className="text-right text-neutral-700">{order.cantidad}</div>
                  <div className="text-neutral-600 truncate">{order.dua || '-'}</div>
                  <div className="text-center flex gap-1">
                    <button onClick={() => setViewingOrder(order)}
                      className="px-2 py-1 text-[9px] border border-neutral-300 hover:border-neutral-900 transition-colors">
                      VER
                    </button>
                    <button onClick={() => handleDeleteOrder(order.id)}
                      className="px-2 py-1 text-[9px] border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {viewingOrder && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-neutral-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg border border-neutral-200 shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-neutral-200 bg-neutral-50">
              <h3 className="text-sm font-mono uppercase tracking-widest text-neutral-900">Detalle del Pedido</h3>
              <button onClick={() => setViewingOrder(null)} className="text-neutral-500 hover:text-neutral-900 font-mono text-xl leading-none">&times;</button>
            </div>
            <div className="p-8 space-y-4">
              {[
                ['Cliente', viewingOrder.cliente],
                ['N° Cliente', viewingOrder.numeroCliente],
                ['Contenedor', viewingOrder.contenedor],
                ['Producto', viewingOrder.producto],
                ['Lote', viewingOrder.lote],
                ['Pallets', String(viewingOrder.pallets)],
                ['Cajas', String(viewingOrder.cantidad)],
                ['Kilos', String(viewingOrder.kilos)],
                ['DUA', viewingOrder.dua || '-'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-neutral-100 pb-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">{label}</span>
                  <span className="text-xs font-mono uppercase text-neutral-900">{value}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end p-6 border-t border-neutral-200 bg-neutral-50">
              <button onClick={() => setViewingOrder(null)}
                className="px-5 py-2.5 text-xs font-mono uppercase tracking-widest text-neutral-500 hover:text-neutral-900 transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
