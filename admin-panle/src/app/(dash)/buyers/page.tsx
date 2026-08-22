import { OrgDirectory } from '@/features/organizations/org-directory';

export default function BuyersPage() {
  return (
    <OrgDirectory
      title="المشترون (تجار التجزئة)"
      description="مؤسسات الشراء مع إحصاءات الطلبات والإنفاق والنزاعات"
      breadcrumb={['لوحة التحكم', 'التجارة']}
      fixedType="buyer"
      showTypeFilter={false}
    />
  );
}
