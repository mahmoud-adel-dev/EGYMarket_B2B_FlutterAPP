'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { organizationsService } from '@/services/organizations.service';
import { PageHeader } from '@/components/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button, Spinner } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/providers';
import { formatDate } from '@/lib/format';
import type { AdminOrganization } from '@/types/api';

interface PendingDecision {
  organization: AdminOrganization;
  decision: 'approve' | 'reject' | 'suspend';
}

const STATUS_FILTERS = [
  { value: 'pending', label: 'قيد المراجعة' },
  { value: 'rejected', label: 'مرفوضة' },
  { value: 'suspended', label: 'موقوفة' },
  { value: 'verified', label: 'موثّقة' },
  { value: 'unsubmitted', label: 'لم يُقدَّم' },
];

export default function VerificationPage() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const toast = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-verification-queue', statusFilter],
    queryFn: () =>
      organizationsService.list({
        verification_status: statusFilter,
        limit: 50,
      }),
  });

  const mutation = useMutation({
    mutationFn: async (decision: PendingDecision) => {
      return organizationsService.verify(
        decision.organization._id,
        decision.decision,
        decision.decision === 'approve' ? undefined : rejectionReason,
      );
    },
    onSuccess: async (_data, decision) => {
      toast.push(
        decision.decision === 'approve'
          ? `تم اعتماد توثيق «${decision.organization.display_name}».`
          : `تم تحديث حالة «${decision.organization.display_name}».`,
        'success',
      );
      setPendingDecision(null);
      setRejectionReason('');
      await queryClient.invalidateQueries({ queryKey: ['admin-verification-queue'] });
    },
    onError: (error) => {
      toast.push((error as Error).message, 'error');
    },
  });

  function requestDecision(organization: AdminOrganization, decision: PendingDecision['decision']) {
    setRejectionReason('');
    setPendingDecision({ organization, decision });
  }

  return (
    <div>
      <PageHeader
        title="توثيق المؤسسات"
        description="مراجعة مستندات التسجيل واعتماد المؤسسات أو رفضها أو تعليقها — كل إجراء يُسجَّل في سجل التدقيق"
        breadcrumb={['لوحة التحكم', 'التشغيل']}
      />

      <div className="mb-4 flex items-center gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatusFilter(filter.value)}
            aria-pressed={statusFilter === filter.value}
            className={`rounded-full px-4 py-2 text-xs font-bold ring-1 transition-colors ${
              statusFilter === filter.value
                ? 'bg-navy-900 text-white ring-navy-900'
                : 'bg-white text-muted ring-line hover:text-ink'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <Card>
          <CardBody className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </CardBody>
        </Card>
      ) : query.isError ? (
        <Card>
          <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
        </Card>
      ) : !query.data?.organizations.length ? (
        <Card>
          <EmptyState
            icon={<ShieldCheck size={44} strokeWidth={1.5} />}
            title="لا توجد مؤسسات بهذه الحالة"
            description="ستظهر هنا طلبات التوثيق الجديدة فور تقديم المؤسسات مستنداتها."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {query.data.organizations.map((organization) => (
            <Card key={organization._id}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {organization.display_name}
                    <OrgTypeBadgeInline type={organization.type} />
                    <StatusBadge kind="verification" value={organization.verification_status} />
                  </span>
                }
                subtitle={`${organization.legal_name} · ${organization.location?.governorate ?? ''}`}
                action={
                  <span className="text-[11px] text-muted">
                    قُدّمت {formatDate(organization.updatedAt ?? organization.createdAt)}
                  </span>
                }
              />
              <CardBody className="space-y-3">
                <ul className="space-y-1.5 text-xs leading-6 text-muted" dir="ltr">
                  <li>📧 {organization.email}</li>
                  <li dir="rtl">📞 {organization.phone}</li>
                  {organization.tax_number ? <li dir="rtl">🧾 رقم ضريبي: {organization.tax_number}</li> : null}
                  {organization.commercial_register_number ? (
                    <li dir="rtl">🏛️ سجل تجاري: {organization.commercial_register_number}</li>
                  ) : null}
                </ul>

                <div className="space-y-2">
                  <p className="text-xs font-extrabold text-ink">المستندات ({organization.verification_documents.length})</p>
                  {organization.verification_documents.length ? (
                    <div className="flex flex-wrap gap-2">
                      {organization.verification_documents.map((document) => (
                        <a
                          key={document._id}
                          href={document.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ring-1 transition-colors hover:bg-slate-50 ${
                            document.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                              : document.status === 'rejected'
                                ? 'bg-red-50 text-red-700 ring-red-200'
                                : 'bg-canvas text-ink ring-line'
                          }`}
                        >
                          {docTypeLabel(document.type)}
                          <ExternalLink size={11} />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">لا توجد مستندات مرفقة.</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                  <Button size="sm" onClick={() => requestDecision(organization, 'approve')} disabled={mutation.isPending}>
                    <ShieldCheck size={14} />
                    اعتماد التوثيق
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => requestDecision(organization, 'reject')} disabled={mutation.isPending}>
                    رفض
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => requestDecision(organization, 'suspend')} disabled={mutation.isPending}>
                    تعليق الحساب
                  </Button>
                  {mutation.isPending &&
                  pendingDecision?.organization._id === organization._id ? (
                    <Spinner />
                  ) : null}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDecision)}
        loading={mutation.isPending}
        danger={pendingDecision?.decision !== 'approve'}
        title={
          pendingDecision?.decision === 'approve'
            ? 'اعتماد توثيق المؤسسة'
            : pendingDecision?.decision === 'suspend'
              ? 'تعليق حساب المؤسسة'
              : 'رفض طلب التوثيق'
        }
        description={
          <>
            <p>
              أنت على وشك{' '}
              <strong>
                {pendingDecision?.decision === 'approve'
                  ? 'اعتماد'
                  : pendingDecision?.decision === 'suspend'
                    ? 'تعليق'
                    : 'رفض'}{' '}
                «{pendingDecision?.organization.display_name}»
              </strong>
              . سيُسجَّل هذا الإجراء في سجل التدقيق باسمك.
            </p>
            {pendingDecision && pendingDecision.decision !== 'approve' ? (
              <textarea
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                rows={3}
                placeholder={pendingDecision.decision === 'suspend' ? 'سبب التعليق…' : 'سبب الرفض…'}
                aria-label="سبب القرار"
                className="mt-3 w-full rounded-xl border border-line p-3 text-sm focus:border-brand-600 focus:outline-none"
                minLength={3}
                required
              />
            ) : null}
          </>
        }
        confirmLabel={
          pendingDecision?.decision === 'approve'
            ? 'تأكيد الاعتماد'
            : pendingDecision?.decision === 'suspend'
              ? 'تأكيد التعليق'
              : 'تأكيد الرفض'
        }
        onConfirm={() => {
          if (!pendingDecision) return;
          if (pendingDecision.decision !== 'approve' && rejectionReason.trim().length < 3) {
            toast.push('يرجى كتابة سبب القرار (٣ أحرف على الأقل).', 'error');
            return;
          }
          mutation.mutate(pendingDecision);
        }}
        onCancel={() => {
          setPendingDecision(null);
          setRejectionReason('');
        }}
      />
    </div>
  );
}

function OrgTypeBadgeInline({ type }: { type: string }) {
  return (
    <Badge tone={type === 'wholesaler' ? 'teal' : type === 'shipper' ? 'sky' : 'violet'}>
      {type === 'wholesaler' ? 'بائع جملة' : type === 'shipper' ? 'شركة شحن' : 'مشتري'}
    </Badge>
  );
}

function docTypeLabel(type: string): string {
  switch (type) {
    case 'commercial_register':
      return 'السجل التجاري';
    case 'tax_card':
      return 'البطاقة الضريبية';
    case 'national_id':
      return 'هوية وطنية';
    case 'shipping_license':
      return 'رخصة نقل';
    default:
      return 'مستند آخر';
  }
}
