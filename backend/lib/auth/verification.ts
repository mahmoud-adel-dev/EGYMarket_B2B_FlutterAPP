import { createHash, randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import VerificationToken from '@/models/VerificationToken';

export function hashVerificationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueVerificationToken(userId: string, purpose: 'verify_email' | 'reset_password') {
  await VerificationToken.updateMany(
    { user_id: userId, purpose, used_at: { $exists: false } },
    { $set: { used_at: new Date() } }
  );
  const token = randomBytes(32).toString('hex');
  const duration = purpose === 'verify_email' ? 24 * 60 * 60 * 1000 : 30 * 60 * 1000;
  await VerificationToken.create({
    user_id: userId,
    purpose,
    token_hash: hashVerificationToken(token),
    expires_at: new Date(Date.now() + duration),
  });
  return token;
}

function mailTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) throw new Error('SMTP is not configured');
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
}

export async function sendVerificationEmail(email: string, name: string, token: string) {
  const baseUrl = process.env.NEXTAUTH_URL;
  if (!baseUrl) throw new Error('NEXTAUTH_URL is not configured');
  const url = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  await mailTransport().sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'تأكيد بريدك الإلكتروني في Seals B2B',
    text: `مرحبًا ${name}، أكد بريدك من خلال الرابط التالي خلال 24 ساعة: ${url}`,
    html: `<div dir="rtl"><p>مرحبًا ${name}،</p><p>أكد بريدك الإلكتروني خلال 24 ساعة:</p><p><a href="${url}">تأكيد البريد الإلكتروني</a></p></div>`,
  });
}

export async function sendPasswordResetEmail(email: string, name: string, token: string) {
  const appOrigin = process.env.APP_ORIGIN || process.env.NEXTAUTH_URL;
  if (!appOrigin) throw new Error('APP_ORIGIN is not configured');
  const url = `${appOrigin}/reset-password?token=${encodeURIComponent(token)}`;
  await mailTransport().sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'إعادة تعيين كلمة المرور في Seals B2B',
    text: `مرحبًا ${name}، استخدم الرابط التالي خلال 30 دقيقة لإعادة تعيين كلمة المرور: ${url}`,
    html: `<div dir="rtl"><p>مرحبًا ${name}،</p><p>استخدم الرابط التالي خلال 30 دقيقة:</p><p><a href="${url}">إعادة تعيين كلمة المرور</a></p></div>`,
  });
}
