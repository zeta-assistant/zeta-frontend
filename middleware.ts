// middleware.ts (project root)
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Skip middleware for:
 * - /projects
 * - /settings
 * - static assets, images, favicon
 * - API routes
 */
export const config = {
  matcher: [
    // run on everything EXCEPT the paths listed in the negative lookahead
    '/((?!projects|settings|api|_next/static|_next/image|favicon.ico|images|public).*)',
  ],
};

export default function middleware(_req: NextRequest) {
  // No route protection here; your pages already handle auth client-side.
  return NextResponse.next();
}
