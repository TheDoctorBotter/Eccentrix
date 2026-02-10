import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Get the pathname
  const path = req.nextUrl.pathname;

  // Allow all auth routes
  if (path.startsWith('/auth')) {
    return res;
  }

  // Allow API routes (they handle their own auth)
  if (path.startsWith('/api')) {
    return res;
  }

  // Allow public files
  if (
    path.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|css|js|woff|woff2|ttf|eot)$/) ||
    path.startsWith('/_next') ||
    path.startsWith('/favicon')
  ) {
    return res;
  }

  // Check for Supabase session cookies (multiple possible formats)
  const cookies = req.cookies;
  const hasSession =
    cookies.get('sb-access-token') ||
    cookies.get('supabase-auth-token') ||
    // Check for project-specific cookie (format: sb-{project-ref}-auth-token)
    Array.from(cookies.getAll()).some(cookie =>
      cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')
    );

  // If no session, redirect to sign-in
  if (!hasSession) {
    const redirectUrl = new URL('/auth/sign-in', req.url);
    redirectUrl.searchParams.set('redirectTo', path);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

