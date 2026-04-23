'use client';

import React from 'react';
import {
  Thermometer, ExternalLink, Monitor,
} from 'lucide-react';

const TEMPERATURA_URL = 'http://192.168.150.31/TemperaturaWeb/temperatura.php';

export default function TemperatureMonitor() {
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
              Servidor interno · 192.168.150.31
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-neutral-50 flex items-center justify-center p-8">
        <div className="text-center max-w-lg">
          {/* Icon */}
          <div className="w-24 h-24 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center mx-auto mb-6">
            <Monitor className="w-12 h-12 text-blue-500" />
          </div>

          <h3 className="text-xl font-mono uppercase tracking-widest text-neutral-900 mb-3">
            Monitoreo de Temperaturas
          </h3>

          <p className="text-sm text-neutral-600 mb-6 leading-relaxed">
            El sistema de temperatura se encuentra en el servidor interno de la empresa.
            Hacé clic en el botón de abajo para abrirlo en una nueva pestaña.
          </p>

          {/* Main button */}
          <a
            href={TEMPERATURA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-8 py-4 bg-blue-600 text-white hover:bg-blue-700 text-sm font-mono uppercase tracking-widest transition-colors rounded-lg shadow-lg"
          >
            <ExternalLink className="w-5 h-5" />
            Abrir Monitoreo de Temperaturas
          </a>

          {/* Info */}
          <div className="mt-8 bg-neutral-100 border border-neutral-200 rounded-lg p-4 text-left">
            <p className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 mb-2">
              Datos del servidor
            </p>
            <div className="space-y-1.5 text-xs text-neutral-600 font-mono">
              <p><span className="text-neutral-400">URL:</span> {TEMPERATURA_URL}</p>
              <p><span className="text-neutral-400">Red:</span> Solo accesible desde la red interna de la empresa</p>
              <p><span className="text-neutral-400">Protocolo:</span> HTTP (no se puede embeber en HTTPS)</p>
            </div>
          </div>

          {/* Why explanation */}
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 text-left">
            <p className="text-xs text-amber-800">
              <strong>Nota:</strong> El monitoreo no se puede mostrar dentro de esta ventana porque
              la app está en HTTPS (GitHub Pages) y el servidor de temperatura usa HTTP.
              El navegador bloquea contenido mixto por seguridad.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
