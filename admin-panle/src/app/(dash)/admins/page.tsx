'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, UserX } from 'lucide-react';
import { adminOpsService } from '@/services/admin-ops.service';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useSession, useToast } from '@/components/providers';
import { formatDate } from '@/lib/format';
import type { AdminAccount } from '@/types/api';

export default function AdminsPage() {
  const session = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pendingToggle, setPendingToggle] = useState<{ admin: AdminAccount; next: boolean } | null>(null);

  const query = useQuery({ queryKey: ['admin-accounts'], queryFn: () => adminOpsService.admins() });

  const mutation = useMutation({
    mutationFn: (payload: { id: string; isActive: boolean }) =>
      adminOpsService.setAdminActive(payload.id, payload.isActive),
    onSuccess: async () => {
      toast.push('تم تحديث حالة الحساب وتسجيل الإجراء في التدقيق.', 'success');
      setPendingToggle(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-accounts'] });
    },
    onError: (error) => toast.push((error as Error).message, 'error'),
  });

  return (
    <div>
      <PageHeader
        title="حسابات الإدارة"
        description="حسابات المشرفين على المنصة — التعطيل يمنع الدخول فورًا (الجلسات تُرفض عند التحقق من قاعدة البيانات)"
        breadcrumb={['لوحة التحكم', 'الإدارة']}
      />

      <Card>
        {query.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
        ) : !query.data?.admins.length ? (
          <EmptyState icon={<ShieldCheck size={44} strokeWidth={1.5} />} title="لا توجد حسابات إدارة" />
        ) : (
          <ul className="divide-y divide-line">
            {query.data.admins.map((admin) => {
              const isSelf = admin._id === session.user.id;
              return (
                <li key={admin._id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-navy-900 text-sm font-extrabold text-white">
                    {admin.name?.trim().charAt(0) || 'A'}
                  </span>
                  <div className="min-w-40">
                    <p className="text-sm font-extrabold text-ink">
                      {admin.name}
                      {isSelf ? <span className="ms-2 text-[11px] font-bold text-brand-700">(أنت)</span> : null}
                    </p>
                    <p className="text-[11px] text-muted" dir="ltr">{admin.email}</p>
                  </div>
                  <Badge tone="gray">{admin.role}</Badge>
                  {admin.isActive ? (
                    <Badge tone="green">نشط</Badge>
                  ) : (
                    <Badge tone="red">معطّل</Badge>
                  )}
                  <span className="text-xs text-muted">أُنشئ {formatDate(admin.createdAt)}</span>
                  <div className="ms-auto">
                    <Button
                      size="sm"
                      variant={admin.isActive ? 'outline' : 'primary'}
                      disabled={isSelf || mutation.isPending}
                      onClick={() => setPendingToggle({ admin, next: !admin.isActive })}
                      title={isSelf ? 'لا يمكنك تعطيل حسابك' : undefined}
                    >
                      {admin.isActive ? (
                        <>
                          <UserX size={14} />
                          تعطيل
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={14} />
                          تنشيط
                        </>
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(pendingToggle)}
        loading={mutation.isPending}
        danger={Boolean(pendingToggle?.next === false)}
        title={pendingToggle?.next ? 'تنشيط حساب إداري' : 'تعطيل حساب إداري'}
        description={
          <p>
            سيتم {pendingToggle?.next ? 'تنشيط' : 'تعطيل'} حساب{' '}
            <strong dir="ltr">{pendingToggle?.admin.email}</strong>. يُسجَّل هذا الإجراء في سجل التدقيق باسمك.
          </p>
        }
        confirmLabel={pendingToggle?.next ? 'نعم، نشّط' : 'نعم، عطّل'}
        onConfirm={() => {
          if (pendingToggle) mutation.mutate({ id: pendingToggle.admin._id, isActive: pendingToggle.next });
        }}
        onCancel={() => setPendingToggle(null)}
      />
    </div>
  );
}
