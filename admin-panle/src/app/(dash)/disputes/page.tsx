'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ExternalLink, Gavel } from 'lucide-react';
import { disputesService } from '@/services/disputes.service';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Button, Spinner } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/providers';
import { formatDateTime } from '@/lib/format';
import type { AdminDispute } from '@/types/api';

type Decision =
  | { kind: 'in_review' }
  | { kind: 'resolve'; outcome: 'complete' | 'cancel' };

export default function DisputesPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [activeDispute, setActiveDispute] = useState<AdminDispute | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [resolutionText, setResolutionText] = useState('');

  const query = useQuery({
    queryKey: ['admin-disputes', statusFilter],
    queryFn: () => disputesService.list({ status: statusFilter || undefined }),
  });

  const mutation = useMutation({
    mutationFn: async (payload: { dispute: AdminDispute; decision: Decision; resolution: string }) => {
      if (payload.decision.kind === 'in_review') {
        return disputesService.review(payload.dispute._id, { decision: 'in_review' });
      }
      return disputesService.review(payload.dispute._id, {
        decision: 'resolved',
        outcome: payload.decision.outcome,
        resolution: payload.resolution,
      });
    },
    onSuccess: async () => {
      toast.push('تم تحديث حالة النزاع وتسجيله في التدقيق.', 'success');
      setActiveDispute(null);
      setDecision(null);
      setResolutionText('');
      await queryClient.invalidateQueries({ queryKey: ['admin-disputes'] });
    },
    onError: (error) => toast.push((error as Error).message, 'error'),
  });

  const disputes = query.data?.disputes ?? [];
  const orderIdOf = (dispute: AdminDispute) =>
    typeof dispute.order_id === 'object' && dispute.order_id?._id ? dispute.order_id._id : undefined;
  const orderNumberOf = (dispute: AdminDispute) =>
    typeof dispute.order_id === 'object' ? dispute.order_id?.order_number : undefined;

  return (
    <div>
      <PageHeader
        title="النزاعات"
        description="حسم النزاعات هو المسار الوحيد لخروج الطلب من حالة النزاع — كل قراراتك تُطبّق آثارها المالية والمخزنية وتُسجَّل"
        breadcrumb={['لوحة التحكم', 'التشغيل']}
        actions={
          <div className="flex gap-1.5">
            {['', 'open', 'in_review', 'resolved', 'rejected'].map((value) => (
              <button
                key={value || 'all'}
                type="button"
                onClick={() => setStatusFilter(value)}
                aria-pressed={statusFilter === value}
                className={`rounded-full px-3.5 py-2 text-xs font-bold ring-1 transition-colors ${
                  statusFilter === value ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-muted ring-line hover:text-ink'
                }`}
              >
                {value === '' ? 'الكل' : value === 'open' ? 'مفتوحة' : value === 'in_review' ? 'قيد المراجعة' : value === 'resolved' ? 'محلولة' : 'مرفوضة'}
              </button>
            ))}
          </div>
        }
      />

      {query.isLoading ? (
        <Card>
          <div className="space-y-3 p-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        </Card>
      ) : query.isError ? (
        <Card>
          <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
        </Card>
      ) : !disputes.length ? (
        <Card>
          <EmptyState icon={<Gavel size={44} strokeWidth={1.5} />} title="لا توجد نزاعات بهذه الحالة" />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {disputes.map((dispute) => (
            <Card key={dispute._id}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge kind="dispute" value={dispute.status} />
                  <Link
                    href={orderIdOf(dispute) ? `/orders/${orderIdOf(dispute)}` : '#'}
                    dir="ltr"
                    className="text-sm font-extrabold text-brand-700 hover:underline"
                  >
                    {orderNumberOf(dispute) ?? 'طلب'}
                  </Link>
                </div>
                <span className="text-[11px] text-muted">{formatDateTime(dispute.createdAt)}</span>
              </div>
              <div className="space-y-3 px-4 py-3.5">
                <p className="text-sm leading-6 text-ink">{dispute.reason}</p>
                {dispute.evidence_urls?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {dispute.evidence_urls.map((url, index) => (
                      <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-canvas px-2 py-1 text-[11px] font-bold text-ink ring-1 ring-line hover:bg-slate-50">
                        دليل {index + 1} <ExternalLink size={10} />
                      </a>
                    ))}
                  </div>
                ) : null}
                <p className="text-[11px] text-muted">
                  فتحه: {(dispute.opened_by_user_id as { name?: string })?.name ?? '—'}
                  {dispute.resolution ? ` · الحل: ${dispute.resolution}` : ''}
                </p>

                {dispute.status === 'open' || dispute.status === 'in_review' ? (
                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                    {dispute.status === 'open' ? (
                      <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => { setActiveDispute(dispute); setDecision({ kind: 'in_review' }); setResolutionText('بدأت إدارة المنصة مراجعة النزاع'); }}>
                        بدء المراجعة
                      </Button>
                    ) : null}
                    <Button size="sm" disabled={mutation.isPending} onClick={() => { setActiveDispute(dispute); setDecision({ kind: 'resolve', outcome: 'complete' }); setResolutionText(''); }}>
                      حل بإكمال الطلب
                    </Button>
                    <Button size="sm" variant="danger" disabled={mutation.isPending} onClick={() => { setActiveDispute(dispute); setDecision({ kind: 'resolve', outcome: 'cancel' }); setResolutionText(''); }}>
                      حل بالإلغاء والاسترجاع
                    </Button>
                    {mutation.isPending && activeDispute?._id === dispute._id ? <Spinner /> : null}
                  </div>
                ) : (
                  <p className="rounded-lg bg-canvas px-3 py-2 text-xs font-bold text-muted">
                    حُسم بواسطة {(dispute.resolved_by as { name?: string })?.name ?? '—'} · {formatDateTime(dispute.resolved_at)}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(activeDispute && decision)}
        loading={mutation.isPending}
        danger={decision?.kind === 'resolve' && decision.outcome === 'cancel'}
        title={
          decision?.kind === 'in_review'
            ? 'نقل النزاع لقيد المراجعة'
            : decision?.outcome === 'complete'
              ? 'حسم النزاع بإكمال الطلب'
              : 'حسم النزاع بإلغاء الطلب'
        }
        description={
          <>
            {decision?.kind === 'in_review' ? (
              <p>سيُسجَّل أن الإدارة بدأت مراجعة هذا النزاع.</p>
            ) : decision?.outcome === 'complete' ? (
              <p className="leading-7">
                سيُعتمد الطلب ويُثبَّت المخزون، وتُعتبر التزامات الدفع المقدَّمة مستحقة للطرف المستفيد.
              </p>
            ) : (
              <p className="leading-7">
                سيُلغى الطلب نهائيًا، ويعود المخزون المحجوز، وتتحول التزامات الدفع المؤكدة/المقدمة إلى{' '}
                <strong>«استرجاع معلق»</strong> لتتم معالجتها من قسم الاسترجاعات.
              </p>
            )}
            <textarea
              value={resolutionText}
              onChange={(event) => setResolutionText(event.target.value)}
              rows={3}
              placeholder="ملخص القرار (٥ أحرف على الأقل)…"
              aria-label="ملخص القرار"
              minLength={5}
              className="mt-3 w-full rounded-xl border border-line p-3 text-sm focus:border-brand-600 focus:outline-none"
            />
          </>
        }
        confirmLabel="تأكيد القرار"
        onConfirm={() => {
          if (!activeDispute || !decision) return;
          if (resolutionText.trim().length < 5) {
            toast.push('اكتب ملخص قرار من ٥ أحرف على الأقل.', 'error');
            return;
          }
          mutation.mutate({ dispute: activeDispute, decision, resolution: resolutionText.trim() });
        }}
        onCancel={() => {
          setActiveDispute(null);
          setDecision(null);
          setResolutionText('');
        }}
      />
    </div>
  );
}
