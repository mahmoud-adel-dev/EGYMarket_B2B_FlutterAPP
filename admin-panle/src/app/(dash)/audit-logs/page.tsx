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
        title="Ø³Ø¬ï¿½ Ø§ï¿½ØªØ¯ï¿½ï¿½`ï¿½"
        description="Ø³Ø¬ï¿½ Øºï¿½`Ø± ï¿½Ø§Ø¨ï¿½ ï¿½ï¿½ØªØ¹Ø¯ï¿½`ï¿½ ï¿½Ù’ï¿½ Ø§ï¿½Ø¹ï¿½&ï¿½ï¿½`Ø§Øª Ø§ï¿½Ø¥Ø¯Ø§Ø±ï¿½`Ø© Ø§ï¿½Ø­Ø³Ø§Ø³Ø©: Ø§ï¿½Øªï¿½ï¿½Ø«ï¿½`ï¿½ï¿½R Ø§ï¿½Ùï¿½ï¿½Ø§Øªï¿½`Ø±ï¿½R Ø§ï¿½ï¿½ Ø²Ø§Ø¹Ø§Øªï¿½R Ø§ï¿½Ø­Ø³Ø§Ø¨Ø§Øª"
        breadcrumb={['ï¿½ï¿½ï¿½Ø­Ø© Ø§ï¿½ØªØ­Ù’ï¿½&', 'Ø§ï¿½Ø¥Ø¯Ø§Ø±Ø©']}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <StatCard label="Ø¥Ø¬ï¿½&Ø§ï¿½ï¿½` Ø§ï¿½Ø³Ø¬ï¿½Ø§Øª" value={(query.data?.pagination.total ?? 0).toLocaleString('ar-EG')} />
        <StatCard
          label="Ø¢Ø®Ø± Ø¥Ø¬Ø±Ø§Ø¡ ï¿½&Ø³Ø¬ï¿½ï¿½"
          value={<span className="text-sm">{query.data?.logs[0]?.action ?? 'ï¿½'}</span>}
          hint={query.data?.logs[0] ? formatDateTime(query.data.logs[0].createdAt) : undefined}
        />
      </div>

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <Field label="ï¿½ ï¿½ï¿½Ø¹ Ø§ï¿½Ø¥Ø¬Ø±Ø§Ø¡ (Ø¨Ø§ï¿½Ø¥ï¿½ Ø¬ï¿½ï¿½`Ø²ï¿½`Ø©)">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="organization_verifiedâ¬¦" />
        </Field>
        <Field label="ï¿½ ï¿½ï¿½Ø¹ Ø§ï¿½Ù’ï¿½`Ø§ï¿½ ">
          <Select value={entityType} onChange={(event) => { setEntityType(event.target.value); setPage(1); }} className="w-52">
            <option value="">Ø§ï¿½Ù’ï¿½</option>
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
              header: 'Ø§ï¿½ï¿½&Ø³Ø¤ï¿½ï¿½ï¿½',
              render: (row) => (
                <div className="min-w-32">
                  <p className="font-bold">{row.actor_user_id?.name ?? 'ï¿½ Ø¸Ø§ï¿½&'}</p>
                  <p className="text-[11px] text-muted" dir="ltr">{row.actor_user_id?.email}</p>
                </div>
              ),
            },
            {
              key: 'action',
              header: 'Ø§ï¿½Ø¥Ø¬Ø±Ø§Ø¡',
              render: (row) => (
                <Badge tone={row.action.includes('reject') || row.action.includes('suspend') || row.action.includes('deactivated') ? 'red' : row.action.includes('approved') || row.action.includes('verified') || row.action.includes('activated') ? 'green' : 'blue'}>
                  {row.action}
                </Badge>
              ),
            },
            {
              key: 'entity',
              header: 'Ø§ï¿½Ù’ï¿½`Ø§ï¿½ ',
              render: (row) => (
                <div className="text-xs leading-5">
                  <p className="font-bold">{row.entity_type}</p>
                  {row.entity_id ? (
                    <p className="text-muted" dir="ltr">{row.entity_id.slice(0, 10)}â¬¦</p>
                  ) : null}
                </div>
              ),
            },
            {
              key: 'metadata',
              header: 'ØªÙØ§Øµï¿½`ï¿½',
              render: (row) => {
                if (!row.metadata || !Object.keys(row.metadata).length) return <span className="text-muted">ï¿½</span>;
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
              render: (row) => <span dir="ltr" className="text-xs text-muted">{row.ip_address ?? 'ï¿½'}</span>,
            },
            {
              key: 'createdAt',
              header: 'Ø§ï¿½Øªï¿½ï¿½ï¿½ï¿½`Øª',
              align: 'end',
              render: (row) => <span className="whitespace-nowrap text-xs text-muted">{formatDateTime(row.createdAt)}</span>,
            },
          ]}
          rows={query.data?.logs}
          loading={query.isLoading}
          error={query.isError ? (query.error as Error).message : null}
          onRetry={() => query.refetch()}
          emptyTitle="ï¿½Ø§ Øªï¿½ï¿½Ø¬Ø¯ Ø³Ø¬ï¿½Ø§Øª ØªØ¯ï¿½ï¿½`ï¿½ ï¿½&Ø·Ø§Ø¨ï¿½Ø©"
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

