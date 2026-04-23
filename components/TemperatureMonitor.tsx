'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw, Thermometer,
  TrendingUp, TrendingDown,
  BarChart3, Monitor, ExternalLink, AlertTriangle,
  CalendarDays, Microchip, Info
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis,
  YAxis, CartesianGrid, Tooltip, ReferenceLine
} from 'recharts';

const REFRESH_MS = 3 * 60 * 1000;
const REFRESH_SECONDS = REFRESH_MS / 1000;
const DIRECT_URL = 'http://192.168.150.31/TemperaturaWeb/temperatura.php';
const SENSOR_URL = 'http://192.168.150.31/TemperaturaWeb/sensores.php';

const DEMO_SENSORS = [
  'Camara Frigorifica 1 - Congelados',
  'Camara Frigorifica 2 - Refrigerados',
  'Camara Frigorifica 3 - Lacteos',
  'Camara Frigorifica 4 - Carnes',
];

const BASE_TEMP: Record<string, number> = {
  'Camara Frigorifica 1 - Congelados': -20.5,
  'Camara Frigorifica 2 - Refrigerados': 2.0,
  'Camara Frigorifica 3 - Lacteos': 4.0,
  'Camara Frigorifica 4 - Carnes': -1.5,
};

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

type ViewStatus = 'loading' | 'ok' | 'error' | 'demo';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr: string) {
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function tempColor(t: number): string {
  if (t < -24) return 'text-blue-600';
  if (t > -18) return 'text-red-600';
  return 'text-green-600';
}

function tempStatus(t: number): { label: string; color: string } {
  if (t < -24) return { label: 'Frio', color: 'bg-blue-100 text-blue-700 border-blue-300' };
  if (t > -18) return { label: 'Calor', color: 'bg-red-100 text-red-700 border-red-300' };
  return { label: 'Normal', color: 'bg-green-100 text-green-700 border-green-300' };
}

function statColor(value: number): string {
  if (value < -24) return 'blue';
  if (value > -18) return 'red';
  return 'green';
}

// Generador de datos demo realistas
function generateDemoData(sensor: string): TempData {
  const base = BASE_TEMP[sensor] ?? -20.5;
  const now = new Date();
  const temperatures: TempRecord[] = [];
  const graphLabels: string[] = [];
  const graphData: number[] = [];

  // 48 lecturas cada 30 minutos (24 horas hacia atras)
  const totalReadings = 48;
  const intervalMs = 30 * 60 * 1000;

  for (let i = totalReadings - 1; i >= 0; i--) {
    const readingTime = new Date(now.getTime() - i * intervalMs);

    // Variacion sinusoidal para simular ciclo de compresor (periodo ~6 horas)
    const hoursFromStart = i * 0.5;
    const sinusoidal = Math.sin((hoursFromStart / 6) * Math.PI * 2) * 1.8;

    // Ruido aleatorio realista
    const noise = (Math.random() - 0.5) * 1.2;

    // Variacion gradual por puerta abierta (simulamos 1-2 picos por dia)
    let doorEffect = 0;
    if (i === 8 || i === 7 || i === 32 || i === 31) {
      doorEffect = Math.random() * 4 + 2; // Pico de calentamiento
    } else if (i === 9 || i === 33) {
      doorEffect = Math.random() * 1.5; // Recuperacion parcial
    }

    const temp = base + sinusoidal + noise + doorEffect;
    const roundedTemp = Math.round(temp * 100) / 100;

    const fecha = readingTime.toISOString().slice(0, 10);
    const hora = readingTime.toTimeString().slice(0, 8);
    const horaLabel = readingTime.toTimeString().slice(0, 5);

    temperatures.push({
      sensor,
      fecha,
      hora,
      temperatura: roundedTemp.toFixed(2),
    });

    graphLabels.push(horaLabel);
    graphData.push(roundedTemp);
  }

  // Calcular estadisticas
  const temps = graphData;
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;

  return {
    stats: {
      min_temp: Math.round(minTemp * 100) / 100,
      max_temp: Math.round(maxTemp * 100) / 100,
      avg_temp: Math.round(avgTemp * 100) / 100,
    },
    temperatures,
    graph_labels: graphLabels,
    graph_data: graphData,
  };
}

export default function TemperatureMonitor() {
  const [sensors, setSensors] = useState<string[]>(DEMO_SENSORS);
  const [selectedSensor, setSelectedSensor] = useState(DEMO_SENSORS[0]);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [data, setData] = useState<TempData | null>(null);
  const [status, setStatus] = useState<ViewStatus>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [isDemo, setIsDemo] = useState(false);

  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');

  // Obtener sensores — intenta: 1) fetch directo al PHP, 2) API local, 3) demo
  const fetchSensors = useCallback(async () => {
    // Strategy 1: Try direct PHP endpoint (works from internal network)
    try {
      const res = await fetch(SENSOR_URL, { 
        method: 'POST',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.sensors && json.sensors.length > 0) {
          setSensors(json.sensors);
          setSelectedSensor(json.sensors[0]);
          setIsDemo(false);
          return true;
        }
      }
    } catch {
      // CORS blocked or network unreachable — try next strategy
    }

    // Strategy 2: Try local API route (npm run dev mode)
    if (!isGitHubPages) {
      try {
        const res = await fetch('/api/temperatura/sensors', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json.sensors && json.sensors.length > 0) {
            setSensors(json.sensors);
            setSelectedSensor(json.sensors[0]);
            setIsDemo(false);
            return true;
          }
        }
      } catch {
        // API not available
      }
    }

    // Strategy 3: Demo mode
    setIsDemo(true);
    setSensors(DEMO_SENSORS);
    setSelectedSensor(DEMO_SENSORS[0]);
    return false;
  }, [isGitHubPages]);

  // Obtener datos de temperatura — intenta: 1) fetch directo al PHP, 2) API local, 3) demo
  const fetchData = useCallback(async () => {
    if (!selectedSensor) return;
    setStatus('loading');
    setErrorMsg('');

    // Strategy 1: Try direct PHP endpoint
    try {
      const bodyParams = new URLSearchParams();
      bodyParams.append('sensor', selectedSensor);
      bodyParams.append('start_date', startDate);
      bodyParams.append('end_date', endDate);

      const res = await fetch(DIRECT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString(),
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const json: TempData = await res.json();
        if (json.temperatures && json.temperatures.length > 0 && !json.error) {
          setData(json);
          setStatus('ok');
          setIsDemo(false);
          setCountdown(REFRESH_SECONDS);
          return;
        }
      }
    } catch {
      // CORS blocked or network unreachable
    }

    // Strategy 2: Try local API route
    if (!isGitHubPages) {
      try {
        const bodyParams = new URLSearchParams();
        bodyParams.append('sensor', selectedSensor);
        bodyParams.append('start_date', startDate);
        bodyParams.append('end_date', endDate);

        const res = await fetch('/api/temperatura/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: bodyParams.toString(),
          cache: 'no-store',
        });

        if (res.ok) {
          const json: TempData = await res.json();
          if (!json.error) {
            setData(json);
            setStatus('ok');
            setIsDemo(false);
            setCountdown(REFRESH_SECONDS);
            return;
          }
        }
      } catch {
        // API not available
      }
    }

    // Strategy 3: Demo data
    const demoData = generateDemoData(selectedSensor);
    setData(demoData);
    setStatus('demo');
    setIsDemo(true);
    setCountdown(REFRESH_SECONDS);
  }, [selectedSensor, startDate, endDate, isGitHubPages]);

  // Carga inicial
  useEffect(() => {
    fetchSensors().then((hasSensors) => {
      if (!hasSensors && !isGitHubPages) {
        // Servidor no disponible -> modo demo automatico
        setIsDemo(true);
      }
    });
  }, [fetchSensors, isGitHubPages]);

  // Cargar datos cuando cambia el sensor seleccionado
  useEffect(() => {
    if (!selectedSensor) return;
    fetchData();
  }, [selectedSensor, fetchData]);

  // Auto-refresh cada 3 minutos (solo modo real, no demo)
  useEffect(() => {
    if (isDemo) return;
    if (status !== 'ok' && status !== 'loading') return;

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
  }, [fetchData, status, isDemo]);

  const cfmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Preparar datos del grafico
  const chartData = useMemo(() =>
    data?.graph_labels?.map((label, i) => ({
      hora: label,
      valor: data.graph_data[i],
    })) || [],
    [data]
  );

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
          <div>
            <button onClick={() => window.open(DIRECT_URL, '_blank')}
              className="px-4 py-1.5 text-xs font-mono uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2">
              <ExternalLink className="w-3 h-3" />
              Ver datos reales
            </button>
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

        {/* Datos (real o demo) */}
        {data && (
          <div className="p-4">
            {/* Banner de estado */}
            {isDemo ? (
              <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center gap-3 mb-4 text-xs font-mono uppercase tracking-widest rounded">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span className="font-bold">Modo demostracion</span>
                <span className="opacity-80">·</span>
                <span>Datos simulados (no son lecturas reales)</span>
                <span className="ml-auto opacity-80">{selectedSensor}</span>
              </div>
            ) : (
              <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center gap-3 mb-4 text-xs font-mono uppercase tracking-widest rounded">
                <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse"></span>
                <span className="font-bold">Datos en vivo</span>
                <span className="opacity-70">·</span>
                <span>Auto-refresh cada 3 minutos</span>
                <span className="opacity-70">·</span>
                <span>Proxima en {cfmt(countdown)}</span>
                <span className="ml-auto opacity-70">{selectedSensor}</span>
              </div>
            )}

            {/* Tarjetas de estadisticas */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <StatCard
                color={currentTemp != null ? statColor(currentTemp) : 'green'}
                value={currentTemp ?? 0}
                label="Temperatura Actual"
                icon={<Thermometer className="w-6 h-6" />}
              />
              <StatCard
                color={data.stats ? statColor(data.stats.min_temp) : 'blue'}
                value={parseFloat(String(data.stats?.min_temp ?? 0))}
                label="Temperatura Minima"
                icon={<TrendingDown className="w-6 h-6" />}
              />
              <StatCard
                color={data.stats ? statColor(data.stats.max_temp) : 'red'}
                value={parseFloat(String(data.stats?.max_temp ?? 0))}
                label="Temperatura Maxima"
                icon={<TrendingUp className="w-6 h-6" />}
              />
              <StatCard
                color={data.stats ? statColor(data.stats.avg_temp) : 'green'}
                value={parseFloat(String(data.stats?.avg_temp ?? 0))}
                label="Temperatura Promedio"
                icon={<BarChart3 className="w-6 h-6" />}
              />
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
              <div className="p-4" style={{ height: 300 }}>
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                      <XAxis
                        dataKey="hora"
                        tick={{ fontSize: 10, fontFamily: 'monospace' }}
                        stroke="#a3a3a3"
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        domain={['dataMin - 2', 'dataMax + 2']}
                        tick={{ fontSize: 10, fontFamily: 'monospace' }}
                        stroke="#a3a3a3"
                      />
                      <Tooltip
                        contentStyle={{ fontFamily: 'monospace', fontSize: 12 }}
                        formatter={(v) => [`${Number(v ?? 0).toFixed(2)} °C`, 'Temperatura']}
                      />
                      <ReferenceLine y={-18} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={1.5}
                        label={{ value: '-18°C Limite', position: 'insideTopRight', fill: '#ef4444', fontSize: 10, fontFamily: 'monospace' }}
                      />
                      <ReferenceLine y={-24} stroke="#3b82f6" strokeDasharray="6 3" strokeWidth={1.5}
                        label={{ value: '-24°C Optimo', position: 'insideTopLeft', fill: '#3b82f6', fontSize: 10, fontFamily: 'monospace' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="valor"
                        stroke="#e74c3c"
                        strokeWidth={2}
                        dot={{ r: 2, fill: '#e74c3c', strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: '#fff', strokeWidth: 2, stroke: '#e74c3c' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs font-mono text-neutral-400">
                    Datos de grafica no disponibles
                  </div>
                )}
              </div>
            </div>

            {/* Leyenda de colores */}
            <div className="bg-white border border-neutral-200 rounded-lg p-4 mb-4">
              <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-700 mb-3 flex items-center gap-2">
                <Info className="w-3.5 h-3.5" />
                Leyenda de estados
              </h3>
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-blue-500 border border-blue-600"></span>
                  <span className="text-xs font-mono text-neutral-600">
                    Frio (&lt; -24°C) — Temperatura excesivamente baja
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-green-500 border border-green-600"></span>
                  <span className="text-xs font-mono text-neutral-600">
                    Normal (-24°C a -18°C) — Rango operativo correcto
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-red-500 border border-red-600"></span>
                  <span className="text-xs font-mono text-neutral-600">
                    Calor (&gt; -18°C) — Temperatura por encima del limite
                  </span>
                </div>
              </div>
            </div>

            {/* Tabla de registros */}
            <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden mb-4">
              <div className="bg-neutral-800 text-white px-4 py-3 flex items-center justify-between">
                <h3 className="text-sm font-mono uppercase tracking-widest">
                  Registros de Temperatura
                </h3>
                <span className="text-xs text-neutral-400 font-mono">
                  {data.temperatures.length} registros
                </span>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-700 text-white sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest">Sensor</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest">Fecha</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest">Hora</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest">Temperatura</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-mono uppercase tracking-widest">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.temperatures.map((temp, i) => {
                      const t = parseFloat(temp.temperatura);
                      const st = tempStatus(t);
                      return (
                        <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                          <td className="px-4 py-2 font-mono text-xs text-neutral-600">{temp.sensor}</td>
                          <td className="px-4 py-2 font-mono text-xs text-neutral-600">{formatDate(temp.fecha)}</td>
                          <td className="px-4 py-2 font-mono text-xs text-neutral-600">{temp.hora.slice(0, 8)}</td>
                          <td className={`px-4 py-2 font-mono text-xs font-bold text-right ${tempColor(t)}`}>
                            {t.toFixed(2)} °C
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-block px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-full border ${st.color}`}>
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {data.temperatures.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-xs text-neutral-400 font-mono">
                          No hay registros para el rango seleccionado
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer informativo */}
            {isDemo && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 mb-4">
                <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-700 mb-2 flex items-center gap-2">
                  <Info className="w-3.5 h-3.5" />
                  Acerca de los datos mostrados
                </h3>
                <div className="text-xs text-neutral-500 space-y-2">
                  <p>
                    Los datos que se ven en esta pantalla son <strong className="text-neutral-700">simulaciones demo</strong> generadas
                    automaticamente. Representan lecturas hipoteticas de sensores de temperatura para camaras frigorificas,
                    con un patron realista que incluye variaciones sinusoidales (simulando ciclos de compresor), ruido aleatorio,
                    y picos eventuales de temperatura (simulando apertura de puertas).
                  </p>
                  <p>
                    Para ver los <strong className="text-neutral-700">datos reales en tiempo real</strong> de los sensores del
                    Centro Logistico Frimaral, tiene dos opciones:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>
                      Hacer click en <strong className="text-blue-600">Ver datos reales</strong> para abrir directamente el
                      servidor interno de temperaturas en 192.168.150.31 (requiere estar en la red interna).
                    </li>
                    <li>
                      Ejecutar la aplicacion localmente con <span className="font-mono bg-neutral-800 text-green-300 px-1.5 py-0.5 rounded text-[11px]">npm run dev</span>{' '}
                      desde la red interna del centro logistico, lo cual habilita el proxy hacia el servidor de sensores
                      y permite consultar datos en tiempo real con auto-refresh.
                    </li>
                  </ul>
                </div>
              </div>
            )}
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
