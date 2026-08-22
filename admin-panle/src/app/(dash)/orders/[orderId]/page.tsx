'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { ordersService } from '@/services/orders.service';
import { PageHeader, StatCard } from '@/components/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, ORDER_STATUS_LABELS, StatusBadge } from '@/components/ui/badge';
import { ErrorState, TableSkeleton } from '@/components/ui/states';
import { compactNumber, egp, formatDate, formatDateTime } from '@/lib/format';

export default function OrderDetailsPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;

  const query = useQuery({
    queryKey: ['admin-order', orderId],
    queryFn: () => ordersService.detail(orderId),
    enabled: Boolean(orderId),
  });

  if (query.isLoading) {
    return (
      <div>
        <PageHeader title="تفاصيل الطلب" breadcrumb={['لوحة التحكم', 'الطلبات']} />
        <TableSkeleton rows={8} />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div>
        <PageHeader title="تفاصيل الطلب" breadcrumb={['لوحة التحكم', 'الطلبات']} />
        <Card>
          <ErrorState
            message={(query.error as Error | undefined)?.message ?? 'تعذر تحميل الطلب.'}
            onRetry={() => query.refetch()}
          />
        </Card>
      </div>
    );
  }

  const { order, payment_obligations: obligations, payment_summary: summary, disputes } = query.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title={order.order_number}
        description={`أُنشئ في ${formatDateTime(order.createdAt)} · ${order.fulfillment_method === 'buyer_pickup' ? 'استلام من البائع' : 'شحن خارجي'}`}
        breadcrumb={['لوحة التحكم', 'الطلبات', order.order_number]}
        actions={
          <StatusBadge kind="order" value={order.status} className="!text-sm !px-3.5 !py-1.5" />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="إجمالي مستحق" value={egp(order.total_payable_piasters)} />
        <StatCard label="قيمة البضاعة" value={egp(order.goods_subtotal_piasters)} />
        <StatCard label="رسوم المنصة" value={egp(order.platform_fee_piasters)} />
        <StatCard
          label="حالة الدفع"
          value={<StatusBadge kind="payment_state" value={summary.state} />}
          hint={`${summary.confirmed_count}/${summary.total_count} التزامات مؤكدة`}
        />
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="الأطراف" />
          <CardBody className="space-y-3">
            <PartyRow label="المشتري" name={order.buyer_organization_id?.display_name} sub={order.buyer_organization_id?.location?.governorate} />
            <PartyRow label="البائع" name={order.seller_organization_id?.display_name} sub={order.seller_organization_id?.location?.governorate} />
            <PartyRow label="الناقل" name={order.shipper_organization_id?.display_name} sub={order.shipper_organization_id?.location?.governorate} />
            <PartyRow label="أنشأه" name={(order.created_by as { name?: string })?.name ?? '—'} sub={(order.created_by as { email?: string })?.email} />
            {order.shipping_address ? (
              <p className="rounded-xl bg-canvas px-3 py-2.5 text-xs leading-6 text-muted">
                عنوان الشحن: {order.shipping_address.governorate} — {order.shipping_address.address ?? 'بدون تفاصيل'}
                {order.shipping_address.contact_name ? ` · ${order.shipping_address.contact_name}` : ''}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="بنود الطلب" subtitle={`${compactNumber(order.items.length)} بند`} />
          <CardBody className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th scope="col" className="px-4 py-2.5 text-start font-bold">المنتج</th>
                  <th scope="col" className="px-2 py-2.5 text-center font-bold">الكمية</th>
                  <th scope="col" className="px-2 py-2.5 text-center font-bold">سعر الوحدة</th>
                  <th scope="col" className="px-4 py-2.5 text-end font-bold">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, index) => (
                  <tr key={index} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2.5 font-semibold">{item.title}</td>
                    <td className="px-2 py-2.5 text-center">{compactNumber(item.quantity)}</td>
                    <td className="px-2 py-2.5 text-center text-xs">{egp(item.unit_price_piasters)}</td>
                    <td className="px-4 py-2.5 text-end font-bold">{egp(item.subtotal_piasters)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-canvas/70">
                  <td colSpan={3} className="px-4 py-2.5 text-xs font-bold text-muted">الشحن</td>
                  <td className="px-4 py-2.5 text-end text-xs font-bold">{egp(order.shipping_cost_piasters)}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="px-4 py-2.5 text-xs font-extrabold">الإجمالي النهائي</td>
                  <td className="px-4 py-2.5 text-end font-extrabold text-brand-700">{egp(order.total_payable_piasters)}</td>
                </tr>
              </tfoot>
            </table>
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader title="التزامات الدفع" subtitle="رسوم المنصة، قيمة البضاعة، والشحن — مع الإثباتات المرفوعة" />
        <CardBody className="grid gap-3 lg:grid-cols-3">
          {obligations.map((obligation) => (
            <div key={obligation._id} className="rounded-xl border border-line p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-extrabold">
                  {obligation.kind === 'platform_fee'
                    ? 'رسوم المنصة'
                    : obligation.kind === 'shipping'
                      ? 'قيمة الشحن'
                      : 'قيمة البضاعة'}
                </span>
                <StatusBadge kind="tx_status" value={obligation.status} />
              </div>
              <p className="mt-2 text-lg font-extrabold text-ink">{egp(obligation.amount_piasters)}</p>
              <dl className="mt-2 space-y-1 text-[11px] leading-5 text-muted">
                <DetailLine label="الدافع" value={(obligation.payer_organization_id as { display_name?: string })?.display_name} />
                <DetailLine label="المستفيد" value={
                  obligation.beneficiary_type === 'platform'
                    ? 'منصة Seals'
                    : (obligation.beneficiary_organization_id as { display_name?: string })?.display_name
                } />
                {obligation.payment_method ? <DetailLine label="الطريقة" value={obligation.payment_method} /> : null}
                {obligation.sender_reference ? <DetailLine label="مرجع التحويل" value={obligation.sender_reference} /> : null}
                {obligation.rejection_reason ? <DetailLine label="سبب الرفض" value={obligation.rejection_reason} /> : null}
              </dl>
              {obligation.proof_url ? (
                <a
                  href={obligation.proof_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:underline"
                >
                  فتح إثبات التحويل
                  <ExternalLink size={12} />
                </a>
              ) : null}
            </div>
          ))}
          {!obligations.length ? (
            <p className="py-6 text-center text-xs text-muted lg:col-span-3">لم تُصدر التزامات دفع لهذا الطلب بعد.</p>
          ) : null}
        </CardBody>
      </Card>

      {disputes.length ? (
        <Card>
          <CardHeader title="النزاعات المرتبطة" />
          <CardBody className="space-y-3">
            {disputes.map((dispute) => (
              <div key={dispute._id} className="rounded-xl border border-line p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={dispute.status === 'open' ? 'amber' : dispute.status === 'resolved' ? 'green' : dispute.status === 'rejected' ? 'red' : 'blue'}>
                    {dispute.status === 'open' ? 'مفتوح' : dispute.status === 'in_review' ? 'قيد المراجعة' : dispute.status === 'resolved' ? 'محلول' : 'مرفوض'}
                  </Badge>
                  <span className="text-xs text-muted">
                    {(dispute.opened_by_user_id as { name?: string })?.name ?? 'مستخدم'} · {formatDate(dispute.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6">{dispute.reason}</p>
                {dispute.resolution ? (
                  <p className="mt-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800">
                    القرار: {dispute.resolution}
                  </p>
                ) : null}
                <Link href="/disputes" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:underline">
                  <ArrowRight size={12} />
                  إدارة النزاعات
                </Link>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="الخط الزمني للطلب" />
        <CardBody>
          <ol className="relative space-y-5 ps-6 before:absolute before:inset-y-1 before:start-[7px] before:w-0.5 before:bg-line">
            {[...order.status_history].reverse().map((event, index) => (
              <li key={index} className="relative">
                <span className="absolute -start-6 top-1 size-3.5 rounded-full border-2 border-white bg-brand-600 shadow" aria-hidden />
                <p className="text-sm font-extrabold">
                  {statusLabel(event.status)}
                  <span className="ms-2 text-xs font-bold text-muted">{formatDateTime(event.timestamp)}</span>
                </p>
                <p className="text-xs leading-6 text-muted">
                  بواسطة {roleLabel(event.changed_by_role)}
                  {event.note ? ` — ${event.note}` : ''}
                </p>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}

function PartyRow({ label, name, sub }: { label: string; name?: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-3 py-2.5">
      <span className="text-xs font-bold text-muted">{label}</span>
      <span className="flex items-center gap-2 text-sm font-extrabold text-ink">
        {sub ? <span className="text-[11px] font-bold text-muted">{sub}</span> : null}
        <span className="max-w-52 truncate">{name ?? '—'}</span>
      </span>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-2">
      <dt>{label}</dt>
      <dd className="max-w-36 truncate font-bold text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}

function statusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

function roleLabel(role: string): string {
  switch (role.toLowerCase()) {
    case 'wholesaler':
      return 'البائع';
    case 'retailer':
      return 'المشتري';
    case 'shipper':
      return 'شركة الشحن';
    case 'admin':
      return 'الإدارة';
    case 'system':
      return 'النظام';
    default:
      return role;
  }
}
