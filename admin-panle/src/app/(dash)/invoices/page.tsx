�'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { financeService } from '@/services/finance.service';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput, useDebouncedValue } from '@/components/data-table';
import { PageHeader, StatCard } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/badge';
import { useToast } from '@/components/providers';
import { egp, formatDateTime } from '@/lib/format';
import type { AdminInvoice } from '@/types/api';

export default function InvoicesPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);
  const [pendingDecision, setPendingDecision] = useState<
    { invoice: AdminInvoice; decision: 'approve' | 'reject' } | null
  >(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-invoices', page, debouncedSearch],
    queryFn: () =>
      financeService.invoices({
        page,
        limit: 15,
        q: debouncedSearch || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const mutation = useMutation({
    mutationFn: (decision: { invoice: AdminInvoice; decision: 'approve' | 'reject' }) =>
      financeService.reviewInvoice(
        decision.invoice._id,
        decision.decision,
        decision.decision === 'reject' ? 'إثبات ا�سداد غ�`ر �&طاب�' : undefined,
      ),
    onSuccess: async (_data, variables) => {
      toast.push(
        variables.decision === 'approve'
          ? `ت�& اعت�&اد ا�فات��رة ${variables.invoice.invoice_number} ��تفع�`� ا�اشتراْ.`
          : `ت�& رفض ا�فات��رة ${variables.invoice.invoice_number}.`,
        variables.decision === 'approve' ? 'success' : 'info',
      );
      setPendingDecision(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-invoices'] });
    },
    onError: (error) => toast.push((error as Error).message, 'error'),
  });

  const invoices = query.data?.invoices ?? [];
  const pendingCount = invoices.filter((invoice) => invoice.status === 'proof_submitted').length;
  const paidAmount = invoices
    .filter((invoice) => invoice.status === 'paid')
    .reduce((sum, invoice) => sum + invoice.amount_piasters, 0);

  return (
    <div>
      <PageHeader
        title="ف��ات�`ر ا�اشتراْات"
        description="ف��ات�`ر اشتراْ ا��&ؤسسات ���&راجعة إثباتات سداد�!ا"
        breadcrumb={['���حة ا�تحْ�&', 'ا��&ا��`ة']}
        actions={
          <div className="w-56">
            <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="ر��& فات��رة أ�� �&ؤسسة⬦" />
          </div>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="ف��ات�`ر ا�صفحة" value={String(invoices.length)} />
        <StatCard label="با� تظار ا��&راجعة (با�صفحة)" value={String(pendingCount)} tone={pendingCount ? 'warning' : 'default'} />
        <StatCard label="ا��&حص�� با�صفحة" value={egp(paidAmount)} tone="positive" />
      </div>

      <Card>
        <DataTable<AdminInvoice>
          columns={[
            {
              key: 'invoice_number',
              header: 'ا�فات��رة',
              render: (row) => (
                <span dir="ltr" className="font-extrabold text-ink">
                  {row.invoice_number}
                </span>
              ),
            },
            {
              key: 'organization',
              header: 'ا��&ؤسسة',
              render: (row) => row.organization_id?.display_name ?? '�',
            },
            {
              key: 'plan',
              header: 'ا�خطة',
              render: (row) =>
                row.plan_id?.name_ar ? `${row.plan_id.name_ar}${row.plan_id.code ? ` (${row.plan_id.code})` : ''}` : '�',
            },
            { key: 'status', header: 'ا�حا�ة', render: (row) => <StatusBadge kind="invoice" value={row.status} /> },
            { key: 'amount', header: 'ا��&ب�غ', align: 'end', render: (row) => <span className="font-extrabold">{egp(row.amount_piasters)}</span> },
            {
              key: 'createdAt',
              header: 'أُ� شئت',
              align: 'end',
              render: (row) => <span className="text-xs text-muted">{formatDateTime(row.createdAt)}</span>,
            },
            {
              key: 'reviewed',
              header: 'آخر �&راجعة',
              align: 'end',
              render: (row) => <span className="text-xs text-muted">{formatDateTime(row.reviewed_at)}</span>,
            },
            {
              key: 'actions',
              header: '',
              align: 'end',
              render: (row) => (
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {row.proof_url ? (
                    <a href={row.proof_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-brand-700 hover:bg-brand-50">
                      ا�إ�`صا� <ExternalLink size={11} />
                    </a>
                  ) : null}
                  {row.status === 'proof_submitted' ? (
                    <>
                      <Button size="sm" onClick={() => setPendingDecision({ invoice: row, decision: 'approve' })} disabled={mutation.isPending}>
                        تفع�`�
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setPendingDecision({ invoice: row, decision: 'reject' })} disabled={mutation.isPending}>
                        رفض
                      </Button>
                    </>
                  ) : null}
                </div>
              ),
            },
          ]}
          rows={query.data?.invoices}
          loading={query.isLoading}
          error={query.isError ? (query.error as Error).message : null}
          onRetry={() => query.refetch()}
          emptyTitle="�ا ت��جد ف��ات�`ر"
          pagination={{
            page,
            totalPages: query.data?.pagination.total_pages ?? 1,
            total: query.data?.pagination.total ?? 0,
          }}
          onPageChange={setPage}
        />
      </Card>

      <ConfirmDialog
        open={Boolean(pendingDecision)}
        loading={mutation.isPending}
        danger={pendingDecision?.decision === 'reject'}
        title={pendingDecision?.decision === 'approve' ? 'اعت�&اد سداد ا�فات��رة' : 'رفض إثبات ا�سداد'}
        description={
          pendingDecision?.decision === 'approve' ? (
            <p>
              س�`ُعت�&د سداد ا�فات��رة{' '}
              <strong dir="ltr">{pendingDecision?.invoice.invoice_number}</strong> ب��`�&ة{' '}
              <strong>{egp(pendingDecision?.invoice.amount_piasters ?? 0)}</strong> ���`بدأ/�`تجدد اشتراْ ا��&ؤسسة ��&دة
              د��رة ا�فات��رة ْا�&�ة. �`ُسج�}�� ا��رار ف�` سج� ا�تد��`�.
            </p>
          ) : (
            <p>س�`ُرفض ا�إثبات ��تع��د ا�فات��رة �حا�ة «�&رف��ضة» �&ع إ�`�اف �&سار ا�اشتراْ ا��&رتبط.</p>
          )
        }
        confirmLabel={pendingDecision?.decision === 'approve' ? '� ع�&�R اعت�&د ��فع��' : '� ع�&�R ارفض'}
        onConfirm={() => pendingDecision && mutation.mutate(pendingDecision)}
        onCancel={() => setPendingDecision(null)}
      />
    </div>
  );
}
