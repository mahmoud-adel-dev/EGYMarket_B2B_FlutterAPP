'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Receipt } from 'lucide-react';
import { api } from '@/lib/api-client';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Button, Spinner } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/providers';
import { egp, formatDateTime } from '@/lib/format';

interface PendingProof {
  _id: string;
  order_id?: { _id?: string; order_number?: string } | string | null;
  amount_piasters: number;
  payment_method?: string;
  sender_reference?: string;
  proof_url?: string;
  createdAt: string;
  payer_organization_id?: { display_name?: string } | null;
}

export default function PaymentsPage() {
  const [pendingDecision, setPendingDecision] = useState<
    { proof: PendingProof; decision: 'confirm' | 'reject' } | null
  >(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-payment-proofs'],
    queryFn: () =>
      api.get<{ success: boolean; transactions: PendingProof[] }>('admin/transactions', {
        tx_type: 'platform_fee',
        status: 'proof_submitted',
        limit: 50,
      }),
    refetchInterval: 60_000,
  });

  const orderIdOf = (proof: PendingProof) => {
    const order = proof.order_id;
    if (order && typeof order === 'object') return order._id;
    return typeof order === 'string' ? order : undefined;
  };

  const mutation = useMutation({
    mutationFn: async ({ proof, decision }: { proof: PendingProof; decision: 'confirm' | 'reject' }) => {
      const orderId = orderIdOf(proof);
      if (!orderId) throw new Error('لا يمكن تحديد الطلب المرتبط بهذا الإثبات.');
      return api.post<{ success: boolean; message?: string }>(
        `orders/${orderId}/payments/${proof._id}/review`,
        {
          decision,
          ...(decision === 'reject' ? { rejection_reason: 'بيانات التحويل غير مطابقة — راجع الإيصال' } : {}),
        },
      );
    },
    onSuccess: async (_data, variables) => {
      toast.push(
        variables.decision === 'confirm'
          ? `تم تأكيد رسم المنصة للطلب ${variables.proof.order_id && typeof variables.proof.order_id === 'object' ? variables.proof.order_id.order_number : ''}.`
          : 'تم رفض الإثبات ويمكن للمشتري إعادة الإرسال.',
        variables.decision === 'confirm' ? 'success' : 'info',
      );
      setPendingDecision(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-payment-proofs'] });
    },
    onError: (error) => toast.push((error as Error).message, 'error'),
  });

  const rows = query.data?.transactions ?? [];

  return (
    <div>
      <PageHeader
        title="المدفوعات — إثباتات رسوم المنصة"
        description="مراجعة تحويلات رسم المنصة (50 ج.م) قبل فتح متابعة الطلب للمشتري"
        breadcrumb={['لوحة التحكم', 'المالية']}
      />

      {query.isLoading ? (
        <Card>
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        </Card>
      ) : query.isError ? (
        <Card>
          <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
        </Card>
      ) : !rows.length ? (
        <Card>
          <EmptyState
            icon={<Receipt size={44} strokeWidth={1.5} />}
            title="لا توجد إثباتات بانتظار المراجعة"
            description="سيظهر هنا كل تحويل رسم منصة جديد يرفعه المشترون."
          />
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {rows.map((proof) => (
            <article key={proof._id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5">
              <div className="min-w-40">
                <p dir="ltr" className="text-sm font-extrabold text-ink">
                  {(proof.order_id as { order_number?: string })?.order_number ?? '—'}
                </p>
                <p className="text-[11px] text-muted">{formatDateTime(proof.createdAt)}</p>
              </div>
              <Badge tone="violet">{egp(proof.amount_piasters)}</Badge>
              <span className="text-xs text-muted">الدافع: {proof.payer_organization_id?.display_name ?? '—'}</span>
              <span className="text-xs text-muted" dir="ltr">
                {proof.sender_reference}
              </span>
              {proof.proof_url ? (
                <a href={proof.proof_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:underline">
                  فتح الإيصال <ExternalLink size={11} />
                </a>
              ) : null}
              <div className="ms-auto flex gap-2">
                {orderIdOf(proof) ? (
                  <Link href={`/orders/${orderIdOf(proof)}`}>
                    <Button variant="ghost" size="sm">الطلب</Button>
                  </Link>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPendingDecision({ proof, decision: 'reject' })}
                  disabled={mutation.isPending}
                >
                  رفض
                </Button>
                <Button size="sm" onClick={() => setPendingDecision({ proof, decision: 'confirm' })} disabled={mutation.isPending}>
                  تأكيد الاستلام
                </Button>
                {mutation.isPending && pendingDecision?.proof._id === proof._id ? <Spinner /> : null}
              </div>
            </article>
          ))}
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(pendingDecision)}
        loading={mutation.isPending}
        danger={pendingDecision?.decision === 'reject'}
        title={pendingDecision?.decision === 'confirm' ? 'تأكيد استلام الرسم' : 'رفض الإثبات'}
        description={
          pendingDecision?.decision === 'confirm' ? (
            <p>
              تأكيد استلام رسم المنصة بقيمة{' '}
              <strong>{egp(pendingDecision?.proof.amount_piasters)}</strong> للطلب{' '}
              <strong dir="ltr">{(pendingDecision?.proof.order_id as { order_number?: string })?.order_number}</strong>.
              سيُفتح بعدها متابعة الطلب للمشتري، ويُسجَّل الإجراء في سجل التدقيق.
            </p>
          ) : (
            <p>
              رفض الإثبات يعيد الالتزام إلى «بانتظار التحويل» ليعيد المشتري رفع إثبات صحيح. هل تريد المتابعة؟
            </p>
          )
        }
        confirmLabel={pendingDecision?.decision === 'confirm' ? 'نعم، تم استلامه' : 'نعم، ارفض الإثبات'}
        onConfirm={() => pendingDecision && mutation.mutate(pendingDecision)}
        onCancel={() => setPendingDecision(null)}
      />
    </div>
  );
}
