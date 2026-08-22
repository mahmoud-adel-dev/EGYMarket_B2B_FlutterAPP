import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Seals B2B',
  description: 'منصة تجارة الجملة بين الشركات في مصر',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: 'Arial, sans-serif', background: '#f5f6fa', color: '#1a1d3b' }}>
        {children}
      </body>
    </html>
  );
}
