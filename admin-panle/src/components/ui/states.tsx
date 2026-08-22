import clsx from 'clsx';
import { AlertTriangle, Inbox, RefreshCcw } from 'lucide-react';
import { Button } from './button';

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-lg bg-slate-200/70', className)} />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" role="status" aria-label="جارٍ التحميل">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="hidden h-9 w-24 sm:block" />
          <Skeleton className="hidden h-9 w-20 md:block" />
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="جارٍ التحميل">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-28 rounded-2xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="text-slate-300">{icon ?? <Inbox size={44} strokeWidth={1.5} />}</div>
      <p className="text-sm font-extrabold text-ink">{title}</p>
      {description ? <p className="max-w-sm text-xs leading-5 text-muted">{description}</p> : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"
    >
      <AlertTriangle className="text-red-500" size={40} strokeWidth={1.6} />
      <p className="max-w-md text-sm font-semibold text-red-700">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCcw size={14} />
          إعادة المحاولة
        </Button>
      ) : null}
    </div>
  );
}
