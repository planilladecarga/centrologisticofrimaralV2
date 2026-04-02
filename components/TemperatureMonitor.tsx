'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw, ExternalLink, Thermometer,
  Database, Wifi, TrendingUp, TrendingDown,
  BarChart3, Printer, Monitor
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis,
  YAxis, CartesianGrid, Tooltip
} from 'recharts';

const TEMP_URL = 'http://192.168.150.31/TemperaturaWeb/temperatura.php';
const REFRESH_MS = 3 * 60 * 1000;

interface TempData {
  actual: number;
  min: number;
  max: number;
  promedio: number;
  sensor: string;
  fecha: string;
  historial: { hora: string; valor: number }[];
}

export default function TemperatureMonitor() {
  const [data, setData] = useState<TempData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(180);
  const [mode, setMode] = useState<'auto' | 'direct'>('auto');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const fetchViaProxy = useCallback(async () => {
    try {
      const res = await fetch('/api/temperatura');
      if (!res.ok) throw new Error('Proxy no disponible');
      const html = await res.text();
      return parseHtml(html);
    } catch { return null; }
  }, []);

  const fetchDirect = useCallback(async () => {
    try {
      const res = await fetch(TEMP_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      return parseHtml(html);
    } catch { return null; }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let parsed = mode === 'auto' ? await fetchViaProxy() : null;
      if (!parsed) parsed = await fetchDirect();
      if (!parsed) throw new Error('No se pudo obtener datos');
      setData(parsed);
      if (mode === 'auto') setMode('direct');
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [mode, fetchViaProxy, fetchDirect]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => { if (prev <= 1) { fetchData(); return 180; } return prev - 1; });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const openDirect = () => { window.open(TEMP_URL, '_blank'); };
  const cfmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="flex flex-col h-full bg-white border border-neutral-200">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-mono uppercase tracking-widest text-neutral-900 flex items-center gap-3">
              <Thermometer className="w-5 h-5 text-blue-600" />
              04. Monitoreo de Temperaturas
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              Datos en tiempo real del sistema de sensores
              {data && <span> · {data.sensor} · {data.fecha}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
              <div className={`flex items-center gap-1 ${data ? 'text-green-600' : error ? 'text-red-500' : 'text-neutral-400'}`}>
                <Database className="w-3 h-3" /><span>Servidor</span>
              </div>
              <div className={`flex items-center gap-1 ${data ? 'text-green-600' : error ? 'text-red-500' : 'text-neutral-400'}`}>
                <Wifi className="w-3 h-3" />
                <span>{data ? 'Online' : error ? 'Offline' : '...'}</span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-neutral-400 bg-neutral-100 px-2 py-1">{cfmt(countdown)}</span>
            <button onClick={fetchData} disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 disabled:bg-neutral-300 transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={openDirect}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-widest border border-neutral-300 hover:border-neutral-900 transition-colors">
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-neutral-50">
        {/* Loading */}
        {loading && !data && !error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 text-neutral-400 animate-spin mx-auto mb-3" />
              <p className="text-xs font-mono uppercase tracking-widest text-neutral-500">Conectando al servidor...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !data && (
          <div className="flex items-center justify-center h-full p-8">
            <div className="text-center max-w-md">
              <div className="mx-auto w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <Monitor className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-sm font-mono uppercase tracking-widest mb-2">Servidor no disponible</h3>
              <p className="text-xs text-neutral-500 mb-6">
                No se pudo conectar. Esto puede ocurrir si la página está en GitHub Pages (HTTPS) y el servidor es HTTP.
              </p>
              <div className="bg-amber-50 border border-amber-200 p-4 mb-6 text-left">
                <p className="text-xs text-amber-800 font-bold mb-1">Solución para ver temperaturas en tu web:</p>
                <p className="text-xs text-amber-700">1. Ejecuta la app localmente: <code className="bg-amber-100 px-1">npm start</code> y abre <code className="bg-amber-100 px-1">localhost:3000</code></p>
                <p className="text-xs text-amber-700 mt-1">2. O despliega en Vercel (soporta API routes proxy)</p>
              </div>
              <div className="flex justify-center gap-3">
                <button onClick={fetchData} className="px-5 py-2 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800">Reintentar</button>
                <button onClick={openDirect} className="flex items-center gap-2 px-5 py-2 border border-neutral-300 text-xs font-mono uppercase tracking-widest hover:border-neutral-900">
                  <ExternalLink className="w-4 h-4" /> Abrir Sistema Original
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Data */}
        {data && (
          <div className="p-6">
            {/* Status Banner */}
            <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center gap-3 mb-6 text-xs font-mono uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse"></span>
              <span className="font-bold">Sistema activo</span>
              <span>·</span>
              <span>Auto-refresh cada 3 minutos</span>
              <span>·</span>
              <span>Próxima en {cfmt(countdown)}</span>
              <span className="ml-auto">{data.sensor}</span>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard color="green" value={data.actual} label="Temperatura Actual" icon={<Thermometer className="w-6 h-6" />} />
              <StatCard color="blue" value={data.min} label="Temperatura Mínima" icon={<TrendingDown className="w-6 h-6" />} />
              <StatCard color="red" value={data.max} label="Temperatura Máxima" icon={<TrendingUp className="w-6 h-6" />} />
              <StatCard color="purple" value={data.promedio} label="Temperatura Promedio" icon={<BarChart3 className="w-6 h-6" />} />
            </div>

            {/* Chart */}
            <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
              <div className="bg-neutral-800 text-white px-4 py-3 flex items-center justify-between">
                <h3 className="text-sm font-mono uppercase tracking-widest">
                  Variación de Temperatura — {data.fecha}
                </h3>
                <div className="flex gap-2">
                  <button onClick={openDirect} className="flex items-center gap-1 px-3 py-1 text-[10px] font-mono uppercase tracking-widest bg-blue-500 hover:bg-blue-600 transition-colors">
                    <Printer className="w-3 h-3" /> Imprimir
                  </button>
                  <button onClick={openDirect} className="flex items-center gap-1 px-3 py-1 text-[10px] font-mono uppercase tracking-widest bg-blue-500 hover:bg-blue-600 transition-colors">
                    <BarChart3 className="w-3 h-3" /> 30 Días
                  </button>
                </div>
              </div>
              <div className="p-4" style={{ height: 280 }}>
                {data.historial.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.historial}>
                      <defs>
                        <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                      <XAxis dataKey="hora" tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="#a3a3a3" />
                      <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="#a3a3a3" />
                      <Tooltip contentStyle={{ fontFamily: 'monospace', fontSize: 12 }} formatter={(v: any) => [`${Number(v).toFixed(2)} °C`, 'Temp']} />
                      <Area type="monotone" dataKey="valor" stroke="#ef4444" strokeWidth={2} fill="url(#tg)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs font-mono text-neutral-400">
                    Datos de gráfica no disponibles
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ color, value, label, icon }: { color: string; value: number; label: string; icon: React.ReactNode }) {
  const border: Record<string, string> = { green: 'border-green-500', blue: 'border-blue-500', red: 'border-red-500', purple: 'border-purple-500' };
  const txt: Record<string, string> = { green: 'text-green-600', blue: 'text-blue-600', red: 'text-red-600', purple: 'text-purple-600' };
  const bg: Record<string, string> = { green: 'bg-green-100', blue: 'bg-blue-100', red: 'bg-red-100', purple: 'bg-purple-100' };
  return (
    <div className={`bg-white border-l-4 ${border[color]} p-5 shadow-sm flex flex-col items-center text-center`}>
      <div className={`p-3 rounded-full mb-3 ${bg[color]} ${txt[color]}`}>{icon}</div>
      <p className={`text-3xl font-bold ${txt[color]}`}>{value.toFixed(2)} °C</p>
      <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mt-2">{label}</p>
    </div>
  );
}

function parseHtml(html: string): TempData | null {
  const text = html.replace(/<[^>]*>/g, ' ');
  const temps: number[] = [];
  const re = /(-?\d+[\.,]\d{2})\s*°?\s*C/gi;
  let m;
  while ((m = re.exec(text)) !== null) temps.push(parseFloat(m[1].replace(',', '.')));
  if (temps.length === 0) return null;

  const findNear = (kw: string) => {
    const idx = text.toLowerCase().indexOf(kw);
    if (idx === -1) return temps[0];
    const after = text.substring(idx);
    const match = after.match(/(-?\d+[\.,]\d{2})\s*°?\s*C/i);
    return match ? parseFloat(match[1].replace(',', '.')) : temps[0];
  };

  const actual = findNear('actual');
  const promedio = findNear('promed') || findNear('prom');
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const sensorMatch = text.match(/sensor\s*\d+/i);
  const sensor = sensorMatch ? sensorMatch[0].toUpperCase() : 'SENSOR1';
  const fechaMatch = text.match(/(\d{1,2})\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{2,4})/);
  const fecha = fechaMatch ? `${fechaMatch[1].padStart(2, '0')}/${fechaMatch[2].padStart(2, '0')}/${fechaMatch[3].padStart(4, '0')}` : new Date().toLocaleDateString('es-ES');

  // Extract chart data arrays from JS
  let historial: { hora: string; valor: number }[] = [];
  const arrMatch = html.match(/\[(?:-?\d+[\.,]\d+(?:,\s*)?)+\]/g);
  if (arrMatch) {
    let longest = '';
    for (const a of arrMatch) if (a.length > longest.length) longest = a;
    const vals = longest.match(/-?\d+[\.,]\d+/g);
    if (vals && vals.length > 2) {
      const interval = (24 * 60) / vals.length;
      vals.forEach((v, i) => {
        const mins = Math.floor(i * interval);
        historial.push({ hora: `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`, valor: parseFloat(v.replace(',', '.')) });
      });
    }
  }

  return { actual, min, max, promedio: promedio || (temps.reduce((a, b) => a + b, 0) / temps.length), sensor, fecha, historial };
}
