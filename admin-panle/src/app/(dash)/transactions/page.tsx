import { TransactionsView } from '@/features/finance/transactions-view';

export default function TransactionsPage() {
  return (
    <TransactionsView
      title="المعاملات المالية"
      description="سجل موحّد لكل حركة مالية على المنصة: رسوم الطلبات، قيم البضائع، الشحن، وفواتير الاشتراكات"
      breadcrumb={['لوحة التحكم', 'المالية']}
    />
  );
}
