'use client';

import React from 'react';

export default function LoadingScreen() {
  return (
    <div className="absolute inset-0 z-40 bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-6 border-4 border-neutral-200 dark:border-neutral-700 border-t-blue-600 rounded-full animate-spin" />
        <h2 className="text-lg font-mono uppercase tracking-widest text-neutral-900 dark:text-neutral-100">Frimaral</h2>
        <p className="text-xs font-mono text-neutral-500 mt-2 uppercase tracking-widest">Cargando sistema...</p>
        {/* Skeleton KPIs */}
        <div className="flex gap-4 mt-8 justify-center">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="w-36 h-24 bg-neutral-200 dark:bg-neutral-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
