'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, ExternalLink, AlertTriangle, Thermometer, Database, Wifi } from 'lucide-react';

const TEMP_URL = 'http://192.168.150.31/TemperaturaWeb/temperatura.php';
const REFRESH_INTERVAL = 3 * 60 * 1000;

export default function TemperatureMonitor() {
  const [html, setHtml] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(180);
  const containerRef = useRef<HTMLDivElement>(null);
  const countdownRef = useRef(countdown);

  countdownRef.current = countdown;

  const fetchPage = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(TEMP_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setHtml(text);
      setLastRefresh(new Date());
      setCountdown(180);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Ejecutar scripts del HTML inyectado
  useEffect(() => {
    if (!html || !containerRef.current) return;
    containerRef.current.querySelectorAll('script').forEach(old => {
      const s = document.createElement('script');
      s.textContent = old.textContent || '';
      s.src = old.src || '';
      old.replaceWith(s);
    });
  }, [html]);

  // Fetch inicial
  useEffect(() => { fetchPage(); }, [fetchPage]);

  // Auto-refresh countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { fetchPage(); return 180; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchPage]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

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
            <p className="text-xs font-sans text-neutral-500 mt-1">
              Datos en tiempo real del sistema de sensores
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
              <div className="flex items-center gap-1 text-green-600"><Database className="w-3 h-3" /><span>Servidor</span></div>
              <div className="flex items-center gap-1 text-green-600"><Wifi className="w-3 h-3" /><span>Online</span></div>
            </div>
            <span className="text-[10px] font-mono text-neutral-400">
              {fmt(countdownRef.current)}
            </span>
            <button onClick={fetchPage} disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 transition-colors disabled:bg-neutral-300">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? '...' : 'Actualizar'}
            </button>
            <a href={TEMP_URL} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-widest border border-neutral-300 hover:border-neutral-900 transition-colors">
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-hidden">
        {loadError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-50 p-12 text-center">
            <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
            <h3 className="text-sm font-mono uppercase tracking-widest text-neutral-900 mb-2">No se pudo cargar el sistema de temperaturas</h3>
            <p className="text-xs font-sans text-neutral-500 mb-6">Verifica que estés conectado a la red interna (192.168.150.31).</p>
            <button onClick={() => { setLoadError(false); fetchPage(); }}
              className="px-5 py-2.5 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors">
              Reintentar
            </button>
          </div>
        ) : isLoading && !html ? (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-50">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 text-neutral-400 animate-spin" />
              <p className="text-xs font-mono uppercase tracking-widest text-neutral-500">Cargando...</p>
            </div>
          </div>
        ) : (
          <div ref={containerRef} className="w-full h-full overflow-auto"
            dangerouslySetInnerHTML={{ __html: html }}
            suppressHydrationWarning
          />
        )}
      </div>
    </div>
  );
}
