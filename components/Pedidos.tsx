'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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

interface ArchivoAdjunto {
  nombre: string;
  tipo: string;
  tamanio: number;
  dataUrl: string;
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
  archivosAdjuntos?: ArchivoAdjunto[];
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

  // Adjuntos
  const [archivosAdjuntos, setArchivosAdjuntos] = useState<ArchivoAdjunto[]>([]);
  const archivoInputRef = useRef<HTMLInputElement>(null);

  // AI Extraction state (client-side via AI provider API)
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiExtractedItems, setAiExtractedItems] = useState<Array<{
    producto: string;
    contenedor: string;
    lote: string;
    pallets: number;
    cajas: number;
    kilos: number;
  }>>([]);
  const [aiError, setAiError] = useState('');
  const [aiClientName, setAiClientName] = useState('');
  const [aiObservaciones, setAiObservaciones] = useState('');
  const [aiRawText, setAiRawText] = useState('');
  const [showAiPanel, setShowAiPanel] = useState(false);
  // AI Provider config (Groq / OpenRouter / Gemini)
  const AI_PROVIDERS = {
    groq: { name: 'Groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', visionModel: 'meta-llama/llama-4-scout-17b-16e-instruct', textModel: 'meta-llama/llama-4-scout-17b-16e-instruct', keyLabel: 'Groq API Key', keyPrefix: 'gsk_', keyLink: 'https://console.groq.com/keys', description: 'Gratis, rapidísimo, buena cuota' },
    openrouter: { name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', visionModel: 'google/gemini-2.0-flash-001:free', textModel: 'google/gemini-2.0-flash-001:free', keyLabel: 'OpenRouter Key', keyPrefix: 'sk-or-', keyLink: 'https://openrouter.ai/settings/keys', description: 'Multi-proveedor, modelos gratis' },
    gemini: { name: 'Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', visionModel: 'gemini-2.0-flash', textModel: 'gemini-2.0-flash', keyLabel: 'Gemini API Key', keyPrefix: 'AIza', keyLink: 'https://aistudio.google.com/apikey', description: 'Google, puede tener cuota limitada' },
  } as const;
  type AIProviderKey = keyof typeof AI_PROVIDERS;

  const [aiProvider, setAiProvider] = useState<AIProviderKey>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('ai_provider') as AIProviderKey) || 'groq';
    return 'groq';
  });
  const [aiApiKeys, setAiApiKeys] = useState<Record<AIProviderKey, string>>(() => {
    const keys: Record<string, string> = { groq: '', openrouter: '', gemini: '' };
    if (typeof window !== 'undefined') {
      try { keys.groq = localStorage.getItem('ai_key_groq') || ''; } catch {}
      try { keys.openrouter = localStorage.getItem('ai_key_openrouter') || ''; } catch {}
      try { keys.gemini = localStorage.getItem('ai_key_gemini') || localStorage.getItem('gemini_api_key') || ''; } catch {}
    }
    return keys as Record<AIProviderKey, string>;
  });
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

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
    setArchivosAdjuntos([]);
    setAiProcessing(false);
    setAiExtractedItems([]);
    setAiError('');
    setAiClientName('');
    setAiObservaciones('');
    setAiRawText('');
    setShowAiPanel(false);
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
      archivosAdjuntos: archivosAdjuntos.length > 0 ? archivosAdjuntos : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setOrders(prev => [...prev, newOrder]);
    setSelectedOrderId(newOrder.id);
    setView('detail');
    clearForm();
    showToast(`Pedido ${newOrder.numero} creado exitosamente.`);
  }, [cart, selClient, observaciones, operatorName, orders, archivosAdjuntos, clearForm, showToast]);

  // ── ADJUNTAR ARCHIVOS ───────────────────────────────

  const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB max por archivo
  const ACCEPTED_TYPES = [
    'application/pdf',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
  ];
  const ACCEPTED_EXT = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.xlsx,.xls,.csv';

  // ── EXTRACCION NATIVA (100% gratis, sin API, sin límites) ──

  const currentApiKey = aiApiKeys[aiProvider];
  const currentProvider = AI_PROVIDERS[aiProvider];

  const saveAIProvider = useCallback((provider: AIProviderKey) => {
    setAiProvider(provider);
    if (typeof window !== 'undefined') localStorage.setItem('ai_provider', provider);
  }, []);

  const saveAIKey = useCallback((provider: AIProviderKey, key: string) => {
    setAiApiKeys(prev => ({ ...prev, [provider]: key }));
    if (typeof window !== 'undefined') localStorage.setItem(`ai_key_${provider}`, key);
  }, []);

  // ── Generic AI call (works with Groq, OpenRouter, Gemini) ──

  const callAIVision = async (base64Data: string, mimeType: string, prompt: string, onProgress?: (msg: string) => void): Promise<string> => {
    const provider = AI_PROVIDERS[aiProvider];
    const apiKey = aiApiKeys[aiProvider];

    if (!apiKey.trim()) {
      const err = new Error('NO_KEY');
      throw err;
    }

    if (aiProvider === 'gemini') {
      // Gemini uses its own REST API format
      const url = `${provider.endpoint}?key=${apiKey.trim()}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: prompt },
          ]}],
          systemInstruction: { parts: [{ text: 'Eres un asistente de logística. Responde en español.' }] },
        }),
      });
      if (!resp.ok) {
        if (resp.status === 429) throw new Error('QUOTA_EXCEEDED');
        const errText = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${errText.substring(0, 200)}`);
      }
      const data = await resp.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // Groq / OpenRouter: OpenAI-compatible format
    const resp = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: provider.visionModel,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } },
            { type: 'text', text: prompt },
          ],
        }],
        max_tokens: 4096,
      }),
    });
    if (!resp.ok) {
      if (resp.status === 429) throw new Error('QUOTA_EXCEEDED');
      const errText = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${errText.substring(0, 200)}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  };

  const callAIText = async (text: string, systemPrompt: string): Promise<string> => {
    const provider = AI_PROVIDERS[aiProvider];
    const apiKey = aiApiKeys[aiProvider];
    if (!apiKey.trim()) return '';

    if (aiProvider === 'gemini') {
      const url = `${provider.endpoint}?key=${apiKey.trim()}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    const resp = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: provider.textModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        max_tokens: 4096,
      }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  };

  // ── Native text extraction from file ──
  const extractTextFromFile = async (archivo: ArchivoAdjunto, onProgress?: (msg: string) => void): Promise<{ text: string; isTabular: boolean; rows?: any[]; needsKey?: boolean; quotaExceeded?: boolean }> => {
    if (archivo.tipo.startsWith('image/')) {
      // Images need AI Vision API
      onProgress?.('Procesando imagen...');
      const apiKey = aiApiKeys[aiProvider];
      if (!apiKey.trim()) {
        return { text: '', isTabular: false, needsKey: true };
      }
      try {
        onProgress?.('Analizando imagen con IA...');
        const base64Data = archivo.dataUrl.replace(/^data:image\/[^;]+;base64,/, '');
        const mimeType = archivo.tipo || 'image/jpeg';
        const text = await callAIVision(base64Data, mimeType,
          'Leé todo el texto de esta imagen y devolvelo tal cual aparece, sin cambiar nada. Si hay una tabla, reproduci los datos en formato texto con separadores.',
          onProgress
        );
        return { text, isTabular: false };
      } catch (err: any) {
        const msg = err.message || String(err);
        if (msg === 'NO_KEY') return { text: '', isTabular: false, needsKey: true };
        if (msg === 'QUOTA_EXCEEDED') return { text: '', isTabular: false, quotaExceeded: true };
        throw err;
      }
    }

    if (archivo.tipo.includes('pdf') || archivo.nombre.endsWith('.pdf')) {
      onProgress?.('Extrayendo texto del PDF...');
      const pdfjsLib = await import('pdfjs-dist');
      const raw = archivo.dataUrl.replace(/^data:application\/pdf;base64,/, '');
      const pdfData = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        onProgress?.(`Leyendo página ${i}/${pdf.numPages}...`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
      }
      return { text: fullText, isTabular: false };
    }

    // Excel / CSV
    onProgress?.('Leyendo planilla Excel...');
    const XLSX = await import('xlsx');
    const raw = archivo.dataUrl.replace(/^data:application\/[^;]+;base64,/, '');
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const workbook = XLSX.read(bytes, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<any[]>(firstSheet, { defval: '' });
    const textRep = data.map((row, idx) =>
      `Fila ${idx + 1}: ${Object.entries(row).map(([k, v]) => `${k}=${v}`).join(', ')}`
    ).join('\n');
    return { text: textRep, isTabular: true, rows: data };
  };

  // ── Regex-based order extraction from text ──
  const extractOrderFromText = (text: string, rows?: any[]): ExtractResult => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const items: ExtractItem[] = [];
    let cliente = '';
    let contenedor = '';
    let lote = '';
    let observaciones = '';

    // Detect container number (typically 4-7 digits, often starting with letters)
    const containerPatterns = [
      /contenedor[:\s-]*([A-Za-z]{0,4}\d{4,8})/i,
      /container[:\s-]*([A-Za-z]{0,4}\d{4,8})/i,
      /cont[:\s-]*([A-Za-z]{0,4}\d{4,8})/i,
      /\b([A-Z]{4}\d{7})\b/, // e.g. TRLU1234567
      /\b(MSCU\d{7})\b/,
      /\b(CLRU\d{7})\b/,
      /\b(TEMU\d{7})\b/,
      /\b(CXDU\d{7})\b/,
      /\b(OOLU\d{7})\b/,
      /\b(HLCU\d{7})\b/,
      /\b(FCMU\d{7})\b/,
      /\b(BMOU\d{7})\b/,
      /\b(CS LU\d{7})\b/,
    ];
    for (const pat of containerPatterns) {
      const m = text.match(pat);
      if (m) { contenedor = m[1].toUpperCase().replace(/\s/g, ''); break; }
    }

    // Detect lot number
    const lotPatterns = [
      /lote[:\s-]*([A-Za-z0-9]{3,15})/i,
      /lot[:\s-]*([A-Za-z0-9]{3,15})/i,
      /lote\s*#?\s*([A-Za-z0-9]{3,15})/i,
      /LT\s*[-:]?\s*([A-Za-z0-9]{3,15})/i,
    ];
    for (const pat of lotPatterns) {
      const m = text.match(pat);
      if (m && !/^\d+$/.test(m[1])) { lote = m[1].toUpperCase().trim(); break; }
    }

    // Detect client name (look for common patterns)
    const clientPatterns = [
      /(?:cliente|customer|client|para|destinatario|consignatario)[:\s-]*([^\n,;]{2,40})/i,
      /DYSA\s*10330/i,
    ];
    for (const pat of clientPatterns) {
      const m = text.match(pat);
      if (m) { cliente = m[1]?.trim() || 'SADETIR (DYSA 10330)'; break; }
    }
    if (!cliente && text.match(/DYSA|SADETIR|10330/i)) {
      cliente = 'SADETIR (DYSA 10330)';
    }

    // Quantity units keywords
    const units = {
      pallets: /\b(pallets?|pales?|pallet)\b/i,
      cajas: /\b(cajas?|caja|boxes?|bultos?)\b/i,
      kilos: /\b(kilos?|kgs?|kg)\b/i,
    };

    // ── If Excel rows: extract from structured data ──
    if (rows && rows.length > 0) {
      const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim());
      const prodCol = headers.find(h => /producto|product|descripcion|desc|item|nombre|name|mercaderia|mercadería/i.test(h));
      const palletCol = headers.find(h => /pallet|pale/i.test(h));
      const cajaCol = headers.find(h => /caja|box|bulto/i.test(h));
      const kiloCol = headers.find(h => /kilo|kg|peso|weight/i.test(h));
      const contCol = headers.find(h => /contenedor|container|cont/i.test(h));
      const loteCol = headers.find(h => /lote|lot/i.test(h));

      for (const row of rows) {
        const prod = prodCol ? String(row[headers.find(h => h === prodCol) || prodCol] || '').trim() : '';
        if (!prod) continue;
        items.push({
          producto: prod,
          contenedor: contCol ? String(row[headers.find(h => h === contCol) || contCol] || '').trim() : contenedor,
          lote: loteCol ? String(row[headers.find(h => h === loteCol) || loteCol] || '').trim() : lote,
          pallets: palletCol ? Number(row[headers.find(h => h === palletCol) || palletCol]) || 0 : 0,
          cajas: cajaCol ? Number(row[headers.find(h => h === cajaCol) || cajaCol]) || 0 : 0,
          kilos: kiloCol ? Number(row[headers.find(h => h === kiloCol) || kiloCol]) || 0 : 0,
        });
      }
    }

    // ── Extract from text lines ──
    if (items.length === 0) {
      // Pattern 1: "N pallets de PRODUCTO" / "N cajas PRODUCTO" / "N kilos PRODUCTO"
      const qtyProductPattern = /(\d+(?:[.,]\d+)?)\s*(pallets?|pales?|cajas?|bultos?|kilos?|kgs?|kg|units?|unidades?)\s*(?:de|del|por)?\s*(.+)/i;
      // Pattern 2: "PRODUCTO: N pallets" / "PRODUCTO - N cajas"
      const productQtyPattern = /([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s/()\-\.]+?)\s*[:\-–—]\s*(\d+(?:[.,]\d+)?)\s*(pallets?|pales?|cajas?|bultos?|kilos?|kgs?|kg|units?|unidades?)/i;
      // Pattern 3: "PRODUCTO x N" / "PRODUCTO X N"
      const productXQtyPattern = /([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s/()\-\.]+?)\s*[xX]\s*(\d+(?:[.,]\d+)?)/i;
      // Pattern 4: standalone number + product on same line "5 MANZANAS"
      const numberProductPattern = /^\s*(\d{1,4})\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s/()\-\.]{3,40})\s*$/;

      for (const line of lines) {
        if (line.length < 4) continue;

        let match: RegExpExecArray | null = null;

        // Try pattern 1: quantity unit of product
        match = qtyProductPattern.exec(line);
        if (match) {
          const qty = Number(match[1].replace(',', '.')) || 0;
          const unit = (match[2] || '').toLowerCase();
          const prod = (match[3] || '').trim().replace(/[.,;]$/, '');
          if (prod && qty > 0) {
            items.push({
              producto: prod,
              contenedor,
              lote,
              pallets: units.pallets.test(unit) ? qty : 0,
              cajas: units.cajas.test(unit) ? qty : 0,
              kilos: units.kilos.test(unit) ? qty : 0,
            });
            continue;
          }
        }

        // Try pattern 2: product: quantity unit
        match = productQtyPattern.exec(line);
        if (match) {
          const prod = (match[1] || '').trim();
          const qty = Number(match[2].replace(',', '.')) || 0;
          const unit = (match[3] || '').toLowerCase();
          if (prod && qty > 0) {
            items.push({
              producto: prod,
              contenedor,
              lote,
              pallets: units.pallets.test(unit) ? qty : 0,
              cajas: units.cajas.test(unit) ? qty : 0,
              kilos: units.kilos.test(unit) ? qty : 0,
            });
            continue;
          }
        }

        // Try pattern 3: product x N
        match = productXQtyPattern.exec(line);
        if (match) {
          const prod = (match[1] || '').trim();
          const qty = Number(match[2].replace(',', '.')) || 0;
          if (prod && qty > 0) {
            items.push({
              producto: prod,
              contenedor,
              lote,
              pallets: qty,
              cajas: 0,
              kilos: 0,
            });
            continue;
          }
        }

        // Try pattern 4: "5 MANZANAS" (number followed by all-caps word)
        match = numberProductPattern.exec(line);
        if (match) {
          const qty = Number(match[1]) || 0;
          const prod = (match[2] || '').trim().replace(/[.,;]$/, '');
          // Only match if the "product" looks like a word (not a sentence)
          if (prod && prod.length > 2 && prod.length < 40 && qty > 0 && qty < 10000 && !/^\d+$/.test(prod)) {
            items.push({
              producto: prod,
              contenedor,
              lote,
              pallets: qty,
              cajas: 0,
              kilos: 0,
            });
          }
        }
      }
    }

    // If still no items found, try to extract ANY line that looks like a product (uppercase-heavy lines)
    if (items.length === 0) {
      for (const line of lines) {
        const cleaned = line.replace(/^[\-\d.\s]+/, '').replace(/[\-,\s]+$/, '').trim();
        if (cleaned.length >= 3 && cleaned.length <= 60) {
          const upperCount = (cleaned.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length;
          const alphaCount = (cleaned.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g) || []).length;
          // If mostly uppercase letters, likely a product name
          if (alphaCount > 2 && upperCount / alphaCount > 0.5) {
            // Try to extract a number from the line
            const numMatch = cleaned.match(/(\d+)/);
            items.push({
              producto: cleaned,
              contenedor,
              lote,
              pallets: numMatch ? Number(numMatch[1]) || 1 : 1,
              cajas: 0,
              kilos: 0,
            });
          }
        }
      }
    }

    // Deduplicate items by product name
    const seen = new Set<string>();
    const deduped = items.filter(item => {
      const key = item.producto.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      success: deduped.length > 0,
      items: deduped,
      cliente,
      contenedor,
      lote,
      observaciones,
      rawText: text.substring(0, 2000),
    };
  };

  interface ExtractItem {
    producto: string;
    contenedor: string;
    lote: string;
    pallets: number;
    cajas: number;
    kilos: number;
  }

  interface ExtractResult {
    success: boolean;
    items: ExtractItem[];
    cliente: string;
    contenedor: string;
    lote: string;
    observaciones: string;
    rawText: string;
    error?: string;
  }

  // ── AI JSON response parser ──
  const parseAIResponse = (content: string): ExtractResult => {
    try {
      let jsonStr = content.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonStr);
      if (parsed.error) return { success: false, error: parsed.error, items: [], cliente: '', contenedor: '', lote: '', observaciones: '', rawText: '' };
      const items = (parsed.items || []).map((item: any) => ({
        producto: String(item.producto || '').trim(),
        contenedor: String(item.contenedor || '').trim(),
        lote: String(item.lote || '').trim(),
        pallets: Number(item.pallets) || 0,
        cajas: Number(item.cajas) || 0,
        kilos: Number(item.kilos) || 0,
      })).filter((item: ExtractItem) => item.producto);
      return { success: true, items, cliente: String(parsed.cliente || '').trim(), contenedor: '', lote: '', observaciones: String(parsed.observaciones || '').trim(), rawText: '' };
    } catch {
      return { success: false, error: 'No se pudo interpretar la respuesta de la IA.', items: [], cliente: '', contenedor: '', lote: '', observaciones: '', rawText: '' };
    }
  };

  // ── Main extraction: Native regex + AI enhancement ──
  const processWithAI = useCallback(async (archivo: ArchivoAdjunto) => {
    setAiProcessing(true);
    setAiError('');
    setAiExtractedItems([]);
    setAiRawText('');
    setShowAiPanel(true);

    try {
      let result: ExtractResult;

      const { text, isTabular, rows, needsKey, quotaExceeded } = await extractTextFromFile(archivo, (msg) => {
        setAiError(msg);
      });
      setAiError('');

      if (needsKey) {
        setAiError(`Para analizar imágenes necesitás una API Key. Hacé clic en "${currentProvider.name} (opcional)" arriba. Obtené una gratis en ${currentProvider.keyLink}`);
        setShowApiKeyInput(true);
        return;
      }

      if (quotaExceeded) {
        setAiError(`Límite de uso alcanzado (${currentProvider.name}). Tu API key es correcta pero agotaste la cuota. Esperá hasta mañana o generá una nueva en ${currentProvider.keyLink}. Para PDF y Excel no necesitás API Key.`);
        return;
      }

      if (!text.trim()) {
        setAiError('No se pudo extraer texto del archivo. Probá con una captura más clara.');
        return;
      }

      // Step 2: Native extraction (regex-based, always works)
      result = extractOrderFromText(text, rows);

      if (result.success && result.items.length > 0) {
        // Step 3: If API key available, enhance with AI
        const apiKey = aiApiKeys[aiProvider];
        if (apiKey.trim()) {
          try {
            setAiError('Mejorando con IA...');
            const SYSTEM_PROMPT = `Eres un asistente de logística de centro de frío. EXTRAER datos de pedidos.
CONTEXTO: SADETIR (DYSA 10330).
REGLAS:
- El campo "contenedor" es OBLIGATORIO en cada item. Es el número de contenedor (ej: TRLU1234567).
- Si un contenedor aparece en el texto, TODOS los items del pedido van en ese contenedor.
- "producto" es el nombre del producto exactamente como aparece.
- "pallets" es la cantidad de pallets pedidos.
- "cajas" es la cantidad de cajas por pallet.
- "kilos" es el peso total en kilos.
RESPONDE SOLO JSON: {"cliente":"","items":[{"producto":"","contenedor":"","lote":"","pallets":0,"cajas":0,"kilos":0}],"observaciones":""}`;
            const aiText = await callAIText(
              `Texto extraído:\n\n${text.substring(0, 8000)}\n\nExtrae datos del pedido. IMPORTANTE: Incluí el contenedor en CADA item. Solo JSON.`,
              SYSTEM_PROMPT
            );
            if (aiText) {
              const aiResult = parseAIResponse(aiText);
              if (aiResult.success && aiResult.items.length > 0) {
                // Propagate container from regex extraction to AI items that lack it
                const globalContainer = result.contenedor || '';
                aiResult.items.forEach(item => {
                  if (!item.contenedor && globalContainer) item.contenedor = globalContainer;
                  if (!item.lote && result.lote) item.lote = result.lote;
                });
                // Use AI result if it found more items, otherwise merge
                if (aiResult.items.length >= result.items.length) {
                  result = { ...aiResult, rawText: text.substring(0, 2000) };
                } else {
                  // AI found fewer items, add container from AI to regex items
                  result.items.forEach(item => {
                    if (!item.contenedor && globalContainer) item.contenedor = globalContainer;
                  });
                }
              }
            }
          } catch (aiErr: any) {
            console.warn('AI enhancement failed, using native result:', aiErr.message);
          }
        }

        // Ensure all items have container from global extraction
        const globalCont = result.contenedor || '';
        if (globalCont) {
          result.items.forEach(item => {
            if (!item.contenedor) item.contenedor = globalCont;
          });
        }

        setAiExtractedItems(result.items);
        setAiClientName(result.cliente || '');
        setAiObservaciones(result.observaciones || '');
        setAiRawText(result.rawText || '');
        showToast(`${result.items.length} producto(s) extraído(s). Revisá y confirmá.`);
      } else if (text.trim().length > 10) {
        setAiRawText(text.substring(0, 2000));
        setAiError('No se pudieron identificar productos automáticamente. Se extrajo texto que podés ver abajo. Probá con otra captura.');
      } else {
        setAiError('No se pudo extraer información del archivo. Asegurate de que la imagen sea legible.');
      }
    } catch (err: any) {
      console.error('Error en extracción:', err);
      setAiError(`Error: ${err.message || 'Error desconocido'}`);
    } finally {
      setAiProcessing(false);
    }
  }, [aiProvider, aiApiKeys, currentProvider, showToast]);

  const confirmAiExtraction = useCallback(() => {
    if (aiExtractedItems.length === 0) return;

    const newCartItems: CartItem[] = [];
    let matchedCount = 0;
    let unmatchedItems: string[] = [];

    // Collect all containers mentioned in the extraction
    const extractedContainers = aiExtractedItems
      .map(ei => (ei.contenedor || '').toUpperCase().trim())
      .filter(Boolean);

    aiExtractedItems.forEach(ei => {
      const searchProduct = ei.producto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const searchContainer = (ei.contenedor || '').toUpperCase().trim();
      let bestMatch: any = null;

      // Strategy 1: Match by container + product (most reliable)
      const candidatesByContainer = searchContainer
        ? inventoryData.filter(inv =>
            (inv.contenedor || '').toUpperCase().trim() === searchContainer
          )
        : [];

      for (const inv of candidatesByContainer) {
        const invProduct = (inv.producto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        if (invProduct === searchProduct || invProduct.includes(searchProduct) || searchProduct.includes(invProduct)) {
          bestMatch = inv;
          break;
        }
      }

      // Strategy 2: If no container match, search by product name across all inventory
      if (!bestMatch) {
        for (const inv of inventoryData) {
          const invProduct = (inv.producto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          if (invProduct === searchProduct) {
            bestMatch = inv;
            break;
          }
          if (invProduct.includes(searchProduct) || searchProduct.includes(invProduct)) {
            bestMatch = inv;
          }
        }
      }

      if (bestMatch) {
        const existingInCart = newCartItems.find(c => c.inventoryId === bestMatch.id);
        if (existingInCart) {
          existingInCart.pallets += ei.pallets || 1;
          existingInCart.cajas += ei.cajas || 0;
          existingInCart.kilos += ei.kilos || 0;
        } else {
          newCartItems.push({
            inventoryId: bestMatch.id,
            producto: bestMatch.producto,
            contenedor: bestMatch.contenedor,
            lote: bestMatch.lote || '',
            cliente: bestMatch.cliente,
            pallets: ei.pallets || 1,
            cajas: ei.cajas || 0,
            kilos: ei.kilos || 0,
            maxPallets: Number(bestMatch.pallets) || 0,
            maxCajas: Number(bestMatch.cantidad) || 0,
            maxKilos: Number(bestMatch.kilos) || 0,
          });
        }
        matchedCount++;
      } else {
        unmatchedItems.push(ei.producto);
      }
    });

    if (newCartItems.length > 0) {
      setCart(prev => [...prev, ...newCartItems]);

      if (aiClientName) {
        const matchedClient = clientOptions.find(co =>
          co.value.toLowerCase().includes(aiClientName.toLowerCase()) ||
          aiClientName.toLowerCase().includes(co.value.toLowerCase()) ||
          (co.sub && co.sub.includes(aiClientName))
        );
        if (matchedClient) {
          setSelClient(matchedClient.value);
        }
      }

      if (newCartItems.length > 0 && newCartItems[0].contenedor) {
        setSelContainer(newCartItems[0].contenedor);
      }

      if (aiObservaciones && !observaciones) {
        setObservaciones(aiObservaciones.toUpperCase());
      }

      let msg = `${matchedCount} producto(s) cargado(s) al pedido.`;
      if (unmatchedItems.length > 0) {
        msg += ` No encontrados: ${unmatchedItems.join(', ')}`;
      }
      showToast(msg);
      setShowAiPanel(false);
      setAiExtractedItems([]);
    } else {
      showToast('No se pudo encontrar ningún producto en el inventario. Verificá que el inventario esté cargado.', 'error');
    }
  }, [aiExtractedItems, aiClientName, aiObservaciones, observaciones, inventoryData, clientOptions, showToast]);

  // ── ARCHIVO UPLOAD ───────────────────────────────

  const handleArchivoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let errorCount = 0;

    Array.from(files).forEach(file => {
      if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXT.includes(file.name.substring(file.name.lastIndexOf('.')).toLowerCase())) {
        errorCount++;
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        errorCount++;
        return;
      }

      const reader = new FileReader();
      reader.onload = (evt) => {
        const dataUrl = evt.target?.result as string;
        const archivo: ArchivoAdjunto = {
          nombre: file.name,
          tipo: file.type,
          tamanio: file.size,
          dataUrl,
        };
        setArchivosAdjuntos(prev => {
          if (prev.some(a => a.nombre === archivo.nombre)) return prev;
          const updated = [...prev, archivo];
          // AI auto-processing disabled: only works in server mode (npm run dev)
          // User can manually click the "IA" button per file if running locally
          return updated;
        });
      };
      reader.readAsDataURL(file);
    });

    if (errorCount > 0) {
      showToast(`${errorCount} archivo(s) rechazado(s). Max 4MB, formatos: PDF, JPG, PNG, Excel, CSV.`, 'error');
    }

    if (archivoInputRef.current) archivoInputRef.current.value = '';
  }, [showToast, processWithAI]);

  const removeArchivo = useCallback((nombre: string) => {
    setArchivosAdjuntos(prev => prev.filter(a => a.nombre !== nombre));
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (tipo: string) => {
    if (tipo.startsWith('image/')) return 'IMG';
    if (tipo.includes('pdf')) return 'PDF';
    if (tipo.includes('sheet') || tipo.includes('excel') || tipo.includes('csv')) return 'XLS';
    return 'FILE';
  };

  const getFileColor = (tipo: string) => {
    if (tipo.startsWith('image/')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (tipo.includes('pdf')) return 'bg-red-100 text-red-700 border-red-200';
    if (tipo.includes('sheet') || tipo.includes('excel') || tipo.includes('csv')) return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-neutral-100 text-neutral-700 border-neutral-200';
  };

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

            {/* Adjuntar archivo del pedido + IA */}
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-2">
                Subir Email de Pedido (IA Extrae los Datos Automáticamente)
              </label>
              <input
                type="file"
                ref={archivoInputRef}
                onChange={handleArchivoUpload}
                accept={ACCEPTED_EXT}
                multiple
                className="hidden"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => archivoInputRef.current?.click()}
                  disabled={aiProcessing}
                  className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  {aiProcessing ? 'Procesando...' : 'Subir PDF / Excel / JPG'}
                </button>
                <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
                  Max 4MB · Extracción 100% Gratis (OCR + IA)
                </span>
                {/* Provider selector + API Key config button */}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                    className={`px-2 py-1 text-[9px] font-mono uppercase tracking-widest border transition-colors ${currentApiKey ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-neutral-50 text-neutral-500 border-neutral-200'}`}
                  >
                    {currentApiKey ? `✓ ${currentProvider.name}` : `${currentProvider.name}`}
                  </button>
                </div>
              </div>

              {/* AI Provider & API Key configuration panel */}
              {showApiKeyInput && (
                <div className="mt-3 border border-neutral-200 bg-white p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-mono font-bold text-neutral-900 uppercase tracking-widest">
                      Proveedor de IA
                    </p>
                    <button type="button" onClick={() => setShowApiKeyInput(false)} className="text-neutral-400 hover:text-neutral-600 text-xs">✕</button>
                  </div>
                  {/* Provider tabs */}
                  <div className="flex gap-1 mb-3">
                    {(Object.keys(AI_PROVIDERS) as AIProviderKey[]).map(key => {
                      const p = AI_PROVIDERS[key];
                      const isActive = aiProvider === key;
                      const hasKey = aiApiKeys[key]?.trim();
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => saveAIProvider(key)}
                          className={`px-3 py-1.5 text-[9px] font-mono uppercase tracking-widest border transition-colors ${isActive ? 'bg-neutral-900 text-white border-neutral-900' : hasKey ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-neutral-50 text-neutral-500 border-neutral-200 hover:bg-neutral-100'}`}
                        >
                          {p.name} {hasKey ? '✓' : ''}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[9px] font-mono text-neutral-500 mb-1 leading-relaxed">
                    {currentProvider.description} — Obtené tu API Key gratis:{' '}
                    <a href={currentProvider.keyLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                      {currentProvider.keyLink.replace('https://', '')}
                    </a>
                  </p>
                  <p className="text-[9px] font-mono text-neutral-400 mb-3">
                    Se guarda solo en tu navegador. Para PDF y Excel no necesitás API Key.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={currentApiKey}
                      onChange={(e) => saveAIKey(aiProvider, e.target.value)}
                      placeholder={currentProvider.keyPrefix + '...'}
                      className="flex-1 px-3 py-1.5 text-[11px] font-mono border border-neutral-200 bg-neutral-50 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 rounded"
                    />
                    {currentApiKey && (
                      <button
                        type="button"
                        onClick={() => saveAIKey(aiProvider, '')}
                        className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-widest text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 transition-colors"
                      >
                        Borrar
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Preview de archivos adjuntos */}
              {archivosAdjuntos.length > 0 && (
                <div className="mt-3 space-y-2">
                  {archivosAdjuntos.map((archivo, idx) => (
                    <div key={`${archivo.nombre}-${idx}`} className="border border-neutral-200 bg-white p-3 flex items-center gap-3">
                      {/* Thumbnail para imagenes */}
                      {archivo.tipo.startsWith('image/') ? (
                        <div className="w-12 h-12 rounded border border-neutral-200 overflow-hidden flex-shrink-0 bg-neutral-50">
                          <img
                            src={archivo.dataUrl}
                            alt={archivo.nombre}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className={`w-12 h-12 rounded border flex items-center justify-center text-[9px] font-mono font-bold flex-shrink-0 ${getFileColor(archivo.tipo)}`}>
                          {getFileIcon(archivo.tipo)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-mono font-medium text-neutral-900 truncate">
                          {archivo.nombre}
                        </p>
                        <p className="text-[9px] font-mono text-neutral-400 uppercase">
                          {formatFileSize(archivo.tamanio)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => processWithAI(archivo)}
                        disabled={aiProcessing}
                        className="px-2 py-1 text-[9px] font-mono uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                        title={`Extraer datos (${currentProvider.name})`}
                      >
                        {currentApiKey ? 'IA' : 'IA'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeArchivo(archivo.nombre)}
                        className="text-neutral-400 hover:text-red-600 transition-colors text-sm leading-none shrink-0 p-1"
                        title="Eliminar archivo"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* AI Processing Indicator */}
              {aiProcessing && (
                <div className="mt-3 border-2 border-dashed border-blue-300 bg-blue-50 p-4 flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <div>
                    <p className="text-[11px] font-mono font-medium text-blue-900 uppercase">
                      Analizando archivo con IA...
                    </p>
                    <p className="text-[9px] font-mono text-blue-600 uppercase mt-0.5">
                      Leyendo contenido, extrayendo productos y cantidades del pedido
                    </p>
                  </div>
                </div>
              )}

              {/* AI Error */}
              {aiError && !aiProcessing && (
                <div className="mt-3 border border-red-200 bg-red-50 p-3">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
                    </svg>
                    <div>
                      <p className="text-[11px] font-mono font-medium text-red-800 uppercase">
                        Error en extracción IA
                      </p>
                      <p className="text-[10px] font-mono text-red-600 mt-0.5">
                        {aiError}
                      </p>
                    </div>
                    <button
                      onClick={() => { setAiError(''); setShowAiPanel(false); }}
                      className="text-red-400 hover:text-red-600 ml-auto flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* AI Extracted Results Panel */}
              {showAiPanel && aiExtractedItems.length > 0 && !aiProcessing && (
                <div className="mt-3 border-2 border-emerald-300 bg-emerald-50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-emerald-600 rounded flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-[11px] font-mono font-medium text-emerald-900 uppercase">
                          Datos Extraídos por IA
                        </p>
                        <p className="text-[9px] font-mono text-emerald-600 uppercase">
                          {aiExtractedItems.length} producto(s) encontrado(s) · Revisá antes de confirmar
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowAiPanel(false)}
                      className="text-emerald-400 hover:text-emerald-700"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Client name if detected */}
                  {aiClientName && (
                    <div className="mb-3 px-3 py-2 bg-white border border-emerald-200">
                      <span className="text-[9px] font-mono text-emerald-600 uppercase">Cliente detectado: </span>
                      <span className="text-[11px] font-mono font-bold text-emerald-900 uppercase">{aiClientName}</span>
                    </div>
                  )}

                  {/* Extracted items table */}
                  <div className="overflow-x-auto mb-3">
                    <div className="grid grid-cols-12 gap-1 p-2 bg-emerald-800 text-white text-[8px] font-mono uppercase tracking-widest rounded-t">
                      <div className="col-span-5">Producto</div>
                      <div className="col-span-2 text-center">Contenedor</div>
                      <div className="col-span-1 text-center">PAL</div>
                      <div className="col-span-1 text-center">CAJ</div>
                      <div className="col-span-1 text-center">KG</div>
                      <div className="col-span-2 text-center">Lote</div>
                    </div>
                    <div className="divide-y divide-emerald-200 border border-t-0 border-emerald-300 rounded-b">
                      {aiExtractedItems.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-1 p-2 bg-white text-[10px] font-mono hover:bg-emerald-50">
                          <div className="col-span-5 text-neutral-900 truncate font-medium">{item.producto}</div>
                          <div className="col-span-2 text-center text-neutral-600 font-mono">{item.contenedor || '-'}</div>
                          <div className="col-span-1 text-center text-neutral-900 font-bold">{item.pallets || 0}</div>
                          <div className="col-span-1 text-center text-neutral-600">{item.cajas || 0}</div>
                          <div className="col-span-1 text-center text-neutral-600">{item.kilos || 0}</div>
                          <div className="col-span-2 text-center text-neutral-400 font-mono">{item.lote || '-'}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Observaciones from AI */}
                  {aiObservaciones && (
                    <div className="mb-3 px-3 py-2 bg-white border border-emerald-200 text-[10px] font-mono text-neutral-600">
                      <span className="text-[9px] font-mono text-emerald-600 uppercase">Obs: </span>
                      {aiObservaciones}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={confirmAiExtraction}
                      className="flex-1 px-4 py-2.5 bg-emerald-700 text-white text-[10px] font-mono uppercase tracking-widest hover:bg-emerald-800 transition-colors font-medium"
                    >
                      Cargar al Pedido ({aiExtractedItems.length} ítem)
                    </button>
                    <button
                      onClick={() => {
                        setShowAiPanel(false);
                        setAiExtractedItems([]);
                      }}
                      className="px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest border border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
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

            {/* Reimprimir Remito (DESPACHADO only) */}
            {order.estado === 'DESPACHADO' && (
              <button
                onClick={() => printRemito(order)}
                className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest border border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-700 transition-colors"
              >
                Reimprimir Remito
              </button>
            )}

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

          {/* Archivos adjuntos */}
          {order.archivosAdjuntos && order.archivosAdjuntos.length > 0 && (
            <div className="bg-white border border-neutral-200 p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-900">
                  Archivos Adjuntos ({order.archivosAdjuntos.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {order.archivosAdjuntos.map((archivo, idx) => (
                  <a
                    key={`${archivo.nombre}-${idx}`}
                    href={archivo.dataUrl}
                    download={archivo.nombre}
                    className="border border-neutral-200 hover:border-neutral-400 p-3 flex items-center gap-3 transition-colors cursor-pointer group"
                    title={`Descargar ${archivo.nombre}`}
                  >
                    {archivo.tipo.startsWith('image/') ? (
                      <div className="w-14 h-14 rounded border border-neutral-200 overflow-hidden flex-shrink-0 bg-neutral-50">
                        <img
                          src={archivo.dataUrl}
                          alt={archivo.nombre}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className={`w-14 h-14 rounded border flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0 ${getFileColor(archivo.tipo)}`}>
                        {getFileIcon(archivo.tipo)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-mono font-medium text-neutral-900 truncate group-hover:text-blue-600 transition-colors">
                        {archivo.nombre}
                      </p>
                      <p className="text-[9px] font-mono text-neutral-400 uppercase">
                        {formatFileSize(archivo.tamanio)}
                      </p>
                      <p className="text-[9px] font-mono text-blue-500 uppercase mt-0.5 group-hover:underline">
                        Descargar
                      </p>
                    </div>
                  </a>
                ))}
              </div>
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
