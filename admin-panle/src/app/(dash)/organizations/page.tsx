import { OrgDirectory } from '@/features/organizations/org-directory';

export default function OrganizationsPage() {
  return (
    <OrgDirectory
      title="المؤسسات"
      description="كل مؤسسات المنصة: بائعو الجملة، المشترون، وشركات الشحن"
      breadcrumb={['لوحة التحكم', 'التجارة']}
    />
  );
}
