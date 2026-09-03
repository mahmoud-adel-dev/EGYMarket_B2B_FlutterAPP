'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Locale = 'ar' | 'en';
const translations = {
  ar: { dashboard: 'نظرة عامة', commerce: 'التجارة', orders: 'الطلبات', buyers: 'المشترون', sellers: 'البائعون', organizations: 'المؤسسات', finance: 'المالية', payments: 'المدفوعات', transactions: 'المعاملات', platformFees: 'رسوم المنصة', refunds: 'الاسترجاعات', subscriptions: 'الاشتراكات', invoices: 'الفواتير', operations: 'التشغيل', verification: 'توثيق المؤسسات', disputes: 'النزاعات', reports: 'التقارير والتحليلات', administration: 'الإدارة', admins: 'حسابات الإدارة', roles: 'الأدوار والصلاحيات', auditLogs: 'سجل التدقيق', settings: 'إعدادات المنصة', collapse: 'تصغير القائمة', openMenu: 'فتح القائمة', closeMenu: 'إغلاق القائمة', signOut: 'تسجيل الخروج', panel: 'لوحة التحكم', language: 'English' },
  en: { dashboard: 'Overview', commerce: 'Commerce', orders: 'Orders', buyers: 'Buyers', sellers: 'Sellers', organizations: 'Organizations', finance: 'Finance', payments: 'Payments', transactions: 'Transactions', platformFees: 'Platform fees', refunds: 'Refunds', subscriptions: 'Subscriptions', invoices: 'Invoices', operations: 'Operations', verification: 'Organization verification', disputes: 'Disputes', reports: 'Reports & analytics', administration: 'Administration', admins: 'Admin accounts', roles: 'Roles & permissions', auditLogs: 'Audit log', settings: 'Platform settings', collapse: 'Collapse menu', openMenu: 'Open menu', closeMenu: 'Close menu', signOut: 'Sign out', panel: 'Admin panel', language: 'العربية' },
} as const;
export type TranslationKey = keyof typeof translations.ar;
type ContextValue = { locale: Locale; toggleLocale: () => void; t: (key: TranslationKey) => string };
const LanguageContext = createContext<ContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('ar');
  useEffect(() => {
    const saved = window.localStorage.getItem('seals-admin-locale');
    if (saved === 'en') setLocale('en');
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    window.localStorage.setItem('seals-admin-locale', locale);
  }, [locale]);
  const value = useMemo(() => ({ locale, toggleLocale: () => setLocale((current) => current === 'ar' ? 'en' : 'ar'), t: (key: TranslationKey) => translations[locale][key] }), [locale]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used within LanguageProvider');
  return value;
}
