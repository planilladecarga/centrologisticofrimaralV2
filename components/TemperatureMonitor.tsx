'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Thermometer, ExternalLink, AlertTriangle,
  TrendingDown, TrendingUp, Info, Activity,
  Snowflake, Flame, CheckCircle, RefreshCw,
  Database, Upload, FileText, Table as TableIcon,
  Calendar, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
const TEMPERATURA_URL = 'http://192.168.150.31/TemperaturaWeb/temperatura.php';
const SENSOR_ID = 'CAM-01';
const SENSOR_NOMBRE = 'Camara Fria 1';
const SENSOR_UBICACION = 'Deposito A';

// ──────────────────────────────────────────────
// Types
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

type DataMode = 'empty' | 'demo' | 'uploaded' | 'live';

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

function generateDemoData(): Lectura[] {
  const now = new Date();
  const daySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const data: Lectura[] = [];
  const rng = seededRandom(daySeed);

  for (let i = 47; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 30 * 60 * 1000);
    const hourOfDay = time.getHours() + time.getMinutes() / 60;
    const sin1 = Math.sin((hourOfDay / 8) * 2 * Math.PI) * 0.8;
    const sin2 = Math.sin((hourOfDay / 24) * 2 * Math.PI - Math.PI / 2) * 1.2;
    const noise = (rng() - 0.5) * 1.6;
    const spike = rng() < 0.05 ? (rng() * 2.5 + 1.0) : 0;
    const temp = Math.round((-20.5 + sin1 + sin2 + noise + spike) * 10) / 10;

    data.push({
      sensor: SENSOR_ID,
      sensorNombre: SENSOR_NOMBRE,
      ubicacion: SENSOR_UBICACION,
      timestamp: time.toISOString(),
      fecha: time.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      hora: time.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
      temperatura: temp,
    });
  }
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
// Chart Tooltip
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
// PDF Parser — extract temperature rows from reporte_temperatura.pdf
// ──────────────────────────────────────────────
async function parsePdfFile(file: File, onProgress: (msg: string) => void): Promise<Lectura[]> {
  const pdfjsLib = await import('pdfjs-dist');
  // Use CDN worker for static export (GitHub Pages) — avoids path issues
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allRows: Lectura[] = [];

  onProgress(`Procesando ${pdf.numPages} paginas...`);

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress(`Leyendo pagina ${i} de ${pdf.numPages}...`);
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const lines = textContent.items
      .map((item: any) => item.str)
      .join('|');

    // Extract rows: pattern is SensorName DD/MM/YYYY HH:MM:SS -XX.X °C -XX.X °C
    const regex = /(\S+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})\s+(-?\d+[\.,]\d+)\s*°C/gi;
    let match;
    while ((match = regex.exec(lines)) !== null) {
      const sensorRaw = match[1];
      const fechaStr = match[2]; // DD/MM/YYYY
      const horaStr = match[3]; // HH:MM:SS
      const tempStr = match[4].replace(',', '.');

      const temp = parseFloat(tempStr);
      // Skip 0.00 readings (null/error values from sensor)
      if (isNaN(temp) || temp === 0) continue;

      // Parse DD/MM/YYYY to ISO timestamp
      const [day, month, year] = fechaStr.split('/').map(Number);
      const [h, m, s] = horaStr.split(':').map(Number);
      const dateObj = new Date(year, month - 1, day, h, m, s);

      if (isNaN(dateObj.getTime())) continue;

      const sensorId = sensorRaw.replace(/sensor/i, 'CAM-').toUpperCase();

      allRows.push({
        sensor: sensorId || SENSOR_ID,
        sensorNombre: SENSOR_NOMBRE,
        ubicacion: SENSOR_UBICACION,
        timestamp: dateObj.toISOString(),
        fecha: dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        hora: dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
        temperatura: temp,
      });
    }
  }

  // Sort by timestamp ascending
  allRows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return allRows;
}

// ──────────────────────────────────────────────
// Excel Parser
// ──────────────────────────────────────────────
async function parseExcelFile(file: File, onProgress: (msg: string) => void): Promise<Lectura[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

  onProgress(`Procesando hoja "${wb.SheetNames[0]}" con ${rows.length} filas...`);

  const allRows: Lectura[] = [];
  const headerIdx = rows.findIndex(row => {
    const str = row.map((c: any) => String(c || '').toLowerCase()).join(' ');
    return (str.includes('sensor') || str.includes('temperatura')) && str.includes('fecha');
  });

  const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0;

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;

    // Try flexible column mapping
    let fechaStr = '';
    let horaStr = '';
    let tempVal = 0;
    let sensorName = SENSOR_ID;

    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || '').trim();

      // Date: DD/MM/YYYY or YYYY-MM-DD
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(cell) || /^\d{4}-\d{2}-\d{2}$/.test(cell)) {
        fechaStr = cell;
      }
      // Time: HH:MM:SS
      if (/^\d{2}:\d{2}(:\d{2})?$/.test(cell)) {
        horaStr = cell;
      }
      // Temperature: -XX.X with optional °C
      const tempMatch = cell.match(/(-?\d+[\.,]\d+)/);
      if (tempMatch) {
        tempVal = parseFloat(tempMatch[1].replace(',', '.'));
      }
      // Sensor name
      if (/sensor/i.test(cell) || /cam/i.test(cell)) {
        sensorName = cell.toUpperCase().replace(/sensor/i, 'CAM-').trim();
      }
    }

    if (!fechaStr || !horaStr || isNaN(tempVal) || tempVal === 0) continue;

    // Parse date
    let dateObj: Date;
    if (fechaStr.includes('/')) {
      const [day, month, year] = fechaStr.split('/').map(Number);
      const [h, m, s] = horaStr.split(':').map(Number);
      dateObj = new Date(year, month - 1, day, h, m, s || 0);
    } else {
      dateObj = new Date(fechaStr + 'T' + horaStr);
    }

    if (isNaN(dateObj.getTime())) continue;

    allRows.push({
      sensor: sensorName || SENSOR_ID,
      sensorNombre: SENSOR_NOMBRE,
      ubicacion: SENSOR_UBICACION,
      timestamp: dateObj.toISOString(),
      fecha: dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      hora: dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
      temperatura: tempVal,
    });
  }

  allRows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return allRows;
}

// ──────────────────────────────────────────────
// Helper: get unique dates from data
// ──────────────────────────────────────────────
function getDateRange(data: Lectura[]): { min: string; max: string } | null {
  if (data.length === 0) return null;
  const dates = data.map(d => new Date(d.timestamp).getTime());
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { min: fmt(minDate), max: fmt(maxDate) };
}

function toInputDate(isoStr: string): string {
  return isoStr.slice(0, 10);
}

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────
export default function TemperatureMonitor() {
  const [mode, setMode] = useState<DataMode>('empty');
  const [data, setData] = useState<Lectura[]>([]);
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [fileName, setFileName] = useState('');
  const [chartReady, setChartReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Initialize with demo data
  useEffect(() => {
    const demo = generateDemoData();
    setData(demo);
    setMode('demo');
  }, []);

  // Render chart only when container has valid dimensions (fixes -1 width/height)
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    let stopped = false;
    const check = () => {
      if (stopped) return;
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setChartReady(true);
      } else {
        requestAnimationFrame(check);
      }
    };
    // ResizeObserver as primary, rAF as fallback
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
            setChartReady(true);
          }
        }
      });
      ro.observe(el);
      return () => { stopped = true; ro.disconnect(); };
    } else {
      check();
      return () => { stopped = true; };
    }
  }, []);

  // ─── File Upload Handler ────────────────
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setFileName(file.name);
    setUploading(true);

    try {
      let lectures: Lectura[] = [];

      if (file.name.endsWith('.pdf')) {
        lectures = await parsePdfFile(file, setUploadProgress);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        lectures = await parseExcelFile(file, setUploadProgress);
      } else {
        throw new Error('Formato no soportado. Usar PDF o Excel (.xlsx/.xls/.csv)');
      }

      if (lectures.length === 0) {
        throw new Error('No se encontraron datos de temperatura en el archivo. Verifica el formato.');
      }

      setData(lectures);
      setMode('uploaded');

      // Auto-set date range to full range
      const range = getDateRange(lectures);
      if (range) {
        setFilterStart(range.min);
        setFilterEnd(range.max);
      }

      setUploadProgress(`Cargado: ${lectures.length} lecturas procesadas`);
    } catch (err: any) {
      setUploadError(err.message || 'Error al procesar el archivo');
      setMode(data.length > 0 ? 'demo' : 'empty');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [data.length]);

  // ─── Filtered data by date range ────────
  const filteredData = useMemo(() => {
    if (!filterStart && !filterEnd) return data;
    return data.filter(d => {
      const dateStr = toInputDate(d.timestamp);
      if (filterStart && dateStr < filterStart) return false;
      if (filterEnd && dateStr > filterEnd) return false;
      return true;
    });
  }, [data, filterStart, filterEnd]);

  // ─── Stats ──────────────────────────────
  const stats = useMemo(() => {
    const temps = filteredData.map(d => d.temperatura);
    if (temps.length === 0) return { actual: null, min: null, max: null, prom: null, count: 0 };
    const actual = temps[temps.length - 1];
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    const prom = temps.reduce((a, b) => a + b, 0) / temps.length;
    return {
      actual: Math.round(actual * 10) / 10,
      min: Math.round(min * 10) / 10,
      max: Math.round(max * 10) / 10,
      prom: Math.round(prom * 10) / 10,
      count: temps.length,
    };
  }, [filteredData]);

  // ─── Chart data (sampled for performance) ─
  const chartData = useMemo(() => {
    let source = filteredData;
    // If more than 500 points, sample every N
    if (source.length > 500) {
      const step = Math.ceil(source.length / 500);
      source = source.filter((_, i) => i % step === 0 || i === source.length - 1);
    }
    return source.map(d => ({
      name: `${d.fecha} ${d.hora}`,
      fecha: d.fecha,
      hora: d.hora,
      temp: d.temperatura,
    }));
  }, [filteredData]);

  // Chart Y domain
  const yDomain = useMemo(() => {
    if (stats.min == null || stats.max == null) return [-28, -14];
    return [Math.floor(stats.min) - 1, Math.ceil(stats.max) + 1];
  }, [stats.min, stats.max]);

  // ─── Quick date range presets ───────────
  const setDatePreset = useCallback((days: number) => {
    if (data.length === 0) return;
    const allDates = data.map(d => new Date(d.timestamp).getTime());
    const maxTs = Math.max(...allDates);
    const minDate = new Date(maxTs - days * 24 * 60 * 60 * 1000);
    const maxDate = new Date(maxTs);
    setFilterStart(toInputDate(minDate.toISOString()));
    setFilterEnd(toInputDate(maxDate.toISOString()));
  }, [data]);

  // ─── Clear uploaded data ───────────────
  const clearData = useCallback(() => {
    const demo = generateDemoData();
    setData(demo);
    setMode('demo');
    setFilterStart('');
    setFilterEnd('');
    setFileName('');
    setUploadError('');
    setUploadProgress('');
  }, []);

  // ─── Date navigation ───────────────────
  const shiftRange = useCallback((days: number) => {
    if (!filterStart || !filterEnd) return;
    const start = new Date(filterStart + 'T00:00:00');
    const end = new Date(filterEnd + 'T00:00:00');
    const diff = end.getTime() - start.getTime();
    start.setDate(start.getDate() + days);
    end.setDate(end.getDate() + days);
    setFilterStart(toInputDate(start.toISOString()));
    setFilterEnd(toInputDate(end.toISOString()));
  }, [filterStart, filterEnd]);

  // ─── Render ────────────────────────────
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
              {mode === 'uploaded'
                ? <>Archivo: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{fileName}</span> · {data.length} lecturas totales</>
                : mode === 'demo'
                  ? 'Datos demostrativos'
                  : mode === 'live'
                    ? 'Servidor interno · 192.168.150.31'
                    : 'Sin datos cargados'
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href={TEMPERATURA_URL} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5">
              <ExternalLink className="w-3 h-3" />
              Ver datos reales
            </a>
          </div>
        </div>
      </div>

      {/* ─── Upload Section ──────────────── */}
      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* File upload button */}
          <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all cursor-pointer ${
            uploading
              ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-400 cursor-wait'
              : 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 shadow-sm'
          }`}>
            {uploading ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Procesando...</>
            ) : (
              <><Upload className="w-3.5 h-3.5" /> Subir PDF / Excel</>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>

          {/* Supported formats hint */}
          <span className="text-[10px] font-mono text-neutral-400 hidden sm:inline">
            Formatos: .PDF .XLSX .XLS .CSV
          </span>

          {/* Progress or error */}
          {uploading && (
            <span className="text-[10px] font-mono text-blue-600 animate-pulse">{uploadProgress}</span>
          )}
          {uploadError && (
            <span className="text-[10px] font-mono text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {uploadError}
            </span>
          )}
          {!uploading && mode === 'uploaded' && uploadProgress && (
            <span className="text-[10px] font-mono text-green-600 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> {uploadProgress}
            </span>
          )}

          {/* Clear button */}
          {mode === 'uploaded' && !uploading && (
            <button onClick={clearData}
              className="ml-auto px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-neutral-500 hover:text-red-600 transition-colors flex items-center gap-1.5">
              <X className="w-3 h-3" /> Limpiar datos
            </button>
          )}
        </div>
      </div>

      {/* ─── Mode Banner ─────────────────── */}
      <div className={`px-4 py-2 flex items-center gap-3 text-xs font-mono uppercase tracking-widest flex-shrink-0 ${
        mode === 'demo'
          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-b border-amber-200 dark:border-amber-800'
          : mode === 'uploaded'
            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-b border-green-200 dark:border-green-800'
            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border-b border-neutral-200 dark:border-neutral-700'
      }`}>
        <span className={`w-2 h-2 rounded-full inline-block ${
          mode === 'demo' ? 'bg-amber-500' : mode === 'uploaded' ? 'bg-green-500' : 'bg-neutral-400'
        } animate-pulse`} />
        <span className="flex items-center gap-2">
          {mode === 'demo' ? (
            <><AlertTriangle className="w-3.5 h-3.5" /> Modo Demostracion</>
          ) : mode === 'uploaded' ? (
            <><FileText className="w-3.5 h-3.5" /> Datos del Archivo</>
          ) : mode === 'live' ? (
            <><Activity className="w-3.5 h-3.5" /> Datos en Vivo</>
          ) : (
            <><Database className="w-3.5 h-3.5" /> Sin datos</>
          )}
        </span>
        {mode === 'demo' && (
          <span className="text-[10px] opacity-75 ml-2">
            Subi un PDF o Excel de temperatura para ver datos reales
          </span>
        )}
        {mode === 'uploaded' && (
          <span className="text-[10px] opacity-75 ml-2">
            Mostrando {filteredData.length} de {data.length} lecturas
            {filterStart && filterEnd && ` · ${filterStart} a ${filterEnd}`}
          </span>
        )}
      </div>

      {/* ─── Content ─────────────────────── */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 md:p-6 space-y-5">

          {/* ─── Date Range Filter ───────── */}
          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Calendar className="w-4 h-4 text-neutral-500" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Rango de fechas:</span>

              {/* Quick presets */}
              <div className="flex items-center gap-1">
                {[1, 3, 7, 14, 30].map(d => (
                  <button key={d} onClick={() => setDatePreset(d)}
                    className={`px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${
                      mode === 'demo' || data.length === 0
                        ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-400 cursor-not-allowed'
                        : 'bg-white dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-600'
                    }`}
                    disabled={mode === 'demo' || data.length === 0}>
                    {d}d
                  </button>
                ))}
                <button onClick={() => { setFilterStart(''); setFilterEnd(''); }}
                  className="px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider bg-white dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-600 transition-colors"
                  disabled={mode === 'demo' || data.length === 0}>
                  Todos
                </button>
              </div>

              {/* Separator */}
              <div className="hidden md:block w-px h-6 bg-neutral-300 dark:bg-neutral-600" />

              {/* Start date */}
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-mono text-neutral-500">Desde:</label>
                <input
                  type="date"
                  value={filterStart}
                  onChange={e => setFilterStart(e.target.value)}
                  className="px-2 py-1 text-[11px] font-mono bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:border-blue-500 outline-none"
                  disabled={mode === 'demo' || data.length === 0}
                />
              </div>

              {/* End date */}
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-mono text-neutral-500">Hasta:</label>
                <input
                  type="date"
                  value={filterEnd}
                  onChange={e => setFilterEnd(e.target.value)}
                  className="px-2 py-1 text-[11px] font-mono bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:border-blue-500 outline-none"
                  disabled={mode === 'demo' || data.length === 0}
                />
              </div>

              {/* Shift buttons */}
              {filterStart && filterEnd && (mode === 'uploaded' || mode === 'live') && (
                <div className="flex items-center gap-1">
                  <button onClick={() => shiftRange(-1)}
                    className="p-1 rounded bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-600 transition-colors"
                    title="Retroceder 1 dia">
                    <ChevronLeft className="w-3 h-3 text-neutral-600 dark:text-neutral-300" />
                  </button>
                  <button onClick={() => shiftRange(1)}
                    className="p-1 rounded bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-600 transition-colors"
                    title="Avanzar 1 dia">
                    <ChevronRight className="w-3 h-3 text-neutral-600 dark:text-neutral-300" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ─── Stats Cards ──────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Actual */}
            <div className={`rounded-lg border p-4 ${stats.actual != null ? tempBg(stats.actual) : 'bg-neutral-50 border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700'}`}>
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1 flex items-center gap-1.5">
                <Thermometer className="w-3 h-3" /> Temp Actual
              </p>
              <p className={`text-2xl font-mono font-bold ${stats.actual != null ? tempColor(stats.actual) : 'text-neutral-400'}`}>
                {stats.actual != null ? `${stats.actual}°C` : '--'}
              </p>
              <p className="text-[10px] font-mono text-neutral-400 mt-1">Ultima lectura</p>
            </div>
            {/* Min */}
            <div className={`rounded-lg border p-4 ${stats.min != null ? tempBg(stats.min) : 'bg-neutral-50 border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700'}`}>
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1 flex items-center gap-1.5">
                <TrendingDown className="w-3 h-3" /> Minima
              </p>
              <p className={`text-2xl font-mono font-bold ${stats.min != null ? tempColor(stats.min) : 'text-neutral-400'}`}>
                {stats.min != null ? `${stats.min}°C` : '--'}
              </p>
              <p className="text-[10px] font-mono text-neutral-400 mt-1">
                {stats.min != null && stats.min < -24 ? 'Exceso de frio' : stats.min != null ? 'Rango registrado' : ''}
              </p>
            </div>
            {/* Max */}
            <div className={`rounded-lg border p-4 ${stats.max != null ? tempBg(stats.max) : 'bg-neutral-50 border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700'}`}>
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1 flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3" /> Maxima
              </p>
              <p className={`text-2xl font-mono font-bold ${stats.max != null ? tempColor(stats.max) : 'text-neutral-400'}`}>
                {stats.max != null ? `${stats.max}°C` : '--'}
              </p>
              <p className="text-[10px] font-mono text-neutral-400 mt-1">
                {stats.max != null && stats.max > -18 ? 'Alerta: fuera de rango' : stats.max != null ? 'Dentro del rango' : ''}
              </p>
            </div>
            {/* Promedio */}
            <div className={`rounded-lg border p-4 ${stats.prom != null ? tempBg(stats.prom) : 'bg-neutral-50 border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700'}`}>
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1 flex items-center gap-1.5">
                <Activity className="w-3 h-3" /> Promedio
              </p>
              <p className={`text-2xl font-mono font-bold ${stats.prom != null ? tempColor(stats.prom) : 'text-neutral-400'}`}>
                {stats.prom != null ? `${stats.prom}°C` : '--'}
              </p>
              <p className="text-[10px] font-mono text-neutral-400 mt-1">
                {stats.count} lecturas en rango
              </p>
            </div>
          </div>

          {/* ─── Chart ────────────────────── */}
          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                <Database className="w-3 h-3" />
                {SENSOR_ID} — {SENSOR_NOMBRE}
              </p>
              {filterStart && filterEnd && (
                <span className="text-[10px] font-mono text-neutral-400">
                  {filterStart} a {filterEnd}
                </span>
              )}
            </div>

            <div ref={chartContainerRef} className="h-64 md:h-80">
              {filteredData.length > 0 && chartReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" className="dark:opacity-30" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 9, fontFamily: 'ui-monospace, monospace' }}
                      tickLine={false}
                      axisLine={{ stroke: '#d4d4d4' }}
                      interval="preserveStartEnd"
                      angle={-30}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      domain={yDomain}
                      tick={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
                      tickLine={false}
                      axisLine={{ stroke: '#d4d4d4' }}
                      tickFormatter={(v: number) => `${v}°`}
                    />
                    <Tooltip content={<ChartTooltipContent />} />
                    <ReferenceLine y={-18} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={1.5}
                      label={{ value: '-18°C Alerta Calor', position: 'insideTopRight', fill: '#ef4444', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
                    />
                    <ReferenceLine y={-24} stroke="#3b82f6" strokeDasharray="6 4" strokeWidth={1.5}
                      label={{ value: '-24°C Alerta Frio', position: 'insideBottomRight', fill: '#3b82f6', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="temp"
                      stroke="#16a34a"
                      strokeWidth={filteredData.length > 200 ? 1.5 : 2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                      animationDuration={800}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-neutral-400">
                  <p className="text-sm font-mono uppercase tracking-widest">No hay datos para el rango seleccionado</p>
              </div>
            )}
            </div>
          </div>

          {/* ─── Color Legend ──────────────── */}
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
                Lecturas ({filteredData.length} registros
                {filterStart && filterEnd ? ` en rango` : ' totales'})
              </p>
            </div>
            {filteredData.length > 0 ? (
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
                    {[...filteredData].reverse().map((row, idx) => {
                      const estado = getEstado(row.temperatura);
                      const badge = estadoBadge(estado);
                      return (
                        <tr key={`${row.timestamp}-${idx}`}
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
            ) : (
              <div className="p-8 text-center text-neutral-400">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-mono uppercase tracking-widest">No hay datos para mostrar</p>
                <p className="text-[11px] font-mono mt-1">
                  {mode === 'demo' ? 'Subi un PDF o Excel de temperatura para visualizar los datos' : 'Ajusta el rango de fechas'}
                </p>
              </div>
            )}
          </div>

          {/* ─── Footer Info ──────────────── */}
          {mode === 'demo' && (
            <div className="space-y-3">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="space-y-2">
                    <p className="text-xs font-mono text-amber-800 dark:text-amber-300 font-semibold uppercase tracking-widest">
                      Datos de demostracion
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                      Los datos mostrados son simulados. Para ver datos reales, subi un archivo
                      PDF o Excel exportado desde el sistema de monitoreo de temperatura de la camara fria.
                      Acepta formatos de reporte con columnas: Sensor, Fecha, Hora, Temperatura.
                    </p>
                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex items-center gap-2 text-[11px] font-mono text-amber-700 dark:text-amber-400">
                        <FileText className="w-3.5 h-3.5" />
                        PDF — Reporte de temperatura
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-mono text-amber-700 dark:text-amber-400">
                        <TableIcon className="w-3.5 h-3.5" />
                        Excel / CSV — Datos tabulares
                      </div>
                    </div>
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
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === 'uploaded' && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs font-mono text-blue-800 dark:text-blue-300 font-semibold uppercase tracking-widest">
                    Datos del archivo
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
                    Visualizando datos cargados desde <span className="font-semibold">{fileName}</span>.
                    Total: {data.length} lecturas. Usa el selector de rango de fechas para filtrar el periodo que deseas visualizar.
                    Las lecturas con temperatura 0.00°C se excluyen automaticamente (valores nulos del sensor).
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}