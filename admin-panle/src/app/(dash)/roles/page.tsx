import { PageHeader } from '@/components/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PERMISSION_LABELS, ROLE_PRESETS, type Permission } from '@/lib/permissions';

export default function RolesPage() {
  const roles = Object.keys(ROLE_PRESETS);

  return (
    <div>
      <PageHeader
        title="الأدوار والصلاحيات"
        description="مصفوفة الصلاحيات المستهدفة لوحدة الإدارة. الأمان الفعلي مفروض على الخادم لكل نقطة نهاية، وهذه المصفوفة تحدد ما ستتحكم به واجهة كل دور عند تفعيل الأدوار التفصيلية في الخادم."
        breadcrumb={['لوحة التحكم', 'الإدارة']}
      />

      <Card className="mb-4 border-amber-200 bg-amber-50/60">
        <CardBody className="text-sm leading-7 text-amber-900">
          <strong>ملاحظة أمنية:</strong> المنصة الحالية تفرض دور <code dir="ltr">Admin</code> موحّدًا على مستوى
          الخادم. مصفوفة الأدوار أدناه تمثل الطبقة التمهيدية للتحكم بالواجهة (UX) ولا تُخفّض أي حماية خلفية.
        </CardBody>
      </Card>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,35,58,0.04)]">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line bg-slate-50/70 text-xs text-muted">
              <th scope="col" className="sticky start-0 z-10 bg-slate-50 px-4 py-3 text-start font-extrabold">
                الصلاحية
              </th>
              {roles.map((role) => (
                <th key={role} scope="col" className="px-4 py-3 text-center font-extrabold">
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(PERMISSION_LABELS) as Permission[]).map((permission) => (
              <tr key={permission} className="border-b border-line/70 last:border-0 hover:bg-brand-50/30">
                <td className="sticky start-0 z-10 bg-white px-4 py-2.5 font-bold">{PERMISSION_LABELS[permission]}</td>
                {roles.map((role) => (
                  <td key={role} className="px-4 py-2.5 text-center">
                    {ROLE_PRESETS[role].includes(permission) ? (
                      <Badge tone="green">✓</Badge>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {roles.map((role) => (
          <Card key={role}>
            <CardHeader title={role} subtitle={`${ROLE_PRESETS[role].length} صلاحية`} />
            <CardBody className="flex flex-wrap gap-1.5">
              {ROLE_PRESETS[role].map((permission) => (
                <Badge key={permission} tone="blue">
                  {PERMISSION_LABELS[permission]}
                </Badge>
              ))}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
