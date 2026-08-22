/**
 * Frontend permission layer (UX only).
 *
 * The backend currently enforces a single `Admin` role on every admin endpoint;
 * these keys describe the intended RBAC split so the UI can gate sections once
 * the backend introduces granular admin roles. Real authorization always stays
 * server-side.
 */
export const PERMISSIONS = [
  'orders.view',
  'orders.manage',
  'payments.view',
  'payments.review',
  'transactions.view',
  'refunds.view',
  'subscriptions.view',
  'subscriptions.manage',
  'invoices.review',
  'verification.review',
  'organizations.view',
  'buyers.view',
  'sellers.view',
  'disputes.view',
  'disputes.resolve',
  'reports.view',
  'admins.manage',
  'audit.view',
  'settings.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PRESETS: Record<string, Permission[]> = {
  'Super Admin': [...PERMISSIONS],
  'Finance Admin': [
    'orders.view',
    'payments.view',
    'payments.review',
    'transactions.view',
    'refunds.view',
    'subscriptions.view',
    'invoices.review',
    'reports.view',
  ],
  'Verification Admin': [
    'organizations.view',
    'verification.review',
    'buyers.view',
    'sellers.view',
    'audit.view',
  ],
  'Operations Admin': [
    'orders.view',
    'orders.manage',
    'organizations.view',
    'disputes.view',
    'disputes.resolve',
    'buyers.view',
    'sellers.view',
    'reports.view',
  ],
  'Support Admin': [
    'orders.view',
    'buyers.view',
    'sellers.view',
    'disputes.view',
    'organizations.view',
  ],
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  'orders.view': 'عرض الطلبات',
  'orders.manage': 'إدارة الطلبات',
  'payments.view': 'عرض المدفوعات',
  'payments.review': 'مراجعة المدفوعات',
  'transactions.view': 'عرض المعاملات المالية',
  'refunds.view': 'عرض الاسترجاعات',
  'subscriptions.view': 'عرض الاشتراكات',
  'subscriptions.manage': 'إدارة الاشتراكات',
  'invoices.review': 'مراجعة الفواتير',
  'verification.review': 'مراجعة التوثيق',
  'organizations.view': 'عرض المؤسسات',
  'buyers.view': 'عرض المشترين',
  'sellers.view': 'عرض البائعين',
  'disputes.view': 'عرض النزاعات',
  'disputes.resolve': 'حسم النزاعات',
  'reports.view': 'عرض التقارير',
  'admins.manage': 'إدارة حسابات الإدارة',
  'audit.view': 'عرض سجل التدقيق',
  'settings.manage': 'إدارة إعدادات المنصة',
};
