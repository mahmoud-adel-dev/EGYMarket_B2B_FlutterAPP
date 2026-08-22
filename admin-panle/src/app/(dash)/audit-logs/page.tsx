'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { adminOpsService } from '@/services/admin-ops.service';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput, useDebouncedValue } from '@/components/data-table';
import { PageHeader, StatCard } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/format';
import type { AuditLogRow } from '@/types/api';

const ENTITY_OPTIONS = [
  'Organization',
  'SubscriptionInvoice',
  'Dispute',
  'PaymentObligation',
  'User',
];

export default function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  const query = useQuery({
    queryKey: ['admin-audit-logs', page, debouncedSearch, entityType],
    queryFn: () =>
      adminOpsService.auditLogs({
        page,
        limit: 20,
        action: debouncedSearch || undefined,
        entity_type: entityType || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader
        title="Ø³Ø¬Ù„ Ø§Ù„ØªØ¯Ù‚ÙŠÙ‚"
        description="Ø³Ø¬Ù„ ØºÙŠØ± Ù‚Ø§Ø¨Ù„ Ù„Ù„ØªØ¹Ø¯ÙŠÙ„ Ù„ÙƒÙ„ Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„Ø¥Ø¯Ø§Ø±ÙŠØ© Ø§Ù„Ø­Ø³Ø§Ø³Ø©: Ø§Ù„ØªÙˆØ«ÙŠÙ‚ØŒ Ø§Ù„ÙÙˆØ§ØªÙŠØ±ØŒ Ø§Ù„Ù†Ø²Ø§Ø¹Ø§ØªØŒ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª"
        breadcrumb={['Ù„ÙˆØ­Ø© Ø§Ù„ØªØ­ÙƒÙ…', 'Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©']}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <StatCard label="Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø³Ø¬Ù„Ø§Øª" value={(query.data?.pagination.total ?? 0).toLocaleString('ar-EG')} />
        <StatCard
          label="Ø¢Ø®Ø± Ø¥Ø¬Ø±Ø§Ø¡ Ù…Ø³Ø¬Ù‘Ù„"
          value={<span className="text-sm">{query.data?.logs[0]?.action ?? 'â€”'}</span>}
          hint={query.data?.logs[0] ? formatDateTime(query.data.logs[0].createdAt) : undefined}
        />
      </div>

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <Field label="Ù†ÙˆØ¹ Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡ (Ø¨Ø§Ù„Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ©)">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="organization_verifiedâ€¦" />
        </Field>
        <Field label="Ù†ÙˆØ¹ Ø§Ù„ÙƒÙŠØ§Ù†">
          <Select value={entityType} onChange={(event) => { setEntityType(event.target.value); setPage(1); }} className="w-52">
            <option value="">Ø§Ù„ÙƒÙ„</option>
            {ENTITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card>
        <DataTable<AuditLogRow>
          columns={[
            {
              key: 'actor',
              header: 'Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„',
              render: (row) => (
                <div className="min-w-32">
                  <p className="font-bold">{row.actor_user_id?.name ?? 'Ù†Ø¸Ø§Ù…'}</p>
                  <p className="text-[11px] text-muted" dir="ltr">{row.actor_user_id?.email}</p>
                </div>
              ),
            },
            {
              key: 'action',
              header: 'Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡',
              render: (row) => (
                <Badge tone={row.action.includes('reject') || row.action.includes('suspend') || row.action.includes('deactivated') ? 'red' : row.action.includes('approved') || row.action.includes('verified') || row.action.includes('activated') ? 'green' : 'blue'}>
                  {row.action}
                </Badge>
              ),
            },
            {
              key: 'entity',
              header: 'Ø§Ù„ÙƒÙŠØ§Ù†',
              render: (row) => (
                <div className="text-xs leading-5">
                  <p className="font-bold">{row.entity_type}</p>
                  {row.entity_id ? (
                    <p className="text-muted" dir="ltr">{row.entity_id.slice(0, 10)}â€¦</p>
                  ) : null}
                </div>
              ),
            },
            {
              key: 'metadata',
              header: 'ØªÙØ§ØµÙŠÙ„',
              render: (row) => {
                if (!row.metadata || !Object.keys(row.metadata).length) return <span className="text-muted">â€”</span>;
                const summary = Object.entries(row.metadata as Record<string, unknown>)
                  .slice(0, 3)
                  .map(([key, value]) => `${key}: ${String(value).slice(0, 40)}`)
                  .join(' Â· ');
                return <span className="text-[11px] text-muted" dir="ltr">{summary}</span>;
              },
            },
            {
              key: 'ip',
              header: 'IP',
              render: (row) => <span dir="ltr" className="text-xs text-muted">{row.ip_address ?? 'â€”'}</span>,
            },
            {
              key: 'createdAt',
              header: 'Ø§Ù„ØªÙˆÙ‚ÙŠØª',
              align: 'end',
              render: (row) => <span className="whitespace-nowrap text-xs text-muted">{formatDateTime(row.createdAt)}</span>,
            },
          ]}
          rows={query.data?.logs}
          loading={query.isLoading}
          error={query.isError ? (query.error as Error).message : null}
          onRetry={() => query.refetch()}
          emptyTitle="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø³Ø¬Ù„Ø§Øª ØªØ¯Ù‚ÙŠÙ‚ Ù…Ø·Ø§Ø¨Ù‚Ø©"
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
