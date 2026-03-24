import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('auth_token')?.value;

  const protectedPage = pathname.startsWith('/dashboard');
  const protectedApi = pathname.startsWith('/api/progress');

  if ((protectedPage || protectedApi) && !token) {
    if (protectedApi) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const loginUrl = new URL('/', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/progress/:path*'],
};
