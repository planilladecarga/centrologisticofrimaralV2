'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx-js-style';
import {
  ShoppingBag, Search, Plus, Minus, Trash2, CheckCircle,
  FileSpreadsheet, Package, Eye, ArrowLeft, ChevronDown, X
} from 'lucide-react';

interface CartItem {
  cartId: string;
  inventoryId: string;
  numeroCliente: string;
  producto: string;
  contenedor: string;
  lote: string;
  cajasPerPallet: number;
  kilosPerPallet: number;
  palletsRequested: number;
  maxPallets: number;
  observaciones: string;
}

interface OrderItem {
  id: string;
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
  estado: string;
  observaciones: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

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

interface PedidosProps {
  inventoryData: InventoryItem[];
  onUpdateInventory: (updatedData: InventoryItem[]) => void;
}

const ORDERS_CACHE_KEY = 'frimaral_orders_cache_v1';

const statusConfig: Record<string, { label: string; color: string; next?: string }> = {
  'PENDIENTE': { label: 'Pendiente', color: 'bg-amber-50 text-amber-800 border-amber-200', next: 'EN PREPARACIÓN' },
  'EN PREPARACIÓN': { label: 'En Preparación', color: 'bg-blue-50 text-blue-800 border-blue-200', next: 'LISTO' },
  'LISTO': { label: 'Listo', color: 'bg-green-50 text-green-800 border-green-200', next: 'DESPACHADO' },
  'DESPACHADO': { label: 'Despachado', color: 'bg-neutral-100 text-neutral-600 border-neutral-300' },
};

// ===== Reusable Searchable Dropdown Component =====
function SearchableDropdown({
  label,
  placeholder,
  options,
  selected,
  onSelect,
  onClear,
  icon,
  badge,
  width = 'full',
}: {
  label: string;
  placeholder: string;
  options: { value: string; display: string; sub?: string }[];
  selected: string;
  onSelect: (value: string) => void;
  onClear?: () => void;
  icon?: React.ReactNode;
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

  const handleSelect = useCallback((value: string) => {
    onSelect(value);
    setFilter('');
    setIsOpen(false);
  }, [onSelect]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setFilter('');
  }, []);

  return (
    <div ref={wrapperRef} className="relative" style={{ width: width === 'full' ? '100%' : width }}>
      {/* Label row */}
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
          {icon}
          {label}
        </label>
        {badge && (
          <span className="text-[9px] font-mono text-neutral-400 uppercase">{badge}</span>
        )}
      </div>

      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-mono bg-neutral-50 border border-neutral-200 hover:border-neutral-400 focus:border-neutral-900 outline-none transition-colors text-left"
      >
        <span className={`truncate flex-1 ${selected ? 'text-neutral-900 font-medium' : 'text-neutral-400'}`}>
          {selectedDisplay || placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selected && onClear && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="p-0.5 text-neutral-400 hover:text-red-500 transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div style={listPos} className="bg-white border border-neutral-200 shadow-lg overflow-hidden flex flex-col">
          {/* Search inside dropdown */}
          <div className="p-2 border-b border-neutral-100 bg-neutral-50 shrink-0">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-neutral-200">
              <Search className="w-3 h-3 text-neutral-400 shrink-0" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={`Filtrar ${label.toLowerCase()}...`}
                className="flex-1 text-xs font-mono bg-transparent outline-none placeholder:text-neutral-400"
                autoFocus
              />
            </div>
          </div>

          {/* Options list */}
          <div className="overflow-auto flex-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-[10px] font-mono text-neutral-400 uppercase">
                Sin resultados
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full text-left px-3 py-2.5 text-xs font-mono hover:bg-neutral-50 border-b border-neutral-50 transition-colors flex items-center justify-between gap-2 ${
                    opt.value === selected ? 'bg-neutral-900 text-white hover:bg-neutral-800' : ''
                  }`}
                >
                  <span className="truncate flex-1">{opt.display}</span>
                  {opt.sub && (
                    <span className={`text-[9px] font-mono shrink-0 ${opt.value === selected ? 'text-neutral-300' : 'text-neutral-400'}`}>
                      {opt.sub}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Main Pedidos Component =====
export default function Pedidos({ inventoryData, onUpdateInventory }: PedidosProps) {
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const cached = localStorage.getItem(ORDERS_CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderObservations, setOrderObservations] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(new Set());

  // Dropdown filter selections (new order)
  const [selClient, setSelClient] = useState('');
  const [selContainer, setSelContainer] = useState('');
  const [selProduct, setSelProduct] = useState('');
  const [selLote, setSelLote] = useState('');

  // Persist orders to localStorage
  useEffect(() => {
    try { localStorage.setItem(ORDERS_CACHE_KEY, JSON.stringify(orders)); } catch {}
  }, [orders]);

  // ===== Computed lists for dropdowns =====
  // Client options (from inventory)
  const clientOptions = useMemo(() => {
    const map = new Map<string, number>();
    inventoryData.forEach(item => {
      const cli = (item.cliente || '').trim();
      if (!cli) return;
      map.set(cli, (map.get(cli) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({
        value: name,
        display: name,
        sub: `${count} item${count !== 1 ? 's' : ''}`,
      }));
  }, [inventoryData]);

  // Filtered inventory based on dropdown selections
  const filteredInventory = useMemo(() => {
    let data = [...inventoryData];
    if (selClient) data = data.filter(i => (i.cliente || '').trim() === selClient);
    if (selContainer) data = data.filter(i => (i.contenedor || '').trim() === selContainer);
    if (selProduct) data = data.filter(i => (i.producto || '').trim() === selProduct);
    if (selLote) {
      data = data.filter(i =>
        (i.lote || '').trim() === selLote ||
        (i.numeroCliente || '').trim() === selLote
      );
    }
    return data;
  }, [inventoryData, selClient, selContainer, selProduct, selLote]);

  // Container options (cascading from client)
  const containerOptions = useMemo(() => {
    const source = selClient
      ? inventoryData.filter(i => (i.cliente || '').trim() === selClient)
      : inventoryData;
    const map = new Map<string, { count: number; pallets: number; kilos: number }>();
    source.forEach(item => {
      const cont = (item.contenedor || '').trim();
      if (!cont) return;
      if (!map.has(cont)) map.set(cont, { count: 0, pallets: 0, kilos: 0 });
      const e = map.get(cont)!;
      e.count++;
      e.pallets += item.pallets || 0;
      e.kilos += item.kilos || 0;
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, info]) => ({
        value: name,
        display: name,
        sub: `${info.pallets} PAL · ${info.kilos.toFixed(0)} KG`,
      }));
  }, [inventoryData, selClient]);

  // Product options (cascading from container/client)
  const productOptions = useMemo(() => {
    const source = selClient
      ? inventoryData.filter(i => (i.cliente || '').trim() === selClient)
      : inventoryData;
    const source2 = selContainer
      ? source.filter(i => (i.contenedor || '').trim() === selContainer)
      : source;
    const map = new Map<string, { pallets: number; kilos: number }>();
    source2.forEach(item => {
      const prod = (item.producto || '').trim();
      if (!prod) return;
      if (!map.has(prod)) map.set(prod, { pallets: 0, kilos: 0 });
      const e = map.get(prod)!;
      e.pallets += item.pallets || 0;
      e.kilos += item.kilos || 0;
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, info]) => ({
        value: name,
        display: name.length > 60 ? name.substring(0, 57) + '...' : name,
        sub: `${info.pallets} PAL · ${info.kilos.toFixed(0)} KG`,
      }));
  }, [inventoryData, selClient, selContainer]);

  // Lote/Pallet options (cascading from product/container/client)
  const loteOptions = useMemo(() => {
    const source = selClient
      ? inventoryData.filter(i => (i.cliente || '').trim() === selClient)
      : inventoryData;
    const source2 = selContainer
      ? source.filter(i => (i.contenedor || '').trim() === selContainer)
      : source;
    const source3 = selProduct
      ? source2.filter(i => (i.producto || '').trim() === selProduct)
      : source2;
    return source3
      .sort((a, b) => {
        const la = a.lote || a.numeroCliente || '';
        const lb = b.lote || b.numeroCliente || '';
        return la.localeCompare(lb, undefined, { numeric: true });
      })
      .map(item => ({
        value: item.lote || item.numeroCliente,
        display: item.lote || item.numeroCliente,
        sub: `${item.contenedor || '-'} · ${item.pallets} PAL · ${(item.kilos || 0).toFixed(0)} KG`,
      }));
  }, [inventoryData, selClient, selContainer, selProduct]);

  // Cart computed values
  const cartByContainer = useMemo(() => {
    const map = new Map<string, CartItem[]>();
    cart.forEach(item => {
      const key = item.contenedor || 'SIN CONTENEDOR';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    return Array.from(map.entries());
  }, [cart]);

  const cartTotals = useMemo(() => cart.reduce((acc, item) => ({
    pallets: acc.pallets + item.palletsRequested,
    cajas: acc.cajas + Math.round(item.cajasPerPallet * item.palletsRequested),
    kilos: acc.kilos + Math.round(item.kilosPerPallet * item.palletsRequested * 10) / 10,
  }), { pallets: 0, cajas: 0, kilos: 0 }), [cart]);

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') return orders;
    return orders.filter(o => o.estado === statusFilter);
  }, [orders, statusFilter]);

  const todayOrders = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return orders.filter(o => o.createdAt.startsWith(today));
  }, [orders]);

  const selectedOrder = useMemo(() =>
    orders.find(o => o.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  // Container groups for detail view
  const orderContainerGroups = useMemo(() => {
    if (!selectedOrder) return [];
    const containers = [...new Set(selectedOrder.items.map(i => i.contenedor))];
    return containers.map(cont => {
      const orderContItems = selectedOrder.items.filter(i => i.contenedor === cont);
      const currentInv = inventoryData.filter(i => (i.contenedor || '') === cont);
      const currentInvKeys = new Set(currentInv.map(i => i.numeroCliente));

      const allItems = [...currentInv];
      orderContItems.forEach(oi => {
        if (!currentInvKeys.has(oi.numeroCliente)) {
          allItems.push({
            numeroCliente: oi.numeroCliente, producto: oi.producto,
            contenedor: oi.contenedor, lote: oi.lote, pallets: 0,
            cantidad: oi.cajas, kilos: oi.kilos, cliente: selectedOrder.cliente,
          } as InventoryItem);
        }
      });

      const orderedKeys = new Set(orderContItems.map(i => i.numeroCliente));
      return {
        contenedor: cont,
        items: allItems.map(inv => ({
          inventoryItem: inv,
          isOrdered: orderedKeys.has(inv.numeroCliente),
          orderItem: orderContItems.find(oi => oi.numeroCliente === inv.numeroCliente),
        })).sort((a, b) => (b.isOrdered ? 1 : 0) - (a.isOrdered ? 1 : 0)),
      };
    });
  }, [selectedOrder, inventoryData]);

  // ===== Actions =====

  const clearFilters = () => {
    setSelClient('');
    setSelContainer('');
    setSelProduct('');
    setSelLote('');
  };

  const generateOrderNumber = () => {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const todayCount = orders.filter(o => o.createdAt.startsWith(today)).length;
    return `PED-${today}-${String(todayCount + 1).padStart(3, '0')}`;
  };

  const addToCart = (invItem: InventoryItem) => {
    const invId = invItem.id || `${invItem.numeroCliente}|${invItem.producto}|${invItem.contenedor}`;
    const existingIdx = cart.findIndex(c => c.inventoryId === invId);
    if (existingIdx !== -1) {
      setCart(cart.map((c, i) =>
        i === existingIdx && c.palletsRequested < c.maxPallets
          ? { ...c, palletsRequested: c.palletsRequested + 1 }
          : c
      ));
    } else {
      setCart([...cart, {
        cartId: crypto.randomUUID(), inventoryId: invId,
        numeroCliente: invItem.numeroCliente, producto: invItem.producto,
        contenedor: invItem.contenedor || '', lote: invItem.lote || '',
        cajasPerPallet: invItem.pallets > 0 ? Math.round(invItem.cantidad / invItem.pallets) : invItem.cantidad,
        kilosPerPallet: invItem.pallets > 0 ? Math.round(invItem.kilos / invItem.pallets * 10) / 10 : invItem.kilos,
        palletsRequested: 1, maxPallets: invItem.pallets, observaciones: '',
      }]);
    }
  };

  const addAllFiltered = () => {
    filteredInventory.forEach(item => addToCart(item));
  };

  const updateCartQty = (cartId: string, qty: number) => {
    setCart(cart.map(c =>
      c.cartId === cartId ? { ...c, palletsRequested: Math.max(1, Math.min(qty, c.maxPallets)) } : c
    ));
  };

  const updateCartObs = (cartId: string, obs: string) => {
    setCart(cart.map(c => c.cartId === cartId ? { ...c, observaciones: obs } : c));
  };

  const removeFromCart = (cartId: string) => setCart(cart.filter(c => c.cartId !== cartId));

  const reduceInventory = (cartItems: CartItem[]): InventoryItem[] => {
    const updated = [...inventoryData];
    cartItems.forEach(ci => {
      const idx = updated.findIndex(item =>
        item.id === ci.inventoryId ||
        `${item.numeroCliente}|${item.producto}|${item.contenedor}` === ci.inventoryId
      );
      if (idx === -1) return;
      const item = updated[idx];
      const newPallets = item.pallets - ci.palletsRequested;
      if (newPallets <= 0) {
        updated.splice(idx, 1);
      } else {
        const ratio = newPallets / (item.pallets || 1);
        updated[idx] = {
          ...item, pallets: newPallets,
          cantidad: Math.round(item.cantidad * ratio),
          kilos: Math.round(item.kilos * ratio * 10) / 10,
        };
      }
    });
    return updated;
  };

  const confirmOrder = () => {
    if (!selClient.trim() || cart.length === 0) {
      alert('Selecciona un cliente y agrega al menos un item al carrito.');
      return;
    }
    const newOrder: Order = {
      id: crypto.randomUUID(), orderNumber: generateOrderNumber(),
      cliente: selClient.trim().toUpperCase(),
      estado: 'PENDIENTE',
      observaciones: orderObservations.trim().toUpperCase(),
      items: cart.map(c => ({
        id: crypto.randomUUID(), numeroCliente: c.numeroCliente,
        producto: c.producto, contenedor: c.contenedor, lote: c.lote,
        cajas: Math.round(c.cajasPerPallet * c.palletsRequested),
        kilos: Math.round(c.kilosPerPallet * c.palletsRequested * 10) / 10,
        palletsRequested: c.palletsRequested,
        observaciones: c.observaciones.trim().toUpperCase(),
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // Baja de stock inmediata al confirmar el pedido
    onUpdateInventory(reduceInventory(cart));
    setOrders([newOrder, ...orders]);
    setCart([]);
    clearFilters();
    setOrderObservations('');
    setSelectedOrderId(newOrder.id);
    setView('detail');
  };

  const updateOrderStatus = (orderId: string, newStatus: string) => {
    setOrders(orders.map(o =>
      o.id === orderId ? { ...o, estado: newStatus, updatedAt: new Date().toISOString() } : o
    ));
  };

  const deleteOrder = (orderId: string) => {
    if (!confirm('¿Eliminar este pedido?')) return;
    setOrders(orders.filter(o => o.id !== orderId));
    if (selectedOrderId === orderId) { setView('list'); setSelectedOrderId(null); }
  };

  const exportOrderExcel = (order: Order) => {
    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];
    const hlRows = new Set<number>();

    wsData.push([`PEDIDO ${order.orderNumber}`, '', '', '', '', '', '']);
    wsData.push(['', '', '', '', `CLIENTE: ${order.cliente}`, '', '']);
    wsData.push(['', '', '', '', `FECHA: ${new Date(order.createdAt).toLocaleDateString('es-ES')}`, '', '']);
    wsData.push(['', '', '', '', `ESTADO: ${order.estado}`, '', '']);
    wsData.push([]);
    wsData.push(['Contenedor', 'Cant.', 'Bultos', 'Peso', 'Descripción', '', 'Pallet ID']);

    const containers = [...new Set(order.items.map(i => i.contenedor))];
    containers.forEach(cont => {
      order.items.filter(i => i.contenedor === cont).forEach(item => {
        hlRows.add(wsData.length);
        wsData.push([cont, item.palletsRequested, item.cajas, item.kilos, item.producto, '', item.numeroCliente]);
      });
      wsData.push([]);
    });

    if (order.observaciones) {
      wsData.push(['', '', '', '', 'OBSERVACIONES:', '', '']);
      wsData.push(['', '', '', '', order.observaciones, '', '']);
    }

    wsData.push([]);
    wsData.push(['', '', '', '', 'RESUMEN TOTAL', '', '']);
    const tP = order.items.reduce((s, i) => s + i.palletsRequested, 0);
    const tC = order.items.reduce((s, i) => s + i.cajas, 0);
    const tK = order.items.reduce((s, i) => s + i.kilos, 0);
    wsData.push(['', '', '', '', 'PALLETS', 'CAJAS', 'KG']);
    wsData.push(['', '', '', '', tP, tC, Math.round(tK)]);

    const coteSet = new Set<string>();
    order.items.forEach(item => {
      (item.producto.match(/COTE\s+P?\d+/gi) || []).forEach(c =>
        coteSet.add(c.replace(/COTE\s*P?/i, 'P'))
      );
    });
    if (coteSet.size > 0) {
      wsData.push([]); wsData.push(['', '', '', '', 'COTES ÚNICOS', '', '']);
      Array.from(coteSet).sort().forEach(c => wsData.push(['', '', '', '', c, '', '']));
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: wsData.length - 1, c: 6 } });
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];

    const tb = {
      top: { style: "thin" as const, color: { rgb: "000000" } },
      bottom: { style: "thin" as const, color: { rgb: "000000" } },
      left: { style: "thin" as const, color: { rgb: "000000" } },
      right: { style: "thin" as const, color: { rgb: "000000" } },
    };
    ['A','B','C','D','E','F','G'].forEach(col => {
      const ref = `${col}6`;
      if (ws[ref]) ws[ref].s = {
        fill: { fgColor: { rgb: "E0E0E0" } }, font: { bold: true, sz: 10 },
        border: tb, alignment: { horizontal: "center" as const, vertical: "center" as const },
      };
    });

    for (let i = 6; i < wsData.length; i++) {
      const row = i + 1;
      const rd = wsData[i];
      if (!rd || rd.every(c => c === '' || c === null || c === undefined)) continue;
      const isHL = hlRows.has(i);
      const isSum = rd[4] && typeof rd[4] === 'string' &&
        (rd[4].includes('RESUMEN') || rd[4].includes('COTES') || rd[4] === 'PALLETS' || rd[4] === 'CAJAS' || rd[4].includes('OBSERV'));
      ['A','B','C','D','E','F','G'].forEach(col => {
        const ref = `${col}${row}`;
        if (!ws[ref]) ws[ref] = { t: 's', v: '' };
        if (isSum) ws[ref].s = { font: { bold: true, sz: 10 } };
        else if (isHL && col === 'G') ws[ref].s = { border: tb, font: { sz: 10, bold: true }, fill: { fgColor: { rgb: "FFFF00" } } };
        else ws[ref].s = { border: tb, font: { sz: 10 } };
      });
    }
    ws['!cols'] = [{ wch: 20 }, { wch: 6 }, { wch: 8 }, { wch: 8 }, { wch: 55 }, { wch: 4 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Pedido");
    XLSX.writeFile(wb, `Pedido_${order.orderNumber}.xlsx`);
  };

  const toggleContainer = (key: string) => {
    setExpandedContainers(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  // Active filters count
  const activeFilterCount = [selClient, selContainer, selProduct, selLote].filter(Boolean).length;

  // ===== RENDER =====
  return (
    <div className="flex flex-col h-full bg-neutral-50">
      {/* Header */}
      <div className="p-8 pb-4 border-b border-neutral-200 flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-2xl font-light tracking-tight text-neutral-900 uppercase">Pedidos</h2>
          <p className="text-xs font-mono text-neutral-500 mt-2 uppercase tracking-widest">
            {orders.length} pedidos totales &middot; {todayOrders.length} hoy
          </p>
        </div>
        <div className="flex items-center gap-3">
          {view !== 'list' && (
            <button onClick={() => { setView('list'); setSelectedOrderId(null); setExpandedContainers(new Set()); }}
              className="px-5 py-2.5 text-xs font-mono uppercase tracking-widest border border-neutral-300 hover:border-neutral-900 transition-colors">
              Volver
            </button>
          )}
          {view === 'list' && (
            <button onClick={() => setView('new')}
              className="px-5 py-2.5 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors">
              [+] Nuevo Pedido
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">

        {/* ===== LIST VIEW ===== */}
        {view === 'list' && (
          <div className="flex flex-col gap-6">
            {/* Status filters */}
            <div className="flex items-center gap-2 flex-wrap">
              {['all', 'PENDIENTE', 'EN PREPARACIÓN', 'LISTO', 'DESPACHADO'].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                    statusFilter === s ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-900'
                  }`}>
                  {s === 'all' ? `TODOS (${orders.length})` : `${s} (${orders.filter(o => o.estado === s).length})`}
                </button>
              ))}
            </div>

            {/* Order cards */}
            {filteredOrders.length === 0 ? (
              <div className="border-2 border-dashed border-neutral-300 bg-white p-12 text-center">
                <p className="text-sm font-mono uppercase tracking-widest text-neutral-500 mb-2">
                  {statusFilter === 'all' ? 'No hay pedidos' : `No hay pedidos ${statusFilter}`}
                </p>
                <p className="text-xs font-mono text-neutral-400">Crea un nuevo pedido con el botón [+]</p>
              </div>
            ) : (
              filteredOrders
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map(order => {
                  const sc = statusConfig[order.estado] || statusConfig['PENDIENTE'];
                  return (
                    <div key={order.id} className="border border-neutral-300 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      <button onClick={() => { setSelectedOrderId(order.id); setView('detail'); setExpandedContainers(new Set()); }}
                        className="w-full p-5 hover:bg-neutral-50 transition-colors text-left">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className="w-6 h-6 flex items-center justify-center shrink-0">
                              <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 flex-wrap mb-1">
                                <span className="text-sm font-mono font-bold text-neutral-900">{order.orderNumber}</span>
                                <span className={`px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest border ${sc.color}`}>{sc.label}</span>
                                <span className="px-2 py-0.5 bg-neutral-900 text-white text-[10px] font-mono uppercase tracking-widest">
                                  {order.items.reduce((s, i) => s + i.palletsRequested, 0)} PAL
                                </span>
                              </div>
                              <div className="flex items-center gap-5 text-[11px] font-mono text-neutral-500">
                                <span><span className="text-neutral-400">CLIENTE:</span> <span className="font-medium">{order.cliente}</span></span>
                                <span><span className="font-bold text-neutral-700">{order.items.reduce((s, i) => s + i.cajas, 0)}</span> CAJ</span>
                                <span><span className="font-bold text-neutral-700">{Math.round(order.items.reduce((s, i) => s + i.kilos, 0))}</span> KG</span>
                                <span>{new Date(order.createdAt).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
                              </div>
                              {order.observaciones && (
                                <p className="text-[10px] font-mono text-amber-700 mt-1 truncate">OBS: {order.observaciones}</p>
                              )}
                            </div>
                          </div>
                          <Eye className="w-4 h-4 text-neutral-400 shrink-0 ml-4" />
                        </div>
                      </button>
                    </div>
                  );
                })
            )}
          </div>
        )}

        {/* ===== NEW ORDER VIEW ===== */}
        {view === 'new' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Dropdowns + Results */}
            <div className="flex flex-col gap-6">
              {/* Step 1: Dropdown filters */}
              <div className="border border-neutral-300 bg-white overflow-hidden shadow-sm">
                <div className="p-5 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
                  <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4" /> 1. Seleccionar Cliente y Filtros
                  </h3>
                  {activeFilterCount > 0 && (
                    <button onClick={clearFilters}
                      className="px-3 py-1 text-[9px] font-mono uppercase tracking-widest text-red-600 border border-red-200 hover:bg-red-50 transition-colors">
                      Limpiar ({activeFilterCount})
                    </button>
                  )}
                </div>
                <div className="p-5 space-y-4">
                  {/* Client dropdown */}
                  <SearchableDropdown
                    label="Cliente"
                    placeholder="Seleccionar cliente..."
                    options={clientOptions}
                    selected={selClient}
                    onSelect={(v) => { setSelClient(v); setSelContainer(''); setSelProduct(''); setSelLote(''); }}
                    onClear={() => { setSelClient(''); setSelContainer(''); setSelProduct(''); setSelLote(''); }}
                    badge={`${clientOptions.length} disponibles`}
                  />

                  {/* Two columns for Container + Product */}
                  <div className="grid grid-cols-2 gap-4">
                    <SearchableDropdown
                      label="Contenedor"
                      placeholder="Todos los contenedores"
                      options={containerOptions}
                      selected={selContainer}
                      onSelect={(v) => { setSelContainer(v); setSelProduct(''); setSelLote(''); }}
                      onClear={() => { setSelContainer(''); setSelProduct(''); setSelLote(''); }}
                      badge={`${containerOptions.length}`}
                    />
                    <SearchableDropdown
                      label="Producto"
                      placeholder="Todos los productos"
                      options={productOptions}
                      selected={selProduct}
                      onSelect={(v) => { setSelProduct(v); setSelLote(''); }}
                      onClear={() => { setSelProduct(''); setSelLote(''); }}
                      badge={`${productOptions.length}`}
                    />
                  </div>

                  {/* Lote dropdown */}
                  <SearchableDropdown
                    label="Lote / Pallet"
                    placeholder="Todos los lotes"
                    options={loteOptions}
                    selected={selLote}
                    onSelect={setSelLote}
                    onClear={() => setSelLote('')}
                    badge={`${loteOptions.length}`}
                  />

                  {/* Active filters summary */}
                  {activeFilterCount > 0 && (
                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-100">
                      <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-widest shrink-0">Filtros:</span>
                      {selClient && (
                        <span className="px-2 py-0.5 bg-neutral-900 text-white text-[9px] font-mono flex items-center gap-1">
                          {selClient}
                          <X className="w-2.5 h-2.5 cursor-pointer hover:text-red-400" onClick={() => { setSelClient(''); setSelContainer(''); setSelProduct(''); setSelLote(''); }} />
                        </span>
                      )}
                      {selContainer && (
                        <span className="px-2 py-0.5 bg-neutral-700 text-white text-[9px] font-mono flex items-center gap-1">
                          {selContainer}
                          <X className="w-2.5 h-2.5 cursor-pointer hover:text-red-400" onClick={() => { setSelContainer(''); setSelProduct(''); setSelLote(''); }} />
                        </span>
                      )}
                      {selProduct && (
                        <span className="px-2 py-0.5 bg-neutral-600 text-white text-[9px] font-mono flex items-center gap-1 truncate max-w-48">
                          {selProduct.length > 25 ? selProduct.substring(0, 22) + '...' : selProduct}
                          <X className="w-2.5 h-2.5 cursor-pointer hover:text-red-400 shrink-0" onClick={() => { setSelProduct(''); setSelLote(''); }} />
                        </span>
                      )}
                      {selLote && (
                        <span className="px-2 py-0.5 bg-neutral-500 text-white text-[9px] font-mono flex items-center gap-1">
                          {selLote}
                          <X className="w-2.5 h-2.5 cursor-pointer hover:text-red-400" onClick={() => setSelLote('')} />
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2: Results */}
              <div className="border border-neutral-300 bg-white overflow-hidden shadow-sm flex-1 flex flex-col">
                <div className="p-5 border-b border-neutral-200 bg-neutral-50 flex justify-between items-center">
                  <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 flex items-center gap-2">
                    <Package className="w-4 h-4" /> 2. Resultados ({filteredInventory.length})
                  </h3>
                  {filteredInventory.length > 0 && (
                    <button onClick={addAllFiltered}
                      className="px-3 py-1 text-[9px] font-mono uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 transition-colors">
                      Agregar Todos
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-auto p-5">
                  {filteredInventory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <p className="text-xs font-mono text-neutral-400 uppercase tracking-widest mb-2">Sin resultados</p>
                      <p className="text-[10px] font-mono text-neutral-300">
                        {inventoryData.length === 0
                          ? 'No hay inventario cargado'
                          : 'Usa los filtros de arriba para buscar productos'}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {filteredInventory.map((item, idx) => {
                        const invId = item.id || `${item.numeroCliente}|${item.producto}|${item.contenedor}`;
                        const inCart = cart.find(c => c.inventoryId === invId);
                        return (
                          <div key={idx} className={`border p-3 transition-colors ${
                            inCart
                              ? 'bg-green-50 border-green-200'
                              : 'bg-white border-neutral-200 hover:bg-neutral-50'
                          }`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-[9px] font-mono text-neutral-400 uppercase bg-neutral-100 px-1.5 py-0.5 shrink-0">
                                    {item.contenedor || 'SIN CONT.'}
                                  </span>
                                  {inCart && (
                                    <span className="text-[9px] font-mono text-green-700 bg-green-100 px-1.5 py-0.5 shrink-0">
                                      {inCart.palletsRequested} en carrito
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-mono font-medium text-neutral-900 truncate">{item.producto}</p>
                                <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-neutral-500">
                                  <span>PAL: <span className="font-bold text-neutral-700">{item.pallets}</span></span>
                                  <span>CAJ: <span className="font-bold text-neutral-700">{item.cantidad}</span></span>
                                  <span>KG: <span className="font-bold text-neutral-700">{item.kilos}</span></span>
                                  <span>LOTE: {item.lote || item.numeroCliente}</span>
                                </div>
                              </div>
                              <button onClick={() => addToCart(item)}
                                disabled={inCart && inCart.palletsRequested >= inCart.maxPallets}
                                className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest shrink-0 transition-colors ${
                                  inCart
                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                    : 'bg-neutral-900 text-white hover:bg-neutral-800'
                                } disabled:bg-neutral-300 disabled:cursor-not-allowed`}>
                                {inCart ? '+1' : 'Agregar'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Cart */}
            <div className="border border-neutral-300 bg-white overflow-hidden shadow-sm flex flex-col">
              <div className="p-5 border-b border-neutral-200 bg-neutral-50 flex justify-between items-center">
                <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 flex items-center gap-2">
                  <Package className="w-4 h-4" /> CARRITO ({cart.length} ítems)
                </h3>
                {cart.length > 0 && (
                  <span className="text-[10px] font-mono text-neutral-500">
                    {cartTotals.pallets} PAL · {cartTotals.cajas} CAJ · {cartTotals.kilos} KG
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-auto p-5">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-xs font-mono text-neutral-400 uppercase tracking-widest mb-2">Carrito vacío</p>
                    <p className="text-[10px] font-mono text-neutral-300">
                      Selecciona cliente, filtra y agrega productos
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {cartByContainer.map(([cont, items]) => (
                      <div key={cont} className="border border-neutral-200">
                        <div className="p-3 bg-neutral-900 text-white border-b border-neutral-200">
                          <p className="text-xs font-mono font-bold uppercase">{cont}</p>
                        </div>
                        {items.map(ci => (
                          <div key={ci.cartId} className="p-3 border-b border-neutral-100 last:border-0">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-mono font-medium text-neutral-900 truncate">{ci.producto}</p>
                                <p className="text-[10px] font-mono text-neutral-500">
                                  PAL: {ci.numeroCliente} · {Math.round(ci.cajasPerPallet * ci.palletsRequested)} CAJ · {Math.round(ci.kilosPerPallet * ci.palletsRequested * 10) / 10} KG
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => updateCartQty(ci.cartId, ci.palletsRequested - 1)}
                                  className="w-6 h-6 flex items-center justify-center border border-neutral-200 hover:border-neutral-900 text-xs font-mono transition-colors">-</button>
                                <span className="w-8 text-center text-xs font-mono font-bold">{ci.palletsRequested}</span>
                                <button onClick={() => updateCartQty(ci.cartId, ci.palletsRequested + 1)}
                                  className="w-6 h-6 flex items-center justify-center border border-neutral-200 hover:border-neutral-900 text-xs font-mono transition-colors">+</button>
                                <button onClick={() => removeFromCart(ci.cartId)}
                                  className="w-6 h-6 flex items-center justify-center text-red-500 hover:text-red-700 ml-1 transition-colors">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <input type="text" value={ci.observaciones} onChange={(e) => updateCartObs(ci.cartId, e.target.value)}
                              placeholder="Observación del ítem..."
                              className="w-full p-2 text-[10px] font-mono bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none" />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm section */}
              <div className="p-5 border-t border-neutral-200 bg-neutral-50">
                <textarea value={orderObservations} onChange={(e) => setOrderObservations(e.target.value)}
                  placeholder="Observaciones generales del pedido..."
                  className="w-full p-3 text-xs font-mono bg-white border border-neutral-200 focus:border-neutral-900 outline-none mb-3 resize-none" rows={2} />
                <button onClick={confirmOrder}
                  disabled={!selClient.trim() || cart.length === 0}
                  className="w-full py-3 bg-green-600 text-white text-xs font-mono uppercase tracking-widest hover:bg-green-700 transition-colors disabled:bg-neutral-300 disabled:cursor-not-allowed">
                  Confirmar Pedido ({cartTotals.pallets} pallets · {cartTotals.cajas} cajas · {cartTotals.kilos} kg)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== DETAIL VIEW ===== */}
        {view === 'detail' && selectedOrder && (
          <div className="flex flex-col gap-6">
            {/* Order header */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-px bg-neutral-200 border border-neutral-200">
              <div className="bg-white p-6 md:col-span-2">
                <p className="text-xs font-mono uppercase tracking-widest text-neutral-500 mb-2">Pedido</p>
                <h3 className="text-3xl font-light tracking-tighter text-neutral-900">{selectedOrder.orderNumber}</h3>
                <div className="mt-3 text-xs font-mono text-neutral-500">
                  Creado: {new Date(selectedOrder.createdAt).toLocaleString('es-ES')}
                </div>
              </div>
              <div className="bg-white p-6">
                <p className="text-xs font-mono uppercase tracking-widest text-neutral-500 mb-2">Cliente</p>
                <p className="text-sm font-mono font-medium text-neutral-900">{selectedOrder.cliente}</p>
              </div>
              <div className="bg-white p-6">
                <p className="text-xs font-mono uppercase tracking-widest text-neutral-500 mb-2">Estado</p>
                <div className="flex flex-col gap-2">
                  <span className={`inline-block px-3 py-1 text-xs font-mono uppercase tracking-widest border ${statusConfig[selectedOrder.estado]?.color || ''}`}>
                    {statusConfig[selectedOrder.estado]?.label || selectedOrder.estado}
                  </span>
                  {statusConfig[selectedOrder.estado]?.next && (
                    <button onClick={() => updateOrderStatus(selectedOrder.id, statusConfig[selectedOrder.estado].next!)}
                      className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 transition-colors w-full">
                      {statusConfig[selectedOrder.estado].next}
                    </button>
                  )}
                </div>
              </div>
              <div className="bg-white p-6 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-neutral-500 mb-2">Totales</p>
                  <p className="text-sm font-mono text-neutral-700 font-bold">{selectedOrder.items.reduce((s, i) => s + i.palletsRequested, 0)} Pallets</p>
                  <p className="text-sm font-mono text-neutral-700">{selectedOrder.items.reduce((s, i) => s + i.cajas, 0)} Cajas</p>
                  <p className="text-sm font-mono text-neutral-700">{Math.round(selectedOrder.items.reduce((s, i) => s + i.kilos, 0))} Kg</p>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => exportOrderExcel(selectedOrder)}
                    className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest border border-neutral-300 hover:border-neutral-900 transition-colors flex items-center gap-1">
                    <FileSpreadsheet className="w-3 h-3" /> Excel
                  </button>
                  <button onClick={() => deleteOrder(selectedOrder.id)}
                    className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* Observations */}
            {selectedOrder.observaciones && (
              <div className="border border-neutral-300 bg-amber-50 p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-amber-800 mb-1">Observaciones del Pedido</p>
                <p className="text-xs font-sans text-amber-900">{selectedOrder.observaciones}</p>
              </div>
            )}

            {/* Container groups */}
            {orderContainerGroups.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900">Contenedores a Preparar</h3>
                  <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
                    {orderContainerGroups.length} contenedor{orderContainerGroups.length !== 1 ? 'es' : ''} · click para expandir
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {orderContainerGroups.map((group, idx) => {
                    const isExpanded = expandedContainers.has(group.contenedor);
                    const orderedInGroup = group.items.filter(i => i.isOrdered);
                    return (
                      <div key={group.contenedor} className="border border-neutral-300 bg-white overflow-hidden shadow-sm">
                        <button onClick={() => toggleContainer(group.contenedor)}
                          className="w-full flex items-center justify-between p-5 hover:bg-neutral-50 transition-colors text-left">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className={`w-6 h-6 flex items-center justify-center text-neutral-500 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 flex-wrap mb-1">
                                <span className="text-sm font-mono uppercase tracking-wider text-neutral-900 font-bold whitespace-nowrap">{group.contenedor}</span>
                                <span className="px-2 py-0.5 bg-yellow-200 text-amber-800 text-[10px] font-mono uppercase tracking-widest">
                                  {orderedInGroup.length} PEDIDO{orderedInGroup.length !== 1 ? 'S' : ''}
                                </span>
                                <span className="px-2 py-0.5 bg-neutral-900 text-white text-[10px] font-mono uppercase tracking-widest">
                                  {group.items.length} TOTAL
                                </span>
                              </div>
                              <div className="text-[10px] font-mono text-neutral-500">
                                {orderedInGroup.reduce((s, i) => s + (i.orderItem?.palletsRequested || 0), 0)} pallets pedidos
                              </div>
                            </div>
                          </div>
                          <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest shrink-0 ml-4 bg-neutral-100 px-3 py-1">
                            #{String(idx + 1).padStart(2, '0')}
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
                                    <th className="p-3 text-right">Cant.</th>
                                    <th className="p-3 text-right">Cajas</th>
                                    <th className="p-3 text-right">Kilos</th>
                                    <th className="p-3">Obs.</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-200 bg-white">
                                  {group.items.map(({ inventoryItem, isOrdered, orderItem }, iidx) => (
                                    <tr key={iidx} className={isOrdered ? 'bg-yellow-50' : 'opacity-50'}>
                                      <td className="p-3 text-center">
                                        <span className={`inline-block w-2 h-2 rounded-full ${isOrdered ? 'bg-yellow-400' : 'bg-neutral-300'}`}></span>
                                      </td>
                                      <td className="p-3 font-mono font-semibold text-amber-800">{inventoryItem.numeroCliente}</td>
                                      <td className="p-3">{inventoryItem.producto}</td>
                                      <td className="p-3 text-right font-mono font-semibold text-amber-800">{orderItem?.palletsRequested || '-'}</td>
                                      <td className="p-3 text-right font-mono">{isOrdered ? orderItem?.cajas : inventoryItem.cantidad}</td>
                                      <td className="p-3 text-right font-mono">{isOrdered ? orderItem?.kilos : inventoryItem.kilos}</td>
                                      <td className="p-3 text-[10px] font-mono text-neutral-500">{orderItem?.observaciones || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-neutral-900 text-white font-bold">
                                    <td className="p-3 font-mono uppercase tracking-widest text-[10px] text-sm" colSpan={3}>SUBTOTAL</td>
                                    <td className="p-3 text-right font-mono text-sm">{orderedInGroup.reduce((s, i) => s + (i.orderItem?.palletsRequested || 0), 0)}</td>
                                    <td className="p-3 text-right font-mono text-sm">{orderedInGroup.reduce((s, i) => s + (i.orderItem?.cajas || 0), 0)}</td>
                                    <td className="p-3 text-right font-mono text-sm">{orderedInGroup.reduce((s, i) => s + (i.orderItem?.kilos || 0), 0)}</td>
                                    <td></td>
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
