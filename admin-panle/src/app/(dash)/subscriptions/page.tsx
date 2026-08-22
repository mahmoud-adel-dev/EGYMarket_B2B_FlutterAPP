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
  { value: 'active', label: 'Ù†Ø´Ø·' },
  { value: 'trialing', label: 'ØªØ¬Ø±ÙŠØ¨ÙŠ' },
  { value: 'under_review', label: 'Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©' },
  { value: 'pending_payment', label: 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ø¯ÙØ¹' },
  { value: 'grace_period', label: 'Ù…Ù‡Ù„Ø© Ø³Ù…Ø§Ø­' },
  { value: 'expired', label: 'Ù…Ù†ØªÙ‡ÙŠ' },
  { value: 'canceled', label: 'Ù…Ù„ØºÙŠ' },
  { value: 'rejected', label: 'Ù…Ø±ÙÙˆØ¶' },
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
        title="Ø§Ù„Ø§Ø´ØªØ±Ø§ÙƒØ§Øª"
        description="Ø§Ø´ØªØ±Ø§ÙƒØ§Øª Ø§Ù„Ù…Ø¤Ø³Ø³Ø§Øª ÙÙŠ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø­Ø§Ù„Ø§Øª Ù…Ø¹ Ø§Ù„Ø®Ø·Ø· ÙˆØ¯ÙˆØ±Ø§Øª Ø§Ù„ØªØ¬Ø¯ÙŠØ¯"
        breadcrumb={['Ù„ÙˆØ­Ø© Ø§Ù„ØªØ­ÙƒÙ…', 'Ø§Ù„Ù…Ø§Ù„ÙŠØ©']}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Ø§Ø´ØªØ±Ø§ÙƒØ§Øª Ø¨Ø§Ù„ØµÙØ­Ø©" value={compactNumber(rows.length)} />
        <StatCard label="Ù†Ø´Ø·Ø© Ø¨Ø§Ù„ØµÙØ­Ø©" value={compactNumber(activeCount)} tone="positive" />
        <StatCard
          label="ØªÙ†ØªÙ‡ÙŠ Ø®Ù„Ø§Ù„ Ù§ Ø£ÙŠØ§Ù… (Ø¨Ø§Ù„ØµÙØ­Ø©)"
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
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Ø§Ø³Ù… Ø§Ù„Ù…Ø¤Ø³Ø³Ø©â€¦" />
        </Field>
        <Field label="Ø§Ù„Ø­Ø§Ù„Ø©">
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="w-44">
            <option value="">ÙƒÙ„ Ø§Ù„Ø­Ø§Ù„Ø§Øª</option>
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
              header: 'Ø§Ù„Ù…Ø¤Ø³Ø³Ø©',
              render: (row) => (
                <div className="min-w-36">
                  <p className="font-extrabold">{row.organization_id?.display_name ?? 'â€”'}</p>
                  <p className="text-[11px] text-muted">{row.organization_id?.type ?? ''}</p>
                </div>
              ),
            },
            {
              key: 'plan',
              header: 'Ø§Ù„Ø®Ø·Ø©',
              render: (row) =>
                row.plan_id ? (
                  <div className="text-xs leading-5">
                    <p className="font-bold">{row.plan_id.name_ar}</p>
                    <p className="text-muted">
                      {egp(row.plan_id.price_piasters)} Â· {row.plan_id.billing_interval === 'yearly' ? 'Ø³Ù†ÙˆÙŠ' : 'Ø´Ù‡Ø±ÙŠ'}
                    </p>
                  </div>
                ) : (
                  'â€”'
                ),
            },
            { key: 'status', header: 'Ø§Ù„Ø­Ø§Ù„Ø©', render: (row) => <StatusBadge kind="subscription" value={row.status} /> },
            { key: 'starts', header: 'Ø§Ù„Ø¨Ø¯Ø§ÙŠØ©', align: 'end', render: (row) => <span className="text-xs">{formatDate(row.starts_at)}</span> },
            {
              key: 'ends',
              header: 'Ù†Ù‡Ø§ÙŠØ© Ø§Ù„Ø¯ÙˆØ±Ø©',
              align: 'end',
              render: (row) => <span className="text-xs">{formatDate(row.current_period_ends_at)}</span>,
            },
            {
              key: 'renewal',
              header: 'Ø§Ù„ØªØ¬Ø¯ÙŠØ¯ Ø§Ù„ØªÙ„Ù‚Ø§Ø¦ÙŠ',
              align: 'center',
              render: (row) => (row.cancel_at_period_end ? <span className="text-xs font-bold text-red-600">Ù…ØªÙˆÙ‚Ù</span> : <span className="text-xs text-emerald-700">Ù…ÙØ¹Ù‘Ù„</span>),
            },
          ]}
          rows={query.data?.subscriptions}
          loading={query.isLoading}
          error={query.isError ? (query.error as Error).message : null}
          onRetry={() => query.refetch()}
          emptyTitle="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø§Ø´ØªØ±Ø§ÙƒØ§Øª"
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
