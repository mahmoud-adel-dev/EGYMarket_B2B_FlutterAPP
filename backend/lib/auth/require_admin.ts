import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/authOptions';
import connectToDatabase from '@/lib/db/mongoose';
import User from '@/models/User';

export async function requireAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/admin/login');
  await connectToDatabase();
  const user = await User.findOne({ _id: session.user.id, role: 'Admin', isActive: true });
  if (!user) redirect('/admin/login');
  return { session, user };
}
