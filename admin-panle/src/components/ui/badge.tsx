import clsx from 'clsx';
import type { ReactNode } from 'react';
import type {
  AdminDispute,
  InvoiceStatusValue,
  OrderStatusValue,
  PaymentStateValue,
  SubscriptionStatusValue,
  TransactionRow,
} from '@/types/api';

type Tone = 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'teal' | 'sky';

const tones: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export function Badge({
  tone = 'gray',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold leading-none ring-1',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------------- Label maps ---------------- */

export const ORDER_STATUS_LABELS: Record<string, string> = {
  requested: 'بانتظار البائع',
  awaiting_payments: 'بانتظار الدفع',
  preparing: 'قيد التجهيز',
  ready_for_pickup: 'جاهز للاستلام',
  in_transit: 'في الطريق',
  delivered: 'تم التسليم',
  completed: 'مكتمل',
  canceled: 'ملغي',
  rejected: 'مرفوض',
  disputed: 'نزاع مفتوح',
};

const ORDER_STATUS_TONES: Record<string, Tone> = {
  requested: 'amber',
  awaiting_payments: 'violet',
  preparing: 'teal',
  ready_for_pickup: 'sky',
  in_transit: 'blue',
  delivered: 'blue',
  completed: 'green',
  canceled: 'red',
  rejected: 'red',
  disputed: 'amber',
};

export const PAYMENT_STATE_LABELS: Record<string, string> = {
  not_issued: 'لم تُصدر',
  pending: 'بانتظار الدفع',
  partial: 'قيد المراجعة',
  paid: 'مدفوع',
};

const PAYMENT_STATE_TONES: Record<string, Tone> = {
  not_issued: 'gray',
  pending: 'amber',
  partial: 'blue',
  paid: 'green',
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار السداد',
  proof_submitted: 'إثبات قيد المراجعة',
  paid: 'مدفوعة',
  rejected: 'مرفوضة',
  void: 'ملغاة',
};

const INVOICE_STATUS_TONES: Record<string, Tone> = {
  pending: 'amber',
  proof_submitted: 'blue',
  paid: 'green',
  rejected: 'red',
  void: 'gray',
};

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  trialing: 'تجريبي',
  pending_payment: 'بانتظار الدفع',
  under_review: 'قيد المراجعة',
  active: 'نشط',
  grace_period: 'مهلة سماح',
  expired: 'منتهي',
  canceled: 'ملغي',
  rejected: 'مرفوض',
};

const SUBSCRIPTION_STATUS_TONES: Record<string, Tone> = {
  trialing: 'sky',
  pending_payment: 'amber',
  under_review: 'blue',
  active: 'green',
  grace_period: 'amber',
  expired: 'gray',
  canceled: 'red',
  rejected: 'red',
};

export const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  unsubmitted: 'لم يُقدَّم',
  pending: 'قيد المراجعة',
  verified: 'موثّقة',
  rejected: 'مرفوضة',
  suspended: 'موقوفة',
};

const VERIFICATION_STATUS_TONES: Record<string, Tone> = {
  unsubmitted: 'gray',
  pending: 'amber',
  verified: 'green',
  rejected: 'red',
  suspended: 'red',
};

export const TX_TYPE_LABELS: Record<TransactionRow['tx_type'], string> = {
  platform_fee: 'رسوم منصة (طلب)',
  order_goods: 'مقابل بضاعة',
  order_shipping: 'مقابل شحن',
  subscription_invoice: 'فاتورة اشتراك',
};

const TX_STATUS_LABELS: Record<string, string> = {
  ...PAYMENT_STATE_LABELS,
  proof_submitted: 'إثبات قيد المراجعة',
  confirmed: 'مؤكدة',
  rejected: 'مرفوضة',
  paid: 'مدفوعة',
  void: 'ملغاة',
  disputed: 'متنازع عليها',
};

const TX_STATUS_TONES: Record<string, Tone> = {
  pending: 'amber',
  proof_submitted: 'blue',
  confirmed: 'green',
  rejected: 'red',
  paid: 'green',
  void: 'gray',
  disputed: 'amber',
  not_issued: 'gray',
  partial: 'blue',
};

export const DISPUTE_STATUS_LABELS: Record<AdminDispute['status'], string> = {
  open: 'مفتوح',
  in_review: 'قيد المراجعة',
  resolved: 'محلول',
  rejected: 'مرفوض',
};

const DISPUTE_STATUS_TONES: Record<AdminDispute['status'], Tone> = {
  open: 'amber',
  in_review: 'blue',
  resolved: 'green',
  rejected: 'red',
};

const ORG_TYPE_LABELS: Record<string, string> = {
  wholesaler: 'بائع جملة',
  buyer: 'مشتري',
  shipper: 'شركة شحن',
};

/* ---------------- Components ---------------- */

interface StatusBadgeProps {
  value?: string | null;
  kind:
    | 'order'
    | 'payment_state'
    | 'invoice'
    | 'subscription'
    | 'verification'
    | 'tx_status'
    | 'dispute';
  className?: string;
}

export function StatusBadge({ value, kind, className }: StatusBadgeProps) {
  if (!value) return <span className="text-xs text-muted">—</span>;
  const labels: Record<string, Record<string, string>> = {
    order: ORDER_STATUS_LABELS,
    payment_state: PAYMENT_STATE_LABELS,
    invoice: INVOICE_STATUS_LABELS,
    subscription: SUBSCRIPTION_STATUS_LABELS,
    verification: VERIFICATION_STATUS_LABELS,
    tx_status: TX_STATUS_LABELS,
    dispute: DISPUTE_STATUS_LABELS as unknown as Record<string, string>,
  };
  const tonesMap: Record<string, Record<string, Tone>> = {
    order: ORDER_STATUS_TONES,
    payment_state: PAYMENT_STATE_TONES,
    invoice: INVOICE_STATUS_TONES,
    subscription: SUBSCRIPTION_STATUS_TONES,
    verification: VERIFICATION_STATUS_TONES,
    tx_status: TX_STATUS_TONES,
    dispute: DISPUTE_STATUS_TONES as unknown as Record<string, Tone>,
  };
  const label = labels[kind][value] ?? value;
  const tone = tonesMap[kind][value] ?? 'gray';
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}

export function OrgTypeBadge({ type }: { type: string }) {
  return (
    <Badge tone={type === 'wholesaler' ? 'teal' : type === 'shipper' ? 'sky' : 'violet'}>
      {ORG_TYPE_LABELS[type] ?? type}
    </Badge>
  );
}
