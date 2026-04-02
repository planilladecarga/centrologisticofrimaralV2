'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, ExternalLink, AlertTriangle, Thermometer, Database, Wifi } from 'lucide-react';

const REFRESH_INTERVAL = 3 * 60 * 1000;

export default function TemperatureMonitor() {
  const [html, setHtml] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [countdown, setCountdown] = useState(180);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await fetch('/api/temperatura');
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

  // Ejecutar scripts inyectados
  useEffect(() => {
    if (!html || !containerRef.current) return;
    containerRef.current.querySelectorAll('script').forEach(old => {
      const s = document.createElement('script');
      if (old.src) s.src = old.src;
      else s.textContent = old.textContent || '';
      old.replaceWith(s);
    });
  }, [html]);

  useEffect(() => { fetchPage(); }, [fetchPage]);

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
              {lastRefresh && <span className="ml-2">· Última actualización: {lastRefresh.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
              <div className={`flex items-center gap-1 ${!loadError ? 'text-green-600' : 'text-red-500'}`}>
                <Database className="w-3 h-3" /><span>Servidor</span>
              </div>
              <div className={`flex items-center gap-1 ${!loadError ? 'text-green-600' : 'text-red-500'}`}>
                <Wifi className="w-3 h-3" /><span>{!loadError ? 'Online' : 'Offline'}</span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-neutral-400 bg-neutral-100 px-2 py-1">
              {fmt(countdown)}
            </span>
            <button onClick={fetchPage} disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 transition-colors disabled:bg-neutral-300">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <a href="http://192.168.150.31/TemperaturaWeb/temperatura.php" target="_blank" rel="noopener noreferrer"
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
            <h3 className="text-sm font-mono uppercase tracking-widest text-neutral-900 mb-2">Servidor no disponible</h3>
            <p className="text-xs font-sans text-neutral-500 mb-6 max-w-md">
              No se pudo conectar al sistema de temperaturas. Verifica que estés conectado a la red interna del centro logístico y que el servidor 192.168.150.31 esté encendido.
            </p>
            <div className="flex items-center gap-4">
              <button onClick={() => { setLoadError(false); fetchPage(); }}
                className="px-5 py-2.5 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors">
                Reintentar
              </button>
              <a href="http://192.168.150.31/TemperaturaWeb/temperatura.php" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 border border-neutral-300 text-xs font-mono uppercase tracking-widest hover:border-neutral-900 transition-colors">
                <ExternalLink className="w-4 h-4" /> Abrir directamente
              </a>
            </div>
          </div>
        ) : isLoading && !html ? (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-50">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 text-neutral-400 animate-spin" />
              <p className="text-xs font-mono uppercase tracking-widest text-neutral-500">Conectando al servidor de temperaturas...</p>
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
