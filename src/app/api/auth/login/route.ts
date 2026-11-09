import { NextRequest, NextResponse } from 'next/server';
import { getUserByUsername, ensureDb } from '@/lib/db';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_for_pos_kasir_app';

function secretMatches(input: string, expected: string) {
    const a = Buffer.from(input);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
    try {
        const { username, password } = await req.json();

        if (!username || !password) {
            return NextResponse.json({ success: false, error: 'Username dan password harus diisi' }, { status: 400 });
        }

        const superUsername = process.env.SUPERADMIN_USERNAME;
        const superPassword = process.env.SUPERADMIN_PASSWORD;
        const superJwtSecret = process.env.JWT_SECRET;
        if (superUsername && superPassword && superJwtSecret && superJwtSecret.length >= 32 &&
            secretMatches(String(username), superUsername) && secretMatches(String(password), superPassword)) {
            const jwt = await new SignJWT({ username: superUsername, role: 'Superadmin', scope: 'platform' })
                .setProtectedHeader({ alg: 'HS256' })
                .setIssuedAt()
                .setExpirationTime('4h')
                .sign(new TextEncoder().encode(superJwtSecret));
            const response = NextResponse.json({ success: true, data: { username: superUsername, role: 'Superadmin' } });
            response.cookies.set('token', jwt, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 60 * 60 * 4,
                path: '/',
            });
            return response;
        }

        await ensureDb();
        const user = (await getUserByUsername(username)) as any;

        if (!user || !user.password) {
            return NextResponse.json({ success: false, error: 'Username tidak ditemukan' }, { status: 401 });
        }

        const passwordMatch = await bcrypt.compare(password, String(user.password));

        if (!passwordMatch) {
            return NextResponse.json({ success: false, error: 'Password salah' }, { status: 401 });
        }

        const secret = new TextEncoder().encode(JWT_SECRET);
        const alg = 'HS256';

        const jwt = await new SignJWT({ 
            id: user.id, 
            username: user.username, 
            role: user.role 
        })
            .setProtectedHeader({ alg })
            .setIssuedAt()
            .setExpirationTime('24h')
            .sign(secret);

        const response = NextResponse.json({
            success: true,
            data: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });

        response.cookies.set('token', jwt, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 60 * 60 * 24, // 1 day
            path: '/'
        });

        return response;
    } catch (error: any) {
        console.error('Login error:', error);
        // Cek kunci apa saja yang ada di environment (HANYA KUNCI, BUKAN NILAI/TOKEN)
        const envKeys = Object.keys(process.env).filter(k => k.includes('TURSO') || k.includes('LIBSQL') || k.includes('DATABASE'));
        
        return NextResponse.json({ 
            success: false, 
            error: 'ERROR: ' + (error.message || 'Unknown Server Error'),
            available_vars: envKeys
        }, { status: 500 });
    }
}
