'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { financeService, type TransactionsQuery } from '@/services/finance.service';
import { DataTable, type Column, type SortState } from '@/components/ui/data-table';
import { defaultDateRange, DateRangeControl, SearchInput, useDebouncedValue, type DateRangeValue } from '@/components/data-table';
import { PageHeader, StatCard } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/input';
import { StatusBadge, TX_TYPE_LABELS } from '@/components/ui/badge';
import { egp, formatDateTime } from '@/lib/format';
import type { TransactionRow } from '@/types/api';

export const TX_TYPE_OPTIONS = Object.entries(TX_TYPE_LABELS);

const TX_STATUS_FILTERS = [
  { value: 'pending', label: 'بانتظار الدفع' },
  { value: 'proof_submitted', label: 'إثبات قيد المراجعة' },
  { value: 'confirmed', label: 'مؤكدة' },
  { value: 'paid', label: 'مدفوعة' },
  { value: 'rejected', label: 'مرفوضة' },
  { value: 'refund_pending', label: 'استرجاع معلّق' },
  { value: 'refunded', label: 'مستردة' },
];

export function TransactionsView({
  title,
  description,
  breadcrumb,
  fixedTxType,
}: {
  title: string;
  description: string;
  breadcrumb: string[];
  fixedTxType?: string;
}) {
  const [search, setSearch] = useState('');
  const [txType, setTxType] = useState(fixedTxType ?? '');
  const [status, setStatus] = useState('');
  const [range, setRange] = useState<DateRangeValue>(defaultDateRange(30));
  const [page, setPage] = useState(1);
  const [sort] = useState<SortState>({ key: 'created_at', dir: 'desc' });
  const debouncedSearch = useDebouncedValue(search);

  function buildQuery(): TransactionsQuery {
    return {
      page,
      limit: 15,
      tx_type: txType || undefined,
      status: status || undefined,
      from: range.from,
      to: range.to,
      q: debouncedSearch || undefined,
    };
  }

  const query = useQuery({
    queryKey: ['admin-transactions', buildQuery()],
    queryFn: () => financeService.transactions(buildQuery()),
    placeholderData: keepPreviousData,
  });

  const overview = query.data?.overview;

  const columns: Column<TransactionRow>[] = [
    {
      key: 'tx_type',
      header: 'النوع',
      render: (row) => (
        <div className="min-w-36">
          <p className="text-xs font-extrabold text-ink">{TX_TYPE_LABELS[row.tx_type]}</p>
          {row.related_order_number ? (
            <p className="text-[11px] text-muted" dir="ltr">
              {row.related_order_number}
            </p>
          ) : row.related_invoice_number ? (
            <p className="text-[11px] text-muted" dir="ltr">
              {row.related_invoice_number}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'party',
      header: 'الجهة',
      render: (row) => (
        <div className="min-w-32">
          <p className="font-semibold">{row.party_name}</p>
          {row.counterparty_name ? (
            <p className="text-[11px] text-muted">↔ {row.counterparty_name}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'method',
      header: 'الطريقة / المرجع',
      render: (row) => (
        <div className="text-[11px] leading-5 text-muted">
          <p>{methodLabel(row.method)}</p>
          {row.reference ? <p dir="ltr">{row.reference}</p> : null}
        </div>
      ),
    },
    { key: 'status', header: 'الحالة', render: (row) => <StatusBadge kind="tx_status" value={row.status} /> },
    {
      key: 'gross_piasters',
      header: 'المبلغ',
      align: 'end',
      render: (row) => <span className="font-extrabold">{egp(row.gross_piasters)}</span>,
    },
    {
      key: 'created_at',
      header: 'التاريخ',
      align: 'end',
      render: (row) => <span className="whitespace-nowrap text-xs text-muted">{formatDateTime(row.created_at)}</span>,
    },
    {
      key: 'settled_at',
      header: 'تاريخ التسوية',
      align: 'end',
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {row.settled_at ? formatDateTime(row.settled_at) : '—'}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        breadcrumb={breadcrumb}
        actions={<DateRangeControl value={range} onChange={(value) => { setRange(value); setPage(1); }} />}
      />

      {overview ? (
        <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="إجمالي الحجم المعالَج"
            value={egp(overview.gross_processed_piasters)}
            hint="التزامات مؤكدة + فواتير مدفوعة"
            tone="positive"
          />
          <StatCard
            label="قيد المراجعة"
            value={egp(overview.pending_review_piasters)}
            hint="إثباتات بانتظار قرار الإدارة"
            tone="warning"
          />
          <StatCard
            label="إيراد المنصة"
            value={egp(overview.platform_revenue_piasters)}
            hint={`رسوم طلبات ${egp(overview.order_fees_piasters)} · اشتراكات ${egp(overview.subscription_revenue_piasters)}`}
            tone="positive"
          />
          <StatCard
            label="استرجاعات"
            value={egp(overview.refunds_piasters)}
            hint={
              overview.refund_pending_count > 0
                ? `${overview.refund_pending_count} استرجاعًا معلّقًا بقيمة ${egp(overview.refund_pending_piasters)}`
                : overview.refunds_note
            }
            tone={overview.refund_pending_count > 0 ? 'danger' : 'default'}
          />
        </div>
      ) : null}

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <Field label="بحث">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="رقم طلب/فاتورة أو مرجع تحويل…" />
        </Field>
        {!fixedTxType ? (
          <Field label="نوع الحركة">
            <Select value={txType} onChange={(event) => { setTxType(event.target.value); setPage(1); }} className="w-44">
              <option value="">كل الأنواع</option>
              {TX_TYPE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="الحالة">
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="w-48">
            <option value="">كل الحالات</option>
            {TX_STATUS_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={query.data?.transactions}
          loading={query.isLoading}
          error={query.isError ? (query.error as Error).message : null}
          onRetry={() => query.refetch()}
          emptyTitle="لا توجد حركات مالية مطابقة"
          emptyDescription="جرّب توسيع النطاق الزمني أو تعديل الفلاتر."
          sort={sort}
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

function methodLabel(method?: string): string {
  switch (method) {
    case 'instapay':
      return 'إنستاباي';
    case 'mobile_wallet':
      return 'محفظة موبايل';
    case 'bank_transfer':
      return 'تحويل بنكي';
    case 'cash':
      return 'كاش/إيصال';
    default:
      return '—';
  }
}
