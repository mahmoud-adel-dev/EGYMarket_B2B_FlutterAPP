'use client';

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
      header: 'Ø§ï¿½ï¿½&Ø¤Ø³Ø³Ø©',
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
            header: 'Ø§ï¿½ï¿½ ï¿½ï¿½Ø¹',
            render: (row: OrgWithStats) => <OrgTypeBadge type={row.type} />,
          } satisfies Column<OrgWithStats>,
        ]
      : []),
    {
      key: 'verification',
      header: 'Ø§ï¿½Øªï¿½ï¿½Ø«ï¿½`ï¿½',
      render: (row) => <StatusBadge kind="verification" value={row.verification_status} />,
    },
    ...(statsEnabled
      ? [
          {
            key: 'orders',
            header: 'Ø§ï¿½Ø·ï¿½Ø¨Ø§Øª',
            align: 'center' as const,
            render: (row: OrgWithStats) => compactNumber(row.stats?.orders_count ?? 0),
          },
          {
            key: 'money',
            header: fixedType === 'wholesaler' ? 'Ø¥Ø¬ï¿½&Ø§ï¿½ï¿½` Ø§ï¿½ï¿½&Ø¨ï¿½`Ø¹Ø§Øª' : fixedType === 'buyer' ? 'Ø¥Ø¬ï¿½&Ø§ï¿½ï¿½` Ø§ï¿½Ø´Ø±Ø§Ø¡' : 'Ø­Ø±Ù’Ø© ï¿½&Ø§ï¿½ï¿½`Ø©',
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
            header: 'ï¿½ Ø²Ø§Ø¹Ø§Øª ï¿½&ÙØªï¿½ï¿½Ø­Ø©',
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
      header: 'Ø§ï¿½ØªØ³Ø¬ï¿½`ï¿½',
      align: 'end',
      render: (row) => <span className="text-xs text-muted">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'is_active',
      header: 'Ø§ï¿½Ø­Ø§ï¿½Ø©',
      render: (row) =>
        row.is_active ? (
          <span className="text-xs font-bold text-emerald-700">ï¿½ Ø´Ø·Ø©</span>
        ) : (
          <span className="text-xs font-bold text-red-600">ï¿½&ï¿½ï¿½ï¿½ï¿½ï¿½ÙØ©</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader title={title} description={description} breadcrumb={breadcrumb} />

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <Field label="Ø¨Ø­Ø«">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Ø§Ø³ï¿½& Ø§ï¿½ï¿½&Ø¤Ø³Ø³Ø©ï¿½R Ø¨Ø±ï¿½`Ø¯ Ø£ï¿½ï¿½ ï¿½!Ø§ØªÙâ¬¦" />
        </Field>
        {showTypeFilter ? (
          <Field label="Ø§ï¿½ï¿½ ï¿½ï¿½Ø¹">
            <Select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="w-44">
              <option value="">Ù’ï¿½ Ø§ï¿½Ø£ï¿½ ï¿½ï¿½Ø§Ø¹</option>
              <option value="wholesaler">Ø¨Ø§Ø¦Ø¹ Ø¬ï¿½&ï¿½Ø©</option>
              <option value="buyer">ï¿½&Ø´ØªØ±ï¿½`</option>
              <option value="shipper">Ø´Ø±Ù’Ø© Ø´Ø­ï¿½ </option>
            </Select>
          </Field>
        ) : null}
        <Field label="Ø­Ø§ï¿½Ø© Ø§ï¿½Øªï¿½ï¿½Ø«ï¿½`ï¿½">
          <Select value={verificationStatus} onChange={(event) => { setVerificationStatus(event.target.value); setPage(1); }} className="w-44">
            <option value="">Ù’ï¿½ Ø§ï¿½Ø­Ø§ï¿½Ø§Øª</option>
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
          emptyTitle="ï¿½Ø§ Øªï¿½ï¿½Ø¬Ø¯ ï¿½&Ø¤Ø³Ø³Ø§Øª ï¿½&Ø·Ø§Ø¨ï¿½Ø©"
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

