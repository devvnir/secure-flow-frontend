'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface CustomDropdownProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  required?: boolean;
}

export default function CustomDropdown({
  label,
  value,
  onChange,
  options,
  required = false,
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div>
      <label className="block text-sm font-semibold text-slate-300 mb-2">
        {label} {required && '*'}
      </label>
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          type="button"
          className="w-full bg-white/5 border border-slate-600/30 rounded-xl px-4 py-3 text-white outline-none focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/10 transition-all duration-300 hover:bg-white/10 flex items-center justify-between"
        >
          <span>{value}</span>
          <ChevronDown
            className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl shadow-2xl backdrop-blur-xl z-50 overflow-hidden">
            {options.map((option) => (
              <button
                key={option}
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                type="button"
                className={`w-full px-4 py-3 text-left text-sm font-medium transition-all duration-200 ${
                  value === option
                    ? 'bg-cyan-500/20 text-cyan-300 border-l-2 border-l-cyan-500'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
