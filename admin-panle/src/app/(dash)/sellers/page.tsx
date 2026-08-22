import { OrgDirectory } from '@/features/organizations/org-directory';

export default function SellersPage() {
  return (
    <OrgDirectory
      title="البائعون (تاجيو الجملة)"
      description="مؤسسات البيع مع إحصاءات المبيعات والطلبات والنزاعات"
      breadcrumb={['لوحة التحكم', 'التجارة']}
      fixedType="wholesaler"
      showTypeFilter={false}
    />
  );
}
