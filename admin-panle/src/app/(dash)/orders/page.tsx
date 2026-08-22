'use client';

import Link from 'next/link';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ordersService, type OrderListQuery } from '@/services/orders.service';
import { DataTable, type Column, type SortState } from '@/components/ui/data-table';
import { SearchInput, useDebouncedValue } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { ORDER_STATUS_LABELS, PAYMENT_STATE_LABELS, StatusBadge } from '@/components/ui/badge';
import { egp, formatDate } from '@/lib/format';
import type { AdminOrderListItem } from '@/types/api';

export default function OrdersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [paymentState, setPaymentState] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ key: 'createdAt', dir: 'desc' });

  const debouncedSearch = useDebouncedValue(search);

  function buildQuery(): OrderListQuery {
    return {
      page,
      limit: 15,
      q: debouncedSearch || undefined,
      status: status || undefined,
      payment_state: paymentState || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
      sort: sort.key === 'total_payable_piasters' ? 'total_payable_piasters' : 'createdAt',
      dir: sort.dir,
    };
  }

  const query = useQuery({
    queryKey: ['admin-orders', buildQuery()],
    queryFn: () => ordersService.list(buildQuery()),
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.orders;

  function handleFilterChange(apply: () => void) {
    apply();
    setPage(1);
  }

  const columns: Column<AdminOrderListItem>[] = [
    {
      key: 'order_number',
      header: 'رقم الطلب',
      render: (row) => (
        <Link
          href={`/orders/${row._id}`}
          className="font-extrabold text-brand-700 hover:underline"
          dir="ltr"
        >
          {row.order_number}
        </Link>
      ),
    },
    {
      key: 'buyer',
      header: 'المشتري',
      render: (row) => <span className="font-semibold">{row.buyer_organization_id?.display_name ?? '—'}</span>,
    },
    {
      key: 'seller',
      header: 'البائع',
      render: (row) => row.seller_organization_id?.display_name ?? '—',
    },
    { key: 'status', header: 'الحالة', render: (row) => <StatusBadge kind="order" value={row.status} /> },
    {
      key: 'payment_state',
      header: 'الدفع',
      render: (row) => <StatusBadge kind="payment_state" value={row.payment_summary?.state} />,
    },
    {
      key: 'total_payable_piasters',
      header: 'الإجمالي',
      sortable: true,
      align: 'end',
      render: (row) => <span className="font-extrabold text-ink">{egp(row.total_payable_piasters)}</span>,
    },
    {
      key: 'createdAt',
      header: 'التاريخ',
      sortable: true,
      align: 'end',
      render: (row) => <span className="text-xs text-muted">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (row) => (
        <Link href={`/orders/${row._id}`}>
          <Button variant="ghost" size="sm">
            التفاصيل
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="الطلبات" description="كل طلبات الجملة على المنصة مع فلاتر متقدمة" breadcrumb={['لوحة التحكم', 'التجارة']} />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="بحث" className="sm:col-span-2 lg:col-span-2">
            <SearchInput value={search} onChange={(value) => handleFilterChange(() => setSearch(value))} placeholder="رقم الطلب أو اسم مؤسسة…" />
          </Field>
          <Field label="حالة الطلب">
            <Select value={status} onChange={(event) => handleFilterChange(() => setStatus(event.target.value))}>
              <option value="">كل الحالات</option>
              {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="حالة الدفع">
            <Select value={paymentState} onChange={(event) => handleFilterChange(() => setPaymentState(event.target.value))}>
              <option value="">الكل</option>
              {Object.entries(PAYMENT_STATE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 items-end gap-2">
            <Field label="من">
              <Input type="date" value={fromDate} onChange={(event) => handleFilterChange(() => setFromDate(event.target.value))} />
            </Field>
            <Field label="إلى">
              <Input type="date" value={toDate} onChange={(event) => handleFilterChange(() => setToDate(event.target.value))} />
            </Field>
          </div>
        </div>
        <div className="mt-3 flex justify-start">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              handleFilterChange(() => {
                setSearch('');
                setStatus('');
                setPaymentState('');
                setFromDate('');
                setToDate('');
              })
            }
          >
            مسح الفلاتر
          </Button>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          loading={query.isLoading}
          error={query.isError ? (query.error as Error).message : null}
          onRetry={() => query.refetch()}
          emptyTitle="لا توجد طلبات مطابقة"
          emptyDescription="جرّب تعديل الفلاتر أو البحث برقم مختلف."
          sort={sort}
          onSortChange={setSort}
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
