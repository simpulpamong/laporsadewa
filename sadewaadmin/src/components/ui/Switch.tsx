import React from 'react';
import { cn } from '@/lib/cn';

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
  size = 'md',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const sm = size === 'sm';
  return (
    <label className={cn('inline-flex items-center gap-2.5 select-none', disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !disabled) { e.preventDefault(); onChange(!checked); } }}
        className={cn(
          'relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
          sm ? 'h-5 w-9' : 'h-6 w-11',
          checked
            ? 'bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500'
            : 'bg-slate-200 border-slate-200 dark:bg-slate-700 dark:border-slate-600',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none inline-block rounded-full bg-white shadow-sm ring-0 transition-transform duration-200',
            sm ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5',
            checked ? (sm ? 'translate-x-[18px]' : 'translate-x-[22px]') : 'translate-x-[2px]',
            !sm && 'h-[18px] w-[18px]',
          )}
          style={sm ? undefined : { height: 18, width: 18 }}
        />
      </button>
      {(label || description) ? (
        <span className="min-w-0">
          {label ? <span className={cn('block text-sm', description ? 'font-medium text-slate-700 dark:text-slate-200' : 'text-slate-600 dark:text-slate-300')}>{label}</span> : null}
          {description ? <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</span> : null}
        </span>
      ) : null}
    </label>
  );
}
