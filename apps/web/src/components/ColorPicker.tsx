'use client';

import { useEffect, useRef } from 'react';
import { COLOR_PRESETS } from '@/lib/constants';

interface ColorPickerProps {
  currentColor: string;
  onSelect: (color: string) => void;
  onClose: () => void;
}

export function ColorPicker({ currentColor, onSelect, onClose }: ColorPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      <div
        ref={pickerRef}
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in duration-200"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-800">색상 선택</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-5 gap-3">
          {COLOR_PRESETS.map((color) => (
            <button
              key={color}
              onClick={() => {
                onSelect(color);
                onClose();
              }}
              className={`
                w-10 h-10 rounded-lg
                transition-all duration-200
                hover:scale-110 hover:shadow-md
                ${currentColor === color ? 'ring-2 ring-slate-800 ring-offset-2' : ''}
              `}
              style={{ backgroundColor: color }}
              aria-label={`Select color ${color}`}
            />
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100">
          <label className="block text-sm text-slate-600 mb-2">
            직접 입력
          </label>
          <input
            type="color"
            value={currentColor}
            onChange={(e) => {
              onSelect(e.target.value);
            }}
            className="w-full h-10 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
