'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Input } from './ui/input';

export interface TablePaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}

export function TablePagination({ page, totalPages, total, onChange }: TablePaginationProps) {
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <nav
      aria-label="تصفح الصفحات"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3"
    >
      <p className="text-xs text-muted">
        الإجمالي: <strong className="text-ink">{total.toLocaleString('ar-EG')}</strong>
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={!canPrev}
          aria-label="الصفحة السابقة"
          className="rounded-lg border border-line bg-white p-2 text-ink disabled:opacity-40"
        >
          <ChevronRight size={15} />
        </button>
        <span className="min-w-16 text-center text-xs font-bold text-ink">
          صفحة {page.toLocaleString('ar-EG')} من {Math.max(totalPages, 1).toLocaleString('ar-EG')}
        </span>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={!canNext}
          aria-label="الصفحة التالية"
          className="rounded-lg border border-line bg-white p-2 text-ink disabled:opacity-40"
        >
          <ChevronLeft size={15} />
        </button>
      </div>
    </nav>
  );
}

export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Input
      type="search"
      value={value}
      placeholder={placeholder ?? 'بحث…'}
      aria-label={placeholder ?? 'بحث'}
      onChange={(event) => onChange(event.target.value)}
      className={clsx('sm:w-64', className)}
    />
  );
}

export const DATE_PRESETS = [
  { key: '7d', label: 'آخر ٧ أيام', days: 7 },
  { key: '30d', label: 'آخر ٣٠ يومًا', days: 30 },
  { key: '90d', label: 'آخر ٩٠ يومًا', days: 90 },
] as const;

function isoDay(offsetDaysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDaysFromToday);
  return date.toISOString().slice(0, 10);
}

export interface DateRangeValue {
  from: string;
  to: string;
}

export function defaultDateRange(days = 30): DateRangeValue {
  return { from: isoDay(-days + 1), to: isoDay(0) };
}

export function DateRangeControl({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex overflow-hidden rounded-xl border border-line bg-white">
        {DATE_PRESETS.map((preset) => {
          const active =
            value.from === isoDay(-preset.days + 1) && value.to === isoDay(0);
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => onChange(defaultDateRange(preset.days))}
              aria-pressed={active}
              className={clsx(
                'px-3 py-2 text-xs font-bold transition-colors',
                active ? 'bg-brand-700 text-white' : 'text-muted hover:text-ink',
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={value.from}
          max={value.to}
          aria-label="من تاريخ"
          onChange={(event) =>
            onChange({ ...value, from: event.target.value || isoDay(-29) })
          }
          className="w-36"
        />
        <span className="pb-2 text-xs text-muted">←</span>
        <Input
          type="date"
          value={value.to}
          min={value.from}
          aria-label="إلى تاريخ"
          onChange={(event) => onChange({ ...value, to: event.target.value || isoDay(0) })}
          className="w-36"
        />
      </div>
    </div>
  );
}
