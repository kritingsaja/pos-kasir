import { NextRequest, NextResponse } from 'next/server';
import { getUserByUsername, ensureDb } from '@/lib/db';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_for_pos_kasir_app';

export async function POST(req: NextRequest) {
    try {
        await ensureDb();
        const { username, password } = await req.json();

        if (!username || !password) {
            return NextResponse.json({ success: false, error: 'Username dan password harus diisi' }, { status: 400 });
        }

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
        return NextResponse.json({ 
            success: false, 
            error: 'ERROR: ' + (error.message || 'Unknown Server Error') 
        }, { status: 500 });
    }
}
