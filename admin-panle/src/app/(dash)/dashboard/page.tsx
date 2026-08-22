'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BadgeCheck,
  Banknote,
  Boxes,
  FileText,
  Gavel,
  Receipt,
  RefreshCcw,
  ShoppingBag,
  Undo2,
  Wallet,
} from 'lucide-react';
import { dashboardService } from '@/services/dashboard.service';
import { PageHeader, StatCard } from '@/components/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { defaultDateRange, DateRangeControl, type DateRangeValue } from '@/components/data-table';
import { CardsSkeleton } from '@/components/ui/states';
import { ORDER_STATUS_LABELS } from '@/components/ui/badge';
import { compactNumber, egp } from '@/lib/format';

const QUEUE_CARDS = [
  { href: '/verification', key: 'pendingVerification', label: 'توثيق مؤسسات منتظر', icon: BadgeCheck },
  { href: '/payments', key: 'pendingProofs', label: 'إثباتات رسوم بانتظار المراجعة', icon: Receipt },
  { href: '/invoices', key: 'pendingSubscriptions', label: 'فواتير اشتراك للمراجعة', icon: FileText },
  { href: '/disputes', key: 'openDisputes', label: 'نزاعات مفتوحة', icon: Gavel },
] as const;

const CHART_AXIS = { fontSize: 11, fontFamily: 'inherit' };

export default function DashboardPage() {
  const [range, setRange] = useState<DateRangeValue>(defaultDateRange(30));

  const overviewQuery = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => dashboardService.overview(),
  });

  const analyticsQuery = useQuery({
    queryKey: ['admin-analytics', range.from, range.to],
    queryFn: () => dashboardService.analytics(range.from, range.to),
  });

  const overview = overviewQuery.data;
  const analytics = analyticsQuery.data;

  return (
    <div>
      <PageHeader
        title="نظرة عامة"
        description="ملخّص حي لحركة المنصة والأداء المالي"
        breadcrumb={['لوحة التحكم']}
        actions={<DateRangeControl value={range} onChange={setRange} />}
      />

      <section aria-label="مؤشرات الفترة">
        <p className="mb-3 text-sm font-extrabold text-muted">أداء الفترة المحددة</p>
        {analyticsQuery.isLoading ? (
          <CardsSkeleton />
        ) : analyticsQuery.isError ? (
          <Card>
            <CardBody className="text-sm font-semibold text-red-700">
              تعذر تحميل تحليلات الفترة: {(analyticsQuery.error as Error).message}
            </CardBody>
          </Card>
        ) : analytics ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="طلبات الفترة"
              value={compactNumber(analytics.totals.orders_created)}
              hint={`مكتملة ${compactNumber(analytics.totals.completed_orders)} · ملغاة ${compactNumber(analytics.totals.canceled_orders)}`}
              icon={<ShoppingBag size={18} />}
            />
            <StatCard
              label="قيمة البضاعة المطلوبة (GMV)"
              value={egp(analytics.totals.gmv_piasters)}
              icon={<Banknote size={18} />}
            />
            <StatCard
              label="رسوم منصة مؤكدة"
              value={egp(analytics.totals.platform_fees_confirmed_piasters)}
              icon={<Receipt size={18} />}
              tone="positive"
            />
            <StatCard
              label="إيراد اشتراكات محصّل"
              value={egp(analytics.totals.subscription_revenue_paid_piasters)}
              icon={<RefreshCcw size={18} />}
              tone="positive"
            />
          </div>
        ) : null}
      </section>

      <section aria-label="حالة المنصة الحالية" className="mt-8">
        <p className="mb-3 text-sm font-extrabold text-muted">حالة المنصة الحالية (إجمالي)</p>
        {overviewQuery.isLoading ? (
          <CardsSkeleton count={5} />
        ) : overviewQuery.isError || !overview ? (
          <Card>
            <CardBody className="text-sm font-semibold text-red-700">
              تعذر تحميل مؤشرات المنصة.
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="إجمالي رسوم الطلبات المحصّلة"
                value={egp(overview.revenue.order_fees_piasters)}
                hint={`${compactNumber(overview.revenue.order_fees_count)} طلب`}
                icon={<Wallet size={18} />}
                tone="positive"
              />
              <StatCard
                label="إجمالي إيراد الاشتراكات"
                value={egp(overview.revenue.subscriptions_piasters)}
                hint={`${compactNumber(overview.revenue.subscriptions_count)} فاتورة مدفوعة`}
                icon={<Banknote size={18} />}
                tone="positive"
              />
              <StatCard
                label="اشتراكات نشطة"
                value={compactNumber(overview.subscriptions.active)}
                hint={`تجريبية ${compactNumber(overview.subscriptions.trialing)} · متعثرة ${compactNumber(overview.subscriptions.lapsed)}`}
                icon={<RefreshCcw size={18} />}
              />
              <StatCard
                label="مؤسسات نشطة"
                value={compactNumber(
                  overview.organizations_active.buyers +
                    overview.organizations_active.sellers +
                    overview.organizations_active.shippers,
                )}
                hint={`بائعون ${compactNumber(overview.organizations_active.sellers)} · مشترون ${compactNumber(overview.organizations_active.buyers)} · شحن ${compactNumber(overview.organizations_active.shippers)}`}
                icon={<Boxes size={18} />}
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {QUEUE_CARDS.map((queue) => {
                const count = overview.queues[queue.key];
                return (
                  <Link key={queue.key} href={queue.href} className="group">
                    <div
                      className={`flex items-center gap-3 rounded-2xl p-4 ring-1 transition-shadow group-hover:shadow-md ${
                        count > 0 ? 'bg-amber-50/70 ring-amber-200' : 'bg-white ring-line'
                      }`}
                    >
                      <span
                        className={`flex size-10 items-center justify-center rounded-xl ${
                          count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <queue.icon size={19} />
                      </span>
                      <div>
                        <p className="text-xl font-extrabold leading-none text-ink">
                          {compactNumber(count)}
                        </p>
                        <p className="mt-1 text-xs font-bold text-muted">{queue.label}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </section>

      {analytics && !analyticsQuery.isLoading ? (
        <section aria-label="الرسوم البيانية" className="mt-8 grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="الإيرادات عبر الزمن" subtitle="رسوم المنصة وإيراد الاشتراكات يوميًا" />
            <CardBody>
              <div dir="ltr" className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.series} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                    <defs>
                      <linearGradient id="feesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0f766e" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7edf1" />
                    <XAxis dataKey="label" tick={CHART_AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={CHART_AXIS} tickLine={false} axisLine={false} width={54} tickFormatter={(value) => `${Math.round(Number(value) / 100)}`} />
                    <Tooltip formatter={(value) => egp(Number(value))} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" name="رسوم المنصة" dataKey="platform_fees_confirmed_piasters" stroke="#0f766e" fill="url(#feesFill)" strokeWidth={2} />
                    <Area type="monotone" name="إيراد الاشتراكات" dataKey="subscription_revenue_piasters" stroke="#7c3aed" fillOpacity={0.05} fill="#7c3aed" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="الطلبات عبر الزمن" subtitle="عدد الطلبات وقيمة البضاعة يوميًا" />
            <CardBody>
              <div dir="ltr" className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.series} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7edf1" vertical={false} />
                    <XAxis dataKey="label" tick={CHART_AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={CHART_AXIS} tickLine={false} axisLine={false} width={36} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Bar name="عدد الطلبات" dataKey="orders_created" fill="#14b8a6" radius={[5, 5, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="نمو المؤسسات والمستخدمين" subtitle="منشآت ومستخدمون جدد يوميًا" />
            <CardBody>
              <div dir="ltr" className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.series} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7edf1" vertical={false} />
                    <XAxis dataKey="label" tick={CHART_AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={CHART_AXIS} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" name="مؤسسات جديدة" dataKey="new_organizations" stroke="#0369a1" strokeWidth={2} dot={false} />
                    <Line type="monotone" name="مستخدمون جدد" dataKey="new_users" stroke="#d97706" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="توزيع حالات الطلبات (الفترة)" subtitle="وفق الطلبات المنشأة خلال النطاق الزمني" />
            <CardBody>
              <StatusBars counts={analytics.orders_by_status} />
            </CardBody>
          </Card>
        </section>
      ) : null}

      {overview && !overviewQuery.isLoading ? (
        <section aria-label="توزيع المؤسسات حسب التوثيق" className="mt-4 grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="المؤسسات حسب حالة التوثيق (إجمالي)" />
            <CardBody>
              <StatusBars
                counts={overview.organizations_by_status}
                labels={{
                  unsubmitted: 'لم يُقدَّم',
                  pending: 'قيد المراجعة',
                  verified: 'موثّقة',
                  rejected: 'مرفوضة',
                  suspended: 'موقوفة',
                }}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="فواتير الاشتراكات غير المسددة (إجمالي)" subtitle="بانتظار سداد أو مراجعة إثبات" />
            <CardBody>
              <StatCard
                label="فواتير غير مسددة"
                value={compactNumber(overview.subscriptions.unpaid_invoices)}
                tone={overview.subscriptions.unpaid_invoices > 0 ? 'warning' : 'default'}
                icon={<Undo2 size={18} />}
              />
            </CardBody>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function StatusBars({
  counts,
  labels,
}: {
  counts: Record<string, number>;
  labels?: Record<string, string>;
}) {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return <p className="py-6 text-center text-xs text-muted">لا توجد بيانات في هذه الفترة.</p>;
  return (
    <ul className="space-y-2.5">
      {entries
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => (
          <li key={status}>
            <div className="mb-1 flex items-center justify-between text-xs font-bold">
              <span className="text-ink">{labels?.[status] ?? ORDER_STATUS_LABELS[status] ?? status}</span>
              <span className="text-muted">{compactNumber(count)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-600"
                style={{ width: `${Math.max((count / total) * 100, 3)}%` }}
              />
            </div>
          </li>
        ))}
    </ul>
  );
}
