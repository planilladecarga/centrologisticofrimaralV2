'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Search, ChevronDown, X, Plus } from 'lucide-react';

interface DropdownOption {
  value: string;
  display: string;
  sub?: string;
}

interface SearchableDropdownProps {
  label: string;
  placeholder: string;
  options: DropdownOption[];
  selected: string;
  onSelect: (value: string) => void;
  onClear?: () => void;
  icon?: React.ReactNode;
  badge?: string;
  width?: string;
  allowCreate?: boolean;
  onCreate?: (newName: string) => void;
}

export default function SearchableDropdown({
  label, placeholder, options, selected, onSelect, onClear,
  icon, badge, width = 'full', allowCreate = false, onCreate,
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [listPos, setListPos] = useState<React.CSSProperties>({});
  const wrapperRef = useRef<HTMLDivElement>(null);

  const updateListPosition = useCallback(() => {
    if (!isOpen || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropHeight = 400;
    const style: React.CSSProperties = {
      position: 'fixed',
      zIndex: 99999,
      width: rect.width,
      maxHeight: `${dropHeight}px`,
    };
    if (spaceBelow >= dropHeight || spaceBelow >= spaceAbove) {
      style.top = rect.bottom + 4;
    } else {
      style.bottom = window.innerHeight - rect.top + 4;
    }
    style.left = rect.left;
    setListPos(style);
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const measure = () => requestAnimationFrame(() => updateListPosition());
    measure();
    const onScroll = () => measure();
    const onResize = () => measure();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [isOpen, updateListPosition]);

  const filteredOptions = useMemo(() => {
    if (!filter.trim()) return options;
    const term = filter.toLowerCase();
    return options.filter(o =>
      o.value.toLowerCase().includes(term) ||
      o.display.toLowerCase().includes(term) ||
      (o.sub || '').toLowerCase().includes(term)
    );
  }, [filter, options]);

  const exactMatch = useMemo(() => {
    if (!filter.trim()) return false;
    const term = filter.trim().toLowerCase();
    return options.some(o => o.value.toLowerCase() === term);
  }, [filter, options]);

  const selectedDisplay = useMemo(() => {
    if (!selected) return '';
    const found = options.find(o => o.value === selected);
    return found ? found.display : selected;
  }, [selected, options]);

  const handleSelect = useCallback((value: string) => {
    onSelect(value);
    setFilter('');
    setIsOpen(false);
  }, [onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && allowCreate && filter.trim() && !exactMatch) {
      e.preventDefault();
      if (onCreate) {
        onCreate(filter.trim());
        setFilter('');
        setIsOpen(false);
      }
    }
  }, [allowCreate, filter, exactMatch, onCreate]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setFilter('');
  }, []);

  return (
    <div ref={wrapperRef} className="relative" style={{ width: width === 'full' ? '100%' : width }}>
      {/* Label row */}
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
          {icon}
          {label}
        </label>
        {badge && (
          <span className="text-[9px] font-mono text-neutral-400 uppercase">{badge}</span>
        )}
      </div>

      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-mono bg-neutral-50 border border-neutral-200 hover:border-neutral-400 focus:border-neutral-900 outline-none transition-colors text-left"
      >
        <span className={`truncate flex-1 ${selected ? 'text-neutral-900 font-medium' : 'text-neutral-400'}`}>
          {selectedDisplay || placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selected && onClear && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="p-0.5 text-neutral-400 hover:text-red-500 transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div style={listPos} className="bg-white border border-neutral-200 shadow-lg overflow-hidden flex flex-col">
          {/* Search inside dropdown */}
          <div className="p-2 border-b border-neutral-100 bg-neutral-50 shrink-0">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-neutral-200">
              <Search className="w-3 h-3 text-neutral-400 shrink-0" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={allowCreate ? `Buscar o crear ${label.toLowerCase()}...` : `Filtrar ${label.toLowerCase()}...`}
                className="flex-1 text-xs font-mono bg-transparent outline-none placeholder:text-neutral-400"
                autoFocus
              />
            </div>
          </div>

          {/* Options list */}
          <div className="overflow-auto flex-1">
            {filteredOptions.length === 0 && !(allowCreate && filter.trim() && !exactMatch) ? (
              <div className="px-3 py-6 text-center text-[10px] font-mono text-neutral-400 uppercase">
                Sin resultados
              </div>
            ) : (
              <>
                {filteredOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left px-3 py-2.5 text-xs font-mono hover:bg-neutral-50 border-b border-neutral-50 transition-colors flex items-center justify-between gap-2 ${
                      opt.value === selected ? 'bg-neutral-900 text-white hover:bg-neutral-800' : ''
                    }`}
                  >
                    <span className="truncate flex-1">{opt.display}</span>
                    {opt.sub && (
                      <span className={`text-[9px] font-mono shrink-0 ${opt.value === selected ? 'text-neutral-300' : 'text-neutral-400'}`}>
                        {opt.sub}
                      </span>
                    )}
                  </button>
                ))}
                {allowCreate && filter.trim() && !exactMatch && (
                  <button
                    type="button"
                    onClick={() => { onCreate?.(filter.trim()); setFilter(''); setIsOpen(false); }}
                    className="w-full text-left px-3 py-2.5 text-xs font-mono border-t-2 border-dashed border-green-300 bg-green-50 hover:bg-green-100 transition-colors flex items-center justify-between gap-2 text-green-800"
                  >
                    <span className="truncate flex-1 flex items-center gap-2">
                      <Plus className="w-3 h-3 shrink-0" />
                      <span>Crear: <span className="font-bold">{filter.trim()}</span></span>
                    </span>
                    <span className="text-[9px] font-mono text-green-600 shrink-0">
                      ENTER
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
