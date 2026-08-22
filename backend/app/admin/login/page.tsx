'use client';

import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const result = await signIn('credentials', {
      email: data.get('email'),
      password: data.get('password'),
      redirect: false,
    });
    setLoading(false);
    if (!result?.ok) {
      setError('تعذر تسجيل الدخول. تأكد من البريد وكلمة المرور وتأكيد البريد.');
      return;
    }
    router.replace('/admin');
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 420, margin: '80px auto', padding: 24 }}>
      <form onSubmit={submit} style={{ background: 'white', padding: 28, borderRadius: 18 }}>
        <h1>إدارة Seals B2B</h1>
        <label>البريد الإلكتروني</label>
        <input name="email" type="email" required style={inputStyle} />
        <label>كلمة المرور</label>
        <input name="password" type="password" required minLength={8} style={inputStyle} />
        {error && <p style={{ color: '#b42318' }}>{error}</p>}
        <button disabled={loading} style={buttonStyle}>{loading ? 'جارٍ الدخول…' : 'دخول'}</button>
      </form>
    </main>
  );
}

const inputStyle = { display: 'block', width: '100%', boxSizing: 'border-box' as const, padding: 12, margin: '8px 0 16px', border: '1px solid #ddd', borderRadius: 10 };
const buttonStyle = { width: '100%', padding: 13, border: 0, borderRadius: 10, background: '#6c63ff', color: 'white', fontWeight: 700, cursor: 'pointer' };
