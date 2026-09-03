�'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  organizationsService,
  type OrganizationsQuery,
} from '@/services/organizations.service';
import { DataTable, type Column } from '@/components/ui/data-table';
import { SearchInput, useDebouncedValue } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/input';
import { OrgTypeBadge, StatusBadge, VERIFICATION_STATUS_LABELS } from '@/components/ui/badge';
import { compactNumber, egp, formatDate } from '@/lib/format';
import type { AdminOrganization, OrganizationStats as OrgStatsRow } from '@/types/api';

type OrgWithStats = AdminOrganization & { stats?: OrgStatsRow };

export function OrgDirectory({
  title,
  description,
  breadcrumb,
  fixedType,
  showTypeFilter = true,
  defaultVerification = '',
  statsEnabled = true,
}: {
  title: string;
  description: string;
  breadcrumb: string[];
  fixedType?: 'wholesaler' | 'buyer' | 'shipper';
  showTypeFilter?: boolean;
  defaultVerification?: string;
  statsEnabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState(fixedType ?? '');
  const [verificationStatus, setVerificationStatus] = useState(defaultVerification);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  function buildQuery(): OrganizationsQuery {
    return {
      page,
      limit: 15,
      q: debouncedSearch || undefined,
      type: type || undefined,
      verification_status: verificationStatus || undefined,
      include_stats: statsEnabled ? true : undefined,
    };
  }

  const query = useQuery({
    queryKey: ['admin-organizations', buildQuery()],
    queryFn: () => organizationsService.list(buildQuery()),
    placeholderData: keepPreviousData,
  });

  const columns: Column<OrgWithStats>[] = [
    {
      key: 'display_name',
      header: 'ا��&ؤسسة',
      render: (row) => (
        <div className="min-w-40">
          <p className="font-extrabold text-ink">{row.display_name}</p>
          <p className="text-[11px] text-muted" dir="ltr">
            {row.email}
          </p>
        </div>
      ),
    },
    ...(showTypeFilter
      ? [
          {
            key: 'type',
            header: 'ا�� ��ع',
            render: (row: OrgWithStats) => <OrgTypeBadge type={row.type} />,
          } satisfies Column<OrgWithStats>,
        ]
      : []),
    {
      key: 'verification',
      header: 'ا�ت��ث�`�',
      render: (row) => <StatusBadge kind="verification" value={row.verification_status} />,
    },
    ...(statsEnabled
      ? [
          {
            key: 'orders',
            header: 'ا�ط�بات',
            align: 'center' as const,
            render: (row: OrgWithStats) => compactNumber(row.stats?.orders_count ?? 0),
          },
          {
            key: 'money',
            header: fixedType === 'wholesaler' ? 'إج�&ا��` ا��&ب�`عات' : fixedType === 'buyer' ? 'إج�&ا��` ا�شراء' : 'حرْة �&ا��`ة',
            align: 'end' as const,
            render: (row: OrgWithStats) =>
              egp(
                fixedType === 'wholesaler'
                  ? row.stats?.sales_piasters ?? 0
                  : row.stats?.spend_piasters ?? 0,
              ),
          },
          {
            key: 'disputes',
            header: '� زاعات �&فت��حة',
            align: 'center' as const,
            render: (row: OrgWithStats) =>
              row.stats?.open_disputes ? (
                <span className="font-extrabold text-red-600">{row.stats.open_disputes}</span>
              ) : (
                <span className="text-muted">0</span>
              ),
          },
        ]
      : []),
    {
      key: 'createdAt',
      header: 'ا�تسج�`�',
      align: 'end',
      render: (row) => <span className="text-xs text-muted">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'is_active',
      header: 'ا�حا�ة',
      render: (row) =>
        row.is_active ? (
          <span className="text-xs font-bold text-emerald-700">� شطة</span>
        ) : (
          <span className="text-xs font-bold text-red-600">�&�����فة</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader title={title} description={description} breadcrumb={breadcrumb} />

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <Field label="بحث">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="اس�& ا��&ؤسسة�R بر�`د أ�� �!اتف⬦" />
        </Field>
        {showTypeFilter ? (
          <Field label="ا�� ��ع">
            <Select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="w-44">
              <option value="">ْ� ا�أ� ��اع</option>
              <option value="wholesaler">بائع ج�&�ة</option>
              <option value="buyer">�&شتر�`</option>
              <option value="shipper">شرْة شح� </option>
            </Select>
          </Field>
        ) : null}
        <Field label="حا�ة ا�ت��ث�`�">
          <Select value={verificationStatus} onChange={(event) => { setVerificationStatus(event.target.value); setPage(1); }} className="w-44">
            <option value="">ْ� ا�حا�ات</option>
            {Object.entries(VERIFICATION_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={query.data?.organizations}
          loading={query.isLoading}
          error={query.isError ? (query.error as Error).message : null}
          onRetry={() => query.refetch()}
          emptyTitle="�ا ت��جد �&ؤسسات �&طاب�ة"
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
