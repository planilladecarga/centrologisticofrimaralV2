'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ExternalLink, AlertTriangle, Thermometer, Database, Wifi } from 'lucide-react';

const TEMP_URL = 'http://192.168.150.31/TemperaturaWeb/temperatura.php';
const REFRESH_INTERVAL = 3 * 60 * 1000; // 3 minutos como en el original

export default function TemperatureMonitor() {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(180);

  const refresh = useCallback(() => {
    setIsLoading(true);
    setLoadError(false);
    setLastRefresh(new Date());
    setCountdown(180);
    // Force iframe reload
    const iframe = document.getElementById('temp-iframe') as HTMLIFrameElement;
    if (iframe) {
      iframe.src = TEMP_URL;
    }
  }, []);

  // Auto-refresh countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          refresh();
          return 180;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-white border border-neutral-200">
      {/* Header */}
      <div className="p-6 border-b border-neutral-200 bg-neutral-50">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-mono uppercase tracking-widest text-neutral-900 flex items-center gap-3">
              <Thermometer className="w-5 h-5 text-blue-600" />
              04. Monitoreo de Temperaturas
            </h2>
            <p className="text-xs font-sans text-neutral-500 mt-1">
              Datos en tiempo real del sistema de sensores — Actualización automática cada 3 minutos
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Status indicators */}
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
              <div className="flex items-center gap-1 text-green-600">
                <Database className="w-3 h-3" />
                <span>Servidor</span>
              </div>
              <div className="flex items-center gap-1 text-green-600">
                <Wifi className="w-3 h-3" />
                <span>Online</span>
              </div>
            </div>
            <button onClick={refresh}
              disabled={isLoading}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${
                isLoading ? 'bg-neutral-300 text-neutral-500 cursor-wait' : 'bg-neutral-900 text-white hover:bg-neutral-800'
              }`}>
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        {/* Status bar */}
        <div className="mt-4 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-neutral-500 border-t border-neutral-200 pt-3">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span>Sistema activo — Próxima actualización en {formatCountdown(countdown)}</span>
          </div>
          {lastRefresh && (
            <span>Última actualización: {lastRefresh.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative">
        {loadError ? (
          /* Error state */
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-50 p-12 text-center">
            <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
            <h3 className="text-sm font-mono uppercase tracking-widest text-neutral-900 mb-2">No se pudo cargar el sistema de temperaturas</h3>
            <p className="text-xs font-sans text-neutral-500 mb-6 max-w-md">
              Verifica que estés conectado a la red interna del centro logístico y que el servidor 192.168.150.31 esté disponible.
            </p>
            <div className="flex items-center gap-4">
              <button onClick={() => { setLoadError(false); refresh(); }}
                className="px-5 py-2.5 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors">
                Reintentar
              </button>
              <a href={TEMP_URL} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 border border-neutral-300 text-xs font-mono uppercase tracking-widest hover:border-neutral-900 transition-colors">
                <ExternalLink className="w-4 h-4" />
                Abrir en nueva pestaña
              </a>
            </div>
          </div>
        ) : (
          /* Iframe */
          <>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-50/80 z-10">
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="w-8 h-8 text-neutral-400 animate-spin" />
                  <p className="text-xs font-mono uppercase tracking-widest text-neutral-500">Cargando datos de sensores...</p>
                </div>
              </div>
            )}
            <iframe
              id="temp-iframe"
              src={TEMP_URL}
              className="w-full h-full border-0"
              onLoad={() => { setIsLoading(false); setLoadError(false); }}
              onError={() => { setIsLoading(false); setLoadError(true); }}
              title="Sistema de Temperaturas"
            />
          </>
        )}
      </div>
    </div>
  );
}
