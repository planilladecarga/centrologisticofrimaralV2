'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Thermometer,
  TrendingUp, TrendingDown,
  BarChart3, Monitor, ExternalLink, AlertTriangle,
  CalendarDays, Microchip
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis,
  YAxis, CartesianGrid, Tooltip
} from 'recharts';

const REFRESH_MS = 3 * 60 * 1000;
const REFRESH_SECONDS = REFRESH_MS / 1000;
const DIRECT_URL = 'http://192.168.150.31/TemperaturaWeb/temperatura.php';

interface TempRecord {
  sensor: string;
  fecha: string;
  hora: string;
  temperatura: string;
  valorreal?: string;
}

interface Stats {
  min_temp: number;
  max_temp: number;
  avg_temp: number;
}

interface TempData {
  stats?: Stats;
  temperatures: TempRecord[];
  graph_labels: string[];
  graph_data: number[];
  error?: string;
}

type ViewStatus = 'loading' | 'ok' | 'error' | 'not_available';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr: string) {
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function tempColor(t: number) {
  if (t < -24) return 'text-blue-600';
  if (t > -18) return 'text-red-600';
  return 'text-green-600';
}

export default function TemperatureMonitor() {
  const [sensors, setSensors] = useState<string[]>([]);
  const [selectedSensor, setSelectedSensor] = useState('');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [data, setData] = useState<TempData | null>(null);
  const [status, setStatus] = useState<ViewStatus>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);

  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');

  // Obtener sensores
  const fetchSensors = useCallback(async () => {
    try {
      const res = await fetch('/api/temperatura/sensors', { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      if (json.sensors && json.sensors.length > 0) {
        setSensors(json.sensors);
        setSelectedSensor(json.sensors[0]);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  // Obtener datos de temperatura
  const fetchData = useCallback(async () => {
    if (!selectedSensor) return;
    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/temperatura/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sensor: selectedSensor,
          start_date: startDate,
          end_date: endDate,
        }),
        cache: 'no-store',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Server responded with ${res.status}`);
      }

      const json: TempData = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }

      setData(json);
      setStatus('ok');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setErrorMsg(msg);
      setStatus('error');
    } finally {
      setCountdown(REFRESH_SECONDS);
    }
  }, [selectedSensor, startDate, endDate]);

  // Carga inicial
  useEffect(() => {
    if (isGitHubPages) {
      setStatus('not_available');
      return;
    }
    fetchSensors().then((hasSensors) => {
      if (!hasSensors) {
        setStatus('error');
        setErrorMsg('No se pudo obtener la lista de sensores del servidor.');
      }
    });
  }, [fetchSensors, isGitHubPages]);

  // Cargar datos cuando cambia el sensor seleccionado
  useEffect(() => {
    if (!selectedSensor || isGitHubPages) return;
    fetchData();
  }, [selectedSensor, fetchData, isGitHubPages]);

  // Auto-refresh cada 3 minutos
  useEffect(() => {
    if (status !== 'ok' && status !== 'loading') return;
    if (isGitHubPages) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchData();
          return REFRESH_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchData, status, isGitHubPages]);

  const cfmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── Pantalla: GitHub Pages / no disponible ──
  if (status === 'not_available' || isGitHubPages) {
    return (
      <div className="flex flex-col h-full bg-white border border-neutral-200">
        <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex-shrink-0">
          <h2 className="text-lg font-mono uppercase tracking-widest text-neutral-900 flex items-center gap-3">
            <Thermometer className="w-5 h-5 text-blue-600" />
            04. Monitoreo de Temperaturas
          </h2>
          <p className="text-xs text-neutral-500 mt-1">Sistema de sensores de temperatura</p>
        </div>
        <div className="flex-1 flex items-center justify-center bg-neutral-50 p-8">
          <div className="text-center max-w-lg">
            <div className="mx-auto w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center mb-5">
              <AlertTriangle className="w-10 h-10 text-amber-500" />
            </div>
            <h3 className="text-base font-mono uppercase tracking-widest mb-3 text-neutral-900">
              Temperaturas no disponibles en este modo
            </h3>
            <p className="text-sm text-neutral-500 mb-2">
              Los datos provienen del servidor interno (192.168.150.31) y solo pueden accederse
              cuando la aplicacion se ejecuta <strong>localmente en la red interna</strong>.
            </p>
            <p className="text-xs text-neutral-400 mb-6">
              GitHub Pages no tiene acceso a la red interna del centro logistico.
            </p>
            <div className="bg-neutral-900 text-green-400 rounded-lg p-4 text-left font-mono text-xs mb-6 overflow-x-auto">
              <p className="text-neutral-500 mb-2"># Para ver temperaturas, ejecute localmente:</p>
              <p className="text-green-300">cd centrologisticofrimaralV2</p>
              <p className="text-green-300">npm install</p>
              <p className="text-green-300">npm run dev</p>
              <p className="text-neutral-500 mt-2"># Luego abra en el navegador:</p>
              <p className="text-green-300">http://localhost:3000</p>
            </div>
            <button onClick={() => window.open(DIRECT_URL, '_blank')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-xs font-mono uppercase tracking-widest hover:bg-blue-700 transition-colors rounded">
              <ExternalLink className="w-4 h-4" />
              Abrir servidor de temperaturas directamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Preparar datos del grafico
  const chartData = data?.graph_labels?.map((label, i) => ({
    hora: label,
    valor: data.graph_data[i],
  })) || [];

  // Temperatura actual (primer registro)
  const currentTemp = data?.temperatures?.[0]
    ? parseFloat(data.temperatures[0].temperatura)
    : null;

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
              Sistema de sensores · {selectedSensor || '--'}
              {data?.temperatures?.[0] && (
                <span> · Ultima lectura: {formatDate(data.temperatures[0].fecha)} {data.temperatures[0].hora.slice(0, 8)}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {status === 'ok' && (
              <span className="text-[10px] font-mono text-neutral-400 bg-neutral-100 px-2 py-1">
                Proxima: {cfmt(countdown)}
              </span>
            )}
            <button onClick={() => fetchData()}
              disabled={status === 'loading'}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 disabled:bg-neutral-300 transition-colors">
              <RefreshCw className={`w-4 h-4 ${status === 'loading' ? 'animate-spin' : ''}`} />
              {status === 'loading' ? 'Consultando...' : 'Actualizar'}
            </button>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="px-4 py-3 bg-white border-b border-neutral-100 flex-shrink-0">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1">
              <Microchip className="w-3 h-3 inline mr-1" />Sensor
            </label>
            <select value={selectedSensor} onChange={e => setSelectedSensor(e.target.value)}
              className="w-full border border-neutral-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {sensors.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="min-w-[140px]">
            <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1">
              <CalendarDays className="w-3 h-3 inline mr-1" />Desde
            </label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full border border-neutral-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1">
              <CalendarDays className="w-3 h-3 inline mr-1" />Hasta
            </label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full border border-neutral-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-auto bg-neutral-50">

        {/* Cargando */}
        {status === 'loading' && !data && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
              <p className="text-xs font-mono uppercase tracking-widest text-neutral-500">Consultando sensores...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && !data && (
          <div className="flex items-center justify-center h-full p-8">
            <div className="text-center max-w-md">
              <div className="mx-auto w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <Monitor className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-sm font-mono uppercase tracking-widest mb-2">Servicio no disponible</h3>
              <p className="text-xs text-neutral-500 mb-1">{errorMsg}</p>
              <p className="text-[11px] text-neutral-400 mb-6">
                Verifique que este conectado a la red interna y que el servidor 192.168.150.31 este encendido.
              </p>
              <div className="flex justify-center gap-3">
                <button onClick={() => fetchData()}
                  className="px-5 py-2 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800">
                  Reintentar
                </button>
                <button onClick={() => window.open(DIRECT_URL, '_blank')}
                  className="px-5 py-2 bg-blue-600 text-white text-xs font-mono uppercase tracking-widest hover:bg-blue-700">
                  Abrir directamente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Datos */}
        {data && (
          <div className="p-4">
            {/* Banner de estado */}
            <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center gap-3 mb-4 text-xs font-mono uppercase tracking-widest rounded">
              <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse"></span>
              <span className="font-bold">Sistema activo</span>
              <span className="opacity-70">·</span>
              <span>Auto-refresh cada 3 minutos</span>
              <span className="opacity-70">·</span>
              <span>Proxima en {cfmt(countdown)}</span>
              <span className="ml-auto opacity-70">{selectedSensor}</span>
            </div>

            {/* Tarjetas de estadisticas */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <StatCard color="green" value={currentTemp ?? 0} label="Temperatura Actual"
                icon={<Thermometer className="w-6 h-6" />} />
              <StatCard color="blue" value={parseFloat(String(data.stats?.min_temp ?? 0))} label="Temperatura Minima"
                icon={<TrendingDown className="w-6 h-6" />} />
              <StatCard color="red" value={parseFloat(String(data.stats?.max_temp ?? 0))} label="Temperatura Maxima"
                icon={<TrendingUp className="w-6 h-6" />} />
              <StatCard color="purple" value={parseFloat(String(data.stats?.avg_temp ?? 0))} label="Temperatura Promedio"
                icon={<BarChart3 className="w-6 h-6" />} />
            </div>

            {/* Grafica */}
            <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden mb-4">
              <div className="bg-neutral-800 text-white px-4 py-3 flex items-center justify-between">
                <h3 className="text-sm font-mono uppercase tracking-widest">
                  Variacion de Temperatura — {selectedSensor}
                </h3>
                <button onClick={() => window.open(DIRECT_URL, '_blank')}
                  className="text-xs text-blue-300 hover:text-blue-100 font-mono uppercase tracking-widest flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Ver en servidor
                </button>
              </div>
              <div className="p-4" style={{ height: 280 }}>
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                      <XAxis dataKey="hora" tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="#a3a3a3" />
                      <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="#a3a3a3" />
                      <Tooltip contentStyle={{ fontFamily: 'monospace', fontSize: 12 }}
                        formatter={(v) => [`${Number(v).toFixed(2)} °C`, 'Temperatura']} />
                      <Line type="monotone" dataKey="valor" stroke="#e74c3c" strokeWidth={2.5}
                        dot={{ r: 4, fill: '#fff', strokeWidth: 2, stroke: '#e74c3c' }}
                        activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs font-mono text-neutral-400">
                    Datos de grafica no disponibles
                  </div>
                )}
              </div>
            </div>

            {/* Tabla de registros */}
            <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
              <div className="bg-neutral-800 text-white px-4 py-3 flex items-center justify-between">
                <h3 className="text-sm font-mono uppercase tracking-widest">
                  Registros de Temperatura
                </h3>
                <span className="text-xs text-neutral-400 font-mono">
                  {data.temperatures.length} registros
                </span>
              </div>
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-700 text-white sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest">Sensor</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest">Fecha</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest">Hora</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest">Temperatura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.temperatures.map((temp, i) => {
                      const t = parseFloat(temp.temperatura);
                      return (
                        <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                          <td className="px-4 py-2 font-mono text-xs text-neutral-600">{temp.sensor}</td>
                          <td className="px-4 py-2 font-mono text-xs text-neutral-600">{formatDate(temp.fecha)}</td>
                          <td className="px-4 py-2 font-mono text-xs text-neutral-600">{temp.hora.slice(0, 8)}</td>
                          <td className={`px-4 py-2 font-mono text-xs font-bold text-right ${tempColor(t)}`}>
                            {t.toFixed(2)} °C
                          </td>
                        </tr>
                      );
                    })}
                    {data.temperatures.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-xs text-neutral-400 font-mono">
                          No hay registros para el rango seleccionado
                        </td>
                      </tr>
                    )}
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

function StatCard({ color, value, label, icon }: { color: string; value: number; label: string; icon: React.ReactNode }) {
  const border: Record<string, string> = { green: 'border-green-500', blue: 'border-blue-500', red: 'border-red-500', purple: 'border-purple-500' };
  const txt: Record<string, string> = { green: 'text-green-600', blue: 'text-blue-600', red: 'text-red-600', purple: 'text-purple-600' };
  const bg: Record<string, string> = { green: 'bg-green-100', blue: 'bg-blue-100', red: 'bg-red-100', purple: 'bg-purple-100' };

  return (
    <div className={`bg-white border-l-4 ${border[color]} p-4 shadow-sm flex flex-col items-center text-center`}>
      <div className={`p-2.5 rounded-full mb-2 ${bg[color]} ${txt[color]}`}>{icon}</div>
      <p className={`text-2xl font-bold ${txt[color]}`}>{value.toFixed(2)} °C</p>
      <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mt-1">{label}</p>
    </div>
  );
}
