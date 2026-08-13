import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = crypto.randomUUID();

  // Add x-request-id to request headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const isProtectedRoute = pathname.startsWith('/dashboard');
  const sessionCookie = request.cookies.get('session');

  if (isProtectedRoute) {
    if (!sessionCookie) {
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }
    
    try {
      const user = await getSessionUser(sessionCookie.value);
      if (!user) {
        const res = NextResponse.redirect(new URL('/sign-in', request.url));
        res.cookies.delete('session');
        return res;
      }
    } catch (error) {
      console.error('Middleware session check failed:', error);
      const res = NextResponse.redirect(new URL('/sign-in', request.url));
      res.cookies.delete('session');
      return res;
    }
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
  runtime: 'nodejs',
};
