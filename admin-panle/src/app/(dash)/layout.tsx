import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SessionProvider } from '@/components/providers';
import { Shell } from '@/components/shell';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000';

async function loadSession() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');

  try {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      user?: { id: string; name: string; email: string; role: string };
      organization?: unknown;
    };
    if (!payload.user || payload.user.role !== 'Admin') return null;
    return {
      user: payload.user,
      organization: (payload.organization ?? null) as never,
    };
  } catch {
    return null;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await loadSession();
  if (!session) redirect('/login');

  return (
    <SessionProvider value={session}>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
