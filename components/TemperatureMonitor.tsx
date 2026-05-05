'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Thermometer, ExternalLink, AlertTriangle,
  TrendingDown, TrendingUp, Info, Activity,
  Snowflake, Flame, CheckCircle, RefreshCw,
  Database, Upload, FileText, Table as TableIcon,
  Calendar, X, ChevronLeft, ChevronRight,
  Download, Printer, BarChart3, Shield,
  ChevronDown, GitCompare, MessageSquare,
  Settings, AlertOctagon, Clock, FileSpreadsheet,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { exportToExcel } from '../lib/exportUtils';
import { printContent } from '../lib/printUtils';

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

interface Incident {
  startTimestamp: string;
  endTimestamp: string;
  startDate: string;
  startHour: string;
  endDate: string;
  endHour: string;
  type: 'cold' | 'heat';
  minTemp: number;
  maxTemp: number;
  readings: number;
  durationMs: number;
}

type DataMode = 'empty' | 'demo' | 'uploaded' | 'live';
type TabType = 'monitor' | 'analysis' | 'alerts' | 'export';
type StatsPeriod = 'day' | 'week' | 'month';

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
// Color helpers (accept optional thresholds)
// ──────────────────────────────────────────────
type Estado = 'Frio' | 'Normal' | 'Calor';

function getEstado(temp: number, lower: number = -24, upper: number = -18): Estado {
  if (temp < lower) return 'Frio';
  if (temp > upper) return 'Calor';
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

function tempColor(temp: number, lower: number = -24, upper: number = -18): string {
  if (temp < lower) return 'text-blue-600';
  if (temp > upper) return 'text-red-600';
  return 'text-green-600';
}

function tempBg(temp: number, lower: number = -24, upper: number = -18): string {
  if (temp < lower) return 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800';
  if (temp > upper) return 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800';
  return 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800';
}

// ──────────────────────────────────────────────
// Chart Tooltip (accepts thresholds)
// ──────────────────────────────────────────────
function ChartTooltipContent({ active, payload, label, lowerThreshold, upperThreshold }: any) {
  if (!active || !payload || !payload.length) return null;
  const val = payload[0]?.value;
  if (val == null) return null;
  const lo = lowerThreshold ?? -24;
  const up = upperThreshold ?? -18;
  const estado = getEstado(val, lo, up);
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
// PDF Parser — extract temperature rows from table-based PDFs
// Uses text item Y coordinates to group items into rows
// ──────────────────────────────────────────────
async function parsePdfFile(file: File, onProgress: (msg: string) => void): Promise<Lectura[]> {
  const pdfjsLib = await import('pdfjs-dist');
  // Use local worker (copied to public/) to always match the installed pdfjs-dist version
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allRows: Lectura[] = [];
  const allExtractedLines: string[] = []; // for debug

  onProgress(`Procesando ${pdf.numPages} paginas...`);

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress(`Leyendo pagina ${i} de ${pdf.numPages}...`);
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Group text items by their Y position (same row ≈ same Y ± tolerance)
    interface TextItem { str: string; x: number; y: number; }
    const items: TextItem[] = textContent.items
      .filter((item: any) => item.str && item.str.trim().length > 0)
      .map((item: any) => ({
        str: item.str.trim(),
        x: Math.round((item as any).transform?.[4] ?? 0),
        y: Math.round((item as any).transform?.[5] ?? 0),
      }))
      .sort((a, b) => b.y - a.y || a.x - b.x); // top-to-bottom, left-to-right

    // Group into rows by Y proximity (tolerance: 3px)
    const rowGroups: TextItem[][] = [];
    for (const item of items) {
      if (rowGroups.length > 0) {
        const lastRow = rowGroups[rowGroups.length - 1];
        const lastY = lastRow[0].y;
        if (Math.abs(item.y - lastY) <= 3) {
          lastRow.push(item);
          continue;
        }
      }
      rowGroups.push([item]);
    }

    // Sort items within each row by X position (left to right)
    for (const row of rowGroups) {
      row.sort((a, b) => a.x - b.x);
    }

    // Extract data from each row
    for (const row of rowGroups) {
      const fullText = row.map(r => r.str).join(' ');
      allExtractedLines.push(fullText);

      // Try to find a date pattern (DD/MM/YYYY or YYYY-MM-DD)
      const dateMatch = fullText.match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
      // Try to find a time pattern (HH:MM:SS or HH:MM)
      const timeMatch = fullText.match(/(\d{2}:\d{2}(?::\d{2})?)/);
      // Try to find a temperature pattern (negative decimal, possibly with °C)
      const tempMatches = fullText.match(/(-?\d+[\.,]\d+)\s*°?\s*C?/gi);

      if (!dateMatch || !tempMatches) continue;

      const fechaStr = dateMatch[1];
      const horaStr = timeMatch ? timeMatch[1] : '00:00:00';
      // Use the first temperature value found (or last one if multiple)
      let tempStr = tempMatches[0].replace(/[°\s]/g, '').replace(/C$/i, '');
      tempStr = tempStr.replace(',', '.');

      const temp = parseFloat(tempStr);
      if (isNaN(temp) || temp === 0) continue;

      // Extract sensor name: first token or look for sensor/cam pattern
      const sensorRaw = row[0]?.str || SENSOR_ID;

      // Parse date
      let dateObj: Date;
      if (fechaStr.includes('/')) {
        const [day, month, year] = fechaStr.split('/').map(Number);
        const timeParts = horaStr.split(':').map(Number);
        dateObj = new Date(year, month - 1, day, timeParts[0], timeParts[1], timeParts[2] || 0);
      } else {
        dateObj = new Date(fechaStr + 'T' + horaStr);
      }
      if (isNaN(dateObj.getTime())) continue;

      const sensorId = sensorRaw.replace(/sensor/i, 'CAM-').toUpperCase() || SENSOR_ID;

      allRows.push({
        sensor: sensorId,
        sensorNombre: SENSOR_NOMBRE,
        ubicacion: SENSOR_UBICACION,
        timestamp: dateObj.toISOString(),
        fecha: dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        hora: dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
        temperatura: temp,
      });
    }
  }

  // If no rows found with row-grouping, try the old flat-text approach as fallback
  if (allRows.length === 0) {
    onProgress('Reintentando con modo texto plano...');
    const fullText = allExtractedLines.join(' | ');
    const regex = /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)\s+(-?\d+[\.,]\d+)/g;
    let match;
    while ((match = regex.exec(fullText)) !== null) {
      const fechaStr = match[1];
      const horaStr = match[2];
      const tempStr = match[3].replace(',', '.');
      const temp = parseFloat(tempStr);
      if (isNaN(temp) || temp === 0) continue;

      const [day, month, year] = fechaStr.split('/').map(Number);
      const [h, m, s] = horaStr.split(':').map(Number);
      const dateObj = new Date(year, month - 1, day, h, m, s || 0);
      if (isNaN(dateObj.getTime())) continue;

      allRows.push({
        sensor: SENSOR_ID,
        sensorNombre: SENSOR_NOMBRE,
        ubicacion: SENSOR_UBICACION,
        timestamp: dateObj.toISOString(),
        fecha: dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        hora: dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
        temperatura: temp,
      });
    }
  }

  // If still no data, include sample extracted lines in error for debugging
  if (allRows.length === 0) {
    const sample = allExtractedLines.slice(0, 20).join('\n');
    throw new Error(
      `No se encontraron datos de temperatura en el archivo.\n\n` +
      `Texto extraido (primeras 20 lineas):\n${sample}\n\n` +
      `Formatos soportados: columnas con Fecha (DD/MM/YYYY), Hora (HH:MM), y Temperatura (negativa con decimal).`
    );
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
// Utility functions
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

function formatDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function detectIncidents(data: Lectura[], lowerThreshold: number, upperThreshold: number): Incident[] {
  if (data.length === 0) return [];

  const incidents: Incident[] = [];
  let inIncident = false;
  let currentInc: Omit<Incident, 'durationMs'> | null = null;

  const finishIncident = () => {
    if (currentInc) {
      incidents.push({
        ...currentInc,
        durationMs: new Date(currentInc.endTimestamp).getTime() - new Date(currentInc.startTimestamp).getTime(),
      });
    }
    currentInc = null;
    inIncident = false;
  };

  for (const d of data) {
    const temp = d.temperatura;
    const outOfRange = temp < lowerThreshold || temp > upperThreshold;
    const type: 'cold' | 'heat' = temp < lowerThreshold ? 'cold' : 'heat';

    if (outOfRange) {
      if (!inIncident || (currentInc && currentInc.type !== type)) {
        if (inIncident) finishIncident();
        currentInc = {
          startTimestamp: d.timestamp,
          endTimestamp: d.timestamp,
          startDate: d.fecha,
          startHour: d.hora,
          endDate: d.fecha,
          endHour: d.hora,
          type,
          minTemp: temp,
          maxTemp: temp,
          readings: 1,
        };
        inIncident = true;
      } else if (currentInc) {
        currentInc.endTimestamp = d.timestamp;
        currentInc.endDate = d.fecha;
        currentInc.endHour = d.hora;
        currentInc.minTemp = Math.min(currentInc.minTemp, temp);
        currentInc.maxTemp = Math.max(currentInc.maxTemp, temp);
        currentInc.readings++;
      }
    } else if (inIncident) {
      finishIncident();
    }
  }

  if (inIncident) finishIncident();
  return incidents;
}

function getPeriodKey(timestamp: string, period: StatsPeriod): string {
  const d = new Date(timestamp);
  if (period === 'day') return d.toISOString().slice(0, 10);
  if (period === 'week') {
    const dayOfWeek = d.getDay();
    const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    return monday.toISOString().slice(0, 10);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function periodLabel(key: string, period: StatsPeriod): string {
  if (period === 'day') return key;
  if (period === 'week') return `Sem ${key.slice(5)}`;
  const [y, m] = key.split('-');
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

// ──────────────────────────────────────────────
// Tab items definition
// ──────────────────────────────────────────────
const TAB_ITEMS = [
  { id: 'monitor' as const, label: 'Monitor', icon: Activity },
  { id: 'analysis' as const, label: 'Análisis', icon: BarChart3 },
  { id: 'alerts' as const, label: 'Alertas', icon: Shield },
  { id: 'export' as const, label: 'Exportar', icon: Download },
];

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────
export default function TemperatureMonitor() {
  // ─── Existing state ────────────────────────
  const [mode, setMode] = useState<DataMode>('empty');
  const [data, setData] = useState<Lectura[]>([]);
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [fileName, setFileName] = useState('');
  const [chartDimensions, setChartDimensions] = useState<{ width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // ─── NEW state ─────────────────────────────
  const [activeTab, setActiveTab] = useState<TabType>('monitor');
  const [lowerThreshold, setLowerThreshold] = useState(-24);
  const [upperThreshold, setUpperThreshold] = useState(-18);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [incidentNotes, setIncidentNotes] = useState<Record<string, string>>({});
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('day');
  const [operatorName, setOperatorName] = useState('');
  const compareChartARef = useRef<HTMLDivElement>(null);
  const compareChartBRef = useRef<HTMLDivElement>(null);
  const [compareDimA, setCompareDimA] = useState<{ width: number; height: number } | null>(null);
  const [compareDimB, setCompareDimB] = useState<{ width: number; height: number } | null>(null);

  // ─── Initialize with demo data ─────────────
  useEffect(() => {
    const demo = generateDemoData();
    setData(demo);
    setMode('demo');
  }, []);

  // ─── Load persisted state from localStorage ─
  useEffect(() => {
    try {
      const lt = localStorage.getItem('temp-monitor-lower-threshold');
      const ut = localStorage.getItem('temp-monitor-upper-threshold');
      if (lt != null) setLowerThreshold(parseFloat(lt));
      if (ut != null) setUpperThreshold(parseFloat(ut));
    } catch { /* ignore */ }
    try {
      const saved = localStorage.getItem('temp-monitor-incident-notes');
      if (saved) setIncidentNotes(JSON.parse(saved));
    } catch { /* ignore */ }
    try {
      const saved = localStorage.getItem('temp-monitor-operator');
      if (saved) setOperatorName(saved);
    } catch { /* ignore */ }
  }, []);

  // ─── Save thresholds to localStorage ───────
  useEffect(() => {
    try {
      localStorage.setItem('temp-monitor-lower-threshold', String(lowerThreshold));
      localStorage.setItem('temp-monitor-upper-threshold', String(upperThreshold));
    } catch { /* ignore */ }
  }, [lowerThreshold, upperThreshold]);

  // ─── Measure chart container (existing logic) ──
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    let rafId = 0;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 10 && height > 10) {
        setChartDimensions({ width, height });
      } else {
        rafId = requestAnimationFrame(measure);
      }
    };
    measure();
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 10 && height > 10) {
          setChartDimensions({ width, height });
        }
      }
    });
    ro.observe(el);
    return () => { cancelAnimationFrame(rafId); ro.disconnect(); };
  }, []);

  // ─── Measure comparison chart containers ───
  useEffect(() => {
    if (activeTab !== 'analysis') return;
    let raf = 0;
    const measure = () => {
      const elA = compareChartARef.current;
      const elB = compareChartBRef.current;
      let ok = true;
      if (elA) {
        const { width, height } = elA.getBoundingClientRect();
        if (width > 10 && height > 10) setCompareDimA({ width, height });
        else ok = false;
      }
      if (elB) {
        const { width, height } = elB.getBoundingClientRect();
        if (width > 10 && height > 10) setCompareDimB({ width, height });
        else ok = false;
      }
      if (!ok) raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(() => requestAnimationFrame(measure));
    return () => cancelAnimationFrame(raf);
  }, [activeTab]);

  // ─── File Upload Handler ───────────────────
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

  // ─── Filtered data by date range ───────────
  const filteredData = useMemo(() => {
    if (!filterStart && !filterEnd) return data;
    return data.filter(d => {
      const dateStr = toInputDate(d.timestamp);
      if (filterStart && dateStr < filterStart) return false;
      if (filterEnd && dateStr > filterEnd) return false;
      return true;
    });
  }, [data, filterStart, filterEnd]);

  // ─── Stats ─────────────────────────────────
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

  // ─── Chart data (sampled for performance) ──
  const chartData = useMemo(() => {
    let source = filteredData;
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

  const yDomain = useMemo(() => {
    if (stats.min == null || stats.max == null) return [Math.floor(lowerThreshold) - 2, Math.ceil(upperThreshold) + 2];
    return [Math.min(Math.floor(stats.min) - 1, Math.floor(lowerThreshold) - 1), Math.max(Math.ceil(stats.max) + 1, Math.ceil(upperThreshold) + 1)];
  }, [stats.min, stats.max, lowerThreshold, upperThreshold]);

  // ─── NEW: Incidents detection ──────────────
  const incidents = useMemo(() => detectIncidents(filteredData, lowerThreshold, upperThreshold), [filteredData, lowerThreshold, upperThreshold]);

  const compliancePercent = useMemo(() => {
    if (filteredData.length === 0) return 100;
    const inRange = filteredData.filter(d => d.temperatura >= lowerThreshold && d.temperatura <= upperThreshold).length;
    return Math.round((inRange / filteredData.length) * 1000) / 10;
  }, [filteredData, lowerThreshold, upperThreshold]);

  const totalTimeOutsideMs = useMemo(() => incidents.reduce((sum, inc) => sum + inc.durationMs, 0), [incidents]);

  const incidentSummary = useMemo(() => {
    const cold = incidents.filter(i => i.type === 'cold');
    const heat = incidents.filter(i => i.type === 'heat');
    const longest = incidents.reduce((max, inc) => Math.max(max, inc.durationMs), 0);
    return { total: incidents.length, coldCount: cold.length, heatCount: heat.length, longestDuration: longest };
  }, [incidents]);

  // ─── NEW: Period stats ─────────────────────
  const periodStatsData = useMemo(() => {
    if (filteredData.length === 0) return [];
    const groups = new Map<string, Lectura[]>();
    for (const d of filteredData) {
      const key = getPeriodKey(d.timestamp, statsPeriod);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    return Array.from(groups.entries()).map(([key, readings]) => {
      const temps = readings.map(r => r.temperatura);
      const inRange = readings.filter(r => r.temperatura >= lowerThreshold && r.temperatura <= upperThreshold).length;
      return {
        period: periodLabel(key, statsPeriod),
        count: readings.length,
        avg: Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10,
        min: Math.round(Math.min(...temps) * 10) / 10,
        max: Math.round(Math.max(...temps) * 10) / 10,
        inRangePercent: Math.round((inRange / readings.length) * 1000) / 10,
      };
    });
  }, [filteredData, statsPeriod, lowerThreshold, upperThreshold]);

  // ─── NEW: Comparison data ──────────────────
  const comparisonData = useMemo(() => {
    if (filteredData.length < 4) return null;
    const mid = Math.floor(filteredData.length / 2);
    const periodA = filteredData.slice(0, mid);
    const periodB = filteredData.slice(mid);

    const calcStats = (pd: Lectura[]) => {
      const temps = pd.map(d => d.temperatura);
      const inRange = pd.filter(d => d.temperatura >= lowerThreshold && d.temperatura <= upperThreshold).length;
      const incs = detectIncidents(pd, lowerThreshold, upperThreshold);
      return {
        label: `${pd[0]?.fecha || '...'} a ${pd[pd.length - 1]?.fecha || '...'}`,
        count: pd.length,
        avg: temps.length > 0 ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : 0,
        min: temps.length > 0 ? Math.round(Math.min(...temps) * 10) / 10 : 0,
        max: temps.length > 0 ? Math.round(Math.max(...temps) * 10) / 10 : 0,
        inRangePercent: pd.length > 0 ? Math.round((inRange / pd.length) * 1000) / 10 : 0,
        incidents: incs.length,
      };
    };

    return {
      periodA: calcStats(periodA),
      periodB: calcStats(periodB),
      periodAData: periodA,
      periodBData: periodB,
    };
  }, [filteredData, lowerThreshold, upperThreshold]);

  const comparisonChartA = useMemo(() => {
    if (!comparisonData) return [];
    let src = comparisonData.periodAData;
    if (src.length > 300) { const s = Math.ceil(src.length / 300); src = src.filter((_, i) => i % s === 0); }
    return src.map(d => ({ name: `${d.fecha} ${d.hora}`, temp: d.temperatura }));
  }, [comparisonData]);

  const comparisonChartB = useMemo(() => {
    if (!comparisonData) return [];
    let src = comparisonData.periodBData;
    if (src.length > 300) { const s = Math.ceil(src.length / 300); src = src.filter((_, i) => i % s === 0); }
    return src.map(d => ({ name: `${d.fecha} ${d.hora}`, temp: d.temperatura }));
  }, [comparisonData]);

  const comparisonYDomain = useMemo(() => {
    if (!comparisonData) return [Math.floor(lowerThreshold) - 2, Math.ceil(upperThreshold) + 2];
    const allT = [...comparisonData.periodAData, ...comparisonData.periodBData].map(d => d.temperatura);
    if (allT.length === 0) return [Math.floor(lowerThreshold) - 2, Math.ceil(upperThreshold) + 2];
    return [Math.min(Math.floor(Math.min(...allT)) - 1, Math.floor(lowerThreshold) - 1), Math.max(Math.ceil(Math.max(...allT)) + 1, Math.ceil(upperThreshold) + 1)];
  }, [comparisonData, lowerThreshold, upperThreshold]);

  // ─── NEW: Timeline segments ────────────────
  const timelineSegments = useMemo(() => {
    if (filteredData.length < 2) return [];
    const firstTs = new Date(filteredData[0].timestamp).getTime();
    const lastTs = new Date(filteredData[filteredData.length - 1].timestamp).getTime();
    const totalMs = lastTs - firstTs;
    if (totalMs <= 0) return [];

    type Seg = { state: 'in' | 'cold' | 'heat' };
    const segs: Seg[] = [];
    for (let i = 0; i < filteredData.length; i++) {
      const estado = getEstado(filteredData[i].temperatura, lowerThreshold, upperThreshold);
      const state: Seg['state'] = estado === 'Normal' ? 'in' : estado === 'Frio' ? 'cold' : 'heat';
      if (segs.length > 0 && segs[segs.length - 1].state === state) {
        // extend
      } else {
        segs.push({ state });
      }
    }
    return segs;
  }, [filteredData, lowerThreshold, upperThreshold]);

  // ─── Quick date range presets ──────────────
  const setDatePreset = useCallback((days: number) => {
    if (data.length === 0) return;
    const allDates = data.map(d => new Date(d.timestamp).getTime());
    const maxTs = Math.max(...allDates);
    const minDate = new Date(maxTs - days * 24 * 60 * 60 * 1000);
    const maxDate = new Date(maxTs);
    setFilterStart(toInputDate(minDate.toISOString()));
    setFilterEnd(toInputDate(maxDate.toISOString()));
  }, [data]);

  // ─── Clear uploaded data ──────────────────
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

  // ─── Date navigation ──────────────────────
  const shiftRange = useCallback((days: number) => {
    if (!filterStart || !filterEnd) return;
    const start = new Date(filterStart + 'T00:00:00');
    const end = new Date(filterEnd + 'T00:00:00');
    start.setDate(start.getDate() + days);
    end.setDate(end.getDate() + days);
    setFilterStart(toInputDate(start.toISOString()));
    setFilterEnd(toInputDate(end.toISOString()));
  }, [filterStart, filterEnd]);

  // ─── NEW: Section toggle ──────────────────
  const toggleSection = useCallback((key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // ─── NEW: Save incident note ──────────────
  const saveNote = useCallback((key: string, note: string) => {
    setIncidentNotes(prev => {
      const next = { ...prev, [key]: note };
      try { localStorage.setItem('temp-monitor-incident-notes', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // ─── NEW: Save operator name ──────────────
  const saveOperatorName = useCallback((name: string) => {
    setOperatorName(name);
    try { localStorage.setItem('temp-monitor-operator', name); } catch { /* ignore */ }
  }, []);

  // ─── NEW: Export Excel ────────────────────
  const handleExportExcel = useCallback(() => {
    const rows: any[][] = [
      ['Reporte de Temperaturas - FRIMARAL'],
      [`Rango: ${filterStart || 'Todos'} a ${filterEnd || 'Todos'}`],
      [`Generado: ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`],
      [`Sensor: ${SENSOR_ID} - ${SENSOR_NOMBRE}`],
      [`Umbrales: ${lowerThreshold}°C a ${upperThreshold}°C`],
      [],
      ['Sensor', 'Fecha', 'Hora', 'Temperatura (°C)', 'Estado'],
      ...filteredData.map(d => [
        d.sensor, d.fecha, d.hora, d.temperatura,
        getEstado(d.temperatura, lowerThreshold, upperThreshold),
      ]),
    ];
    exportToExcel(rows, 'Temperaturas', `temperaturas_${new Date().toISOString().slice(0, 10)}.xlsx`, [15, 15, 10, 20, 12]);
  }, [filteredData, lowerThreshold, upperThreshold, filterStart, filterEnd]);

  // ─── NEW: Export PDF ──────────────────────
  const handleExportPdf = useCallback(() => {
    const hStyle = 'font-family:Arial,sans-serif;';
    const rows = filteredData.map(d => {
      const estado = getEstado(d.temperatura, lowerThreshold, upperThreshold);
      const cls = estado === 'Frio' ? 'background:#dbeafe;' : estado === 'Calor' ? 'background:#fee2e2;' : 'background:#dcfce7;';
      return `<tr style="${cls}"><td style="padding:3px 6px;border:1px solid #ccc;font-size:9px;">${d.sensor}</td><td style="padding:3px 6px;border:1px solid #ccc;font-size:9px;">${d.fecha}</td><td style="padding:3px 6px;border:1px solid #ccc;font-size:9px;">${d.hora}</td><td style="padding:3px 6px;border:1px solid #ccc;font-size:9px;text-align:right;font-weight:bold;">${d.temperatura}°C</td><td style="padding:3px 6px;border:1px solid #ccc;font-size:9px;text-align:center;">${estado}</td></tr>`;
    }).join('');
    const incRows = incidents.map((inc, i) => `<tr><td style="padding:2px 4px;border:1px solid #ddd;font-size:8px;">${i + 1}</td><td style="padding:2px 4px;border:1px solid #ddd;font-size:8px;">${inc.startDate} ${inc.startHour}</td><td style="padding:2px 4px;border:1px solid #ddd;font-size:8px;">${inc.endDate} ${inc.endHour}</td><td style="padding:2px 4px;border:1px solid #ddd;font-size:8px;text-align:right;">${formatDuration(inc.durationMs)}</td><td style="padding:2px 4px;border:1px solid #ddd;font-size:8px;text-align:right;">${inc.minTemp}°C / ${inc.maxTemp}°C</td><td style="padding:2px 4px;border:1px solid #ddd;font-size:8px;text-align:center;">${inc.type === 'cold' ? 'Frio' : 'Calor'}</td></tr>`).join('');

    const html = `<!DOCTYPE html><html><head><title>Reporte Temperaturas - Frimaral</title><style>@page{size:landscape;margin:10mm}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body style="${hStyle}font-size:10px;color:#111;">
      <div style="display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px;">
        <div><h1 style="font-size:18px;letter-spacing:3px;margin:0;">FRIMARAL</h1><div style="font-size:10px;color:#666;letter-spacing:2px;text-transform:uppercase;">Centro Logistico</div></div>
        <div style="text-align:right;"><div style="font-weight:bold;font-size:13px;">Reporte de Temperaturas</div><div style="font-size:10px;color:#666;">${new Date().toLocaleDateString('es-AR')}</div><div style="font-size:9px;color:#888;">${operatorName ? 'Operador: ' + operatorName : ''}</div></div>
      </div>
      <div style="font-size:9px;color:#555;margin-bottom:10px;">Rango: ${filterStart || 'Todos'} a ${filterEnd || 'Todos'} | ${filteredData.length} lecturas | Sensor: ${SENSOR_ID} | Umbrales: ${lowerThreshold}°C a ${upperThreshold}°C | Cumplimiento: ${compliancePercent}%</div>
      <h2 style="font-size:12px;margin:12px 0 5px;text-transform:uppercase;letter-spacing:2px;">Resumen</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
        <tr style="background:#f5f5f5;"><td style="padding:4px 8px;border:1px solid #ddd;font-size:9px;font-weight:bold;">Temp. Actual</td><td style="padding:4px 8px;border:1px solid #ddd;font-size:9px;">${stats.actual ?? '--'}°C</td><td style="padding:4px 8px;border:1px solid #ddd;font-size:9px;font-weight:bold;">Promedio</td><td style="padding:4px 8px;border:1px solid #ddd;font-size:9px;">${stats.prom ?? '--'}°C</td><td style="padding:4px 8px;border:1px solid #ddd;font-size:9px;font-weight:bold;">Min / Max</td><td style="padding:4px 8px;border:1px solid #ddd;font-size:9px;">${stats.min ?? '--'}°C / ${stats.max ?? '--'}°C</td></tr>
        <tr style="background:#f5f5f5;"><td style="padding:4px 8px;border:1px solid #ddd;font-size:9px;font-weight:bold;">Incidentes</td><td style="padding:4px 8px;border:1px solid #ddd;font-size:9px;">${incidentSummary.total}</td><td style="padding:4px 8px;border:1px solid #ddd;font-size:9px;font-weight:bold;">Tiempo fuera</td><td style="padding:4px 8px;border:1px solid #ddd;font-size:9px;">${formatDuration(totalTimeOutsideMs)}</td><td style="padding:4px 8px;border:1px solid #ddd;font-size:9px;font-weight:bold;">Cumplimiento</td><td style="padding:4px 8px;border:1px solid #ddd;font-size:9px;font-weight:bold;color:${compliancePercent >= 95 ? '#16a34a' : compliancePercent >= 80 ? '#d97706' : '#dc2626'};">${compliancePercent}%</td></tr>
      </table>
      <h2 style="font-size:12px;margin:12px 0 5px;text-transform:uppercase;letter-spacing:2px;">Informe HACCP - Incidentes</h2>
      ${incidents.length > 0 ? `<table style="width:100%;border-collapse:collapse;margin-bottom:12px;"><thead><tr style="background:#333;color:white;"><th style="padding:3px 6px;font-size:8px;">#</th><th style="padding:3px 6px;font-size:8px;">Inicio</th><th style="padding:3px 6px;font-size:8px;">Fin</th><th style="padding:3px 6px;font-size:8px;">Duracion</th><th style="padding:3px 6px;font-size:8px;">Min/Max</th><th style="padding:3px 6px;font-size:8px;">Tipo</th></tr></thead><tbody>${incRows}</tbody></table>` : '<p style="font-size:9px;color:#16a34a;margin-bottom:12px;">Sin incidentes detectados.</p>'}
      <h2 style="font-size:12px;margin:12px 0 5px;text-transform:uppercase;letter-spacing:2px;">Datos (${filteredData.length} lecturas)</h2>
      <table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#333;color:white;"><th style="padding:3px 6px;font-size:8px;">Sensor</th><th style="padding:3px 6px;font-size:8px;">Fecha</th><th style="padding:3px 6px;font-size:8px;">Hora</th><th style="padding:3px 6px;font-size:8px;">Temperatura</th><th style="padding:3px 6px;font-size:8px;">Estado</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 500); }
  }, [filteredData, lowerThreshold, upperThreshold, filterStart, filterEnd, incidents, compliancePercent, stats, incidentSummary, totalTimeOutsideMs, operatorName]);

  // ─── NEW: Print report ────────────────────
  const handlePrint = useCallback(() => {
    const rows = filteredData.slice(0, 200).map(d => {
      const estado = getEstado(d.temperatura, lowerThreshold, upperThreshold);
      return `<tr><td>${d.sensor}</td><td>${d.fecha}</td><td>${d.hora}</td><td style="text-align:right;font-weight:bold">${d.temperatura}°C</td><td style="text-align:center">${estado}</td></tr>`;
    }).join('');
    const incRows = incidents.slice(0, 20).map((inc, i) => `<tr><td>${i + 1}</td><td>${inc.startDate} ${inc.startHour}</td><td>${inc.endDate} ${inc.endHour}</td><td style="text-align:right">${formatDuration(inc.durationMs)}</td><td>${inc.minTemp}°C / ${inc.maxTemp}°C</td><td style="text-align:center">${inc.type === 'cold' ? 'Frio' : 'Calor'}</td></tr>`).join('');

    const contentHtml = `
      <p style="font-size:9px;color:#555;margin-bottom:10px;">Rango: ${filterStart || 'Todos'} a ${filterEnd || 'Todos'} | ${filteredData.length} lecturas | Sensor: ${SENSOR_ID}${operatorName ? ' | Operador: ' + operatorName : ''}</p>
      <table><tr><th>Indicador</th><th>Valor</th></tr>
        <tr><td>Temperatura Actual</td><td>${stats.actual ?? '--'}°C</td></tr>
        <tr><td>Promedio</td><td>${stats.prom ?? '--'}°C</td></tr>
        <tr><td>Minima / Maxima</td><td>${stats.min ?? '--'}°C / ${stats.max ?? '--'}°C</td></tr>
        <tr><td>Cumplimiento HACCP</td><td><strong>${compliancePercent}%</strong></td></tr>
        <tr><td>Incidentes Totales</td><td>${incidentSummary.total} (${incidentSummary.coldCount} frio, ${incidentSummary.heatCount} calor)</td></tr>
        <tr><td>Tiempo Total Fuera de Rango</td><td>${formatDuration(totalTimeOutsideMs)}</td></tr>
        <tr><td>Incidente Mas Largo</td><td>${formatDuration(incidentSummary.longestDuration)}</td></tr>
      </table>
      <br>
      <h3>Informe HACCP</h3>
      ${incidents.length > 0 ? `<table><thead><tr><th>#</th><th>Inicio</th><th>Fin</th><th>Duracion</th><th>Min/Max</th><th>Tipo</th></tr></thead><tbody>${incRows}</tbody></table>` : '<p style="color:#16a34a;font-weight:bold;">Sin incidentes detectados.</p>'}
      <br>
      <h3>Datos ${filteredData.length > 200 ? '(primeras 200 lecturas)' : ''}</h3>
      <table><thead><tr><th>Sensor</th><th>Fecha</th><th>Hora</th><th>Temperatura</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>
    `;
    printContent('Monitoreo de Temperaturas', contentHtml);
  }, [filteredData, lowerThreshold, upperThreshold, filterStart, filterEnd, incidents, compliancePercent, stats, incidentSummary, totalTimeOutsideMs, operatorName]);

  // ─── Render ────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
      {/* ─── Header ──────────────────────────── */}
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
          <div className="flex items-center gap-2 flex-shrink-0">
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
              <input ref={fileInputRef} type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" disabled={uploading} />
            </label>
            <a href={TEMPERATURA_URL} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5">
              <ExternalLink className="w-3 h-3" />
              <span className="hidden sm:inline">Ver datos reales</span>
            </a>
          </div>
        </div>
        {/* Upload progress / error */}
        {uploading && (
          <p className="text-[10px] font-mono text-blue-600 animate-pulse mt-2">{uploadProgress}</p>
        )}
        {uploadError && (
          <p className="text-[10px] font-mono text-red-600 flex items-start gap-1 mt-2 whitespace-pre-line break-all">
            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            {uploadError}
          </p>
        )}
        {!uploading && mode === 'uploaded' && uploadProgress && (
          <p className="text-[10px] font-mono text-green-600 flex items-center gap-1 mt-2">
            <CheckCircle className="w-3 h-3" /> {uploadProgress}
          </p>
        )}
      </div>

      {/* ─── Tab Navigation ──────────────────── */}
      <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex-shrink-0 print-hide">
        <div className="flex items-center gap-1 overflow-x-auto">
          {TAB_ITEMS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Quick Export + Clear ──────────────── */}
      <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex-shrink-0 print-hide">
        <div className="flex flex-wrap items-center gap-2">
          {filteredData.length > 0 && (
            <>
              <button onClick={handleExportExcel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider bg-green-600 text-white hover:bg-green-700 transition-colors shadow-sm">
                <FileSpreadsheet className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Exportar</span> Excel
              </button>
              <button onClick={handleExportPdf}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm">
                <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Exportar</span> PDF
              </button>
              <div className="w-px h-5 bg-neutral-200 dark:bg-neutral-700" />
            </>
          )}
          <span className="text-[10px] font-mono text-neutral-400">Formatos: .PDF .XLSX .XLS .CSV</span>
          {mode === 'uploaded' && !uploading && (
            <button onClick={clearData}
              className="ml-auto px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-neutral-500 hover:text-red-600 transition-colors flex items-center gap-1.5">
              <X className="w-3 h-3" /> Limpiar datos
            </button>
          )}
        </div>
      </div>

      {/* ─── Mode Banner ─────────────────────── */}
      <div className={`px-4 py-2 flex items-center gap-3 text-xs font-mono uppercase tracking-widest flex-shrink-0 ${
        mode === 'demo'
          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-b border-amber-200 dark:border-amber-800'
          : mode === 'uploaded'
            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-b border-green-200 dark:border-green-800'
            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border-b border-neutral-200 dark:border-neutral-700'
      }`}>
        <span className={`w-2 h-2 rounded-full inline-block ${mode === 'demo' ? 'bg-amber-500' : mode === 'uploaded' ? 'bg-green-500' : 'bg-neutral-400'} animate-pulse`} />
        <span className="flex items-center gap-2">
          {mode === 'demo' ? (<><AlertTriangle className="w-3.5 h-3.5" /> Modo Demostracion</>)
            : mode === 'uploaded' ? (<><FileText className="w-3.5 h-3.5" /> Datos del Archivo</>)
            : mode === 'live' ? (<><Activity className="w-3.5 h-3.5" /> Datos en Vivo</>)
            : (<><Database className="w-3.5 h-3.5" /> Sin datos</>)}
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

      {/* ─── Content ─────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 md:p-6 space-y-5">

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* MONITOR TAB ───────────────────────────────────────────────── */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div className={activeTab !== 'monitor' ? 'hidden' : ''}>

            {/* ─── Date Range Filter ─────────── */}
            <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Calendar className="w-4 h-4 text-neutral-500" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Rango de fechas:</span>
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
                <div className="hidden md:block w-px h-6 bg-neutral-300 dark:bg-neutral-600" />
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-mono text-neutral-500">Desde:</label>
                  <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)}
                    className="px-2 py-1 text-[11px] font-mono bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:border-blue-500 outline-none"
                    disabled={mode === 'demo' || data.length === 0} />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-mono text-neutral-500">Hasta:</label>
                  <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)}
                    className="px-2 py-1 text-[11px] font-mono bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:border-blue-500 outline-none"
                    disabled={mode === 'demo' || data.length === 0} />
                </div>
                {filterStart && filterEnd && (mode === 'uploaded' || mode === 'live') && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => shiftRange(-1)} className="p-1 rounded bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-600 transition-colors" title="Retroceder 1 dia">
                      <ChevronLeft className="w-3 h-3 text-neutral-600 dark:text-neutral-300" />
                    </button>
                    <button onClick={() => shiftRange(1)} className="p-1 rounded bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-600 transition-colors" title="Avanzar 1 dia">
                      <ChevronRight className="w-3 h-3 text-neutral-600 dark:text-neutral-300" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ─── Stats Cards ──────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className={`rounded-lg border p-4 ${stats.actual != null ? tempBg(stats.actual, lowerThreshold, upperThreshold) : 'bg-neutral-50 border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700'}`}>
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1 flex items-center gap-1.5"><Thermometer className="w-3 h-3" /> Temp Actual</p>
                <p className={`text-2xl font-mono font-bold ${stats.actual != null ? tempColor(stats.actual, lowerThreshold, upperThreshold) : 'text-neutral-400'}`}>
                  {stats.actual != null ? `${stats.actual}°C` : '--'}
                </p>
                <p className="text-[10px] font-mono text-neutral-400 mt-1">Ultima lectura</p>
              </div>
              <div className={`rounded-lg border p-4 ${stats.min != null ? tempBg(stats.min, lowerThreshold, upperThreshold) : 'bg-neutral-50 border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700'}`}>
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1 flex items-center gap-1.5"><TrendingDown className="w-3 h-3" /> Minima</p>
                <p className={`text-2xl font-mono font-bold ${stats.min != null ? tempColor(stats.min, lowerThreshold, upperThreshold) : 'text-neutral-400'}`}>
                  {stats.min != null ? `${stats.min}°C` : '--'}
                </p>
                <p className="text-[10px] font-mono text-neutral-400 mt-1">
                  {stats.min != null && stats.min < lowerThreshold ? 'Exceso de frio' : stats.min != null ? 'Rango registrado' : ''}
                </p>
              </div>
              <div className={`rounded-lg border p-4 ${stats.max != null ? tempBg(stats.max, lowerThreshold, upperThreshold) : 'bg-neutral-50 border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700'}`}>
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1 flex items-center gap-1.5"><TrendingUp className="w-3 h-3" /> Maxima</p>
                <p className={`text-2xl font-mono font-bold ${stats.max != null ? tempColor(stats.max, lowerThreshold, upperThreshold) : 'text-neutral-400'}`}>
                  {stats.max != null ? `${stats.max}°C` : '--'}
                </p>
                <p className="text-[10px] font-mono text-neutral-400 mt-1">
                  {stats.max != null && stats.max > upperThreshold ? 'Alerta: fuera de rango' : stats.max != null ? 'Dentro del rango' : ''}
                </p>
              </div>
              <div className={`rounded-lg border p-4 ${stats.prom != null ? tempBg(stats.prom, lowerThreshold, upperThreshold) : 'bg-neutral-50 border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700'}`}>
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1 flex items-center gap-1.5"><Activity className="w-3 h-3" /> Promedio</p>
                <p className={`text-2xl font-mono font-bold ${stats.prom != null ? tempColor(stats.prom, lowerThreshold, upperThreshold) : 'text-neutral-400'}`}>
                  {stats.prom != null ? `${stats.prom}°C` : '--'}
                </p>
                <p className="text-[10px] font-mono text-neutral-400 mt-1">{stats.count} lecturas</p>
              </div>
              {/* NEW: Incident Counter Card */}
              <div className={`rounded-lg border p-4 ${incidentSummary.total > 0 ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800' : 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800'}`}>
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1 flex items-center gap-1.5"><AlertOctagon className="w-3 h-3" /> Incidentes</p>
                <p className={`text-2xl font-mono font-bold ${incidentSummary.total > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {incidentSummary.total}
                </p>
                <p className="text-[10px] font-mono text-neutral-400 mt-1">
                  {incidentSummary.heatCount} calor · {incidentSummary.coldCount} frio
                </p>
              </div>
            </div>

            {/* ─── Configurable Thresholds ────── */}
            <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
              <button onClick={() => toggleSection('thresholds')} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-600 dark:text-neutral-400 flex items-center gap-2">
                  <Settings className="w-3.5 h-3.5" /> Umbrales Configurables
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${expandedSections.has('thresholds') ? 'rotate-0' : '-rotate-90'}`} />
              </button>
              {expandedSections.has('thresholds') && (
                <div className="px-4 pb-4 border-t border-neutral-200 dark:border-neutral-700 pt-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Snowflake className="w-3.5 h-3.5 text-blue-600" />
                      <label className="text-[10px] font-mono text-neutral-500 uppercase">Umbral frio:</label>
                      <input type="number" step="0.5" value={lowerThreshold}
                        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v < upperThreshold) setLowerThreshold(v); }}
                        className="w-20 px-2 py-1 text-[11px] font-mono bg-white dark:bg-neutral-700 border border-blue-200 dark:border-blue-800 rounded-lg focus:border-blue-500 outline-none text-blue-700 dark:text-blue-300 font-bold" />
                      <span className="text-[10px] font-mono text-blue-500">°C</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Flame className="w-3.5 h-3.5 text-red-600" />
                      <label className="text-[10px] font-mono text-neutral-500 uppercase">Umbral calor:</label>
                      <input type="number" step="0.5" value={upperThreshold}
                        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > lowerThreshold) setUpperThreshold(v); }}
                        className="w-20 px-2 py-1 text-[11px] font-mono bg-white dark:bg-neutral-700 border border-red-200 dark:border-red-800 rounded-lg focus:border-red-500 outline-none text-red-700 dark:text-red-300 font-bold" />
                      <span className="text-[10px] font-mono text-red-500">°C</span>
                    </div>
                    <button onClick={() => { setLowerThreshold(-24); setUpperThreshold(-18); }}
                      className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-500 hover:text-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                      Restablecer
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ─── Chart ────────────────────── */}
            <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                  <Database className="w-3 h-3" />
                  {SENSOR_ID} — {SENSOR_NOMBRE}
                </p>
                {filterStart && filterEnd && (
                  <span className="text-[10px] font-mono text-neutral-400">{filterStart} a {filterEnd}</span>
                )}
              </div>
              <div ref={chartContainerRef} className="h-64 md:h-80">
                {filteredData.length > 0 && chartDimensions ? (
                  <LineChart data={chartData} width={chartDimensions.width} height={chartDimensions.height} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" className="dark:opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: 'ui-monospace, monospace' }} tickLine={false} axisLine={{ stroke: '#d4d4d4' }} interval="preserveStartEnd" angle={-30} textAnchor="end" height={50} />
                    <YAxis domain={yDomain} tick={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }} tickLine={false} axisLine={{ stroke: '#d4d4d4' }} tickFormatter={(v: number) => `${v}°`} />
                    <Tooltip content={<ChartTooltipContent lowerThreshold={lowerThreshold} upperThreshold={upperThreshold} />} />
                    <ReferenceLine y={upperThreshold} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={1.5}
                      label={{ value: `${upperThreshold}°C Alerta Calor`, position: 'insideTopRight', fill: '#ef4444', fontSize: 10, fontFamily: 'ui-monospace, monospace' }} />
                    <ReferenceLine y={lowerThreshold} stroke="#3b82f6" strokeDasharray="6 4" strokeWidth={1.5}
                      label={{ value: `${lowerThreshold}°C Alerta Frio`, position: 'insideBottomRight', fill: '#3b82f6', fontSize: 10, fontFamily: 'ui-monospace, monospace' }} />
                    <Line type="monotone" dataKey="temp" stroke="#16a34a" strokeWidth={filteredData.length > 200 ? 1.5 : 2} dot={false} activeDot={{ r: 4, strokeWidth: 2, fill: '#fff' }} animationDuration={800} />
                  </LineChart>
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
              <div className="flex items-center gap-1.5"><Snowflake className="w-3.5 h-3.5 text-blue-600" /><span className="text-xs font-mono text-blue-700 dark:text-blue-300">&lt; {lowerThreshold}°C Frio</span></div>
              <div className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-600" /><span className="text-xs font-mono text-green-700 dark:text-green-300">{lowerThreshold}°C a {upperThreshold}°C Normal</span></div>
              <div className="flex items-center gap-1.5"><Flame className="w-3.5 h-3.5 text-red-600" /><span className="text-xs font-mono text-red-700 dark:text-red-300">&gt; {upperThreshold}°C Calor</span></div>
              <div className="hidden md:block w-px h-4 bg-neutral-300 dark:bg-neutral-600" />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-neutral-500">Cumplimiento:</span>
                <span className={`text-xs font-mono font-bold ${compliancePercent >= 95 ? 'text-green-600' : compliancePercent >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                  {compliancePercent}%
                </span>
              </div>
            </div>

            {/* ─── Table ────────────────────── */}
            <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                  Lecturas ({filteredData.length} registros{filterStart && filterEnd ? ' en rango' : ' totales'})
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
                        const estado = getEstado(row.temperatura, lowerThreshold, upperThreshold);
                        const badge = estadoBadge(estado);
                        return (
                          <tr key={`${row.timestamp}-${idx}`} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                            <td className="px-4 py-2.5 font-mono font-semibold text-neutral-900 dark:text-neutral-100">
                              {row.sensor}
                              <span className="block text-[10px] font-normal text-neutral-400">{row.sensorNombre}</span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-neutral-600 dark:text-neutral-400">{row.fecha}</td>
                            <td className="px-4 py-2.5 font-mono text-neutral-600 dark:text-neutral-400">{row.hora}</td>
                            <td className={`px-4 py-2.5 font-mono font-bold text-right ${tempColor(row.temperatura, lowerThreshold, upperThreshold)}`}>{row.temperatura}°C</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-mono uppercase font-bold ${badge.text} ${badge.bg}`}>{badge.label}</span>
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
                  <p className="text-[11px] font-mono mt-1">{mode === 'demo' ? 'Subi un PDF o Excel de temperatura para visualizar los datos' : 'Ajusta el rango de fechas'}</p>
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
                      <p className="text-xs font-mono text-amber-800 dark:text-amber-300 font-semibold uppercase tracking-widest">Datos de demostracion</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">Los datos mostrados son simulados. Para ver datos reales, subi un archivo PDF o Excel exportado desde el sistema de monitoreo de temperatura de la camara fria.</p>
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
                    <p className="text-xs font-mono text-blue-800 dark:text-blue-300 font-semibold uppercase tracking-widest">Datos del archivo</p>
                    <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">Visualizando datos cargados desde <span className="font-semibold">{fileName}</span>. Total: {data.length} lecturas.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* ANALYSIS TAB ─────────────────────────────────────────────── */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'analysis' && (
            <div className="space-y-5 animate-fade-in">
              {/* Period Stats Header */}
              <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-neutral-500" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Resumen estadistico por periodo</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {(['day', 'week', 'month'] as StatsPeriod[]).map(p => (
                      <button key={p} onClick={() => setStatsPeriod(p)}
                        className={`px-3 py-1.5 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${
                          statsPeriod === p
                            ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                            : 'bg-white dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-600'
                        }`}>
                        {p === 'day' ? 'Dia' : p === 'week' ? 'Semana' : 'Mes'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Period Stats Table */}
              {periodStatsData.length > 0 ? (
                <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-neutral-700 text-white">
                          <th className="px-4 py-2.5 text-left font-mono uppercase tracking-widest text-[10px] font-normal">Periodo</th>
                          <th className="px-4 py-2.5 text-right font-mono uppercase tracking-widest text-[10px] font-normal">Lecturas</th>
                          <th className="px-4 py-2.5 text-right font-mono uppercase tracking-widest text-[10px] font-normal">Promedio</th>
                          <th className="px-4 py-2.5 text-right font-mono uppercase tracking-widest text-[10px] font-normal">Min</th>
                          <th className="px-4 py-2.5 text-right font-mono uppercase tracking-widest text-[10px] font-normal">Max</th>
                          <th className="px-4 py-2.5 text-right font-mono uppercase tracking-widest text-[10px] font-normal">% En Rango</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {periodStatsData.map((row, i) => (
                          <tr key={i} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                            <td className="px-4 py-2.5 font-mono font-semibold text-neutral-900 dark:text-neutral-100">{row.period}</td>
                            <td className="px-4 py-2.5 font-mono text-right text-neutral-600 dark:text-neutral-400">{row.count}</td>
                            <td className={`px-4 py-2.5 font-mono font-bold text-right ${tempColor(row.avg, lowerThreshold, upperThreshold)}`}>{row.avg}°C</td>
                            <td className={`px-4 py-2.5 font-mono text-right ${tempColor(row.min, lowerThreshold, upperThreshold)}`}>{row.min}°C</td>
                            <td className={`px-4 py-2.5 font-mono text-right ${tempColor(row.max, lowerThreshold, upperThreshold)}`}>{row.max}°C</td>
                            <td className="px-4 py-2.5 text-right">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                row.inRangePercent >= 95 ? 'text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40'
                                  : row.inRangePercent >= 80 ? 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40'
                                  : 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/40'
                              }`}>{row.inRangePercent}%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center text-neutral-400 py-8">
                  <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-mono uppercase tracking-widest">No hay datos para analizar</p>
                </div>
              )}

              {/* Period Comparison */}
              {comparisonData ? (
                <div className="space-y-4">
                  <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <GitCompare className="w-4 h-4 text-neutral-500" />
                      <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Comparativa de periodos</span>
                    </div>
                    {/* Comparison Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Period A */}
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-blue-600 mb-1 font-bold">Periodo A</p>
                        <p className="text-[10px] font-mono text-neutral-400 mb-3">{comparisonData.periodA.label}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div><span className="text-neutral-500">Lecturas:</span> <span className="font-bold">{comparisonData.periodA.count}</span></div>
                          <div><span className="text-neutral-500">Promedio:</span> <span className={`font-bold ${tempColor(comparisonData.periodA.avg, lowerThreshold, upperThreshold)}`}>{comparisonData.periodA.avg}°C</span></div>
                          <div><span className="text-neutral-500">Min:</span> <span className={tempColor(comparisonData.periodA.min, lowerThreshold, upperThreshold)}>{comparisonData.periodA.min}°C</span></div>
                          <div><span className="text-neutral-500">Max:</span> <span className={tempColor(comparisonData.periodA.max, lowerThreshold, upperThreshold)}>{comparisonData.periodA.max}°C</span></div>
                          <div><span className="text-neutral-500">En rango:</span> <span className="font-bold">{comparisonData.periodA.inRangePercent}%</span></div>
                          <div><span className="text-neutral-500">Incidentes:</span> <span className={`font-bold ${comparisonData.periodA.incidents > 0 ? 'text-red-600' : 'text-green-600'}`}>{comparisonData.periodA.incidents}</span></div>
                        </div>
                      </div>
                      {/* Period B */}
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-amber-600 mb-1 font-bold">Periodo B</p>
                        <p className="text-[10px] font-mono text-neutral-400 mb-3">{comparisonData.periodB.label}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div><span className="text-neutral-500">Lecturas:</span> <span className="font-bold">{comparisonData.periodB.count}</span></div>
                          <div><span className="text-neutral-500">Promedio:</span> <span className={`font-bold ${tempColor(comparisonData.periodB.avg, lowerThreshold, upperThreshold)}`}>{comparisonData.periodB.avg}°C</span></div>
                          <div><span className="text-neutral-500">Min:</span> <span className={tempColor(comparisonData.periodB.min, lowerThreshold, upperThreshold)}>{comparisonData.periodB.min}°C</span></div>
                          <div><span className="text-neutral-500">Max:</span> <span className={tempColor(comparisonData.periodB.max, lowerThreshold, upperThreshold)}>{comparisonData.periodB.max}°C</span></div>
                          <div><span className="text-neutral-500">En rango:</span> <span className="font-bold">{comparisonData.periodB.inRangePercent}%</span></div>
                          <div><span className="text-neutral-500">Incidentes:</span> <span className={`font-bold ${comparisonData.periodB.incidents > 0 ? 'text-red-600' : 'text-green-600'}`}>{comparisonData.periodB.incidents}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Comparison Charts */}
                  <div className="space-y-4">
                    <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-blue-600 mb-2">{comparisonData.periodA.label}</p>
                      <div ref={compareChartARef} className="h-48">
                        {compareDimA && comparisonChartA.length > 0 ? (
                          <LineChart data={comparisonChartA} width={compareDimA.width} height={compareDimA.height} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" className="dark:opacity-30" />
                            <XAxis dataKey="name" tick={{ fontSize: 8, fontFamily: 'ui-monospace, monospace' }} tickLine={false} interval="preserveStartEnd" angle={-30} textAnchor="end" height={40} />
                            <YAxis domain={comparisonYDomain} tick={{ fontSize: 9, fontFamily: 'ui-monospace, monospace' }} tickLine={false} tickFormatter={(v: number) => `${v}°`} />
                            <ReferenceLine y={upperThreshold} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} />
                            <ReferenceLine y={lowerThreshold} stroke="#3b82f6" strokeDasharray="4 3" strokeWidth={1} />
                            <Line type="monotone" dataKey="temp" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                          </LineChart>
                        ) : <div className="h-full flex items-center justify-center text-neutral-400"><p className="text-xs font-mono">Cargando...</p></div>}
                      </div>
                    </div>
                    <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-amber-600 mb-2">{comparisonData.periodB.label}</p>
                      <div ref={compareChartBRef} className="h-48">
                        {compareDimB && comparisonChartB.length > 0 ? (
                          <LineChart data={comparisonChartB} width={compareDimB.width} height={compareDimB.height} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" className="dark:opacity-30" />
                            <XAxis dataKey="name" tick={{ fontSize: 8, fontFamily: 'ui-monospace, monospace' }} tickLine={false} interval="preserveStartEnd" angle={-30} textAnchor="end" height={40} />
                            <YAxis domain={comparisonYDomain} tick={{ fontSize: 9, fontFamily: 'ui-monospace, monospace' }} tickLine={false} tickFormatter={(v: number) => `${v}°`} />
                            <ReferenceLine y={upperThreshold} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} />
                            <ReferenceLine y={lowerThreshold} stroke="#3b82f6" strokeDasharray="4 3" strokeWidth={1} />
                            <Line type="monotone" dataKey="temp" stroke="#d97706" strokeWidth={1.5} dot={false} />
                          </LineChart>
                        ) : <div className="h-full flex items-center justify-center text-neutral-400"><p className="text-xs font-mono">Cargando...</p></div>}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-neutral-400 py-8 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700">
                  <GitCompare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-mono uppercase tracking-widest">Se necesitan al menos 4 lecturas para comparar</p>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* ALERTS TAB ───────────────────────────────────────────────── */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'alerts' && (
            <div className="space-y-5 animate-fade-in">

              {/* HACCP Report */}
              <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                <button onClick={() => toggleSection('haccp')} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-600 dark:text-neutral-400 flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5" /> Informe HACCP
                  </span>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-mono font-bold ${compliancePercent >= 95 ? 'text-green-600' : compliancePercent >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                      {compliancePercent}% cumplimiento
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${expandedSections.has('haccp') ? 'rotate-0' : '-rotate-90'}`} />
                  </div>
                </button>
                {expandedSections.has('haccp') && (
                  <div className="px-4 pb-4 border-t border-neutral-200 dark:border-neutral-700 pt-3 space-y-4">
                    {/* HACCP Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 text-center">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Cumplimiento</p>
                        <p className={`text-xl font-mono font-bold mt-1 ${compliancePercent >= 95 ? 'text-green-600' : compliancePercent >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                          {compliancePercent}%
                        </p>
                      </div>
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 text-center">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Incidentes</p>
                        <p className="text-xl font-mono font-bold mt-1 text-red-600">{incidentSummary.total}</p>
                      </div>
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 text-center">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Tiempo Fuera</p>
                        <p className="text-xl font-mono font-bold mt-1 text-neutral-700 dark:text-neutral-300">{formatDuration(totalTimeOutsideMs)}</p>
                      </div>
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 text-center">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Mas Largo</p>
                        <p className="text-xl font-mono font-bold mt-1 text-neutral-700 dark:text-neutral-300">{formatDuration(incidentSummary.longestDuration)}</p>
                      </div>
                    </div>

                    {/* Incidents list */}
                    {incidents.length > 0 ? (
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {incidents.map((inc, i) => (
                          <div key={i} className={`rounded-lg border p-3 ${
                            inc.type === 'cold'
                              ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800'
                              : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
                          }`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  {inc.type === 'cold' ? <Snowflake className="w-3.5 h-3.5 text-blue-600" /> : <Flame className="w-3.5 h-3.5 text-red-600" />}
                                  <span className={`text-[10px] font-mono uppercase tracking-widest font-bold ${inc.type === 'cold' ? 'text-blue-700 dark:text-blue-300' : 'text-red-700 dark:text-red-300'}`}>
                                    {inc.type === 'cold' ? 'Exceso de Frio' : 'Exceso de Calor'}
                                  </span>
                                  <span className="text-[10px] font-mono text-neutral-400">#{i + 1}</span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-[10px] font-mono">
                                  <div><span className="text-neutral-500">Inicio:</span> {inc.startDate} {inc.startHour}</div>
                                  <div><span className="text-neutral-500">Fin:</span> {inc.endDate} {inc.endHour}</div>
                                  <div><span className="text-neutral-500">Duracion:</span> <span className="font-bold">{formatDuration(inc.durationMs)}</span></div>
                                  <div><span className="text-neutral-500">Rango:</span> {inc.minTemp}°C / {inc.maxTemp}°C</div>
                                </div>
                              </div>
                            </div>
                            {/* Incident Note */}
                            <div className="mt-2 flex items-center gap-2 border-t border-neutral-200 dark:border-neutral-700 pt-2">
                              <MessageSquare className="w-3 h-3 text-neutral-400 flex-shrink-0" />
                              <input
                                type="text"
                                placeholder="Agregar nota..."
                                value={incidentNotes[inc.startTimestamp] || ''}
                                onChange={e => saveNote(inc.startTimestamp, e.target.value)}
                                className="flex-1 px-2 py-1 text-[10px] font-mono bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 rounded focus:border-neutral-400 outline-none text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-400"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                        <p className="text-sm font-mono text-green-700 dark:text-green-400 font-bold uppercase tracking-widest">Sin incidentes</p>
                        <p className="text-[10px] font-mono text-neutral-500 mt-1">Todas las lecturas estan dentro del rango establecido</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Alert Timeline */}
              <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-neutral-500" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Linea de tiempo de alertas</span>
                </div>
                {timelineSegments.length > 0 && filteredData.length >= 2 ? (
                  <div className="space-y-3">
                    {/* Timeline Bar */}
                    <div className="h-8 rounded-full overflow-hidden flex bg-neutral-200 dark:bg-neutral-700">
                      {timelineSegments.map((seg, i) => {
                        const colorClass = seg.state === 'in' ? 'bg-green-500' : seg.state === 'cold' ? 'bg-blue-500' : 'bg-red-500';
                        return <div key={i} className={`${colorClass} transition-all`} style={{ width: `${100 / timelineSegments.length}%` }} title={seg.state === 'in' ? 'En rango' : seg.state === 'cold' ? 'Exceso de frio' : 'Exceso de calor'} />;
                      })}
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-neutral-400">
                      <span>{filteredData[0]?.fecha} {filteredData[0]?.hora}</span>
                      <span>{filteredData[filteredData.length - 1]?.fecha} {filteredData[filteredData.length - 1]?.hora}</span>
                    </div>
                    {/* Timeline Legend */}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-green-500" /><span className="text-[10px] font-mono text-neutral-500">En rango</span></div>
                      <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-blue-500" /><span className="text-[10px] font-mono text-neutral-500">Frio</span></div>
                      <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-red-500" /><span className="text-[10px] font-mono text-neutral-500">Calor</span></div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] font-mono text-neutral-400 text-center py-4">Se necesitan al menos 2 lecturas para mostrar la linea de tiempo</p>
                )}
              </div>

              {/* All Incidents with Notes */}
              <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-4 h-4 text-neutral-500" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Registro de incidentes con notas</span>
                  <span className="text-[10px] font-mono text-neutral-400 ml-auto">{incidents.length} incidentes</span>
                </div>
                {incidents.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {incidents.map((inc, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${inc.type === 'cold' ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-red-100 dark:bg-red-900/40'}`}>
                          {inc.type === 'cold' ? <Snowflake className="w-4 h-4 text-blue-600" /> : <Flame className="w-4 h-4 text-red-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-mono font-bold text-neutral-700 dark:text-neutral-300 truncate">
                            #{i + 1} · {inc.startDate} {inc.startHour} → {inc.endDate} {inc.endHour}
                          </p>
                          <p className="text-[10px] font-mono text-neutral-400">
                            {formatDuration(inc.durationMs)} · {inc.minTemp}°C / {inc.maxTemp}°C
                          </p>
                          {incidentNotes[inc.startTimestamp] && (
                            <p className="text-[10px] font-mono text-amber-600 mt-0.5 truncate">
                              📝 {incidentNotes[inc.startTimestamp]}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] font-mono text-neutral-400 text-center py-4">No hay incidentes registrados</p>
                )}
              </div>

              {/* Demo mode info */}
              {mode === 'demo' && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Modo demostracion: los datos mostrados son simulados. Algunas funciones de alertas pueden mostrar resultados limitados con datos demo.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* EXPORT TAB ───────────────────────────────────────────────── */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'export' && (
            <div className="space-y-5 animate-fade-in">

              {/* Operator Name */}
              <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-2 flex items-center gap-2">
                  <Info className="w-3.5 h-3.5" /> Datos del operador (opcional, para reportes)
                </p>
                <input
                  type="text"
                  placeholder="Nombre del operador..."
                  value={operatorName}
                  onChange={e => saveOperatorName(e.target.value)}
                  className="w-full max-w-sm px-3 py-2 text-xs font-mono bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:border-neutral-400 outline-none text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-400"
                />
              </div>

              {/* Export Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Export Excel */}
                <button onClick={handleExportExcel} disabled={filteredData.length === 0}
                  className="p-6 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-green-50 dark:hover:bg-green-950/20 hover:border-green-300 dark:hover:border-green-800 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group">
                  <FileSpreadsheet className="w-8 h-8 text-green-600 mb-3 group-hover:scale-110 transition-transform" />
                  <p className="text-sm font-mono font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">Exportar Excel</p>
                  <p className="text-[10px] font-mono text-neutral-500 mt-1">Descargar datos filtrados como archivo .xlsx con columnas: Sensor, Fecha, Hora, Temperatura, Estado</p>
                  <p className="text-[10px] font-mono text-green-600 mt-2">{filteredData.length} registros</p>
                </button>

                {/* Export PDF */}
                <button onClick={handleExportPdf} disabled={filteredData.length === 0}
                  className="p-6 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-red-50 dark:hover:bg-red-950/20 hover:border-red-300 dark:hover:border-red-800 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group">
                  <Download className="w-8 h-8 text-red-600 mb-3 group-hover:scale-110 transition-transform" />
                  <p className="text-sm font-mono font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">Exportar PDF</p>
                  <p className="text-[10px] font-mono text-neutral-500 mt-1">Generar reporte PDF con encabezado, resumen, informe HACCP, incidentes y tabla de datos</p>
                  <p className="text-[10px] font-mono text-red-600 mt-2">{filteredData.length} registros</p>
                </button>
              </div>

              {/* Print Report */}
              <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Printer className="w-5 h-5 text-neutral-500" />
                    <div>
                      <p className="text-sm font-mono font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">Imprimir Reporte</p>
                      <p className="text-[10px] font-mono text-neutral-500 mt-0.5">Abre una ventana de impresion con formato compatible para impresora</p>
                    </div>
                  </div>
                  <button onClick={handlePrint} disabled={filteredData.length === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-mono uppercase tracking-widest bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                    <Printer className="w-3.5 h-3.5" /> Imprimir
                  </button>
                </div>
              </div>

              {/* Export Summary */}
              <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-3">Resumen del contenido a exportar</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                  <div><span className="text-neutral-500">Registros:</span> <span className="font-bold">{filteredData.length}</span></div>
                  <div><span className="text-neutral-500">Rango:</span> <span className="font-bold">{filterStart || 'Todos'} a {filterEnd || 'Todos'}</span></div>
                  <div><span className="text-neutral-500">Umbrales:</span> <span className="font-bold">{lowerThreshold}°C / {upperThreshold}°C</span></div>
                  <div><span className="text-neutral-500">Incidentes:</span> <span className={`font-bold ${incidentSummary.total > 0 ? 'text-red-600' : 'text-green-600'}`}>{incidentSummary.total}</span></div>
                  <div><span className="text-neutral-500">Cumplimiento:</span> <span className={`font-bold ${compliancePercent >= 95 ? 'text-green-600' : 'text-amber-600'}`}>{compliancePercent}%</span></div>
                  <div><span className="text-neutral-500">Operador:</span> <span className="font-bold">{operatorName || 'No asignado'}</span></div>
                  <div><span className="text-neutral-500">Promedio:</span> <span className="font-bold">{stats.prom ?? '--'}°C</span></div>
                  <div><span className="text-neutral-500">Sensor:</span> <span className="font-bold">{SENSOR_ID}</span></div>
                </div>
              </div>

              {filteredData.length === 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">No hay datos para exportar. Subi un archivo o selecciona un rango de fechas con datos.</p>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
