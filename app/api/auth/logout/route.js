import { NextResponse } from 'next/server';
import { getClearAuthCookieHeader } from '@/lib/auth';

export async function POST() {
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': getClearAuthCookieHeader(),
      },
    },
  );
}
