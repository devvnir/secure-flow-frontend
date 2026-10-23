'use client';

import { useCallback, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cx, useClickOutside } from '@/components/ui';

export type DropdownOption = string | { value: string; label: string; description?: string };

interface CustomDropdownProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  required?: boolean;
  ariaLabel?: string;
  className?: string;
}

const normalize = (o: DropdownOption) => (typeof o === 'string' ? { value: o, label: o } : o);

export default function CustomDropdown({ label, value, onChange, options, required = false, ariaLabel, className }: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  const ref = useClickOutside<HTMLDivElement>(close);
  const items = options.map(normalize);
  const selected = items.find((o) => o.value === value);

  return (
    <div className={className}>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-slate-200">
          {label}
          {required && <span className="ml-0.5 text-sky-400">*</span>}
        </label>
      )}
      <div ref={ref} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={ariaLabel ?? label}
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
          className={cx(
            'flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-slate-950/60 px-3 text-sm text-slate-100 outline-none transition-colors',
            isOpen ? 'border-sky-500 ring-2 ring-sky-500/20' : 'border-slate-700 hover:border-slate-600'
          )}
        >
          <span className="truncate">{selected?.label ?? value}</span>
          <ChevronDown className={cx('h-4 w-4 shrink-0 text-slate-400 transition-transform', isOpen && 'rotate-180')} />
        </button>

        {isOpen && (
          <div role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-72 overflow-auto rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl shadow-black/40">
            {items.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={value === option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cx('flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors', value === option.value ? 'bg-sky-500/10 text-sky-200' : 'text-slate-200 hover:bg-slate-800')}
              >
                <span className="truncate">{option.label}</span>
                {value === option.value && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
