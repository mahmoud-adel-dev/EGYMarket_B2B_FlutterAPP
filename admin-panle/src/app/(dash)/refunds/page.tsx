'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { financeService } from '@/services/finance.service';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader, StatCard } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/providers';
import { egp, formatDateTime } from '@/lib/format';
import type { TransactionRow } from '@/types/api';

export default function RefundsPage() {
  const [page, setPage] = useState(1);
  const [pendingRefund, setPendingRefund] = useState<TransactionRow | null>(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-refunds', page],
    queryFn: () =>
      financeService.transactions({ status: 'refund_pending', limit: 15, page }),
    placeholderData: keepPreviousData,
  });

  const completedQuery = useQuery({
    queryKey: ['admin-refunds-completed'],
    queryFn: () => financeService.transactions({ status: 'refunded', limit: 10, page: 1 }),
  });

  const mutation = useMutation({
    mutationFn: (row: TransactionRow) => financeService.markRefundCompleted(row.id),
    onSuccess: async () => {
      toast.push('تم تسجيل اكتمال الاسترجاع.', 'success');
      setPendingRefund(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-refunds'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-refunds-completed'] });
    },
    onError: (error) => toast.push((error as Error).message, 'error'),
  });

  const rows = query.data?.transactions;
  const pendingTotal = query.data?.overview.refund_pending_piasters ?? 0;

  return (
    <div>
      <PageHeader
        title="الاسترجاعات"
        description="التزامات محولة لحالة استرجاع بعد حل النزاعات — تأكيد التنفيذ يُسجَّل بالتدقيق ولا يمكن تكراره"
        breadcrumb={['لوحة التحكم', 'المالية']}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="استرجاعات معلّقة" value={egp(pendingTotal)} hint={`${rows?.length ?? 0} عنصر في الصفحة`} tone={pendingTotal > 0 ? 'danger' : 'default'} />
        <StatCard
          label="استرجاعات مكتملة (آخر ١٠)"
          value={egp(completedQuery.data?.transactions.reduce((sum, row) => sum + row.gross_piasters, 0) ?? 0)}
          tone="positive"
        />
        <StatCard
          label="ملاحظة تشغيلية"
          value={<span className="text-xs leading-6">{query.data?.overview.refunds_note ?? '—'}</span>}
        />
      </div>

      <Card className="mb-4">
        <DataTable<TransactionRow>
          columns={[
            {
              key: 'order',
              header: 'الطلب / المرجع',
              render: (row) => (
                <div>
                  <p dir="ltr" className="font-extrabold">{row.related_order_number ?? '—'}</p>
                  <p className="text-[11px] text-muted">{txLabel(row.tx_type)}</p>
                </div>
              ),
            },
            { key: 'party', header: 'الدافع الأصلي', render: (row) => <span className="font-semibold">{row.party_name}</span> },
            { key: 'status', header: 'الحالة', render: (row) => <StatusBadge kind="tx_status" value={row.status} /> },
            { key: 'amount', header: 'قيمة الاسترجاع', align: 'end', render: (row) => <span className="font-extrabold text-red-700">{egp(row.gross_piasters)}</span> },
            {
              key: 'created',
              header: 'تاريخ التحول لاسترجاع',
              align: 'end',
              render: (row) => <span className="text-xs text-muted">{formatDateTime(row.created_at)}</span>,
            },
            {
              key: 'actions',
              header: '',
              align: 'end',
              render: (row) => (
                <Button size="sm" variant="outline" onClick={() => setPendingRefund(row)}>
                  تأكيد تنفيذ الاسترجاع
                </Button>
              ),
            },
          ]}
          rows={rows}
          loading={query.isLoading}
          error={query.isError ? (query.error as Error).message : null}
          onRetry={() => query.refetch()}
          emptyTitle="لا توجد استرجاعات معلّقة"
          emptyDescription="تظهر هنا الالتزامات التي تحولت للاسترجاع بعد حل النزاع بإلغاء الطلب."
          pagination={{
            page,
            totalPages: query.data?.pagination.total_pages ?? 1,
            total: query.data?.pagination.total ?? 0,
          }}
          onPageChange={setPage}
        />
      </Card>

      {completedQuery.data?.transactions.length ? (
        <Card>
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-extrabold">سجل الاسترجاعات المكتملة</h2>
          </div>
          <ul className="divide-y divide-line">
            {completedQuery.data.transactions.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
                <span dir="ltr" className="font-bold">{row.related_order_number ?? row.id}</span>
                <span>{egp(row.gross_piasters)}</span>
                <span className="text-muted">{formatDateTime(row.settled_at ?? row.created_at)}</span>
                <StatusBadge kind="tx_status" value={row.status} />
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <EmptyState title="لم تُنفَّذ استرجاعات بعد" description="سيظهر هنا سجل الاسترجاعات بعد تأكيدها." />
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(pendingRefund)}
        loading={mutation.isPending}
        danger
        title="تأكيد تنفيذ الاسترجاع"
        description={
          <>
            <p>
              تأكيد أن مبلغ <strong>{egp(pendingRefund?.gross_piasters ?? 0)}</strong> المتعلق بالطلب{' '}
              <strong dir="ltr">{pendingRefund?.related_order_number}</strong> تم إرجاعه فعليًا للطرف المستحق عبر
              القنوات المحلية.
            </p>
            <p className="mt-2 rounded-xl bg-red-50 p-3 text-xs leading-6 text-red-800 ring-1 ring-red-200">
              هذا الإجراء نهائي، يُحدِّث حالة الالتزام إلى «مسترد» في قاعدة البيانات ويُسجَّل في سجل التدقيق باسمك.
              لا يمكن التراجع أو التكرار لنفس الالتزام.
            </p>
            {pendingRefund?.related_order_number ? (
              <a
                href={`/orders/${pendingRefund.related_order_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:underline"
              >
                فتح الطلب في تبويب جديد
                <ExternalLink size={11} />
              </a>
            ) : null}
          </>
        }
        confirmLabel="نعم، تم التنفيذ خارجيًا"
        onConfirm={() => {
          if (pendingRefund) mutation.mutate(pendingRefund);
        }}
        onCancel={() => setPendingRefund(null)}
      />
    </div>
  );
}

function txLabel(type: string): string {
  switch (type) {
    case 'platform_fee':
      return 'رسوم منصة';
    case 'order_goods':
      return 'قيمة بضاعة';
    case 'order_shipping':
      return 'قيمة شحن';
    default:
      return type;
  }
}
