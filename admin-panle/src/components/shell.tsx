'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Banknote,
  BarChart3,
  BadgeCheck,
  Boxes,
  ChevronLeft,
  FileText,
  Gavel,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  RefreshCcw,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Undo2,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import clsx from 'clsx';
import { signOutSession } from '@/lib/api-client';
import { useSession } from './providers';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string }>;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const NAVIGATION: NavSection[] = [
  {
    items: [{ href: '/dashboard', label: 'نظرة عامة', icon: LayoutDashboard }],
  },
  {
    label: 'التجارة',
    items: [
      { href: '/orders', label: 'الطلبات', icon: ShoppingBag },
      { href: '/buyers', label: 'المشترون', icon: Users },
      { href: '/sellers', label: 'البائعون', icon: Store },
      { href: '/organizations', label: 'المؤسسات', icon: Boxes },
    ],
  },
  {
    label: 'المالية',
    items: [
      { href: '/payments', label: 'المدفوعات', icon: Wallet },
      { href: '/transactions', label: 'المعاملات', icon: Banknote },
      { href: '/platform-fees', label: 'رسوم المنصة', icon: Receipt },
      { href: '/refunds', label: 'الاسترجاعات', icon: Undo2 },
      { href: '/subscriptions', label: 'الاشتراكات', icon: RefreshCcw },
      { href: '/invoices', label: 'الفواتير', icon: FileText },
    ],
  },
  {
    label: 'التشغيل',
    items: [
      { href: '/verification', label: 'توثيق المؤسسات', icon: BadgeCheck },
      { href: '/disputes', label: 'النزاعات', icon: Gavel },
      { href: '/reports', label: 'التقارير والتحليلات', icon: BarChart3 },
    ],
  },
  {
    label: 'الإدارة',
    items: [
      { href: '/admins', label: 'حسابات الإدارة', icon: UserCog },
      { href: '/roles', label: 'الأدوار والصلاحيات', icon: ShieldCheck },
      { href: '/audit-logs', label: 'سجل التدقيق', icon: ScrollText },
      { href: '/settings', label: 'إعدادات المنصة', icon: Settings },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        className="sticky top-0 hidden h-screen lg:block"
        onNavigate={() => undefined}
      />
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <Sidebar
            collapsed={false}
            onToggle={() => undefined}
            className="absolute inset-y-0 end-0 z-50 w-72 shadow-2xl"
            onNavigate={() => setMobileOpen(false)}
            showClose
          />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({
  collapsed,
  onToggle,
  className,
  onNavigate,
  showClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
  onNavigate: () => void;
  showClose?: boolean;
}) {
  return (
    <aside
      className={clsx(
        'z-50 flex flex-col overflow-y-auto bg-navy-900 text-white transition-[width] duration-200',
        collapsed ? 'w-[76px]' : 'w-72',
        className,
      )}
    >
      <div className={clsx('flex items-center gap-2.5 px-4 pb-5 pt-5', collapsed && 'justify-center px-0')}>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-600">
          <ShoppingBag size={20} />
        </div>
        {!collapsed ? (
          <div className="leading-tight">
            <p className="text-sm font-extrabold tracking-wide">SEALS B2B</p>
            <p className="text-[10px] font-bold tracking-widest text-white/40">SUPER ADMIN</p>
          </div>
        ) : null}
        {showClose ? (
          <button
            type="button"
            onClick={onNavigate}
            aria-label="إغلاق القائمة"
            className="ms-auto rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        ) : null}
      </div>

      <nav aria-label="التنقل الرئيسي" className="flex-1 space-y-4 px-3 pb-6">
        {NAVIGATION.map((section, sectionIndex) => (
          <div key={section.label ?? sectionIndex}>
            {section.label && !collapsed ? (
              <p className="mb-1.5 px-3 text-[10px] font-extrabold uppercase tracking-widest text-white/35">
                {section.label}
              </p>
            ) : null}
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    {...item}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="hidden border-t border-white/10 p-3 lg:block">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft
            size={15}
            className={clsx('transition-transform', collapsed && 'rotate-180')}
          />
          {!collapsed ? 'تصغير القائمة' : null}
        </button>
      </div>
    </aside>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  collapsed,
  onNavigate,
}: NavItem & { collapsed: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors',
        active
          ? 'bg-brand-600/90 text-white'
          : 'text-white/65 hover:bg-white/10 hover:text-white',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon size={19} />
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </Link>
  );
}

function Header({ onMenu }: { onMenu: () => void }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    await signOutSession();
    router.replace('/login');
    router.refresh();
  }

  const pageTitle =
    NAVIGATION.flatMap((section) => section.items).find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.label ?? 'لوحة التحكم';

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onMenu}
          aria-label="فتح القائمة"
          className="rounded-xl p-2 text-muted hover:bg-black/5 lg:hidden"
        >
          <Menu size={20} />
        </button>
        <h1 className="truncate text-base font-extrabold text-ink">{pageTitle}</h1>
        <div className="ms-auto flex items-center gap-2.5">
          <div className="hidden items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-1.5 sm:flex">
            <span className="flex size-7 items-center justify-center rounded-lg bg-brand-700 text-xs font-extrabold text-white">
              {session.user.name?.trim().charAt(0) || 'A'}
            </span>
            <span className="max-w-40 truncate text-xs font-bold text-ink" dir="ltr">
              {session.user.email}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            aria-label="تسجيل الخروج"
            title="تسجيل الخروج"
            className="rounded-xl p-2.5 text-muted transition-colors hover:bg-red-50 hover:text-red-700"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
