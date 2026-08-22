import { TransactionsView } from '@/features/finance/transactions-view';

export default function PlatformFeesPage() {
  return (
    <TransactionsView
      title="رسوم المنصة"
      description="كل حركات رسم المنصة (50 ج.م لكل طلب) وحالة تحصيلها"
      breadcrumb={['لوحة التحكم', 'المالية']}
      fixedTxType="platform_fee"
    />
  );
}
