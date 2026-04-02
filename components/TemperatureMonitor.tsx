'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw, ExternalLink, AlertTriangle, Thermometer,
  Database, Wifi, TrendingUp, TrendingDown, Minus,
  BarChart3, Printer
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Area, AreaChart
} from 'recharts';

const REFRESH_MS = 3 * 60 * 1000;

interface TempData {
  actual: number;
  min: number;
  max: number;
  promedio: number;
  sensor: string;
  fecha: string;
  historial: { hora: string; valor: number }[];
  rawHtml: string;
}

export default function TemperatureMonitor() {
  const [data, setData] = useState<TempData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(180);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/temperatura');
      if (!res.ok) throw new Error('Servidor no disponible');
      const html = await res.text();
      const parsed = parseTemperatureHtml(html);
      if (parsed) {
        setData({ ...parsed, rawHtml: html });
      } else {
        // Fallback: intentar extraer con regex más flexible
        const fallback = parseFallback(html);
        setData({ ...fallback, rawHtml: html });
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { fetchData(); return 180; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ===== RENDER =====
  if (loading && !data) {
    return (
      <div className="flex flex-col h-full bg-white border border-neutral-200 items-center justify-center">
        <RefreshCw className="w-8 h-8 text-neutral-400 animate-spin mb-3" />
        <p className="text-xs font-mono uppercase tracking-widest text-neutral-500">Conectando al servidor de temperaturas...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col h-full bg-white border border-neutral-200">
        <TempHeader countdown={countdown} loading={loading} onRefresh={fetchData} online={false} />
        <div className="flex-1 flex items-center justify-center p-12">
          <div className="text-center max-w-md">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-sm font-mono uppercase tracking-widest mb-2">Servidor no disponible</h3>
            <p className="text-xs text-neutral-500 mb-6">{error}. Verifica que estés en la red interna del centro logístico.</p>
            <div className="flex justify-center gap-3">
              <button onClick={fetchData} className="px-5 py-2 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800">Reintentar</button>
              <a href="http://192.168.150.31/TemperaturaWeb/temperatura.php" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2 border border-neutral-300 text-xs font-mono uppercase tracking-widest hover:border-neutral-900">
                <ExternalLink className="w-4 h-4" /> Abrir Original
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col h-full bg-white border border-neutral-200">
      {/* Header */}
      <TempHeader countdown={countdown} loading={loading} onRefresh={fetchData} online={!error} />

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6 bg-neutral-50">
        {/* Status Banner */}
        <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center gap-3 mb-6 text-xs font-mono uppercase tracking-widest">
          <span className="inline-block w-2 h-2 rounded-full bg-green-300 animate-pulse"></span>
          <span className="font-bold">Sistema activo</span>
          <span>·</span>
          <span>Actualización automática cada 3 minutos</span>
          <span>·</span>
          <span>Próxima en {fmt(countdown)}</span>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            color="green"
            value={data.actual}
            label="Temperatura Actual"
            icon={<Thermometer className="w-6 h-6" />}
          />
          <StatCard
            color="blue"
            value={data.min}
            label="Temperatura Mínima"
            icon={<TrendingDown className="w-6 h-6" />}
          />
          <StatCard
            color="red"
            value={data.max}
            label="Temperatura Máxima"
            icon={<TrendingUp className="w-6 h-6" />}
          />
          <StatCard
            color="purple"
            value={data.promedio}
            label="Temperatura Promedio"
            icon={<BarChart3 className="w-6 h-6" />}
          />
        </div>

        {/* Chart */}
        <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
          <div className="bg-neutral-800 text-white px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-mono uppercase tracking-widest">
              Variación de Temperatura — {data.fecha}
            </h3>
            <div className="flex gap-2">
              <a href="http://192.168.150.31/TemperaturaWeb/temperatura.php" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1 text-[10px] font-mono uppercase tracking-widest bg-blue-500 hover:bg-blue-600 transition-colors">
                <Printer className="w-3 h-3" /> Imprimir
              </a>
              <a href="http://192.168.150.31/TemperaturaWeb/temperatura.php" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1 text-[10px] font-mono uppercase tracking-widest bg-blue-500 hover:bg-blue-600 transition-colors">
                <BarChart3 className="w-3 h-3" /> Gráfica 30 Días
              </a>
            </div>
          </div>
          <div className="p-4" style={{ height: 300 }}>
            {data.historial.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.historial}>
                  <defs>
                    <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="hora" tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="#a3a3a3" />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="#a3a3a3" />
                  <Tooltip
                    contentStyle={{ fontFamily: 'monospace', fontSize: 12, border: '1px solid #e5e5e5' }}
                    formatter={(value: any) => [`${Number(value).toFixed(2)} °C`, 'Temperatura']}
                  />
                  <Area type="monotone" dataKey="valor" stroke="#ef4444" strokeWidth={2} fill="url(#tempGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs font-mono text-neutral-400 uppercase tracking-widest">
                Datos insuficientes para mostrar gráfica
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== SUB COMPONENTS =====

function TempHeader({ countdown, loading, onRefresh, online }: {
  countdown: number; loading: boolean; onRefresh: () => void; online: boolean;
}) {
  return (
    <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex-shrink-0">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-mono uppercase tracking-widest text-neutral-900 flex items-center gap-3">
            <Thermometer className="w-5 h-5 text-blue-600" />
            04. Monitoreo de Temperaturas
          </h2>
          <p className="text-xs text-neutral-500 mt-1">Datos en tiempo real del sistema de sensores</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
            <div className={`flex items-center gap-1 ${online ? 'text-green-600' : 'text-red-500'}`}>
              <Database className="w-3 h-3" /> <span>Servidor</span>
            </div>
            <div className={`flex items-center gap-1 ${online ? 'text-green-600' : 'text-red-500'}`}>
              <Wifi className="w-3 h-3" /> <span>{online ? 'Online' : 'Offline'}</span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-neutral-400 bg-neutral-100 px-2 py-1">{`${Math.floor(countdown/60)}:${String(countdown%60).padStart(2,'0')}`}</span>
          <button onClick={onRefresh} disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 disabled:bg-neutral-300 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <a href="http://192.168.150.31/TemperaturaWeb/temperatura.php" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-widest border border-neutral-300 hover:border-neutral-900 transition-colors">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

function StatCard({ color, value, label, icon }: {
  color: string; value: number; label: string; icon: React.ReactNode;
}) {
  const colors: Record<string, string> = {
    green: 'border-green-500 text-green-600 bg-green-50',
    blue: 'border-blue-500 text-blue-600 bg-blue-50',
    red: 'border-red-500 text-red-600 bg-red-50',
    purple: 'border-purple-500 text-purple-600 bg-purple-50',
  };
  const valueColors: Record<string, string> = { green: 'text-green-600', blue: 'text-blue-600', red: 'text-red-600', purple: 'text-purple-600' };

  return (
    <div className={`bg-white border-l-4 ${colors[color]} p-5 shadow-sm flex flex-col items-center text-center`}>
      <div className={`p-3 rounded-full mb-3 ${colors[color]} ${color === 'green' ? 'bg-green-100' : color === 'blue' ? 'bg-blue-100' : color === 'red' ? 'bg-red-100' : 'bg-purple-100'}`}>
        {icon}
      </div>
      <p className={`text-3xl font-bold ${valueColors[color]}`}>{value.toFixed(2)} °C</p>
      <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mt-2">{label}</p>
    </div>
  );
}

// ===== HTML PARSER =====

function parseTemperatureHtml(html: string): Omit<TempData, 'rawHtml'> | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Buscar temperaturas en el HTML por texto y patrones comunes
  const bodyText = doc.body?.textContent || '';
  const tempRegex = /(-?\d+[\.,]\d{2})\s*°?\s*C/g;
  const temps: number[] = [];
  let match;
  while ((match = tempRegex.exec(bodyText)) !== null) {
    temps.push(parseFloat(match[1].replace(',', '.')));
  }

  if (temps.length === 0) return null;

  // Intentar buscar labels específicos
  const allText = bodyText.toLowerCase();

  let actual = 0, min = Infinity, max = -Infinity, promedio = 0;

  // Buscar por labels comunes en español
  const findNearTemp = (keyword: string): number => {
    const idx = allText.indexOf(keyword);
    if (idx === -1) return temps[0];
    const after = bodyText.substring(idx);
    const m = after.match(/(-?\d+[\.,]\d{2})\s*°?\s*C/);
    return m ? parseFloat(m[1].replace(',', '.')) : temps[0];
  };

  actual = findNearTemp('actual');
  promedio = findNearTemp('promedio') || findNearTemp('prom');

  for (const t of temps) {
    if (t < min) min = t;
    if (t > max) max = t;
  }
  if (min === Infinity) min = temps[0];
  if (max === -Infinity) max = temps[0];

  // Buscar sensor
  const sensorMatch = bodyText.match(/sensor\s*\d+/i);
  const sensor = sensorMatch ? sensorMatch[0].toUpperCase() : 'SENSOR1';

  // Buscar fecha
  const fechaMatch = bodyText.match(/(\d{1,2})\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{2,4})/);
  const fecha = fechaMatch ? `${fechaMatch[1].padStart(2, '0')}/${fechaMatch[2].padStart(2, '0')}/${fechaMatch[3].padStart(4, '0')}` : new Date().toLocaleDateString('es-ES');

  // Buscar datos de gráfica (normalmente en canvas o scripts con arrays de datos)
  const historial = extractChartData(doc, html);

  return { actual, min, max, promedio: promedio || (temps.reduce((a, b) => a + b, 0) / temps.length), sensor, fecha, historial };
}

function extractChartData(doc: Document, html: string): { hora: string; valor: number }[] {
  // Buscar datos numéricos en scripts que parezcan series de tiempo
  const results: { hora: string; valor: number }[] = [];

  // Buscar en canvas data o arrays JavaScript
  const dataMatch = html.match(/\[(?:-?\d+[\.,]\d+(?:,\s*)?)+\]/g);
  if (dataMatch) {
    // Buscar el array más largo (probablemente es la serie de temperatura)
    let longest = '';
    for (const m of dataMatch) {
      if (m.length > longest.length) longest = m;
    }
    const values = longest.match(/-?\d+[\.,]\d+/g);
    if (values && values.length > 2) {
      // Generar horas desde las 00:00 hasta las 23:59
      const now = new Date();
      const startHour = 0;
      const interval = (24 * 60) / values.length;
      values.forEach((v, i) => {
        const minutes = Math.floor(startHour * 60 + i * interval);
        const h = Math.floor(minutes / 60) % 24;
        const m = minutes % 60;
        results.push({
          hora: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
          valor: parseFloat(v.replace(',', '.'))
        });
      });
    }
  }

  return results;
}

function parseFallback(html: string): Omit<TempData, 'rawHtml'> {
  const bodyText = html.replace(/<[^>]*>/g, ' ');
  const tempRegex = /(-?\d+[\.,]\d{2})\s*°?\s*C/g;
  const temps: number[] = [];
  let match;
  while ((match = tempRegex.exec(bodyText)) !== null) {
    temps.push(parseFloat(match[1].replace(',', '.')));
  }

  const actual = temps[0] || 0;
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const promedio = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;

  return {
    actual, min, max, promedio,
    sensor: 'SENSOR1',
    fecha: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    historial: temps.map((t, i) => ({
      hora: `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
      valor: t
    }))
  };
}
