'use client';

import { signOut } from 'next-auth/react';

export default function AdminSignOutButton() {
  return <button onClick={() => signOut({ callbackUrl: '/admin/login' })}>تسجيل الخروج</button>;
}
