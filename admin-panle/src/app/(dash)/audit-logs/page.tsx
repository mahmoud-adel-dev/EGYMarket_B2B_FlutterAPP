�'use client';

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
        title="سج� ا�تد��`�"
        description="سج� غ�`ر �اب� ��تعد�`� �ْ� ا�ع�&��`ات ا�إدار�`ة ا�حساسة: ا�ت��ث�`��R ا�ف��ات�`ر�R ا�� زاعات�R ا�حسابات"
        breadcrumb={['���حة ا�تحْ�&', 'ا�إدارة']}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <StatCard label="إج�&ا��` ا�سج�ات" value={(query.data?.pagination.total ?? 0).toLocaleString('ar-EG')} />
        <StatCard
          label="آخر إجراء �&سج��"
          value={<span className="text-sm">{query.data?.logs[0]?.action ?? '�'}</span>}
          hint={query.data?.logs[0] ? formatDateTime(query.data.logs[0].createdAt) : undefined}
        />
      </div>

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <Field label="� ��ع ا�إجراء (با�إ� ج��`ز�`ة)">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="organization_verified⬦" />
        </Field>
        <Field label="� ��ع ا�ْ�`ا� ">
          <Select value={entityType} onChange={(event) => { setEntityType(event.target.value); setPage(1); }} className="w-52">
            <option value="">ا�ْ�</option>
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
              header: 'ا��&سؤ���',
              render: (row) => (
                <div className="min-w-32">
                  <p className="font-bold">{row.actor_user_id?.name ?? '� ظا�&'}</p>
                  <p className="text-[11px] text-muted" dir="ltr">{row.actor_user_id?.email}</p>
                </div>
              ),
            },
            {
              key: 'action',
              header: 'ا�إجراء',
              render: (row) => (
                <Badge tone={row.action.includes('reject') || row.action.includes('suspend') || row.action.includes('deactivated') ? 'red' : row.action.includes('approved') || row.action.includes('verified') || row.action.includes('activated') ? 'green' : 'blue'}>
                  {row.action}
                </Badge>
              ),
            },
            {
              key: 'entity',
              header: 'ا�ْ�`ا� ',
              render: (row) => (
                <div className="text-xs leading-5">
                  <p className="font-bold">{row.entity_type}</p>
                  {row.entity_id ? (
                    <p className="text-muted" dir="ltr">{row.entity_id.slice(0, 10)}⬦</p>
                  ) : null}
                </div>
              ),
            },
            {
              key: 'metadata',
              header: 'تفاص�`�',
              render: (row) => {
                if (!row.metadata || !Object.keys(row.metadata).length) return <span className="text-muted">�</span>;
                const summary = Object.entries(row.metadata as Record<string, unknown>)
                  .slice(0, 3)
                  .map(([key, value]) => `${key}: ${String(value).slice(0, 40)}`)
                  .join(' · ');
                return <span className="text-[11px] text-muted" dir="ltr">{summary}</span>;
              },
            },
            {
              key: 'ip',
              header: 'IP',
              render: (row) => <span dir="ltr" className="text-xs text-muted">{row.ip_address ?? '�'}</span>,
            },
            {
              key: 'createdAt',
              header: 'ا�ت����`ت',
              align: 'end',
              render: (row) => <span className="whitespace-nowrap text-xs text-muted">{formatDateTime(row.createdAt)}</span>,
            },
          ]}
          rows={query.data?.logs}
          loading={query.isLoading}
          error={query.isError ? (query.error as Error).message : null}
          onRetry={() => query.refetch()}
          emptyTitle="�ا ت��جد سج�ات تد��`� �&طاب�ة"
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
