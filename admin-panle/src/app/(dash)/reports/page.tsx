'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { dashboardService } from '@/services/dashboard.service';
import { defaultDateRange, DateRangeControl, type DateRangeValue } from '@/components/data-table';
import { PageHeader, StatCard } from '@/components/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CardsSkeleton } from '@/components/ui/states';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATE_LABELS,
} from '@/components/ui/badge';
import { compactNumber, egp } from '@/lib/format';
import type { AnalyticsResponse } from '@/types/api';

export default function ReportsPage() {
  const [range, setRange] = useState<DateRangeValue>(defaultDateRange(30));

  const query = useQuery({
    queryKey: ['admin-reports', range.from, range.to],
    queryFn: () => dashboardService.analytics(range.from, range.to),
  });

  const data = query.data;

  function exportCsv() {
    if (!data) return;
    const header = [
      'date',
      'orders_created',
      'gmv_egp',
      'platform_fees_egp',
      'subscription_revenue_egp',
      'new_organizations',
      'new_users',
    ];
    const lines = data.series.map((point) =>
      [
        point.date,
        point.orders_created,
        (point.gmv_piasters / 100).toFixed(2),
        (point.platform_fees_confirmed_piasters / 100).toFixed(2),
        (point.subscription_revenue_piasters / 100).toFixed(2),
        point.new_organizations,
        point.new_users,
      ].join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `seals-report-${range.from}_${range.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="التقارير والتحليلات"
        description="تقارير تشغيلية ومالية مبنيّة على تجميعات الخادم الفعلية"
        breadcrumb={['لوحة التحكم', 'التشغيل']}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeControl value={range} onChange={setRange} />
            <Button variant="outline" onClick={exportCsv} disabled={!data}>
              <Download size={15} />
              تصدير CSV
            </Button>
          </div>
        }
      />

      {query.isLoading || !data ? (
        <CardsSkeleton count={4} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="طلبات الفترة" value={compactNumber(data.totals.orders_created)} />
            <StatCard label="قيمة بضاعة مطلوبة" value={egp(data.totals.gmv_piasters)} />
            <StatCard label="رسوم محصّلة" value={egp(data.totals.platform_fees_confirmed_piasters)} tone="positive" />
            <StatCard label="إيراد اشتراكات" value={egp(data.totals.subscription_revenue_paid_piasters)} tone="positive" />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="ملخص الفترة" />
              <CardBody>
                <ReportTable
                  rows={[
                    ['النطاق', `${data.range.from} ← ${data.range.to}`],
                    ['عدد الأيام', compactNumber(data.range.days)],
                    ['طلبات مكتملة', compactNumber(data.totals.completed_orders)],
                    ['طلبات ملغاة', compactNumber(data.totals.canceled_orders)],
                    ['مؤسسات جديدة', compactNumber(data.totals.new_organizations)],
                    ['مستخدمون جدد', compactNumber(data.totals.new_users)],
                  ]}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="جدول يومي مفصّل" subtitle="آخر ١٤ يومًا من النطاق" />
              <CardBody className="p-0">
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="border-b border-line text-muted">
                        <th scope="col" className="px-3 py-2 text-start font-bold">اليوم</th>
                        <th scope="col" className="px-2 py-2 text-center font-bold">طلبات</th>
                        <th scope="col" className="px-2 py-2 text-end font-bold">GMV</th>
                        <th scope="col" className="px-2 py-2 text-end font-bold">رسوم</th>
                        <th scope="col" className="px-3 py-2 text-end font-bold">اشتراكات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.series]
                        .slice(-14)
                        .reverse()
                        .map((point) => (
                          <tr key={point.date} className="border-b border-line/60 last:border-0">
                            <td className="px-3 py-2 font-semibold" dir="ltr">{point.date}</td>
                            <td className="px-2 py-2 text-center">{compactNumber(point.orders_created)}</td>
                            <td className="px-2 py-2 text-end">{egp(point.gmv_piasters)}</td>
                            <td className="px-2 py-2 text-end">{egp(point.platform_fees_confirmed_piasters)}</td>
                            <td className="px-3 py-2 text-end">{egp(point.subscription_revenue_piasters)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>

            <DistributionCard title="حالات الطلبات خلال الفترة" counts={data.orders_by_status} labels={ORDER_STATUS_LABELS} />
            <DistributionCard title="حالات الالتزامات المالية خلال الفترة" counts={data.payments_by_state} labels={PAYMENT_STATE_LABELS} />
          </div>
        </>
      )}
    </div>
  );
}

function DistributionCard({
  title,
  counts,
  labels,
}: {
  title: string;
  counts: Record<string, number>;
  labels: Record<string, string>;
}) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="p-0">
        <table className="w-full text-sm">
          <tbody>
            {Object.entries(counts)
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => (
                <tr key={key} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5 font-semibold">{labels[key] ?? key}</td>
                  <td className="px-2 py-2.5 text-center text-muted">{total ? `${Math.round((count / total) * 100)}%` : '—'}</td>
                  <td className="px-4 py-2.5 text-end font-extrabold">{compactNumber(count)}</td>
                </tr>
              ))}
            {!total ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-xs text-muted">
                  لا توجد بيانات في هذه الفترة.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}

function ReportTable({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-line/60 last:border-0">
            <td className="py-2.5 font-semibold text-muted">{label}</td>
            <td className="py-2.5 text-end font-extrabold">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
