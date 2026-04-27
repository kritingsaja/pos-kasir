import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_for_pos_kasir_app';

export async function middleware(request: NextRequest) {
    const token = request.cookies.get('token')?.value;
    const path = request.nextUrl.pathname;

    // Root or login page should not be protected right here if the intent is to redirect
    // But actually let's just make it simple:
    const isLoginPage = path === '/login';
    const isAuthApi = path.startsWith('/api/auth/');
    const isPublicAsset = path.match(/\.(png|jpg|jpeg|gif|svg|ico|json|webmanifest)$/i) || path === '/manifest.ts';

    if (!token && !isLoginPage && !isAuthApi && !isPublicAsset) {
        if (path.startsWith('/api/')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (token) {
        try {
            const secret = new TextEncoder().encode(JWT_SECRET);
            const { payload } = await jwtVerify(token, secret);

            const role = payload.role as string;

            if (isLoginPage) {
                return NextResponse.redirect(new URL(role === 'Kasir' ? '/kasir' : '/', request.url));
            }

            // Role-based Path protection
            if (role === 'Kasir') {
                const allowedPaths = ['/kasir', '/api/kasir'];
                const isAllowed = allowedPaths.some(p => path.startsWith(p)) || path.startsWith('/api/');
                if (!isAllowed) {
                    return NextResponse.redirect(new URL('/kasir', request.url));
                }
            }

            if (role === 'Admin') {
                // Admin cannot access kasir directly (as per requirement: "untuk admin tanpa kasir")
                // But usually Admin manages things. For this request we'll block /kasir for admin.
                if (path.startsWith('/kasir')) {
                    return NextResponse.redirect(new URL('/', request.url));
                }
            }

            // Add user info to headers for downstream access if needed
            const requestHeaders = new Headers(request.headers);
            requestHeaders.set('x-user-role', role);
            requestHeaders.set('x-user-username', payload.username as string);

            return NextResponse.next({
                request: {
                    headers: requestHeaders,
                },
            });

        } catch (error) {
            if (isLoginPage) return NextResponse.next();

            if (path.startsWith('/api/') && !path.startsWith('/api/auth/')) {
                return NextResponse.json({ success: false, error: 'Invalid Token' }, { status: 401 });
            }
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico|icon.png|logo.png|manifest.json).*)',
    ],
};
