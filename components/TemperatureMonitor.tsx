'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Thermometer, ExternalLink, RefreshCw, Monitor, Maximize2, Minimize2 } from 'lucide-react';

const TEMPERATURE_URL = 'http://192.168.150.31/TemperaturaWeb/temperatura.php';

export default function TemperatureMonitor() {
  const [loading, setLoading] = useState(true);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Timeout: si en 5 segundos no cargó, sacar el spinner
  // (onLoad/onError no son confiables con iframes cross-origin)
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setLoading(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [loading, refreshKey]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setIframeBlocked(false);
    setRefreshKey(prev => prev + 1);
  }, []);

  const openInNewTab = () => {
    window.open(TEMPERATURE_URL, '_blank');
  };

  const toggleExpand = () => {
    setExpanded(prev => !prev);
  };

  return (
    <div className={`flex flex-col ${expanded ? 'fixed inset-0 z-[9999] bg-black' : 'h-full'} bg-white border border-neutral-200`}>
      {/* Header */}
      <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Thermometer className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-lg font-mono uppercase tracking-widest text-neutral-900">
                04. Monitoreo de Temperaturas
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Sistema de sensores · 192.168.150.31
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openInNewTab}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              title="Abrir en nueva pestaña">
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Abrir en pestaña nueva</span>
            </button>
            <button onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 transition-colors"
              title="Recargar">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Recargar</span>
            </button>
            <button onClick={toggleExpand}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-widest bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
              title={expanded ? 'Minimizar' : 'Pantalla completa'}>
              {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className={`flex-1 relative ${expanded ? '' : 'overflow-hidden'}`}>

        {/* Spinner de carga - desaparece solo a los 5s */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
              <p className="text-sm font-mono text-neutral-600">Cargando temperaturas...</p>
              <p className="text-xs text-neutral-400 mt-1">Si no carga, use el boton "Abrir en pestaña nueva"</p>
            </div>
          </div>
        )}

        {/* Error: servidor bloquea iframe */}
        {iframeBlocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <div className="text-center max-w-md p-8">
              <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mb-4">
                <Monitor className="w-8 h-8 text-amber-500" />
              </div>
              <h3 className="text-sm font-mono uppercase tracking-widest mb-2">El servidor bloquea la vista embebida</h3>
              <p className="text-xs text-neutral-500 mb-6">
                El servidor de temperaturas tiene configuracion de seguridad que impide mostrarse dentro de esta pagina.
              </p>
              <button onClick={openInNewTab}
                className="px-6 py-2.5 bg-blue-600 text-white text-xs font-mono uppercase tracking-widest hover:bg-blue-700 transition-colors">
                Abrir en pestaña nueva
              </button>
            </div>
          </div>
        )}

        {/* Iframe sin sandbox - sin restricciones */}
        <iframe
          key={refreshKey}
          src={TEMPERATURE_URL}
          className={`w-full ${expanded ? 'h-[calc(100vh-60px)]' : 'h-full'} border-0`}
          title="Monitoreo de Temperaturas"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}
