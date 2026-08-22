import Link from 'next/link';
import { requireAdminPage } from '@/lib/auth/require_admin';
import { getPlatformSettings } from '@/models/PlatformSettings';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import { createPlanAction, savePlatformSettingsAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const [settings, plans] = await Promise.all([getPlatformSettings(), SubscriptionPlan.find().sort({ createdAt: -1 }).lean()]);
  const account = settings.platform_payment_accounts[0];
  return <main style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
    <Link href="/admin">← لوحة الإدارة</Link>
    <h1>إعدادات التحصيل والخطط</h1>
    <form action={savePlatformSettingsAction} style={cardStyle}>
      <h2>تحصيل المنصة</h2>
      <label>رسم الطلب بالجنيه</label><input style={inputStyle} name="order_fee_egp" type="number" min="0" step="0.01" defaultValue={settings.order_fee_piasters / 100} required />
      <label>مهلة الدفع بالساعة</label><input style={inputStyle} name="payment_deadline_hours" type="number" min="1" max="720" defaultValue={settings.payment_deadline_hours} required />
      <label>الوسيلة</label><select style={inputStyle} name="method" defaultValue={account?.method || 'instapay'}><option value="instapay">InstaPay</option><option value="mobile_wallet">محفظة</option><option value="bank_transfer">تحويل بنكي</option></select>
      <label>صاحب الحساب</label><input style={inputStyle} name="account_holder" defaultValue={account?.account_holder || ''} required />
      <label>العنوان/رقم الحساب</label><input style={inputStyle} name="account_reference" defaultValue={account?.account_reference || ''} required />
      <button>حفظ الإعدادات</button>
    </form>
    <form action={createPlanAction} style={cardStyle}>
      <h2>إضافة خطة اشتراك</h2>
      <input style={inputStyle} name="code" placeholder="كود فريد: wholesaler-monthly" pattern="[a-z0-9_-]+" required />
      <input style={inputStyle} name="name_ar" placeholder="اسم الخطة بالعربية" required />
      <input style={inputStyle} name="name_en" placeholder="اسم الخطة بالإنجليزية" required />
      <input style={inputStyle} name="price_egp" type="number" min="0" step="0.01" placeholder="السعر بالجنيه" required />
      <select style={inputStyle} name="billing_interval"><option value="monthly">شهري</option><option value="yearly">سنوي</option></select>
      <input style={inputStyle} name="organization_types" placeholder="wholesaler,buyer,shipper" required />
      <button>إضافة الخطة</button>
    </form>
    <section style={cardStyle}><h2>الخطط الحالية</h2>{plans.map((plan) => <p key={plan._id.toString()}>{plan.name_ar} — {(plan.price_piasters / 100).toFixed(2)} ج.م — {plan.billing_interval}</p>)}</section>
  </main>;
}

const cardStyle = { background: 'white', padding: 20, borderRadius: 16, marginTop: 18 };
const inputStyle = { display: 'block', width: '100%', boxSizing: 'border-box' as const, padding: 10, margin: '7px 0 14px' };
