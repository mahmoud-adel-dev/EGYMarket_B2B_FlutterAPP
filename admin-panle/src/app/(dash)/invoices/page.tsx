'use client';

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
        decision.decision === 'reject' ? 'Ø¥Ø«Ø¨Ø§Øª Ø§ï¿½Ø³Ø¯Ø§Ø¯ Øºï¿½`Ø± ï¿½&Ø·Ø§Ø¨ï¿½' : undefined,
      ),
    onSuccess: async (_data, variables) => {
      toast.push(
        variables.decision === 'approve' ? 'Invoice approved successfully.' : 'Invoice rejected.',
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
        title="Ùï¿½ï¿½Ø§Øªï¿½`Ø± Ø§ï¿½Ø§Ø´ØªØ±Ø§Ù’Ø§Øª"
        description="Ùï¿½ï¿½Ø§Øªï¿½`Ø± Ø§Ø´ØªØ±Ø§Ù’ Ø§ï¿½ï¿½&Ø¤Ø³Ø³Ø§Øª ï¿½ï¿½ï¿½&Ø±Ø§Ø¬Ø¹Ø© Ø¥Ø«Ø¨Ø§ØªØ§Øª Ø³Ø¯Ø§Ø¯ï¿½!Ø§"
        breadcrumb={['ï¿½ï¿½ï¿½Ø­Ø© Ø§ï¿½ØªØ­Ù’ï¿½&', 'Ø§ï¿½ï¿½&Ø§ï¿½ï¿½`Ø©']}
        actions={
          <div className="w-56">
            <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Ø±ï¿½ï¿½& ÙØ§Øªï¿½ï¿½Ø±Ø© Ø£ï¿½ï¿½ ï¿½&Ø¤Ø³Ø³Ø©â¬¦" />
          </div>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Ùï¿½ï¿½Ø§Øªï¿½`Ø± Ø§ï¿½ØµÙØ­Ø©" value={String(invoices.length)} />
        <StatCard label="Ø¨Ø§ï¿½ ØªØ¸Ø§Ø± Ø§ï¿½ï¿½&Ø±Ø§Ø¬Ø¹Ø© (Ø¨Ø§ï¿½ØµÙØ­Ø©)" value={String(pendingCount)} tone={pendingCount ? 'warning' : 'default'} />
        <StatCard label="Ø§ï¿½ï¿½&Ø­Øµï¿½ï¿½ Ø¨Ø§ï¿½ØµÙØ­Ø©" value={egp(paidAmount)} tone="positive" />
      </div>

      <Card>
        <DataTable<AdminInvoice>
          columns={[
            {
              key: 'invoice_number',
              header: 'Ø§ï¿½ÙØ§Øªï¿½ï¿½Ø±Ø©',
              render: (row) => (
                <span dir="ltr" className="font-extrabold text-ink">
                  {row.invoice_number}
                </span>
              ),
            },
            {
              key: 'organization',
              header: 'Ø§ï¿½ï¿½&Ø¤Ø³Ø³Ø©',
              render: (row) => row.organization_id?.display_name ?? 'ï¿½',
            },
            {
              key: 'plan',
              header: 'Ø§ï¿½Ø®Ø·Ø©',
              render: (row) =>
                row.plan_id?.name_ar ? `${row.plan_id.name_ar}${row.plan_id.code ? ` (${row.plan_id.code})` : ''}` : 'ï¿½',
            },
            { key: 'status', header: 'Ø§ï¿½Ø­Ø§ï¿½Ø©', render: (row) => <StatusBadge kind="invoice" value={row.status} /> },
            { key: 'amount', header: 'Ø§ï¿½ï¿½&Ø¨ï¿½Øº', align: 'end', render: (row) => <span className="font-extrabold">{egp(row.amount_piasters)}</span> },
            {
              key: 'createdAt',
              header: 'Ø£Ùï¿½ Ø´Ø¦Øª',
              align: 'end',
              render: (row) => <span className="text-xs text-muted">{formatDateTime(row.createdAt)}</span>,
            },
            {
              key: 'reviewed',
              header: 'Ø¢Ø®Ø± ï¿½&Ø±Ø§Ø¬Ø¹Ø©',
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
                      Ø§ï¿½Ø¥ï¿½`ØµØ§ï¿½ <ExternalLink size={11} />
                    </a>
                  ) : null}
                  {row.status === 'proof_submitted' ? (
                    <>
                      <Button size="sm" onClick={() => setPendingDecision({ invoice: row, decision: 'approve' })} disabled={mutation.isPending}>
                        ØªÙØ¹ï¿½`ï¿½
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setPendingDecision({ invoice: row, decision: 'reject' })} disabled={mutation.isPending}>
                        Ø±ÙØ¶
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
          emptyTitle="ï¿½Ø§ Øªï¿½ï¿½Ø¬Ø¯ Ùï¿½ï¿½Ø§Øªï¿½`Ø±"
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
        title={pendingDecision?.decision === 'approve' ? 'Ø§Ø¹Øªï¿½&Ø§Ø¯ Ø³Ø¯Ø§Ø¯ Ø§ï¿½ÙØ§Øªï¿½ï¿½Ø±Ø©' : 'Ø±ÙØ¶ Ø¥Ø«Ø¨Ø§Øª Ø§ï¿½Ø³Ø¯Ø§Ø¯'}
        description={
          pendingDecision?.decision === 'approve' ? (
            <p>Invoice approval will update the subscription status.</p>
          ) : (
            <p>Ø³ï¿½`ÙØ±ÙØ¶ Ø§ï¿½Ø¥Ø«Ø¨Ø§Øª ï¿½ï¿½ØªØ¹ï¿½ï¿½Ø¯ Ø§ï¿½ÙØ§Øªï¿½ï¿½Ø±Ø© ï¿½Ø­Ø§ï¿½Ø© Â«ï¿½&Ø±Ùï¿½ï¿½Ø¶Ø©Â» ï¿½&Ø¹ Ø¥ï¿½`ï¿½Ø§Ù ï¿½&Ø³Ø§Ø± Ø§ï¿½Ø§Ø´ØªØ±Ø§Ù’ Ø§ï¿½ï¿½&Ø±ØªØ¨Ø·.</p>
          )
        }
        confirmLabel={pendingDecision?.decision === 'approve' ? 'ï¿½ Ø¹ï¿½&ï¿½R Ø§Ø¹Øªï¿½&Ø¯ ï¿½ï¿½ÙØ¹ï¿½ï¿½' : 'ï¿½ Ø¹ï¿½&ï¿½R Ø§Ø±ÙØ¶'}
        onConfirm={() => pendingDecision && mutation.mutate(pendingDecision)}
        onCancel={() => setPendingDecision(null)}
      />
    </div>
  );
}


