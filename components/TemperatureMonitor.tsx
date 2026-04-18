'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Thermometer, ExternalLink, RefreshCw, Monitor, Maximize2, Minimize2 } from 'lucide-react';

const TEMPERATURE_URL = 'http://192.168.150.31/TemperaturaWeb/temperatura.php';

export default function TemperatureMonitor() {
  const [loading, setLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleRefresh = () => {
    setLoading(true);
    setIframeError(false);
    setRefreshKey(prev => prev + 1);
  };

  const handleLoad = () => {
    setLoading(false);
  };

  const handleError = () => {
    setLoading(false);
    setIframeError(true);
  };

  // Abrir en nueva pestaña
  const openInNewTab = () => {
    window.open(TEMPERATURE_URL, '_blank');
  };

  // Toggle pantalla completa
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
                Sistema de sensores · {TEMPERATURE_URL}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openInNewTab}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-widest bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
              title="Abrir en nueva pestaña">
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Abrir</span>
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

      {/* Contenido del iframe */}
      <div className={`flex-1 relative ${expanded ? '' : 'overflow-hidden'}`}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 text-neutral-400 animate-spin mx-auto mb-3" />
              <p className="text-xs font-mono uppercase tracking-widest text-neutral-500">Cargando temperaturas...</p>
            </div>
          </div>
        )}

        {iframeError && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <div className="text-center max-w-md p-8">
              <div className="mx-auto w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <Monitor className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-sm font-mono uppercase tracking-widest mb-2">No se pudo cargar</h3>
              <p className="text-xs text-neutral-500 mb-1">
                El servidor de temperaturas no esta disponible o no se puede acceder desde este navegador.
              </p>
              <p className="text-[11px] text-neutral-400 mb-6">
                Verifique que este conectado a la red interna y que el servidor 192.168.150.31 este encendido.
              </p>
              <div className="flex justify-center gap-3">
                <button onClick={handleRefresh}
                  className="px-5 py-2 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest hover:bg-neutral-800 transition-colors">
                  Reintentar
                </button>
                <button onClick={openInNewTab}
                  className="px-5 py-2 bg-blue-600 text-white text-xs font-mono uppercase tracking-widest hover:bg-blue-700 transition-colors">
                  Abrir directamente
                </button>
              </div>
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          key={refreshKey}
          src={TEMPERATURE_URL}
          className={`w-full ${expanded ? 'h-[calc(100vh-60px)]' : 'h-full'} border-0`}
          onLoad={handleLoad}
          onError={handleError}
          title="Monitoreo de Temperaturas"
          sandbox="allow-scripts allow-same-origin allow-popups"
          style={{ opacity: loading ? 0 : 1, transition: 'opacity 0.3s ease' }}
        />
      </div>
    </div>
  );
}
