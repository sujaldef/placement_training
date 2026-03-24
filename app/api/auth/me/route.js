import { NextResponse } from 'next/server';
import { COOKIE_NAME, verifyAuthToken } from '@/lib/auth';

export async function GET(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const payload = verifyAuthToken(token);
  if (!payload?.sub) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: String(payload.sub),
      name: String(payload.name || ''),
    },
  });
}
