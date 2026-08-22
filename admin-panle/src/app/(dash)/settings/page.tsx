'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusCircle, Save } from 'lucide-react';
import { adminOpsService } from '@/services/admin-ops.service';
import { subscriptionsService } from '@/services/subscriptions.service';
import { PageHeader, StatCard } from '@/components/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/providers';
import { egp } from '@/lib/format';
import type { PlatformSettingsPayload } from '@/types/api';

const EMPTY_ACCOUNT = {
  method: 'instapay',
  label: '',
  account_holder: '',
  account_reference: '',
  instructions: '',
  is_active: true,
};

export default function SettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PlatformSettingsPayload | null>(null);
  const [planModalOpen, setPlanModalOpen] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => adminOpsService.settings(),
  });

  const plansQuery = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => subscriptionsService.plans(),
  });

  useEffect(() => {
    if (settingsQuery.data?.settings) {
      setForm({
        ...settingsQuery.data.settings,
        platform_payment_accounts: settingsQuery.data.settings.platform_payment_accounts ?? [],
      });
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<PlatformSettingsPayload>) => adminOpsService.updateSettings(payload),
    onSuccess: async () => {
      toast.push('تم حفظ الإعدادات بنجاح.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: (error) => toast.push((error as Error).message, 'error'),
  });

  const createPlanMutation = useMutation({
    mutationFn: (payload: Omit<import('@/types/api').SubscriptionPlan, '_id'>) =>
      subscriptionsService.createPlan(payload),
    onSuccess: async () => {
      toast.push('تم إنشاء الخطة.', 'success');
      setPlanModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
    },
    onError: (error) => toast.push((error as Error).message, 'error'),
  });

  if (settingsQuery.isError) {
    return (
      <div>
        <PageHeader title="إعدادات المنصة" breadcrumb={['لوحة التحكم', 'الإدارة']} />
        <Card>
          <ErrorState message={(settingsQuery.error as Error).message} onRetry={() => settingsQuery.refetch()} />
        </Card>
      </div>
    );
  }

  if (!form) {
    return (
      <div>
        <PageHeader title="إعدادات المنصة" breadcrumb={['لوحة التحكم', 'الإدارة']} />
        <Card>
          <CardBody className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </CardBody>
        </Card>
      </div>
    );
  }

  function patch(partial: Partial<PlatformSettingsPayload>) {
    setForm((current) => (current ? { ...current, ...partial } : current));
  }

  return (
    <div>
      <PageHeader
        title="إعدادات المنصة"
        description="رسوم الطلبات، مهل السداد والدفع، حسابات استلام المنصة، وخطط الاشتراك"
        breadcrumb={['لوحة التحكم', 'الإدارة']}
        actions={
          <Button
            onClick={() =>
              saveMutation.mutate({
                order_fee_piasters: form.order_fee_piasters,
                trial_days: form.trial_days,
                subscription_grace_days: form.subscription_grace_days,
                payment_deadline_hours: form.payment_deadline_hours,
                platform_payment_accounts: form.platform_payment_accounts,
                support_email: form.support_email,
                support_phone: form.support_phone,
              })
            }
            disabled={saveMutation.isPending}
          >
            <Save size={15} />
            حفظ التغييرات
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="قواعد الأعمال" subtitle="تُطبَّق على الطلبات والاشتراكات الجديدة فورًا" />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Field label="رسم المنصة لكل طلب (قروش)" hint={`الحالي: ${egp(form.order_fee_piasters)}`}>
              <Input
                type="number"
                min={0}
                value={form.order_fee_piasters}
                onChange={(event) => patch({ order_fee_piasters: Number(event.target.value) || 0 })}
              />
            </Field>
            <Field label="أيام التجربة المجانية">
              <Input
                type="number"
                min={0}
                value={form.trial_days}
                onChange={(event) => patch({ trial_days: Number(event.target.value) || 0 })}
              />
            </Field>
            <Field label="أيام مهلة سماح الاشتراك">
              <Input
                type="number"
                min={0}
                value={form.subscription_grace_days}
                onChange={(event) => patch({ subscription_grace_days: Number(event.target.value) || 0 })}
              />
            </Field>
            <Field label="ساعات مهلة سداد الطلب" hint="بعد انتهائها يُحرك كرون الإلغاء التلقائي">
              <Input
                type="number"
                min={1}
                value={form.payment_deadline_hours}
                onChange={(event) => patch({ payment_deadline_hours: Number(event.target.value) || 1 })}
              />
            </Field>
            <Field label="بريد الدعم" className="sm:col-span-2">
              <Input
                type="email"
                dir="ltr"
                value={form.support_email ?? ''}
                onChange={(event) => patch({ support_email: event.target.value })}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="حسابات استلام المنصة"
            subtitle="تظهر للمشترين عند سداد رسم المنصة (حد أقصى ١٠)"
          />
          <CardBody className="space-y-3">
            {form.platform_payment_accounts.map((account, index) => (
              <div key={index} className="rounded-xl border border-line p-3">
                <div className="mb-2 flex items-center justify-between">
                  <Badge tone="teal">{methodLabel(account.method)}</Badge>
                  <button
                    type="button"
                    className="text-xs font-bold text-red-600 hover:underline"
                    onClick={() =>
                      patch({
                        platform_payment_accounts: form.platform_payment_accounts.filter(
                          (_, position) => position !== index,
                        ),
                      })
                    }
                  >
                    حذف
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    placeholder="التسمية"
                    aria-label="التسمية"
                    value={account.label}
                    onChange={(event) => updateAccount(index, { ...account, label: event.target.value })}
                  />
                  <Input
                    placeholder="صاحب الحساب"
                    aria-label="صاحب الحساب"
                    value={account.account_holder}
                    onChange={(event) => updateAccount(index, { ...account, account_holder: event.target.value })}
                  />
                  <Input
                    placeholder="رقم/عنوان الحساب"
                    dir="ltr"
                    aria-label="رقم الحساب"
                    value={account.account_reference}
                    onChange={(event) => updateAccount(index, { ...account, account_reference: event.target.value })}
                  />
                </div>
                <Textarea
                  rows={2}
                  placeholder="تعليمات للعميل (اختياري)"
                  aria-label="تعليمات"
                  className="mt-2 !min-h-[60px]"
                  value={account.instructions ?? ''}
                  onChange={(event) => updateAccount(index, { ...account, instructions: event.target.value })}
                />
              </div>
            ))}
            {form.platform_payment_accounts.length < 10 ? (
              <Button variant="outline" size="sm" onClick={() => patch({ platform_payment_accounts: [...form.platform_payment_accounts, { ...EMPTY_ACCOUNT }] })}>
                <PlusCircle size={14} />
                إضافة حساب
              </Button>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="خطط الاشتراك"
          subtitle={`${plansQuery.data?.plans.length ?? 0} خطة`}
          action={
            <Button size="sm" variant="outline" onClick={() => setPlanModalOpen(true)}>
              <PlusCircle size={14} />
              خطة جديدة
            </Button>
          }
        />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th scope="col" className="px-4 py-2.5 text-start font-bold">الكود</th>
                  <th scope="col" className="px-2 py-2.5 text-start font-bold">الاسم</th>
                  <th scope="col" className="px-2 py-2.5 text-center font-bold">الدورة</th>
                  <th scope="col" className="px-2 py-2.5 text-end font-bold">السعر</th>
                  <th scope="col" className="px-4 py-2.5 text-center font-bold">الأنواع</th>
                  <th scope="col" className="px-4 py-2.5 text-center font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {(plansQuery.data?.plans ?? []).map((plan) => (
                  <tr key={plan._id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2.5 font-extrabold" dir="ltr">{plan.code}</td>
                    <td className="px-2 py-2.5">{plan.name_ar}</td>
                    <td className="px-2 py-2.5 text-center text-xs">{plan.billing_interval === 'yearly' ? 'سنوي' : 'شهري'}</td>
                    <td className="px-2 py-2.5 text-end font-extrabold">{egp(plan.price_piasters)}</td>
                    <td className="px-4 py-2.5 text-center text-[11px]" dir="ltr">{(plan.organization_types ?? []).join(', ')}</td>
                    <td className="px-4 py-2.5 text-center">
                      {plan.is_active ? <Badge tone="green">نشطة</Badge> : <Badge tone="gray">متوقفة</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <NewPlanModal
        open={planModalOpen}
        loading={createPlanMutation.isPending}
        onClose={() => setPlanModalOpen(false)}
        onSubmit={(payload) => createPlanMutation.mutate(payload)}
      />
    </div>
  );

  function updateAccount(index: number, next: PlatformSettingsPayload['platform_payment_accounts'][number]) {
    setForm((current) =>
      current
        ? {
            ...current,
            platform_payment_accounts: current.platform_payment_accounts.map((account, position) =>
              position === index ? next : account,
            ),
          }
        : current,
    );
  }
}

function NewPlanModal({
  open,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: Omit<import('@/types/api').SubscriptionPlan, '_id'>) => void;
}) {
  const [draft, setDraft] = useState({
    code: '',
    name_ar: '',
    name_en: '',
    price_egp: '',
    billing_interval: 'monthly' as 'monthly' | 'yearly',
    organization_types: 'wholesaler,buyer,shipper',
    is_active: true,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="إنشاء خطة اشتراك"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button
            disabled={loading || draft.code.trim().length < 2 || draft.name_ar.trim().length < 2}
            onClick={() =>
              onSubmit({
                code: draft.code.trim().toUpperCase(),
                name_ar: draft.name_ar.trim(),
                name_en: draft.name_en.trim() || undefined,
                price_piasters: Math.round(Number(draft.price_egp || 0) * 100),
                billing_interval: draft.billing_interval,
                organization_types: draft.organization_types
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
                features: [],
                is_active: draft.is_active,
              })
            }
          >
            إنشاء الخطة
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="كود الخطة">
          <Input dir="ltr" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="PRO_MONTHLY" />
        </Field>
        <Field label="الاسم بالعربية">
          <Input value={draft.name_ar} onChange={(event) => setDraft({ ...draft, name_ar: event.target.value })} />
        </Field>
        <Field label="السعر (ج.م)">
          <Input type="number" min={0} step="0.01" value={draft.price_egp} onChange={(event) => setDraft({ ...draft, price_egp: event.target.value })} />
        </Field>
        <Field label="دورة الفوترة">
          <Select value={draft.billing_interval} onChange={(event) => setDraft({ ...draft, billing_interval: event.target.value as 'monthly' | 'yearly' })}>
            <option value="monthly">شهري</option>
            <option value="yearly">سنوي</option>
          </Select>
        </Field>
        <Field label="أنواع المؤسسات" hint="مفصولة بفواصل" className="sm:col-span-2">
          <Input dir="ltr" value={draft.organization_types} onChange={(event) => setDraft({ ...draft, organization_types: event.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function methodLabel(method: string): string {
  switch (method) {
    case 'instapay':
      return 'إنستاباي';
    case 'mobile_wallet':
      return 'محفظة موبايل';
    case 'bank_transfer':
      return 'تحويل بنكي';
    case 'cash':
      return 'كاش';
    default:
      return method;
  }
}
