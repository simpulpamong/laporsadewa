'use client';

import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { ScrollArea } from './ScrollArea';

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function Dropdown({
  value,
  options,
  onChange,
  ariaLabel = 'Pilih opsi',
  className,
  disabled = false,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [focusedIndex, setFocusedIndex] = useState(selectedIndex);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (open) optionRefs.current[focusedIndex]?.focus();
  }, [open, focusedIndex]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  const choose = (option: DropdownOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === 'Tab' && open) {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      if (!open) {
        setFocusedIndex(selectedIndex);
        setOpen(true);
      } else {
        setFocusedIndex((current) => (current + direction + options.length) % options.length);
      }
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      const option = options[focusedIndex];
      if (option) choose(option);
    }
  };

  return (
    <div ref={rootRef} className={clsx('relative w-full', className)} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled || options.length === 0}
        onClick={() => {
          setFocusedIndex(selectedIndex);
          setOpen((current) => !current);
        }}
        className={clsx(
          'flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 px-3 py-2 text-left text-sm text-slate-800 dark:text-slate-100 shadow-sm transition',
          'hover:border-slate-400 dark:hover:border-slate-600 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20',
          'disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:text-slate-400',
        )}
      >
        <span className="truncate">{selectedOption?.label ?? 'Pilih opsi'}</span>
        <ChevronDown size={16} className={clsx('shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <ScrollArea
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute inset-x-0 top-[calc(100%+6px)] z-[1000] max-h-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 shadow-[0_14px_36px_rgba(15,23,42,0.18)] ring-1 ring-black/5"
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <div
                key={option.value}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="option"
                aria-selected={selected}
                aria-disabled={option.disabled || undefined}
                tabIndex={option.disabled ? -1 : 0}
                onMouseEnter={() => !option.disabled && setFocusedIndex(index)}
                onClick={() => choose(option)}
                className={clsx(
                  'flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm transition',
                  selected ? 'bg-blue-50 dark:bg-blue-500/15 font-semibold text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800',
                  option.disabled && 'cursor-not-allowed opacity-40',
                  focusedIndex === index && 'outline-none ring-2 ring-inset ring-blue-500/25',
                )}
              >
                <span className="truncate">{option.label}</span>
                {selected ? <Check size={15} className="shrink-0" /> : null}
              </div>
            );
          })}
        </ScrollArea>
      ) : null}
    </div>
  );
}
