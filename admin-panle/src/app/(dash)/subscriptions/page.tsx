'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { subscriptionsService } from '@/services/subscriptions.service';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput, useDebouncedValue } from '@/components/data-table';
import { PageHeader, StatCard } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { compactNumber, egp, formatDate } from '@/lib/format';
import type { AdminSubscription } from '@/types/api';

const STATUS_OPTIONS = [
  { value: 'active', label: 'ï¿½ Ø´Ø·' },
  { value: 'trialing', label: 'ØªØ¬Ø±ï¿½`Ø¨ï¿½`' },
  { value: 'under_review', label: 'ï¿½ï¿½`Ø¯ Ø§ï¿½ï¿½&Ø±Ø§Ø¬Ø¹Ø©' },
  { value: 'pending_payment', label: 'Ø¨Ø§ï¿½ ØªØ¸Ø§Ø± Ø§ï¿½Ø¯ÙØ¹' },
  { value: 'grace_period', label: 'ï¿½&ï¿½!ï¿½Ø© Ø³ï¿½&Ø§Ø­' },
  { value: 'expired', label: 'ï¿½&ï¿½ Øªï¿½!ï¿½`' },
  { value: 'canceled', label: 'ï¿½&ï¿½Øºï¿½`' },
  { value: 'rejected', label: 'ï¿½&Ø±Ùï¿½ï¿½Ø¶' },
];

export default function SubscriptionsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  const query = useQuery({
    queryKey: ['admin-subscriptions', page, debouncedSearch, status],
    queryFn: () =>
      subscriptionsService.list({
        page,
        limit: 15,
        q: debouncedSearch || undefined,
        status: status || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.subscriptions ?? [];
  const activeCount = rows.filter((row) => row.status === 'active').length;

  return (
    <div>
      <PageHeader
        title="Ø§ï¿½Ø§Ø´ØªØ±Ø§Ù’Ø§Øª"
        description="Ø§Ø´ØªØ±Ø§Ù’Ø§Øª Ø§ï¿½ï¿½&Ø¤Ø³Ø³Ø§Øª Ùï¿½` Ø¬ï¿½&ï¿½`Ø¹ Ø§ï¿½Ø­Ø§ï¿½Ø§Øª ï¿½&Ø¹ Ø§ï¿½Ø®Ø·Ø· ï¿½ï¿½Ø¯ï¿½ï¿½Ø±Ø§Øª Ø§ï¿½ØªØ¬Ø¯ï¿½`Ø¯"
        breadcrumb={['ï¿½ï¿½ï¿½Ø­Ø© Ø§ï¿½ØªØ­Ù’ï¿½&', 'Ø§ï¿½ï¿½&Ø§ï¿½ï¿½`Ø©']}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Ø§Ø´ØªØ±Ø§Ù’Ø§Øª Ø¨Ø§ï¿½ØµÙØ­Ø©" value={compactNumber(rows.length)} />
        <StatCard label="ï¿½ Ø´Ø·Ø© Ø¨Ø§ï¿½ØµÙØ­Ø©" value={compactNumber(activeCount)} tone="positive" />
        <StatCard
          label="Øªï¿½ Øªï¿½!ï¿½` Ø®ï¿½Ø§ï¿½ Ù§ Ø£ï¿½`Ø§ï¿½& (Ø¨Ø§ï¿½ØµÙØ­Ø©)"
          value={compactNumber(
            rows.filter((row) => {
              const end = new Date(row.current_period_ends_at).getTime();
              const week = Date.now() + 7 * 86_400_000;
              return row.status === 'active' && end <= week;
            }).length,
          )}
          tone="warning"
        />
      </div>

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <Field label="Ø¨Ø­Ø«">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Ø§Ø³ï¿½& Ø§ï¿½ï¿½&Ø¤Ø³Ø³Ø©â¬¦" />
        </Field>
        <Field label="Ø§ï¿½Ø­Ø§ï¿½Ø©">
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="w-44">
            <option value="">Ù’ï¿½ Ø§ï¿½Ø­Ø§ï¿½Ø§Øª</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card>
        <DataTable<AdminSubscription>
          columns={[
            {
              key: 'organization',
              header: 'Ø§ï¿½ï¿½&Ø¤Ø³Ø³Ø©',
              render: (row) => (
                <div className="min-w-36">
                  <p className="font-extrabold">{row.organization_id?.display_name ?? 'ï¿½'}</p>
                  <p className="text-[11px] text-muted">{row.organization_id?.type ?? ''}</p>
                </div>
              ),
            },
            {
              key: 'plan',
              header: 'Ø§ï¿½Ø®Ø·Ø©',
              render: (row) =>
                row.plan_id ? (
                  <div className="text-xs leading-5">
                    <p className="font-bold">{row.plan_id.name_ar}</p>
                    <p className="text-muted">
                      {egp(row.plan_id.price_piasters)} Â· {row.plan_id.billing_interval === 'yearly' ? 'Ø³ï¿½ ï¿½ï¿½ï¿½`' : 'Ø´ï¿½!Ø±ï¿½`'}
                    </p>
                  </div>
                ) : (
                  'ï¿½'
                ),
            },
            { key: 'status', header: 'Ø§ï¿½Ø­Ø§ï¿½Ø©', render: (row) => <StatusBadge kind="subscription" value={row.status} /> },
            { key: 'starts', header: 'Ø§ï¿½Ø¨Ø¯Ø§ï¿½`Ø©', align: 'end', render: (row) => <span className="text-xs">{formatDate(row.starts_at)}</span> },
            {
              key: 'ends',
              header: 'ï¿½ ï¿½!Ø§ï¿½`Ø© Ø§ï¿½Ø¯ï¿½ï¿½Ø±Ø©',
              align: 'end',
              render: (row) => <span className="text-xs">{formatDate(row.current_period_ends_at)}</span>,
            },
            {
              key: 'renewal',
              header: 'Ø§ï¿½ØªØ¬Ø¯ï¿½`Ø¯ Ø§ï¿½Øªï¿½ï¿½Ø§Ø¦ï¿½`',
              align: 'center',
              render: (row) => (row.cancel_at_period_end ? <span className="text-xs font-bold text-red-600">ï¿½&Øªï¿½ï¿½ï¿½Ù</span> : <span className="text-xs text-emerald-700">ï¿½&ÙØ¹ï¿½ï¿½</span>),
            },
          ]}
          rows={query.data?.subscriptions}
          loading={query.isLoading}
          error={query.isError ? (query.error as Error).message : null}
          onRetry={() => query.refetch()}
          emptyTitle="ï¿½Ø§ Øªï¿½ï¿½Ø¬Ø¯ Ø§Ø´ØªØ±Ø§Ù’Ø§Øª"
          pagination={{
            page,
            totalPages: query.data?.pagination.total_pages ?? 1,
            total: query.data?.pagination.total ?? 0,
          }}
          onPageChange={setPage}
        />
      </Card>
    </div>
  );
}

