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
        decision.decision === 'reject' ? 'Ø¥Ø«Ø¨Ø§Øª Ø§Ù„Ø³Ø¯Ø§Ø¯ ØºÙŠØ± Ù…Ø·Ø§Ø¨Ù‚' : undefined,
      ),
    onSuccess: async (_data, variables) => {
      toast.push(
        variables.decision === 'approve'
          ? `ØªÙ… Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„ÙØ§ØªÙˆØ±Ø© ${variables.invoice.invoice_number} ÙˆØªÙØ¹ÙŠÙ„ Ø§Ù„Ø§Ø´ØªØ±Ø§Ùƒ.`
          : `ØªÙ… Ø±ÙØ¶ Ø§Ù„ÙØ§ØªÙˆØ±Ø© ${variables.invoice.invoice_number}.`,
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
        title="ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ø§Ø´ØªØ±Ø§ÙƒØ§Øª"
        description="ÙÙˆØ§ØªÙŠØ± Ø§Ø´ØªØ±Ø§Ùƒ Ø§Ù„Ù…Ø¤Ø³Ø³Ø§Øª ÙˆÙ…Ø±Ø§Ø¬Ø¹Ø© Ø¥Ø«Ø¨Ø§ØªØ§Øª Ø³Ø¯Ø§Ø¯Ù‡Ø§"
        breadcrumb={['Ù„ÙˆØ­Ø© Ø§Ù„ØªØ­ÙƒÙ…', 'Ø§Ù„Ù…Ø§Ù„ÙŠØ©']}
        actions={
          <div className="w-56">
            <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Ø±Ù‚Ù… ÙØ§ØªÙˆØ±Ø© Ø£Ùˆ Ù…Ø¤Ø³Ø³Ø©â€¦" />
          </div>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="ÙÙˆØ§ØªÙŠØ± Ø§Ù„ØµÙØ­Ø©" value={String(invoices.length)} />
        <StatCard label="Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© (Ø¨Ø§Ù„ØµÙØ­Ø©)" value={String(pendingCount)} tone={pendingCount ? 'warning' : 'default'} />
        <StatCard label="Ø§Ù„Ù…Ø­ØµÙ‘Ù„ Ø¨Ø§Ù„ØµÙØ­Ø©" value={egp(paidAmount)} tone="positive" />
      </div>

      <Card>
        <DataTable<AdminInvoice>
          columns={[
            {
              key: 'invoice_number',
              header: 'Ø§Ù„ÙØ§ØªÙˆØ±Ø©',
              render: (row) => (
                <span dir="ltr" className="font-extrabold text-ink">
                  {row.invoice_number}
                </span>
              ),
            },
            {
              key: 'organization',
              header: 'Ø§Ù„Ù…Ø¤Ø³Ø³Ø©',
              render: (row) => row.organization_id?.display_name ?? 'â€”',
            },
            {
              key: 'plan',
              header: 'Ø§Ù„Ø®Ø·Ø©',
              render: (row) =>
                row.plan_id?.name_ar ? `${row.plan_id.name_ar}${row.plan_id.code ? ` (${row.plan_id.code})` : ''}` : 'â€”',
            },
            { key: 'status', header: 'Ø§Ù„Ø­Ø§Ù„Ø©', render: (row) => <StatusBadge kind="invoice" value={row.status} /> },
            { key: 'amount', header: 'Ø§Ù„Ù…Ø¨Ù„Øº', align: 'end', render: (row) => <span className="font-extrabold">{egp(row.amount_piasters)}</span> },
            {
              key: 'createdAt',
              header: 'Ø£ÙÙ†Ø´Ø¦Øª',
              align: 'end',
              render: (row) => <span className="text-xs text-muted">{formatDateTime(row.createdAt)}</span>,
            },
            {
              key: 'reviewed',
              header: 'Ø¢Ø®Ø± Ù…Ø±Ø§Ø¬Ø¹Ø©',
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
                      Ø§Ù„Ø¥ÙŠØµØ§Ù„ <ExternalLink size={11} />
                    </a>
                  ) : null}
                  {row.status === 'proof_submitted' ? (
                    <>
                      <Button size="sm" onClick={() => setPendingDecision({ invoice: row, decision: 'approve' })} disabled={mutation.isPending}>
                        ØªÙØ¹ÙŠÙ„
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
          emptyTitle="Ù„Ø§ ØªÙˆØ¬Ø¯ ÙÙˆØ§ØªÙŠØ±"
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
        title={pendingDecision?.decision === 'approve' ? 'Ø§Ø¹ØªÙ…Ø§Ø¯ Ø³Ø¯Ø§Ø¯ Ø§Ù„ÙØ§ØªÙˆØ±Ø©' : 'Ø±ÙØ¶ Ø¥Ø«Ø¨Ø§Øª Ø§Ù„Ø³Ø¯Ø§Ø¯'}
        description={
          pendingDecision?.decision === 'approve' ? (
            <p>
              Ø³ÙŠÙØ¹ØªÙ…Ø¯ Ø³Ø¯Ø§Ø¯ Ø§Ù„ÙØ§ØªÙˆØ±Ø©{' '}
              <strong dir="ltr">{pendingDecision?.invoice.invoice_number}</strong> Ø¨Ù‚ÙŠÙ…Ø©{' '}
              <strong>{egp(pendingDecision?.invoice.amount_piasters ?? 0)}</strong> ÙˆÙŠØ¨Ø¯Ø£/ÙŠØªØ¬Ø¯Ø¯ Ø§Ø´ØªØ±Ø§Ùƒ Ø§Ù„Ù…Ø¤Ø³Ø³Ø© Ù„Ù…Ø¯Ø©
              Ø¯ÙˆØ±Ø© Ø§Ù„ÙØ§ØªÙˆØ±Ø© ÙƒØ§Ù…Ù„Ø©. ÙŠÙØ³Ø¬ÙŽÙ‘Ù„ Ø§Ù„Ù‚Ø±Ø§Ø± ÙÙŠ Ø³Ø¬Ù„ Ø§Ù„ØªØ¯Ù‚ÙŠÙ‚.
            </p>
          ) : (
            <p>Ø³ÙŠÙØ±ÙØ¶ Ø§Ù„Ø¥Ø«Ø¨Ø§Øª ÙˆØªØ¹ÙˆØ¯ Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ù„Ø­Ø§Ù„Ø© Â«Ù…Ø±ÙÙˆØ¶Ø©Â» Ù…Ø¹ Ø¥ÙŠÙ‚Ø§Ù Ù…Ø³Ø§Ø± Ø§Ù„Ø§Ø´ØªØ±Ø§Ùƒ Ø§Ù„Ù…Ø±ØªØ¨Ø·.</p>
          )
        }
        confirmLabel={pendingDecision?.decision === 'approve' ? 'Ù†Ø¹Ù…ØŒ Ø§Ø¹ØªÙ…Ø¯ ÙˆÙØ¹Ù‘Ù„' : 'Ù†Ø¹Ù…ØŒ Ø§Ø±ÙØ¶'}
        onConfirm={() => pendingDecision && mutation.mutate(pendingDecision)}
        onCancel={() => setPendingDecision(null)}
      />
    </div>
  );
}
