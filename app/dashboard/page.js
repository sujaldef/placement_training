import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import DashboardClient from '@/components/DashboardClient';
import { COOKIE_NAME, verifyAuthToken } from '@/lib/auth';

export default function DashboardPage() {
  const token = cookies().get(COOKIE_NAME)?.value;

  if (!token) {
    redirect('/');
  }

  const payload = verifyAuthToken(token);
  if (!payload?.sub) {
    redirect('/');
  }

  return <DashboardClient />;
}
