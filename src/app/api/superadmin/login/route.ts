import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';

const JWT_SECRET = process.env.JWT_SECRET;

function equalSecret(input: string, expected: string) {
    const a = Buffer.from(input);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
    const expectedUsername = process.env.SUPERADMIN_USERNAME;
    const expectedPassword = process.env.SUPERADMIN_PASSWORD;

    if (!JWT_SECRET || !expectedUsername || !expectedPassword || JWT_SECRET.length < 32) {
        return NextResponse.json({
            success: false,
            error: 'Akses Superadmin belum dikonfigurasi. Atur SUPERADMIN_USERNAME, SUPERADMIN_PASSWORD, dan JWT_SECRET di Environment Variables Vercel.',
        }, { status: 503 });
    }

    try {
        const body = await request.json();
        const username = typeof body.username === 'string' ? body.username : '';
        const password = typeof body.password === 'string' ? body.password : '';
        if (!equalSecret(username, expectedUsername) || !equalSecret(password, expectedPassword)) {
            return NextResponse.json({ success: false, error: 'Username atau password salah.' }, { status: 401 });
        }

        const jwt = await new SignJWT({ username: expectedUsername, role: 'Superadmin', scope: 'platform' })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('4h')
            .sign(new TextEncoder().encode(JWT_SECRET));

        const response = NextResponse.json({ success: true });
        response.cookies.set('token', jwt, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 60 * 60 * 4,
            path: '/',
        });
        return response;
    } catch {
        return NextResponse.json({ success: false, error: 'Permintaan login tidak valid.' }, { status: 400 });
    }
}
