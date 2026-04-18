'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import SearchableDropdown from '../components/SearchableDropdown';
import ConfirmModal from '../components/ConfirmModal';

// ═══════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════

interface ReservedItem {
  inventoryId: string;
  palletsReserved: number;
  cajasReserved: number;
  kilosReserved: number;
  contenedor: string;
  producto: string;
  numeroCliente: string;
  lote: string;
}

interface OrderItem {
  inventoryId: string;
  producto: string;
  contenedor: string;
  lote: string;
  cliente: string;
  pallets: number;
  cajas: number;
  kilos: number;
}

interface CartItem extends OrderItem {
  maxPallets: number;
  maxCajas: number;
  maxKilos: number;
}

interface Order {
  id: string;
  numero: string;
  cliente: string;
  estado: 'PENDIENTE' | 'CONFIRMADO' | 'DESPACHADO' | 'CANCELADO';
  items: OrderItem[];
  reservedItems?: ReservedItem[];
  observaciones: string;
  operador?: string;
  createdAt: string;
  updatedAt: string;
}

interface PedidosProps {
  inventoryData: any[];
  onUpdateInventory: (updatedInventory: any[]) => void;
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const ORDERS_CACHE_KEY = 'frimaral_orders_v2';

const STATUS_TRANSITIONS: Record<string, string[]> = {
  'PENDIENTE': ['CONFIRMADO', 'CANCELADO'],
  'CONFIRMADO': ['DESPACHADO', 'CANCELADO'],
  'DESPACHADO': [],
  'CANCELADO': [],
};

const STATUS_STYLES: Record<string, string> = {
  'PENDIENTE': 'bg-amber-50 text-amber-800 border border-amber-200',
  'CONFIRMADO': 'bg-blue-50 text-blue-800 border border-blue-200',
  'DESPACHADO': 'bg-green-50 text-green-800 border border-green-200',
  'CANCELADO': 'bg-red-50 text-red-800 border border-red-200',
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

function reduceInventory(
  inventory: any[],
  deductions: { inventoryId: string; pallets: number; cajas: number; kilos: number }[]
): any[] {
  return inventory
    .map(inv => {
      const d = deductions.find(x => x.inventoryId === inv.id);
      if (!d) return inv;
      return {
        ...inv,
        pallets: Math.max(0, (Number(inv.pallets) || 0) - d.pallets),
        cantidad: Math.max(0, (Number(inv.cantidad) || 0) - d.cajas),
        kilos: Math.max(0, (Number(inv.kilos) || 0) - d.kilos),
      };
    })
    .filter(inv => inv.pallets > 0 || inv.cantidad > 0 || inv.kilos > 0);
}

function restoreInventory(
  inventory: any[],
  reservedItems: ReservedItem[]
): any[] {
  const result = [...inventory];
  for (const ri of reservedItems) {
    const idx = result.findIndex(e => e.id === ri.inventoryId);
    if (idx !== -1) {
      result[idx] = {
        ...result[idx],
        pallets: (Number(result[idx].pallets) || 0) + ri.palletsReserved,
        cantidad: (Number(result[idx].cantidad) || 0) + ri.cajasReserved,
        kilos: (Number(result[idx].kilos) || 0) + ri.kilosReserved,
      };
    } else {
      // Inventory entry was deleted — reconstruct from reservation snapshot
      result.push({
        id: ri.inventoryId,
        cliente: ri.numeroCliente,
        numeroCliente: ri.numeroCliente,
        producto: ri.producto,
        contenedor: ri.contenedor,
        lote: ri.lote,
        pallets: ri.palletsReserved,
        cantidad: ri.cajasReserved,
        kilos: ri.kilosReserved,
      });
    }
  }
  return result;
}

function generateOrderNumber(existingOrders: Order[]): string {
  const maxNum = existingOrders.reduce((max, o) => {
    const m = o.numero.match(/PED-(\d+)/);
    return m ? Math.max(max, parseInt(m[1])) : max;
  }, 0);
  return `PED-${String(maxNum + 1).padStart(4, '0')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export default function Pedidos({ inventoryData, onUpdateInventory }: PedidosProps) {
  // ── State ──────────────────────────────────────────────

  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // New order form
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selClient, setSelClient] = useState('');
  const [selContainer, setSelContainer] = useState('');
  const [selItemId, setSelItemId] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [addPallets, setAddPallets] = useState('');
  const [addCajas, setAddCajas] = useState('');
  const [addKilos, setAddKilos] = useState('');

  // List filters
  const [orderSearch, setOrderSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('TODOS');

  // Modals & toasts
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<{ orderId: string; newStatus: string } | null>(null);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // ── Effects ────────────────────────────────────────────

  useEffect(() => {
    try {
      const cached = localStorage.getItem(ORDERS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) setOrders(parsed);
      }
    } catch (e) {
      console.warn('No se pudo cargar pedidos:', e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ORDERS_CACHE_KEY, JSON.stringify(orders));
    } catch (e) {
      console.warn('No se pudo guardar pedidos:', e);
    }
  }, [orders]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Check for staging data from Despachos (PDF pallet locator)
  useEffect(() => {
    try {
      const stagingRaw = localStorage.getItem('frimaral_pdf_to_pedido_v1');
      if (!stagingRaw) return;
      const stagingItems = JSON.parse(stagingRaw);
      if (!Array.isArray(stagingItems) || stagingItems.length === 0) return;

      // Match staging items to inventory by contenedor + producto
      const newCartItems: CartItem[] = [];
      const clientName = stagingItems[0]?.cliente || '';

      stagingItems.forEach((si: any) => {
        const invMatch = inventoryData.find(
          inv =>
            (inv.contenedor || '') === (si.contenedor || '') &&
            (inv.producto || '') === (si.producto || '')
        );
        if (invMatch) {
          newCartItems.push({
            inventoryId: invMatch.id,
            producto: invMatch.producto,
            contenedor: invMatch.contenedor,
            lote: invMatch.lote || '',
            cliente: invMatch.cliente,
            pallets: si.palletsRequested || 1,
            cajas: si.cajas || 0,
            kilos: si.kilos || 0,
            maxPallets: Number(invMatch.pallets) || 0,
            maxCajas: Number(invMatch.cantidad) || 0,
            maxKilos: Number(invMatch.kilos) || 0,
          });
        }
      });

      if (newCartItems.length > 0) {
        setCart(newCartItems);
        const firstItem = newCartItems[0];
        setSelClient(firstItem.cliente || clientName);
        setSelContainer(firstItem.contenedor || '');
        setView('new');
        showToast(`${newCartItems.length} ítem(es) cargados desde Despachos.`);
      }

      // Clear staging data
      localStorage.removeItem('frimaral_pdf_to_pedido_v1');
    } catch (e) {
      console.warn('Error al cargar staging data desde Despachos:', e);
    }
  }, []);

  // ── Computed ───────────────────────────────────────────

  const operatorName = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('frimaral_operator_name') || '';
  }, []);

  const clientOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: { value: string; display: string; sub: string }[] = [];
    inventoryData.forEach(item => {
      const c = (item.cliente || '').trim();
      const n = (item.numeroCliente || '').trim();
      if (c && !seen.has(c)) {
        seen.add(c);
        result.push({
          value: c,
          display: n ? `${c} (${n})` : c,
          sub: n || '',
        });
      }
    });
    return result.sort((a, b) => a.display.localeCompare(b.display));
  }, [inventoryData]);

  const containerOptions = useMemo(() => {
    if (!selClient) return [];
    const seen = new Set<string>();
    const result: { value: string; display: string }[] = [];
    inventoryData.forEach(item => {
      if ((item.cliente || '').trim() === selClient) {
        const cont = (item.contenedor || '').trim();
        if (cont && !seen.has(cont)) {
          seen.add(cont);
          result.push({ value: cont, display: cont });
        }
      }
    });
    return result.sort((a, b) => a.display.localeCompare(b.display));
  }, [inventoryData, selClient]);

  const availableItems = useMemo(() => {
    if (!selClient || !selContainer) return [];
    return inventoryData
      .filter(
        item =>
          (item.cliente || '').trim() === selClient &&
          (item.contenedor || '').trim() === selContainer &&
          ((Number(item.pallets) || 0) > 0 || (Number(item.cantidad) || 0) > 0 || (Number(item.kilos) || 0) > 0)
      )
      .map(item => ({
        value: item.id,
        display: `${item.producto}`,
        sub: `Lote: ${item.lote || 'S/L'} · ${Number(item.pallets)} PAL / ${Number(item.cantidad)} CAJ / ${Number(item.kilos)} KG`,
      }));
  }, [inventoryData, selClient, selContainer]);

  const selectedItemDetails = useMemo(() => {
    if (!selItemId) return null;
    return inventoryData.find(item => item.id === selItemId) || null;
  }, [inventoryData, selItemId]);

  const cartTotals = useMemo(
    () => ({
      pallets: cart.reduce((s, c) => s + c.pallets, 0),
      cajas: cart.reduce((s, c) => s + c.cajas, 0),
      kilos: cart.reduce((s, c) => s + c.kilos, 0),
    }),
    [cart]
  );

  const selectedOrder = useMemo(
    () => (selectedOrderId ? orders.find(o => o.id === selectedOrderId) || null : null),
    [orders, selectedOrderId]
  );

  const filteredOrders = useMemo(() => {
    let result = [...orders];
    if (statusFilter !== 'TODOS') {
      result = result.filter(o => o.estado === statusFilter);
    }
    if (orderSearch.trim()) {
      const term = orderSearch.toLowerCase();
      result = result.filter(
        o =>
          o.numero.toLowerCase().includes(term) ||
          o.cliente.toLowerCase().includes(term) ||
          o.observaciones.toLowerCase().includes(term) ||
          (o.operador || '').toLowerCase().includes(term)
      );
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, statusFilter, orderSearch]);

  const ordersByStatus = useMemo(() => {
    const counts: Record<string, number> = { TODOS: orders.length, PENDIENTE: 0, CONFIRMADO: 0, DESPACHADO: 0, CANCELADO: 0 };
    orders.forEach(o => {
      if (counts[o.estado] !== undefined) counts[o.estado]++;
    });
    return counts;
  }, [orders]);

  // ── Handlers ───────────────────────────────────────────

  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
  }, []);

  const clearForm = useCallback(() => {
    setCart([]);
    setSelClient('');
    setSelContainer('');
    setSelItemId('');
    setObservaciones('');
    setAddPallets('');
    setAddCajas('');
    setAddKilos('');
  }, []);

  const addToCart = useCallback(() => {
    if (!selItemId || !selectedItemDetails) return;
    const pal = parseFloat(addPallets) || 0;
    const caj = parseFloat(addCajas) || 0;
    const kil = parseFloat(addKilos) || 0;

    if (pal <= 0 && caj <= 0 && kil <= 0) {
      showToast('Ingresa al menos una cantidad.', 'error');
      return;
    }

    const maxPal = Number(selectedItemDetails.pallets) || 0;
    const maxCaj = Number(selectedItemDetails.cantidad) || 0;
    const maxKil = Number(selectedItemDetails.kilos) || 0;

    if (pal > maxPal || caj > maxCaj || kil > maxKil) {
      showToast('Las cantidades exceden el inventario disponible.', 'error');
      return;
    }

    const existingIdx = cart.findIndex(c => c.inventoryId === selItemId);
    if (existingIdx !== -1) {
      const existing = cart[existingIdx];
      const newPal = existing.pallets + pal;
      const newCaj = existing.cajas + caj;
      const newKil = existing.kilos + kil;
      if (newPal > maxPal || newCaj > maxCaj || newKil > maxKil) {
        showToast('Las cantidades totales exceden el inventario disponible.', 'error');
        return;
      }
      const updated = [...cart];
      updated[existingIdx] = { ...existing, pallets: newPal, cajas: newCaj, kilos: newKil };
      setCart(updated);
    } else {
      setCart(prev => [
        ...prev,
        {
          inventoryId: selectedItemDetails.id,
          producto: selectedItemDetails.producto,
          contenedor: selectedItemDetails.contenedor,
          lote: selectedItemDetails.lote || '',
          cliente: selectedItemDetails.cliente,
          pallets: pal,
          cajas: caj,
          kilos: kil,
          maxPallets: maxPal,
          maxCajas: maxCaj,
          maxKilos: maxKil,
        },
      ]);
    }

    setAddPallets('');
    setAddCajas('');
    setAddKilos('');
    setSelItemId('');
    showToast('Ítem agregado al pedido.');
  }, [selItemId, selectedItemDetails, addPallets, addCajas, addKilos, cart, showToast]);

  const removeFromCart = useCallback(
    (inventoryId: string) => {
      setCart(prev => prev.filter(c => c.inventoryId !== inventoryId));
    },
    []
  );

  const updateCartQty = useCallback(
    (inventoryId: string, field: 'pallets' | 'cajas' | 'kilos', value: number) => {
      setCart(prev =>
        prev.map(c => {
          if (c.inventoryId !== inventoryId) return c;

          if (field === 'pallets') {
            // Pallets change: kilos proportional, cajas stays same (per-pallet)
            const clamped = Math.max(0, Math.min(value, c.maxPallets));
            const ratio = c.maxPallets > 0 ? clamped / c.maxPallets : 0;
            return {
              ...c,
              pallets: clamped,
              // cajas: keep unchanged (represents boxes per pallet, not total)
              kilos: Math.round(c.maxKilos * ratio * 10) / 10,
            };
          }

          const maxKey = field === 'cajas' ? 'maxCajas' : 'maxKilos';
          return { ...c, [field]: Math.max(0, Math.min(value, c[maxKey])) };
        })
      );
    },
    []
  );

  const confirmOrder = useCallback(() => {
    if (!selClient.trim()) {
      showToast('Selecciona un cliente.', 'error');
      return;
    }
    if (cart.length === 0) {
      showToast('El pedido está vacío.', 'error');
      return;
    }

    const newOrder: Order = {
      id: crypto.randomUUID(),
      numero: generateOrderNumber(orders),
      cliente: selClient.trim(),
      estado: 'PENDIENTE',
      items: cart.map(c => ({
        inventoryId: c.inventoryId,
        producto: c.producto,
        contenedor: c.contenedor,
        lote: c.lote,
        cliente: c.cliente,
        pallets: c.pallets,
        cajas: c.cajas,
        kilos: c.kilos,
      })),
      reservedItems: cart.map(c => ({
        inventoryId: c.inventoryId,
        palletsReserved: c.pallets,
        cajasReserved: c.cajas,
        kilosReserved: c.kilos,
        contenedor: c.contenedor,
        producto: c.producto,
        numeroCliente: c.cliente,
        lote: c.lote,
      })),
      observaciones: observaciones.trim().toUpperCase(),
      operador: operatorName || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setOrders(prev => [...prev, newOrder]);
    setSelectedOrderId(newOrder.id);
    setView('detail');
    clearForm();
    showToast(`Pedido ${newOrder.numero} creado exitosamente.`);
  }, [cart, selClient, observaciones, operatorName, orders, clearForm, showToast]);

  // ── REMITO DE DOS VÍAS ──────────────────────────────────

  const buildRemitoBody = (order: Order, copyLabel: string, copyColor: string) => {
    const totalPallets = order.items.reduce((s, i) => s + i.pallets, 0);
    const totalCajas = order.items.reduce((s, i) => s + i.cajas, 0);
    const totalKilos = order.items.reduce((s, i) => s + i.kilos, 0);
    const containers = [...new Set(order.items.map(i => i.contenedor).filter(Boolean))];

    const itemsRows = order.items.map((item, idx) => `
      <tr style="border-bottom:1px solid #ddd;">
        <td style="padding:6px 8px;font-size:11px;">${idx + 1}</td>
        <td style="padding:6px 8px;font-size:11px;font-family:monospace;">${item.contenedor || '-'}</td>
        <td style="padding:6px 8px;font-size:11px;">${item.producto || '-'}</td>
        <td style="padding:6px 8px;font-size:11px;text-align:center;">${item.pallets}</td>
        <td style="padding:6px 8px;font-size:11px;text-align:right;">${item.cajas}</td>
        <td style="padding:6px 8px;font-size:11px;text-align:right;">${Number(item.kilos).toFixed(1)} kg</td>
        <td style="padding:6px 8px;font-size:11px;font-family:monospace;">${item.lote || '-'}</td>
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
            <div style="font-size:22px;font-weight:bold;font-family:monospace;">${order.numero}</div>
            <div style="font-size:11px;color:#666;">${formatDate(order.updatedAt)}</div>
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
              <th style="padding:8px;font-size:10px;text-align:left;">Lote</th>
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
        <title>REMITO - ${order.numero}</title>
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
          @media print { .page-break { page-break-after: always; } }
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

  const updateOrderStatus = useCallback(
    (orderId: string, newStatus: string) => {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      let newInventory = inventoryData;

      if (newStatus === 'DESPACHADO' && order.reservedItems && order.reservedItems.length > 0) {
        const deductions = order.reservedItems.map(ri => ({
          inventoryId: ri.inventoryId,
          pallets: ri.palletsReserved,
          cajas: ri.cajasReserved,
          kilos: ri.kilosReserved,
        }));
        newInventory = reduceInventory(inventoryData, deductions);
        onUpdateInventory(newInventory);
      }

      if (newStatus === 'CANCELADO' && order.reservedItems && order.reservedItems.length > 0) {
        newInventory = restoreInventory(inventoryData, order.reservedItems);
        onUpdateInventory(newInventory);
      }

      setOrders(prev =>
        prev.map(o => {
          if (o.id !== orderId) return o;
          return {
            ...o,
            estado: newStatus as Order['estado'],
            reservedItems: (newStatus === 'DESPACHADO' || newStatus === 'CANCELADO') ? [] : o.reservedItems,
            updatedAt: new Date().toISOString(),
          };
        })
      );
      setStatusConfirm(null);

      if (newStatus === 'DESPACHADO') {
        showToast(`Pedido ${order.numero} despachado. Inventario actualizado.`);
        // Auto-generate remito de dos vías
        const dispatchedOrder = { ...order, estado: 'DESPACHADO' as const, updatedAt: new Date().toISOString() };
        setTimeout(() => printRemito(dispatchedOrder), 400);
      } else if (newStatus === 'CANCELADO') {
        showToast(`Pedido ${order.numero} cancelado. Stock restaurado.`);
      } else {
        showToast(`Estado actualizado a ${newStatus}.`);
      }
    },
    [orders, inventoryData, onUpdateInventory, showToast]
  );

  const deleteOrder = useCallback(
    (orderId: string) => {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      // Only restore reserved stock if order is NOT already despachado
      if (order.estado !== 'DESPACHADO' && order.reservedItems && order.reservedItems.length > 0) {
        const newInventory = restoreInventory(inventoryData, order.reservedItems);
        onUpdateInventory(newInventory);
        showToast('Pedido eliminado. Stock restaurado.');
      } else {
        showToast('Pedido eliminado.');
      }

      setOrders(prev => prev.filter(o => o.id !== orderId));
      setDeleteConfirm(null);

      if (selectedOrderId === orderId) {
        setSelectedOrderId(null);
        setView('list');
      }
    },
    [orders, inventoryData, onUpdateInventory, selectedOrderId, showToast]
  );

  const editOrder = useCallback(
    (orderId: string) => {
      const order = orders.find(o => o.id === orderId);
      if (!order || order.estado !== 'PENDIENTE') return;

      // Restore reserved stock before deleting the order
      if (order.reservedItems && order.reservedItems.length > 0) {
        const newInventory = restoreInventory(inventoryData, order.reservedItems);
        onUpdateInventory(newInventory);
      }

      setOrders(prev => prev.filter(o => o.id !== orderId));

      setSelClient(order.cliente);
      setSelContainer(order.items[0]?.contenedor || '');
      setObservaciones(order.observaciones);
      setCart(
        order.items.map(item => {
          const inv = inventoryData.find(i => i.id === item.inventoryId);
          return {
            ...item,
            maxPallets: inv ? (Number(inv.pallets) || 0) + item.pallets : item.pallets + 100,
            maxCajas: inv ? (Number(inv.cantidad) || 0) + item.cajas : item.cajas + 100,
            maxKilos: inv ? (Number(inv.kilos) || 0) + item.kilos : item.kilos + 100,
          };
        })
      );

      setView('new');
      showToast('Pedido cargado para edición.');
    },
    [orders, inventoryData, onUpdateInventory, showToast]
  );

  const duplicateOrder = useCallback(
    (orderId: string) => {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      const newOrder: Order = {
        id: crypto.randomUUID(),
        numero: generateOrderNumber(orders),
        cliente: order.cliente,
        estado: 'PENDIENTE',
        items: order.items.map(i => ({ ...i })),
        reservedItems: order.reservedItems ? order.reservedItems.map(ri => ({ ...ri })) : [],
        observaciones: order.observaciones,
        operador: operatorName || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setOrders(prev => [...prev, newOrder]);
      setSelectedOrderId(newOrder.id);
      setView('detail');
      showToast(`Pedido ${newOrder.numero} duplicado.`);
    },
    [orders, operatorName, showToast]
  );

  const exportToExcel = useCallback(async () => {
    try {
      const XLSX = await import('xlsx');
      const rows: Record<string, string | number>[] = [];
      filteredOrders.forEach(order => {
        order.items.forEach((item, idx) => {
          rows.push({
            'N° Pedido': idx === 0 ? order.numero : '',
            Cliente: idx === 0 ? order.cliente : '',
            Estado: idx === 0 ? order.estado : '',
            Operador: idx === 0 ? order.operador || '' : '',
            Fecha: idx === 0 ? formatDate(order.createdAt) : '',
            Producto: item.producto,
            Contenedor: item.contenedor,
            Lote: item.lote,
            Pallets: item.pallets,
            Cajas: item.cajas,
            Kilos: Number(item.kilos).toFixed(1),
            Observaciones: idx === 0 ? order.observaciones : '',
          });
        });
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
      XLSX.writeFile(wb, `pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast('Pedidos exportados a Excel.');
    } catch (e) {
      console.error('Error al exportar:', e);
      showToast('Error al exportar a Excel.', 'error');
    }
  }, [filteredOrders, showToast]);

  const exportDetailToExcel = useCallback(async () => {
    if (!selectedOrder) return;
    try {
      const XLSX = await import('xlsx');
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

      const order = selectedOrder;
      const wsData: any[][] = [
        ['PLANILLA DE CARGA'],
        [],
        ['N° Pedido', order.numero],
        ['Cliente', order.cliente],
        ['Estado', order.estado],
        ['Operador', order.operador || '-'],
        ['Fecha', formatDate(order.createdAt)],
        ['Observaciones', order.observaciones || '-'],
        [],
        ['Producto', 'Contenedor', 'Lote', 'Pallets', 'Cajas', 'Kilos'],
      ];
      order.items.forEach(item => {
        wsData.push([item.producto, item.contenedor, item.lote, item.pallets, item.cajas, Number(item.kilos).toFixed(1)]);
      });
      const totals = order.items.reduce((a, i) => ({ p: a.p + i.pallets, c: a.c + i.cajas, k: a.k + i.kilos }), { p: 0, c: 0, k: 0 });
      wsData.push([]);
      wsData.push(['TOTALES', '', '', totals.p, totals.c, totals.k.toFixed(1)]);

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      // Merge header cell
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
      // Style headers
      const cols = ['A', 'B', 'C', 'D', 'E', 'F'];
      // Title row
      if (ws['A1']) ws['A1'].s = { ...headerStyle, font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } } };
      // Column headers row (row 10)
      cols.forEach(col => {
        const ref = `${col}10`;
        if (ws[ref]) ws[ref].s = headerStyle;
      });
      // Data rows
      for (let i = 11; i < wsData.length; i++) {
        cols.forEach(col => {
          const ref = `${col}${i}`;
          if (!ws[ref]) ws[ref] = { t: 's', v: '' };
          ws[ref].s = normalStyle;
        });
      }
      // Totals row bold
      const totalRow = wsData.length;
      cols.forEach(col => {
        const ref = `${col}${totalRow}`;
        if (ws[ref]) ws[ref].s = { ...normalStyle, font: { bold: true, sz: 10 } };
      });

      ws['!cols'] = [{ wch: 45 }, { wch: 20 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Planilla de Carga');
      XLSX.writeFile(wb, `planilla_${order.numero}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast('Planilla de carga exportada.');
    } catch (e) {
      console.error('Error al exportar planilla:', e);
      showToast('Error al exportar planilla.', 'error');
    }
  }, [selectedOrder, showToast]);

  // ═══════════════════════════════════════════════════════
  // RENDER HELPERS
  // ═══════════════════════════════════════════════════════

  const renderStatusBadge = (status: string) => (
    <span className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest ${STATUS_STYLES[status] || ''}`}>
      {status}
    </span>
  );

  // ── LIST VIEW ──────────────────────────────────────────

  const renderListView = () => (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-neutral-200 bg-white">
        <div>
          <h2 className="text-xl font-light tracking-tight text-neutral-900 uppercase">Gestión de Pedidos</h2>
          <p className="text-[10px] font-mono text-neutral-500 mt-1 uppercase tracking-widest">
            {orders.length} pedido{orders.length !== 1 ? 's' : ''} total{orders.length !== 1 ? 'es' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportToExcel}
            className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest border border-neutral-300 text-neutral-700 hover:border-neutral-900 hover:text-neutral-900 transition-colors"
          >
            Exportar Excel
          </button>
          <button
            onClick={() => {
              clearForm();
              setView('new');
            }}
            className="px-5 py-2.5 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors"
          >
            [+] Nuevo Pedido
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-6 bg-neutral-50 border-b border-neutral-200">
        <div className="flex-1 max-w-md">
          <input
            type="text"
            placeholder="BUSCAR PEDIDO, CLIENTE, OPERADOR..."
            value={orderSearch}
            onChange={e => setOrderSearch(e.target.value)}
            className="w-full py-2 px-3 text-xs font-mono uppercase bg-white border border-neutral-200 focus:border-neutral-900 outline-none transition-colors placeholder:text-neutral-400"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {['TODOS', 'PENDIENTE', 'CONFIRMADO', 'DESPACHADO', 'CANCELADO'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                statusFilter === s
                  ? 'bg-neutral-900 text-white'
                  : 'bg-white border border-neutral-300 text-neutral-600 hover:border-neutral-900 hover:text-neutral-900'
              }`}
            >
              {s} ({ordersByStatus[s]})
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-sm font-mono uppercase tracking-widest text-neutral-400 mb-2">
              {orderSearch || statusFilter !== 'TODOS' ? 'Sin resultados' : 'No hay pedidos'}
            </p>
            <p className="text-xs font-mono text-neutral-400">
              {orderSearch || statusFilter !== 'TODOS'
                ? 'Intenta con otros filtros'
                : 'Crea tu primer pedido con [+ Nuevo Pedido]'}
            </p>
          </div>
        ) : (
          <div className="border-l border-r border-b border-neutral-200">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 p-4 bg-neutral-900 text-white text-[10px] font-mono uppercase tracking-widest">
              <div className="col-span-2">N° Pedido</div>
              <div className="col-span-2">Cliente</div>
              <div className="col-span-2">Estado</div>
              <div className="col-span-1 text-right">Ítems</div>
              <div className="col-span-1 text-right">Pallets</div>
              <div className="col-span-1 text-right">Cajas</div>
              <div className="col-span-1 text-right">Kilos</div>
              <div className="col-span-2">Fecha</div>
            </div>
            {/* Rows */}
            <div className="divide-y divide-neutral-100">
              {filteredOrders.map(order => {
                const totals = order.items.reduce(
                  (acc, item) => ({
                    pallets: acc.pallets + item.pallets,
                    cajas: acc.cajas + item.cajas,
                    kilos: acc.kilos + item.kilos,
                  }),
                  { pallets: 0, cajas: 0, kilos: 0 }
                );
                return (
                  <button
                    key={order.id}
                    onClick={() => {
                      setSelectedOrderId(order.id);
                      setView('detail');
                    }}
                    className="w-full grid grid-cols-12 gap-2 p-4 text-xs font-mono hover:bg-neutral-50 transition-colors text-left"
                  >
                    <div className="col-span-2 font-medium text-neutral-900 truncate">{order.numero}</div>
                    <div className="col-span-2 text-neutral-600 truncate">{order.cliente}</div>
                    <div className="col-span-2">{renderStatusBadge(order.estado)}</div>
                    <div className="col-span-1 text-right text-neutral-600">{order.items.length}</div>
                    <div className="col-span-1 text-right text-neutral-600">{totals.pallets}</div>
                    <div className="col-span-1 text-right text-neutral-600">{totals.cajas}</div>
                    <div className="col-span-1 text-right font-medium text-neutral-900">
                      {totals.kilos.toFixed(1)}
                    </div>
                    <div className="col-span-2 text-neutral-400 text-[10px]">
                      {formatDate(order.createdAt)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── NEW ORDER VIEW ─────────────────────────────────────

  const renderNewOrderView = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-neutral-200 bg-white">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setView('list')}
            className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest border border-neutral-300 text-neutral-500 hover:border-neutral-900 hover:text-neutral-900 transition-colors"
          >
            ← Volver
          </button>
          <div>
            <h2 className="text-xl font-light tracking-tight text-neutral-900 uppercase">Nuevo Pedido</h2>
            <p className="text-[10px] font-mono text-neutral-500 mt-1 uppercase tracking-widest">
              Seleccione cliente, contenedor e ítems para agregar al pedido
            </p>
          </div>
        </div>
      </div>

      {/* Main form */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ── Selection Panel ─────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            <div>
              <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 mb-4">
                Selección de Productos
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <SearchableDropdown
                  label="Cliente"
                  placeholder="Seleccionar cliente..."
                  options={clientOptions}
                  selected={selClient}
                  onSelect={val => {
                    setSelClient(val);
                    setSelContainer('');
                    setSelItemId('');
                  }}
                  onClear={() => {
                    setSelClient('');
                    setSelContainer('');
                    setSelItemId('');
                  }}
                  width="full"
                />
                <SearchableDropdown
                  label="Contenedor"
                  placeholder={selClient ? 'Seleccionar contenedor...' : 'Primero seleccione cliente'}
                  options={containerOptions}
                  selected={selContainer}
                  onSelect={val => {
                    setSelContainer(val);
                    setSelItemId('');
                  }}
                  onClear={() => {
                    setSelContainer('');
                    setSelItemId('');
                  }}
                  width="full"
                />
              </div>

              {/* Item selection - show all container items as clickable list */}
              {selClient && selContainer && (
                <div className="pt-2">
                  <h4 className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-3">
                    Productos en {selContainer}
                  </h4>

                  {availableItems.length === 0 ? (
                    <p className="text-xs font-mono text-neutral-400 text-center py-4">
                      No hay ítems disponibles para este contenedor.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {availableItems.map(invItem => {
                        const invFull = inventoryData.find(it => it.id === invItem.value);
                        if (!invFull) return null;
                        const alreadyInCart = cart.find(c => c.inventoryId === invItem.value);
                        return (
                          <div
                            key={invItem.value}
                            className={`border p-3 transition-colors ${
                              alreadyInCart
                                ? 'border-amber-400 bg-amber-50'
                                : 'border-neutral-200 bg-white hover:border-neutral-400'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-mono font-medium text-neutral-900 flex-1 truncate pr-2">
                                {invFull.producto}
                              </p>
                              <span className="text-[9px] font-mono text-neutral-400 whitespace-nowrap">
                                Lote: {invFull.lote || 'S/L'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-2">
                              <span className="text-neutral-400">Disponible:</span>
                              <span className="text-neutral-900 font-bold">
                                {Number(invFull.pallets)} PAL
                              </span>
                              <span className="text-neutral-900 font-bold">
                                {Number(invFull.cantidad)} CAJ
                              </span>
                              <span className="text-neutral-900 font-bold">
                                {Number(invFull.kilos)} KG
                              </span>
                            </div>
                            {alreadyInCart ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-mono text-amber-700 uppercase font-medium">
                                  En pedido:
                                </span>
                                <span className="text-[10px] font-mono text-amber-900 font-bold">
                                  {alreadyInCart.pallets} PAL
                                </span>
                                <span className="text-[10px] font-mono text-amber-900 font-bold">
                                  {alreadyInCart.cajas} CAJ
                                </span>
                                <span className="text-[10px] font-mono text-amber-900 font-bold">
                                  {alreadyInCart.kilos} KG
                                </span>
                                <button
                                  onClick={() => removeFromCart(invItem.value)}
                                  className="ml-auto px-2 py-1 text-[9px] font-mono uppercase tracking-widest text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                                >
                                  Quitar
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  // Auto-fill with all available inventory
                                  setSelItemId(invItem.value);
                                  setAddPallets(String(Number(invFull.pallets) || 1));
                                  setAddCajas(String(Number(invFull.cantidad) || 0));
                                  setAddKilos(String(Number(invFull.kilos) || 0));
                                  // Add directly to cart
                                  const pal = Number(invFull.pallets) || 1;
                                  const caj = Number(invFull.cantidad) || 0;
                                  const kil = Number(invFull.kilos) || 0;
                                  setCart(prev => [
                                    ...prev,
                                    {
                                      inventoryId: invFull.id,
                                      producto: invFull.producto,
                                      contenedor: invFull.contenedor,
                                      lote: invFull.lote || '',
                                      cliente: invFull.cliente,
                                      pallets: pal,
                                      cajas: caj,
                                      kilos: kil,
                                      maxPallets: pal,
                                      maxCajas: caj,
                                      maxKilos: kil,
                                    },
                                  ]);
                                }}
                                className="w-full px-3 py-1.5 bg-neutral-900 text-white text-[9px] font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors"
                              >
                                + Agregar al Pedido ({Number(invFull.pallets)} PAL / {Number(invFull.cantidad)} CAJ / {Number(invFull.kilos)} KG)
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {!selClient && (
                <div className="pt-4">
                  <p className="text-xs font-mono text-neutral-400 text-center py-8">
                    Seleccione un cliente para comenzar.
                  </p>
                </div>
              )}
            </div>

            {/* Observations */}
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-2">
                Observaciones
              </label>
              <textarea
                rows={2}
                value={observaciones}
                onChange={e => setObservaciones(e.target.value)}
                placeholder="NOTAS ADICIONALES DEL PEDIDO..."
                className="w-full p-2 text-xs font-mono uppercase bg-white border border-neutral-200 focus:border-neutral-900 outline-none transition-colors placeholder:text-neutral-400 resize-none"
              />
            </div>
          </div>

          {/* ── Cart Panel ─────────────────────────── */}
          <div>
            <div className="bg-white border border-neutral-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900">Pedido</h3>
                <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
                  {cart.length} ítem{cart.length !== 1 ? 's' : ''}
                </span>
              </div>

              {cart.length === 0 ? (
                <p className="text-xs font-mono text-neutral-400 text-center py-4">
                  El pedido está vacío.
                </p>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto mb-3">
                  {cart.map(item => (
                    <div key={item.inventoryId} className="border border-neutral-200 p-2">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-[11px] font-mono font-medium text-neutral-900 flex-1 truncate pr-2">
                          {item.producto}
                        </p>
                        <button
                          onClick={() => removeFromCart(item.inventoryId)}
                          className="text-neutral-400 hover:text-red-600 transition-colors text-sm leading-none shrink-0"
                          title="Eliminar"
                        >
                          ×
                        </button>
                      </div>
                      <p className="text-[9px] font-mono text-neutral-400 mb-2 uppercase">
                        {item.contenedor} · {item.lote || 'S/L'}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[8px] font-mono uppercase text-neutral-400 mb-0.5">
                            PAL
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={item.maxPallets}
                            value={item.pallets || ''}
                            onChange={e =>
                              updateCartQty(item.inventoryId, 'pallets', parseFloat(e.target.value) || 0)
                            }
                            className="w-full p-1.5 text-[10px] font-mono bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors text-center"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-mono uppercase text-neutral-400 mb-0.5">
                            CAJ
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={item.maxCajas}
                            value={item.cajas || ''}
                            onChange={e =>
                              updateCartQty(item.inventoryId, 'cajas', parseFloat(e.target.value) || 0)
                            }
                            className="w-full p-1.5 text-[10px] font-mono bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors text-center"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-mono uppercase text-neutral-400 mb-0.5">
                            KG
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={item.maxKilos}
                            step="0.1"
                            value={item.kilos || ''}
                            onChange={e =>
                              updateCartQty(item.inventoryId, 'kilos', parseFloat(e.target.value) || 0)
                            }
                            className="w-full p-1.5 text-[10px] font-mono bg-neutral-50 border border-neutral-200 focus:border-neutral-900 outline-none transition-colors text-center"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals + Confirm */}
              {cart.length > 0 && (
                <div className="border-t-2 border-neutral-900 pt-3 space-y-2">
                  <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest">
                    <span className="text-neutral-500">Pallets</span>
                    <span className="font-bold text-neutral-900">{cartTotals.pallets}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest">
                    <span className="text-neutral-500">Cajas</span>
                    <span className="font-bold text-neutral-900">{cartTotals.cajas}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest">
                    <span className="text-neutral-500">Kilos</span>
                    <span className="font-bold text-neutral-900">{cartTotals.kilos.toFixed(1)}</span>
                  </div>
                  <button
                    onClick={confirmOrder}
                    className="w-full px-4 py-2.5 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors mt-2"
                  >
                    Confirmar Pedido
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── DETAIL VIEW ───────────────────────────────────────

  const renderDetailView = () => {
    if (!selectedOrder) {
      setView('list');
      return null;
    }

    const order = selectedOrder;
    const transitions = STATUS_TRANSITIONS[order.estado] || [];
    const orderTotals = order.items.reduce(
      (acc, item) => ({
        pallets: acc.pallets + item.pallets,
        cajas: acc.cajas + item.cajas,
        kilos: acc.kilos + item.kilos,
      }),
      { pallets: 0, cajas: 0, kilos: 0 }
    );

    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-neutral-200 bg-white">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView('list')}
              className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest border border-neutral-300 text-neutral-500 hover:border-neutral-900 hover:text-neutral-900 transition-colors"
            >
              ← Volver
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-light tracking-tight text-neutral-900 uppercase">
                  {order.numero}
                </h2>
                {renderStatusBadge(order.estado)}
              </div>
              <p className="text-[10px] font-mono text-neutral-500 mt-1 uppercase tracking-widest">
                {order.cliente}
                {order.operador ? ` · Operador: ${order.operador}` : ''} · {formatDate(order.createdAt)}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Export Planilla */}
            <button
              onClick={exportDetailToExcel}
              className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest border border-neutral-300 text-neutral-700 hover:border-neutral-900 hover:text-neutral-900 transition-colors"
            >
              Exportar Planilla
            </button>

            {/* Edit (PENDIENTE only) */}
            {order.estado === 'PENDIENTE' && (
              <button
                onClick={() => editOrder(order.id)}
                className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest border border-amber-400 text-amber-800 hover:bg-amber-50 transition-colors"
              >
                Editar
              </button>
            )}

            {/* Duplicate */}
            <button
              onClick={() => duplicateOrder(order.id)}
              className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest border border-neutral-300 text-neutral-700 hover:border-neutral-900 hover:text-neutral-900 transition-colors"
            >
              Duplicar
            </button>

            {/* Status transitions */}
            {transitions.map(status => (
              <button
                key={status}
                onClick={() => setStatusConfirm({ orderId: order.id, newStatus: status })}
                className={`px-4 py-2 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                  status === 'CANCELADO'
                    ? 'border border-red-300 text-red-700 hover:bg-red-50'
                    : status === 'DESPACHADO'
                      ? 'border border-green-500 text-green-800 hover:bg-green-50'
                      : 'border border-neutral-300 text-neutral-700 hover:border-neutral-900 hover:text-neutral-900'
                }`}
              >
                {status === 'CONFIRMADO' ? 'Confirmar' : status === 'DESPACHADO' ? 'Despachar' : status}
              </button>
            ))}

            {/* Delete */}
            {order.estado !== 'DESPACHADO' && (
              <button
                onClick={() => setDeleteConfirm(order.id)}
                className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Eliminar
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
            {/* KPI Cards */}
            <div className="bg-white border border-neutral-200 p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-2">Ítems</p>
              <h3 className="text-3xl font-light tracking-tighter text-neutral-900">{order.items.length}</h3>
            </div>
            <div className="bg-white border border-neutral-200 p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-2">Pallets</p>
              <h3 className="text-3xl font-light tracking-tighter text-neutral-900">
                {orderTotals.pallets}
              </h3>
            </div>
            <div className="bg-white border border-neutral-200 p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-2">Cajas</p>
              <h3 className="text-3xl font-light tracking-tighter text-neutral-900">{orderTotals.cajas}</h3>
            </div>
            <div className="bg-white border border-neutral-200 p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-2">Kilos</p>
              <h3 className="text-3xl font-light tracking-tighter text-neutral-900">
                {orderTotals.kilos.toFixed(1)}
              </h3>
            </div>
          </div>

          {/* Items table */}
          <div className="bg-white border border-neutral-200 mb-6">
            <div className="p-4 border-b border-neutral-200 bg-neutral-50">
              <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900">
                Detalle de Ítems ({order.items.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-neutral-900 text-white text-[10px] font-mono uppercase tracking-widest">
                  <tr>
                    <th className="p-3">Producto</th>
                    <th className="p-3">Contenedor</th>
                    <th className="p-3">Lote</th>
                    <th className="p-3 text-right">Pallets</th>
                    <th className="p-3 text-right">Cajas</th>
                    <th className="p-3 text-right">Kilos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {order.items.map((item, idx) => (
                    <tr key={item.inventoryId || idx} className="hover:bg-neutral-50 transition-colors">
                      <td className="p-3 font-mono text-neutral-900 max-w-xs truncate">{item.producto}</td>
                      <td className="p-3 font-mono text-neutral-600 whitespace-nowrap">{item.contenedor}</td>
                      <td className="p-3 font-mono text-neutral-600 whitespace-nowrap">{item.lote || '-'}</td>
                      <td className="p-3 text-right font-mono text-neutral-700">{item.pallets}</td>
                      <td className="p-3 text-right font-mono text-neutral-700">{item.cajas}</td>
                      <td className="p-3 text-right font-mono font-bold text-neutral-900">
                        {Number(item.kilos).toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-neutral-900 text-white font-bold">
                    <td className="p-3 font-mono text-[10px] uppercase tracking-widest" colSpan={3}>
                      Total
                    </td>
                    <td className="p-3 text-right font-mono">{orderTotals.pallets}</td>
                    <td className="p-3 text-right font-mono">{orderTotals.cajas}</td>
                    <td className="p-3 text-right font-mono">{orderTotals.kilos.toFixed(1)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Observations */}
          {order.observaciones && (
            <div className="bg-white border border-neutral-200 p-6">
              <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900 mb-3">
                Observaciones
              </h3>
              <p className="text-xs font-mono text-neutral-600 leading-relaxed">{order.observaciones}</p>
            </div>
          )}

          {/* Reserved stock info */}
          {order.reservedItems && order.reservedItems.length > 0 && (
            <div className="mt-6 bg-amber-50 border border-amber-200 p-6">
              <h3 className="text-xs font-mono uppercase tracking-widest text-amber-800 mb-2">
                Stock Reservado
              </h3>
              <p className="text-[10px] font-mono text-amber-700">
                Este pedido tiene {order.reservedItems.length} ítem{order.reservedItems.length !== 1 ? 'es' : ''} con stock reservado. 
                El inventario será descontado al despachar.
              </p>
              <div className="mt-3 flex gap-4 text-[10px] font-mono text-amber-800 uppercase tracking-widest">
                <span>
                  <strong>{order.reservedItems.reduce((s, r) => s + r.palletsReserved, 0)}</strong> PAL
                </span>
                <span>
                  <strong>{order.reservedItems.reduce((s, r) => s + r.cajasReserved, 0)}</strong> CAJ
                </span>
                <span>
                  <strong>
                    {order.reservedItems.reduce((s, r) => s + r.kilosReserved, 0).toFixed(1)}
                  </strong>{' '}
                  KG
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════

  return (
    <div className="h-full flex flex-col relative bg-neutral-100">
      {/* Toast */}
      {toast && (
        <div
          className={`absolute top-4 right-4 z-[60] px-6 py-3 shadow-lg text-xs font-mono uppercase tracking-widest transition-all ${
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={deleteConfirm !== null}
        title="Eliminar Pedido"
        message="¿Estás seguro de que deseas eliminar este pedido? Si tiene stock reservado, será restaurado al inventario."
        confirmLabel="Sí, Eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={() => {
          if (deleteConfirm) deleteOrder(deleteConfirm);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Status Change Confirm Modal */}
      <ConfirmModal
        open={statusConfirm !== null}
        title="Cambiar Estado del Pedido"
        message={
          statusConfirm?.newStatus === 'DESPACHADO'
            ? 'Al despachar se descontará el stock reservado del inventario. Esta acción no se puede deshacer.'
            : statusConfirm?.newStatus === 'CANCELADO'
              ? 'Al cancelar se restaurará el stock reservado al inventario.'
              : '¿Deseas cambiar el estado de este pedido?'
        }
        confirmLabel={
          statusConfirm?.newStatus === 'DESPACHADO'
            ? 'Despachar'
            : statusConfirm?.newStatus === 'CANCELADO'
              ? 'Cancelar Pedido'
              : 'Confirmar'
        }
        cancelLabel="Volver"
        variant={statusConfirm?.newStatus === 'CANCELADO' ? 'warning' : 'info'}
        onConfirm={() => {
          if (statusConfirm) updateOrderStatus(statusConfirm.orderId, statusConfirm.newStatus);
        }}
        onCancel={() => setStatusConfirm(null)}
      />

      {/* Views */}
      {view === 'list' && renderListView()}
      {view === 'new' && renderNewOrderView()}
      {view === 'detail' && renderDetailView()}
    </div>
  );
}
