'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Thermometer, ExternalLink, AlertTriangle,
  TrendingDown, TrendingUp, Minus, Info, Activity,
  ChevronDown, Snowflake, Flame, CheckCircle,
  RefreshCw, Database,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
const TEMPERATURA_URL = 'http://192.168.150.31/TemperaturaWeb/temperatura.php';
const BASE_TEMP = -20.5;
const LECTURAS = 48; // 48 readings every 30 min = 24h
const INTERVAL_MIN = 30;

const DEMO_SENSORS = [
  { id: 'CAM-01', nombre: 'Camara Fria 1', ubicacion: 'Deposito A' },
  { id: 'CAM-02', nombre: 'Camara Fria 2', ubicacion: 'Deposito B' },
  { id: 'CAM-03', nombre: 'Camara Fria 3', ubicacion: 'Deposito C' },
  { id: 'CAM-04', nombre: 'Camara Congelado', ubicacion: 'Deposito D' },
];

// ──────────────────────────────────────────────
// Seeded pseudo-random for stable demo data
// ──────────────────────────────────────────────
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ──────────────────────────────────────────────
// Generate realistic demo data
// ──────────────────────────────────────────────
interface Lectura {
  sensor: string;
  sensorNombre: string;
  ubicacion: string;
  timestamp: string;
  fecha: string;
  hora: string;
  temperatura: number;
}

function generateDemoData(): Lectura[] {
  const now = new Date();
  // Use today's date as seed so data is stable within the same day
  const daySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const data: Lectura[] = [];

  DEMO_SENSORS.forEach((sensor, sensorIdx) => {
    const rng = seededRandom(daySeed + sensorIdx * 1000);
    const isCongelado = sensor.id === 'CAM-04';
    const base = isCongelado ? -25.0 : BASE_TEMP;
    // Each sensor has a fixed offset so they look distinct
    const offset = sensorIdx === 0 ? 0.0 : sensorIdx === 1 ? -0.4 : sensorIdx === 2 ? 0.6 : -0.2;

    for (let i = LECTURAS - 1; i >= 0; i--) {
      const time = new Date(now.getTime() - i * INTERVAL_MIN * 60 * 1000);
      const hourOfDay = time.getHours() + time.getMinutes() / 60;

      // Sinusoidal variation simulating compressor cycles (period ~8h)
      const sin1 = Math.sin((hourOfDay / 8) * 2 * Math.PI) * 0.8;
      // Longer daily cycle (doors opening, ambient heat)
      const sin2 = Math.sin((hourOfDay / 24) * 2 * Math.PI - Math.PI / 2) * 1.2;
      // Random noise (sensor drift, door events)
      const noise = (rng() - 0.5) * 1.6;
      // Occasional spike (door open event ~5% chance)
      const spike = rng() < 0.05 ? (rng() * 2.5 + 1.0) : 0;

      const temp = base + offset + sin1 + sin2 + noise + spike;
      const rounded = Math.round(temp * 10) / 10;

      data.push({
        sensor: sensor.id,
        sensorNombre: sensor.nombre,
        ubicacion: sensor.ubicacion,
        timestamp: time.toISOString(),
        fecha: time.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        hora: time.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
        temperatura: rounded,
      });
    }
  });

  return data;
}

// ──────────────────────────────────────────────
// Color helpers
// ──────────────────────────────────────────────
type Estado = 'Frio' | 'Normal' | 'Calor';

function getEstado(temp: number): Estado {
  if (temp < -24) return 'Frio';
  if (temp > -18) return 'Calor';
  return 'Normal';
}

function estadoBadge(estado: Estado) {
  switch (estado) {
    case 'Frio':
      return { label: 'Frio', text: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-100 dark:bg-blue-900/40' };
    case 'Calor':
      return { label: 'Calor', text: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/40' };
    case 'Normal':
    default:
      return { label: 'Normal', text: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/40' };
  }
}

function tempColor(temp: number): string {
  if (temp < -24) return 'text-blue-600';
  if (temp > -18) return 'text-red-600';
  return 'text-green-600';
}

function tempBg(temp: number): string {
  if (temp < -24) return 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800';
  if (temp > -18) return 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800';
  return 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800';
}

// ──────────────────────────────────────────────
// Custom Tooltip for chart
// ──────────────────────────────────────────────
function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const val = payload[0]?.value;
  if (val == null) return null;
  const estado = getEstado(val);
  const badge = estadoBadge(estado);
  return (
    <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-mono text-neutral-500 uppercase tracking-widest mb-1">{label}</p>
      <p className="font-mono text-lg font-bold">{val}°C</p>
      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${badge.text} ${badge.bg}`}>
        {badge.label}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────
export default function TemperatureMonitor() {
  const [isDemo, setIsDemo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Lectura[]>([]);
  const [selectedSensor, setSelectedSensor] = useState(DEMO_SENSORS[0].id);
  const [showAllTable, setShowAllTable] = useState(false);

  // Try fetching real data; fallback to demo
  useEffect(() => {
    let cancelled = false;

    async function tryFetchReal() {
      try {
        // Fetch sensors
        const sensorsRes = await fetch('/api/temperatura/sensors', {
          signal: AbortSignal.timeout(5000),
        });
        if (!sensorsRes.ok) throw new Error('sensors failed');
        const sensorsData = await sensorsRes.json();
        if (sensorsData.error || !sensorsData.sensors?.length) throw new Error('no sensors');

        // Fetch temperature data for first sensor
        const params = new URLSearchParams();
        params.append('sensor', sensorsData.sensors[0].id || sensorsData.sensors[0]);
        params.append('start_date', '');
        params.append('end_date', '');

        const dataRes = await fetch('/api/temperatura/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
          signal: AbortSignal.timeout(8000),
        });
        if (!dataRes.ok) throw new Error('data failed');
        const jsonData = await dataRes.json();

        if (jsonData.error || !jsonData.temperatures?.length) throw new Error('no data');

        if (!cancelled) {
          // Transform real data into our format
          const lectures: Lectura[] = (jsonData.temperatures || []).map((r: any) => {
            const ts = r.fecha_hora || r.timestamp || r.fecha + ' ' + r.hora;
            const d = new Date(ts);
            return {
              sensor: r.sensor_id || r.sensor || selectedSensor,
              sensorNombre: r.sensor_nombre || r.sensor_name || 'Sensor',
              ubicacion: r.ubicacion || '-',
              timestamp: d.toISOString(),
              fecha: d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
              hora: d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
              temperatura: parseFloat(r.temperatura || r.temp || r.temperature || -20.5),
            };
          });
          setData(lectures);
          setIsDemo(false);
          setLoading(false);
        }
      } catch {
        // Fallback to demo
        if (!cancelled) {
          setData(generateDemoData());
          setIsDemo(true);
          setLoading(false);
        }
      }
    }

    tryFetchReal();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Derived data ──────────────────────────
  const sensorData = useMemo(() => {
    return data.filter(d => d.sensor === selectedSensor);
  }, [data, selectedSensor]);

  const latestPerSensor = useMemo(() => {
    const map = new Map<string, Lectura>();
    data.forEach(d => {
      const existing = map.get(d.sensor);
      if (!existing || d.timestamp > existing.timestamp) {
        map.set(d.sensor, d);
      }
    });
    return Array.from(map.values());
  }, [data]);

  const globalStats = useMemo(() => {
    const allTemps = data.map(d => d.temperatura);
    if (allTemps.length === 0) return { actual: 0, min: 0, max: 0, prom: 0 };
    const actual = allTemps[allTemps.length - 1];
    const min = Math.min(...allTemps);
    const max = Math.max(...allTemps);
    const prom = allTemps.reduce((a, b) => a + b, 0) / allTemps.length;
    return { actual: Math.round(actual * 10) / 10, min: Math.round(min * 10) / 10, max: Math.round(max * 10) / 10, prom: Math.round(prom * 10) / 10 };
  }, [data]);

  const selectedStats = useMemo(() => {
    const temps = sensorData.map(d => d.temperatura);
    if (temps.length === 0) return { actual: 0, min: 0, max: 0, prom: 0 };
    const actual = temps[temps.length - 1];
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    const prom = temps.reduce((a, b) => a + b, 0) / temps.length;
    return { actual: Math.round(actual * 10) / 10, min: Math.round(min * 10) / 10, max: Math.round(max * 10) / 10, prom: Math.round(prom * 10) / 10 };
  }, [sensorData]);

  // Chart data
  const chartData = useMemo(() => {
    return sensorData.map(d => ({
      name: d.hora,
      temp: d.temperatura,
    }));
  }, [sensorData]);

  // Table data: latest reading per sensor, or all readings
  const tableData = useMemo(() => {
    if (showAllTable) {
      return [...data].reverse().slice(0, 200);
    }
    return latestPerSensor.sort((a, b) => a.sensor.localeCompare(b.sensor));
  }, [data, latestPerSensor, showAllTable]);

  // Refresh demo data
  const refreshDemo = useCallback(() => {
    setData(generateDemoData());
    setIsDemo(true);
  }, []);

  // ─── Loading ───────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800 flex-shrink-0">
          <h2 className="text-lg font-mono uppercase tracking-widest text-neutral-900 dark:text-neutral-100 flex items-center gap-3">
            <Thermometer className="w-5 h-5 text-blue-600" />
            04. Monitoreo de Temperaturas
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-neutral-500">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm font-mono uppercase tracking-widest">Cargando datos...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
      {/* ─── Header ──────────────────────── */}
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-mono uppercase tracking-widest text-neutral-900 dark:text-neutral-100 flex items-center gap-3">
              <Thermometer className="w-5 h-5 text-blue-600" />
              04. Monitoreo de Temperaturas
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              {isDemo ? 'Datos demostrativos generados localmente' : 'Servidor interno · 192.168.150.31'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isDemo && (
              <button onClick={refreshDemo}
                className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3" />
                Regenerar
              </button>
            )}
            <a href={TEMPERATURA_URL} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5">
              <ExternalLink className="w-3 h-3" />
              Ver datos reales
            </a>
          </div>
        </div>
      </div>

      {/* ─── Mode Banner ─────────────────── */}
      <div className={`px-4 py-2 flex items-center gap-3 text-xs font-mono uppercase tracking-widest flex-shrink-0 ${
        isDemo
          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-b border-amber-200 dark:border-amber-800'
          : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-b border-green-200 dark:border-green-800'
      }`}>
        <div className={`w-2 h-2 rounded-full ${isDemo ? 'bg-amber-500' : 'bg-green-500'} animate-pulse`} />
        <span className="flex items-center gap-2">
          {isDemo ? (
            <><AlertTriangle className="w-3.5 h-3.5" /> Modo Demostracion</>
          ) : (
            <><Activity className="w-3.5 h-3.5" /> Datos en Vivo</>
          )}
        </span>
        {isDemo && (
          <span className="text-[10px] opacity-75 ml-2">
            Los datos a continuacion son simulados para visualizacion en GitHub Pages
          </span>
        )}
      </div>

      {/* ─── Content ─────────────────────── */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 md:p-6 space-y-6">

          {/* ─── Sensor Selector ───────── */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Sensor:</span>
            {DEMO_SENSORS.map(s => (
              <button key={s.id} onClick={() => setSelectedSensor(s.id)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all border ${
                  selectedSensor === s.id
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 border-neutral-900 dark:border-neutral-100 shadow-sm'
                    : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-500'
                }`}>
                {s.id}
              </button>
            ))}
          </div>

          {/* ─── Global Stats Cards ──────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Actual */}
            <div className={`rounded-lg border p-4 ${tempBg(globalStats.actual)}`}>
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1 flex items-center gap-1.5">
                <Thermometer className="w-3 h-3" /> Temp Actual
              </p>
              <p className={`text-2xl font-mono font-bold ${tempColor(globalStats.actual)}`}>
                {globalStats.actual}°C
              </p>
              <p className="text-[10px] font-mono text-neutral-400 mt-1">Promedio general</p>
            </div>
            {/* Min */}
            <div className={`rounded-lg border p-4 ${tempBg(globalStats.min)}`}>
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1 flex items-center gap-1.5">
                <TrendingDown className="w-3 h-3" /> Minima
              </p>
              <p className={`text-2xl font-mono font-bold ${tempColor(globalStats.min)}`}>
                {globalStats.min}°C
              </p>
              <p className="text-[10px] font-mono text-neutral-400 mt-1">
                {getEstado(globalStats.min) === 'Frio' ? 'Exceso de frio' : 'Rango registrado'}
              </p>
            </div>
            {/* Max */}
            <div className={`rounded-lg border p-4 ${tempBg(globalStats.max)}`}>
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1 flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3" /> Maxima
              </p>
              <p className={`text-2xl font-mono font-bold ${tempColor(globalStats.max)}`}>
                {globalStats.max}°C
              </p>
              <p className="text-[10px] font-mono text-neutral-400 mt-1">
                {globalStats.max > -18 ? 'Alerta: fuera de rango' : 'Dentro del rango'}
              </p>
            </div>
            {/* Promedio */}
            <div className={`rounded-lg border p-4 ${tempBg(globalStats.prom)}`}>
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1 flex items-center gap-1.5">
                <Activity className="w-3 h-3" /> Promedio
              </p>
              <p className={`text-2xl font-mono font-bold ${tempColor(globalStats.prom)}`}>
                {globalStats.prom}°C
              </p>
              <p className="text-[10px] font-mono text-neutral-400 mt-1">
                {data.length} lecturas totales
              </p>
            </div>
          </div>

          {/* ─── Selected Sensor Stats ───── */}
          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                <Database className="w-3 h-3" />
                {selectedSensor} — Ultimas {LECTURAS} lecturas
              </p>
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${tempColor(selectedStats.actual)}`}>
                  {selectedStats.actual}°C
                </span>
                <span className="text-[10px] font-mono text-neutral-400">
                  Min {selectedStats.min}°C · Max {selectedStats.max}°C · Prom {selectedStats.prom}°C
                </span>
              </div>
            </div>

            {/* ─── Chart ────────────────── */}
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" className="dark:opacity-30" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
                    tickLine={false}
                    axisLine={{ stroke: '#d4d4d4' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[Math.floor(globalStats.min) - 1, Math.ceil(globalStats.max) + 1]}
                    tick={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
                    tickLine={false}
                    axisLine={{ stroke: '#d4d4d4' }}
                    tickFormatter={(v: number) => `${v}°`}
                  />
                  <Tooltip content={<ChartTooltipContent />} />
                  {/* Reference lines */}
                  <ReferenceLine y={-18} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={1.5}
                    label={{ value: '-18°C Alerta Calor', position: 'insideTopRight', fill: '#ef4444', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
                  />
                  <ReferenceLine y={-24} stroke="#3b82f6" strokeDasharray="6 4" strokeWidth={1.5}
                    label={{ value: '-24°C Alerta Frio', position: 'insideBottomRight', fill: '#3b82f6', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
                  />
                  {/* Zone fills */}
                  <ReferenceLine y={-18} stroke="none" />
                  <Line
                    type="monotone"
                    dataKey="temp"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                    animationDuration={800}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ─── Color Legend ─────────────── */}
          <div className="flex flex-wrap items-center gap-4 px-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Leyenda:</span>
            <div className="flex items-center gap-1.5">
              <Snowflake className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-xs font-mono text-blue-700 dark:text-blue-300">&lt; -24°C Frio</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-green-600" />
              <span className="text-xs font-mono text-green-700 dark:text-green-300">-24°C a -18°C Normal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-red-600" />
              <span className="text-xs font-mono text-red-700 dark:text-red-300">&gt; -18°C Calor</span>
            </div>
          </div>

          {/* ─── Table ────────────────────── */}
          <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                {showAllTable ? 'Todas las lecturas' : 'Ultima lectura por sensor'}
                {' '}({tableData.length} registros)
              </p>
              <button onClick={() => setShowAllTable(!showAllTable)}
                className="px-3 py-1 text-[10px] font-mono uppercase tracking-widest bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-600 transition-colors flex items-center gap-1.5">
                <Database className="w-3 h-3" />
                {showAllTable ? 'Resumen' : 'Ver todas'}
              </button>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-neutral-700 text-white">
                    <th className="px-4 py-2.5 text-left font-mono uppercase tracking-widest text-[10px] font-normal">Sensor</th>
                    <th className="px-4 py-2.5 text-left font-mono uppercase tracking-widest text-[10px] font-normal">Fecha</th>
                    <th className="px-4 py-2.5 text-left font-mono uppercase tracking-widest text-[10px] font-normal">Hora</th>
                    <th className="px-4 py-2.5 text-right font-mono uppercase tracking-widest text-[10px] font-normal">Temperatura</th>
                    <th className="px-4 py-2.5 text-center font-mono uppercase tracking-widest text-[10px] font-normal">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {tableData.map((row, idx) => {
                    const estado = getEstado(row.temperatura);
                    const badge = estadoBadge(estado);
                    return (
                      <tr key={`${row.sensor}-${row.timestamp}-${idx}`}
                        className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                        <td className="px-4 py-2.5 font-mono font-semibold text-neutral-900 dark:text-neutral-100">
                          {row.sensor}
                          <span className="block text-[10px] font-normal text-neutral-400">{row.sensorNombre}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-neutral-600 dark:text-neutral-400">{row.fecha}</td>
                        <td className="px-4 py-2.5 font-mono text-neutral-600 dark:text-neutral-400">{row.hora}</td>
                        <td className={`px-4 py-2.5 font-mono font-bold text-right ${tempColor(row.temperatura)}`}>
                          {row.temperatura}°C
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-mono uppercase font-bold ${badge.text} ${badge.bg}`}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── Footer Info ──────────────── */}
          {isDemo && (
            <div className="space-y-3">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="space-y-2">
                    <p className="text-xs font-mono text-amber-800 dark:text-amber-300 font-semibold uppercase tracking-widest">
                      Datos de demostracion
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                      Los datos mostrados en esta pantalla son generados localmente con un algoritmo
                      de simulacion para demostrar el aspecto y funcionamiento del modulo de temperaturas.
                      Simulan {LECTURAS} lecturas cada {INTERVAL_MIN} minutos (24 horas) de {DEMO_SENSORS.length}
                      sensores de camaras fricas con una temperatura base de {BASE_TEMP}°C,
                      variaciones sinusoidales (ciclo de compresor + ciclo diario) y ruido aleatorio.
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                      Para ver los datos reales en tiempo real, debe ejecutar la aplicacion en modo desarrollo
                      dentro de la red interna de la empresa:
                    </p>
                    <div className="bg-amber-100 dark:bg-amber-900/40 rounded-md p-3 font-mono text-[11px] text-amber-900 dark:text-amber-200">
                      $ npm run dev
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                      Esto iniciara el servidor Next.js en <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">localhost:3000</code> con acceso
                      al proxy que conecta con el servidor de temperatura en <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">192.168.150.31</code>.
                      Desde ahi se obtendran las lecturas reales de los sensores de las camaras fricas.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Database className="w-4 h-4 text-neutral-500 mt-0.5 flex-shrink-0" />
                  <div className="space-y-2">
                    <p className="text-xs font-mono text-neutral-500 uppercase tracking-widest">
                      Servidor de temperatura
                    </p>
                    <div className="space-y-1 text-[11px] font-mono text-neutral-600 dark:text-neutral-400">
                      <p><span className="text-neutral-400">URL:</span> {TEMPERATURA_URL}</p>
                      <p><span className="text-neutral-400">Red:</span> Solo accesible desde la red interna de la empresa</p>
                      <p><span className="text-neutral-400">Endpoints:</span> /api/temperatura/sensors (GET), /api/temperatura/data (POST)</p>
                      <p><span className="text-neutral-400">Content-Type:</span> application/x-www-form-urlencoded</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
