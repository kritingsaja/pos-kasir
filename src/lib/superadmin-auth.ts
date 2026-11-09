import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function requireSuperadmin(request: NextRequest) {
    const token = request.cookies.get('token')?.value;
    if (!token || !process.env.JWT_SECRET) throw new Error('Unauthorized');
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
    if (payload.role !== 'Superadmin' || payload.scope !== 'platform') throw new Error('Forbidden');
    return payload;
}
