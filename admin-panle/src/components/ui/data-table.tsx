'use client';

import clsx from 'clsx';
import { ArrowDownUp } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  TablePagination,
} from '@/components/data-table';
import { EmptyState, ErrorState, TableSkeleton } from './states';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  width?: string;
  align?: 'start' | 'center' | 'end';
}

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

export function DataTable<T>({
  columns,
  rows,
  loading,
  error,
  onRetry,
  emptyTitle = 'لا توجد بيانات',
  emptyDescription,
  sort,
  onSortChange,
  pagination,
  onPageChange,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  pagination?: { page: number; totalPages: number; total: number };
  onPageChange?: (page: number) => void;
}) {
  if (error && !rows?.length) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-start text-sm">
          <thead>
            <tr className="border-b border-line bg-slate-50/70">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={clsx(
                    'px-4 py-3 text-xs font-extrabold text-muted',
                    column.align === 'end'
                      ? 'text-end'
                      : column.align === 'center'
                        ? 'text-center'
                        : 'text-start',
                  )}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-ink"
                      onClick={() =>
                        onSortChange({
                          key: column.key,
                          dir: sort?.key === column.key && sort.dir === 'desc' ? 'asc' : 'desc',
                        })
                      }
                    >
                      {column.header}
                      <ArrowDownUp
                        size={12}
                        className={clsx(
                          sort?.key === column.key ? 'text-brand-700' : 'text-slate-400',
                        )}
                      />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? null : rows?.length ? (
              rows.map((row, index) => (
                <tr
                  key={(row as { id?: string; _id?: string })?.id ??
                    (row as { _id?: string })?._id ??
                    index}
                  className="border-b border-line/70 transition-colors last:border-0 hover:bg-brand-50/40"
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={clsx(
                        'px-4 py-3 align-middle',
                        column.align === 'end'
                          ? 'text-end'
                          : column.align === 'center'
                            ? 'text-center'
                            : 'text-start',
                      )}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : null}
          </tbody>
        </table>
      </div>

      {loading ? <TableSkeleton /> : null}
      {!loading && !error && !rows?.length ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : null}
      {!loading && error && rows?.length ? (
        <p role="alert" className="px-4 py-2.5 text-xs font-semibold text-red-700">
          تعذر تحديث البيانات: {error}
        </p>
      ) : null}

      {pagination && onPageChange && !loading ? (
        <TablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onChange={onPageChange}
        />
      ) : null}
    </div>
  );
}
