import { ArrowRight } from 'lucide-react';

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumb?: string[];
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      {breadcrumb?.length ? (
        <nav aria-label="مسار التنقل" className="mb-2 flex items-center gap-1.5 text-xs text-muted">
          <ArrowRight size={12} className="rtl:rotate-0" aria-hidden />
          <ol className="flex flex-wrap items-center gap-1.5">
            {breadcrumb.map((crumb, index) => (
              <li key={crumb} className="flex items-center gap-1.5">
                {index > 0 ? <span aria-hidden>/</span> : null}
                <span className={index === breadcrumb.length - 1 ? 'font-bold text-ink' : ''}>
                  {crumb}
                </span>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-ink">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'positive' | 'warning' | 'danger';
}) {
  const toneRing =
    tone === 'positive'
      ? 'ring-emerald-100 bg-emerald-50/60'
      : tone === 'warning'
        ? 'ring-amber-100 bg-amber-50/60'
        : tone === 'danger'
          ? 'ring-red-100 bg-red-50/60'
          : 'ring-line bg-white';
  return (
    <div className={`rounded-2xl p-4 shadow-[0_1px_2px_rgba(16,35,58,0.04)] ring-1 ${toneRing}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-muted">{label}</p>
        {icon ? <span className="text-brand-700">{icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-ink">{value}</p>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}
