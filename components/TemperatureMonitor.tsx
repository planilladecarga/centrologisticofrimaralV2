'use client';

import React, { useState } from 'react';
import {
  Thermometer, ExternalLink, RefreshCw, AlertTriangle, Maximize2, Minimize2,
} from 'lucide-react';

const TEMPERATURA_URL = 'http://192.168.150.31/TemperaturaWeb/temperatura.php';

export default function TemperatureMonitor() {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

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
              Datos en tiempo real · Servidor interno 192.168.150.31
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFullscreen(f => !f)}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 border border-neutral-200 hover:bg-neutral-100 transition-colors"
              title={fullscreen ? 'Minimizar' : 'Maximizar'}
            >
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={() => { setIframeLoaded(false); setIframeError(false); }}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Actualizar
            </button>
            <a
              href={TEMPERATURA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir en nueva pestaña
            </a>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 overflow-hidden bg-neutral-50 ${fullscreen ? 'fixed inset-0 z-50' : ''}`}>
        {!iframeError && (
          <iframe
            key={iframeLoaded ? 'loaded' : 'refresh'}
            src={TEMPERATURA_URL}
            className="w-full h-full border-0"
            onLoad={() => setIframeLoaded(true)}
            onError={() => { setIframeError(true); setIframeLoaded(true); }}
            title="Monitoreo de Temperaturas"
            sandbox="allow-scripts allow-same-origin"
          />
        )}

        {/* Loading state */}
        {!iframeLoaded && !iframeError && (
          <div className="flex items-center justify-center h-full absolute inset-0 bg-white">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
              <p className="text-xs font-mono uppercase tracking-widest text-neutral-500">Conectando al servidor de temperatura...</p>
              <p className="text-[10px] text-neutral-400 mt-2 font-mono">{TEMPERATURA_URL}</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {iframeError && (
          <div className="flex items-center justify-center h-full p-8">
            <div className="text-center max-w-md">
              <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h3 className="text-lg font-mono uppercase tracking-widest text-neutral-900 mb-3">
                No se pudo cargar
              </h3>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-left">
                <p className="text-sm text-neutral-700 mb-2">
                  Esto puede pasar si:
                </p>
                <ul className="text-xs text-neutral-600 space-y-1 list-disc list-inside">
                  <li>No estás en la red interna de la empresa</li>
                  <li>El servidor 192.168.150.31 está apagado</li>
                  <li>La página de temperatura no está disponible</li>
                </ul>
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => { setIframeLoaded(false); setIframeError(false); }}
                  className="px-4 py-2 text-xs font-mono uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 transition-colors"
                >
                  <RefreshCw className="w-3 h-3 inline mr-1" />
                  Reintentar
                </button>
                <a
                  href={TEMPERATURA_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-xs font-mono uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <ExternalLink className="w-3 h-3 inline mr-1" />
                  Abrir directamente
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
