'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { loginWithCredentials, ApiError } from '@/lib/api-client';
import { Button, Spinner } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await loginWithCredentials(email.trim(), password);
      router.replace('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تسجيل الدخول، حاول مجددًا.');
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center text-white">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/30">
            <ShieldCheck size={28} />
          </div>
          <h1 className="text-xl font-extrabold">مركز التحكم — Seals B2B</h1>
          <p className="text-sm text-white/60">دخول خاص بإدارة المنصة</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-3xl border border-white/10 bg-white p-6 shadow-2xl"
        >
          <Field label="البريد الإلكتروني الإداري">
            <Input
              type="email"
              required
              autoComplete="username"
              dir="ltr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
            />
          </Field>
          <Field label="كلمة المرور">
            <Input
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </Field>

          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700 ring-1 ring-red-200">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Spinner /> : null}
            تسجيل الدخول
          </Button>
        </form>
      </div>
    </main>
  );
}
