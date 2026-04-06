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
      {/* Buscador Mejorado */}
      <div className="mb-6 p-4 bg-gradient-to-r from-blue-400 to-blue-100 border border-blue-300 rounded-xl shadow flex items-center gap-3 transition-all duration-300">
        <input
          type="text"
          placeholder="🔍 Buscar por cliente, número, descripción, kilos..."
          className="w-full px-4 py-3 text-xs font-mono uppercase bg-white border border-blue-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-200 outline-none rounded-lg placeholder:text-blue-400 shadow-inner transition-all duration-300"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {!!searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="px-4 py-3 bg-blue-50 border border-blue-300 text-blue-600 hover:bg-blue-100 font-mono text-xs uppercase tracking-widest rounded-lg transition-colors shadow"
          >✕ Limpiar</button>
        )}
      </div>
      <div className="flex-1 flex flex-col gap-4">
        {groupedInventory.map((group, groupIdx) => {
          const isExpanded = expandedContainers.has(group.contenedor);
          return (
            <div key={group.contenedor} className="border border-neutral-300 bg-gradient-to-br from-white to-neutral-50 overflow-hidden rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300">
              {/* Aquí iría tu lógica para mostrar cada grupo/contenedor */}
            </div>
          );
        })}
      </div>
    </div>
  );
}