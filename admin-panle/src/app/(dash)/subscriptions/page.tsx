�'use client';

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
  { value: 'active', label: '� شط' },
  { value: 'trialing', label: 'تجر�`ب�`' },
  { value: 'under_review', label: '��`د ا��&راجعة' },
  { value: 'pending_payment', label: 'با� تظار ا�دفع' },
  { value: 'grace_period', label: '�&�!�ة س�&اح' },
  { value: 'expired', label: '�&� ت�!�`' },
  { value: 'canceled', label: '�&�غ�`' },
  { value: 'rejected', label: '�&رف��ض' },
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
        title="ا�اشتراْات"
        description="اشتراْات ا��&ؤسسات ف�` ج�&�`ع ا�حا�ات �&ع ا�خطط ��د��رات ا�تجد�`د"
        breadcrumb={['���حة ا�تحْ�&', 'ا��&ا��`ة']}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="اشتراْات با�صفحة" value={compactNumber(rows.length)} />
        <StatCard label="� شطة با�صفحة" value={compactNumber(activeCount)} tone="positive" />
        <StatCard
          label="ت� ت�!�` خ�ا� ٧ أ�`ا�& (با�صفحة)"
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
        <Field label="بحث">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="اس�& ا��&ؤسسة⬦" />
        </Field>
        <Field label="ا�حا�ة">
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="w-44">
            <option value="">ْ� ا�حا�ات</option>
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
              header: 'ا��&ؤسسة',
              render: (row) => (
                <div className="min-w-36">
                  <p className="font-extrabold">{row.organization_id?.display_name ?? '�'}</p>
                  <p className="text-[11px] text-muted">{row.organization_id?.type ?? ''}</p>
                </div>
              ),
            },
            {
              key: 'plan',
              header: 'ا�خطة',
              render: (row) =>
                row.plan_id ? (
                  <div className="text-xs leading-5">
                    <p className="font-bold">{row.plan_id.name_ar}</p>
                    <p className="text-muted">
                      {egp(row.plan_id.price_piasters)} · {row.plan_id.billing_interval === 'yearly' ? 'س� ���`' : 'ش�!ر�`'}
                    </p>
                  </div>
                ) : (
                  '�'
                ),
            },
            { key: 'status', header: 'ا�حا�ة', render: (row) => <StatusBadge kind="subscription" value={row.status} /> },
            { key: 'starts', header: 'ا�بدا�`ة', align: 'end', render: (row) => <span className="text-xs">{formatDate(row.starts_at)}</span> },
            {
              key: 'ends',
              header: '� �!ا�`ة ا�د��رة',
              align: 'end',
              render: (row) => <span className="text-xs">{formatDate(row.current_period_ends_at)}</span>,
            },
            {
              key: 'renewal',
              header: 'ا�تجد�`د ا�ت��ائ�`',
              align: 'center',
              render: (row) => (row.cancel_at_period_end ? <span className="text-xs font-bold text-red-600">�&ت���ف</span> : <span className="text-xs text-emerald-700">�&فع��</span>),
            },
          ]}
          rows={query.data?.subscriptions}
          loading={query.isLoading}
          error={query.isError ? (query.error as Error).message : null}
          onRetry={() => query.refetch()}
          emptyTitle="�ا ت��جد اشتراْات"
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
