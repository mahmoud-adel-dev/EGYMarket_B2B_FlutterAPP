import Link from 'next/link';
import { requireAdminPage } from '@/lib/auth/require_admin';
import Organization from '@/models/Organization';
import SubscriptionInvoice from '@/models/SubscriptionInvoice';
import PaymentObligation from '@/models/PaymentObligation';
import Dispute from '@/models/Dispute';
import Order from '@/models/Order';
import AdminSignOutButton from './signout-button';
import {
  reviewDisputeAction,
  reviewOrganizationAction,
  reviewPlatformPaymentAction,
  reviewSubscriptionAction,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const { user } = await requireAdminPage();
  const [organizations, invoices, platformPayments, disputes, orderCount] = await Promise.all([
    Organization.find({ verification_status: 'pending' }).sort({ createdAt: 1 }).limit(200).lean(),
    SubscriptionInvoice.find({ status: 'proof_submitted' }).populate('organization_id', 'display_name').sort({ createdAt: 1 }).limit(200).lean(),
    PaymentObligation.find({ kind: 'platform_fee', status: 'proof_submitted' }).populate('order_id', 'order_number').sort({ createdAt: 1 }).limit(200).lean(),
    Dispute.find({ status: { $in: ['open', 'in_review'] } }).populate('order_id', 'order_number').sort({ createdAt: 1 }).limit(200).lean(),
    Order.countDocuments(),
  ]);

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: 24 }}>
      <header style={headerStyle}>
        <div><h1 style={{ margin: 0 }}>لوحة تشغيل Seals B2B</h1><small>{user.email}</small></div>
        <nav style={{ display: 'flex', gap: 12 }}><Link href="/admin/settings">الإعدادات والخطط</Link><AdminSignOutButton /></nav>
      </header>
      <section style={metricsStyle}>
        <Metric label="إجمالي الطلبات" value={orderCount} />
        <Metric label="توثيق منتظر" value={organizations.length} />
        <Metric label="اشتراكات للمراجعة" value={invoices.length} />
        <Metric label="رسوم طلبات للمراجعة" value={platformPayments.length} />
        <Metric label="نزاعات مفتوحة" value={disputes.length} />
      </section>

      <Queue title="توثيق المؤسسات" empty={organizations.length === 0}>
        {organizations.map((organization) => (
          <article key={organization._id.toString()} style={cardStyle}>
            <strong>{organization.display_name}</strong> — {organization.type} — {organization.location.governorate}
            <div>المستندات: {organization.verification_documents.map((doc) => <a key={doc._id?.toString()} href={doc.file_url} target="_blank" rel="noopener noreferrer"> {doc.type} </a>)}</div>
            <ActionForm action={reviewOrganizationAction} id={organization._id.toString()} actions={[['approve', 'اعتماد'], ['reject', 'رفض'], ['suspend', 'تعليق']]} />
          </article>
        ))}
      </Queue>

      <Queue title="فواتير الاشتراكات" empty={invoices.length === 0}>
        {invoices.map((invoice: any) => (
          <article key={invoice._id.toString()} style={cardStyle}>
            <strong>{invoice.invoice_number}</strong> — {invoice.organization_id?.display_name} — {(invoice.amount_piasters / 100).toFixed(2)} ج.م
            <div><a href={invoice.proof_url} target="_blank" rel="noopener noreferrer">فتح الإيصال</a> — مرجع: {invoice.sender_reference}</div>
            <ActionForm action={reviewSubscriptionAction} id={invoice._id.toString()} actions={[['approve', 'تفعيل'], ['reject', 'رفض']]} />
          </article>
        ))}
      </Queue>

      <Queue title="رسم المنصة 50 جنيهًا" empty={platformPayments.length === 0}>
        {platformPayments.map((payment: any) => (
          <article key={payment._id.toString()} style={cardStyle}>
            <strong>{payment.order_id?.order_number}</strong> — {(payment.amount_piasters / 100).toFixed(2)} ج.م
            <div><a href={payment.proof_url} target="_blank" rel="noopener noreferrer">فتح الإيصال</a> — مرجع: {payment.sender_reference}</div>
            <ActionForm action={reviewPlatformPaymentAction} id={payment._id.toString()} actions={[['confirm', 'تأكيد'], ['reject', 'رفض']]} />
          </article>
        ))}
      </Queue>

      <Queue title="النزاعات" empty={disputes.length === 0}>
        {disputes.map((dispute: any) => (
          <article key={dispute._id.toString()} style={cardStyle}>
            <strong>{dispute.order_id?.order_number}</strong><p>{dispute.reason}</p>
            <form action={reviewDisputeAction} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="hidden" name="id" value={dispute._id.toString()} />
              <input name="resolution" placeholder="قرار/ملاحظة الإدارة" required style={{ padding: 8, minWidth: 220 }} />
              <select name="outcome" defaultValue="complete" style={{ padding: 8 }}>
                <option value="complete">إكمال الطلب</option>
                <option value="cancel">إلغاء الطلب + استرجاع</option>
              </select>
              <button name="decision" value="in_review">قيد المراجعة</button>
              <button name="decision" value="resolved">حل نهائي</button>
              <button name="decision" value="rejected">رفض النزاع</button>
            </form>
          </article>
        ))}
      </Queue>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div style={cardStyle}><strong style={{ fontSize: 26 }}>{value}</strong><div>{label}</div></div>;
}

function Queue({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return <section style={{ marginTop: 26 }}><h2>{title}</h2>{empty ? <p style={cardStyle}>لا توجد عناصر منتظرة.</p> : children}</section>;
}

function ActionForm({ action, id, actions }: { action: (formData: FormData) => Promise<void>; id: string; actions: string[][] }) {
  return <form action={action} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
    <input type="hidden" name="id" value={id} />
    {actions.map(([value, label]) => <button key={value} name="decision" value={value}>{label}</button>)}
  </form>;
}

const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: 18, borderRadius: 16 };
const metricsStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 18 };
const cardStyle = { background: 'white', padding: 16, borderRadius: 14, marginBottom: 10 };
