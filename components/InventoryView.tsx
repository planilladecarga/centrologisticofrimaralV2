'use client';

import React from 'react';

interface Props {
  groupedInventory: any[];
  inventoryData: any[];
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  expandedContainers: Set<string>;
  toggleContainer: (key: string) => void;
  cleanNum: (num: string) => string;
  isUploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function InventoryView({ groupedInventory, inventoryData, searchTerm, setSearchTerm, expandedContainers, toggleContainer, cleanNum, isUploading, fileInputRef, handleFileUpload }: Props) {
  return (
    <div className="p-8 flex-1 overflow-auto flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-end mb-8 border-b border-neutral-200 pb-6">
        <div>
          <h2 className="text-2xl font-light tracking-tight text-neutral-900 uppercase">Control de Inventario</h2>
          <p className="text-xs font-mono text-neutral-500 mt-2 uppercase tracking-widest">
            {groupedInventory.length} contenedor{groupedInventory.length !== 1 ? 'es' : ''} · {inventoryData.length} ítems totales{searchTerm ? ' (filtrado)' : ''}
          </p>
        </div>
        <div>
          <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload}
            ref={fileInputRef} className="hidden" id="excel-upload" disabled={isUploading} />
          <label htmlFor="excel-upload"
            className={`px-5 py-2.5 text-xs font-mono uppercase tracking-widest transition-colors inline-block ${isUploading ? 'bg-neutral-400 text-white cursor-not-allowed' : 'bg-neutral-900 text-white hover:bg-neutral-800 cursor-pointer'}`}>    
            {isUploading ? '[...] Subiendo a la Nube...' : '[+] Cargar Excel'}
          </label>
        </div>
      </div>

      {/* Enhanced Search Bar */}
      <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="🔍 Buscar por: Cliente • Número de Cliente (10330) • Descripción • Kilos"
              className="w-full px-4 py-3 text-xs font-mono uppercase bg-white border border-blue-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-200 outline-none transition-all rounded placeholder:text-neutral-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="px-4 py-3 bg-white border border-blue-300 text-blue-600 hover:bg-blue-50 font-mono text-xs uppercase tracking-widest transition-colors rounded"
            >
              ✕ Limpiar
            </button>
          )}
        </div>
        {searchTerm && (
          <p className="text-[10px] font-mono text-blue-700 mt-2">
            📦 {groupedInventory.length} contenedor{groupedInventory.length !== 1 ? 'es' : ''} encontrado{groupedInventory.length !== 1 ? 's' : ''} • {groupedInventory.reduce((acc, g) => acc + g.items.length, 0)} producto{groupedInventory.reduce((acc, g) => acc + g.items.length, 0) !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Content */}
      {inventoryData.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center rounded-lg">
          <p className="text-sm font-mono uppercase tracking-widest text-neutral-500 mb-4">No hay datos en el inventario</p>
          <label htmlFor="excel-upload" className="text-xs font-mono uppercase tracking-widest text-neutral-900 underline underline-offset-4 cursor-pointer hover:text-neutral-600">
            Cargar archivo .xlsx para comenzar
          </label>
        </div>
      ) : groupedInventory.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center border border-neutral-200 bg-white p-12 text-center rounded-lg">
          <p className="text-sm font-mono uppercase tracking-widest text-neutral-400 mb-2">Sin resultados</p>
          <p className="text-xs font-mono text-neutral-400">No se encontraron ítems que coincidan con &quot;{searchTerm}&quot;</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto flex flex-col gap-3">
          {groupedInventory.map((group, groupIdx) => {
            const isExpanded = expandedContainers.has(group.contenedor);
            return (
              <div key={group.contenedor} className="border border-neutral-300 bg-gradient-to-br from-white to-neutral-50 overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-all">
                {/* Container Header */}
                <button onClick={() => toggleContainer(group.contenedor)} className="w-full flex items-center justify-between p-5 hover:bg-neutral-100 transition-colors text-left group">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className={`text-neutral-500 transition-transform shrink-0 font-bold text-lg group-hover:text-neutral-700 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                    <div className="flex-1 min-w-0">
                      {/* Container Title */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-mono uppercase tracking-widest text-white bg-gradient-to-r from-neutral-800 to-neutral-700 px-3 py-1.5 rounded font-bold">
                          🏭 {group.contenedor}
                        </span>
                        <span className="text-neutral-300">|</span>
                        <span className="text-xs font-mono uppercase tracking-widest text-neutral-700 truncate font-medium">
                          {group.clientes.join(', ')}
                        </span>
                      </div>

                      {/* Stats Row */}
                      <div className="flex items-center gap-4 mt-2.5 text-[10px] font-mono text-neutral-600 flex-wrap">
                        <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded font-semibold">{group.items.length} producto{group.items.length !== 1 ? 's' : ''}</span>
                        <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded font-semibold">{group.totalPallets} pallets</span>
                        <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded font-semibold">{group.totalCajas} cajas</span>
                        <span className="px-2.5 py-1 bg-purple-100 text-purple-800 rounded font-semibold">{group.totalKilos.toFixed(1)} kg</span>
                      </div>
                    </div>
                  </div>

                  {/* Container Number Badge */}
                  <div className="text-[10px] font-mono text-white bg-neutral-500 px-3 py-1.5 rounded-full shrink-0 ml-4 font-semibold">#{groupIdx + 1}</div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-neutral-300 bg-neutral-50">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-sans">
                        {/* Table Header */}
                        <thead className="bg-gradient-to-r from-neutral-800 to-neutral-700 sticky top-0">
                          <tr>
                            <th className="p-4 text-white font-mono uppercase tracking-widest text-[10px] font-bold">Lote</th>
                            <th className="p-4 text-white font-mono uppercase tracking-widest text-[10px] font-bold">Descripción</th>
                            <th className="p-4 text-white font-mono uppercase tracking-widest text-[10px] font-bold text-right">Cajas</th>
                            <th className="p-4 text-white font-mono uppercase tracking-widest text-[10px] font-bold text-right">Kilos</th>
                            <th className="p-4 text-white font-mono uppercase tracking-widest text-[10px] font-bold text-right">Pallets</th>
                          </tr>
                        </thead>

                        {/* Table Body */}
                        <tbody className="divide-y divide-neutral-200">
                          {group.items.map((item, idx) => (
                            <tr key={item.id || idx} className="hover:bg-blue-50 transition-colors hover:shadow-sm">
                              <td className="p-4 font-mono font-bold text-blue-700 whitespace-nowrap text-sm bg-blue-50/50 border-l-4 border-blue-500">{cleanNum(item.numeroCliente)}</td>
                              <td className="p-4 font-medium text-neutral-800 max-w-xs truncate" title={item.producto}>{item.producto}</td>
                              <td className="p-4 text-right font-mono text-neutral-900 font-semibold">{item.cantidad}</td>
                              <td className="p-4 text-right font-mono text-neutral-900 font-semibold">{Number(item.kilos).toFixed(1)}</td>
                              <td className="p-4 text-right"><span className={`px-3 py-1.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-widest ${item.pallets > 1 ? 'bg-green-100 text-green-900 border border-green-300' : 'bg-neutral-200 text-neutral-700'}`}>{item.pallets}</span></td>
                            </tr>
                          ))}
                        </tbody>

                        {/* Subtotal Row */}
                        <tfoot>
                          <tr className="bg-gradient-to-r from-neutral-900 to-neutral-800 border-t-4 border-neutral-700">
                            <td className="p-4 font-mono uppercase tracking-widest text-[10px] text-white font-bold" colSpan={2}>📊 Subtotal</td>
                            <td className="p-4 text-right font-mono font-bold text-white text-sm">{group.totalCajas}</td>
                            <td className="p-4 text-right font-mono font-bold text-white text-sm">{group.totalKilos.toFixed(1)}</td>
                            <td className="p-4 text-right font-mono font-bold text-white text-sm">{group.totalPallets}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}