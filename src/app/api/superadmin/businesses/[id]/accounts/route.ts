import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ensurePlatformSchema, getPlatformDb, getBusinessDatabase } from '@/lib/platform-db';
import { requireSuperadmin } from '@/lib/superadmin-auth';

type RouteContext = { params: Promise<{ id: string }> };
function failed(error: unknown) {
    const message = error instanceof Error ? error.message : 'Operasi akun gagal.';
    const status = /Unauthorized/.test(message) ? 401 : /Forbidden/.test(message) ? 403 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        await requireSuperadmin(request);
        await ensurePlatformSchema();
        const { id } = await context.params;
        const result = await getPlatformDb().execute({
            sql: 'SELECT id,username,role,active,created_at FROM platform_accounts WHERE business_id=? ORDER BY role,username',
            args: [id],
        });
        return NextResponse.json({ success: true, accounts: result.rows });
    } catch (error) { return failed(error); }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
    try {
        await requireSuperadmin(request);
        const { id: businessId } = await context.params;
        const body = await request.json();
        const accountId = typeof body.accountId === 'string' ? body.accountId : '';
        const username = typeof body.username === 'string' ? body.username.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';
        if (!accountId || !/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
            return NextResponse.json({ success: false, error: 'Username harus 3–40 karakter tanpa spasi.' }, { status: 400 });
        }
        if (password.length < 10 || password.length > 128) {
            return NextResponse.json({ success: false, error: 'Password baru harus 10–128 karakter.' }, { status: 400 });
        }
        await ensurePlatformSchema();
        const platformDb = getPlatformDb();
        const found = await platformDb.execute({
            sql: 'SELECT id,username,role FROM platform_accounts WHERE id=? AND business_id=?',
            args: [accountId, businessId],
        });
        if (!found.rows.length) return NextResponse.json({ success: false, error: 'Akun bisnis tidak ditemukan.' }, { status: 404 });
        const oldUsername = String(found.rows[0].username);
        const role = String(found.rows[0].role);
        const collision = await platformDb.execute({
            sql: 'SELECT 1 FROM platform_accounts WHERE username=? AND id<>? LIMIT 1',
            args: [username, accountId],
        });
        if (collision.rows.length) return NextResponse.json({ success: false, error: 'Username sudah dipakai akun lain.' }, { status: 409 });

        const passwordHash = await bcrypt.hash(password, 12);
        const tenantDb = await getBusinessDatabase(businessId, true);
        const changed = await tenantDb.execute({
            sql: 'UPDATE users SET username=?,password=? WHERE username=? AND role=?',
            args: [username, passwordHash, oldUsername, role],
        });
        if (!changed.rowsAffected) return NextResponse.json({ success: false, error: 'Akun tenant tidak ditemukan; data platform tidak diubah.' }, { status: 409 });

        const tx = await platformDb.transaction('write');
        try {
            await tx.execute({
                sql: 'UPDATE platform_accounts SET username=?,password_hash=? WHERE id=? AND business_id=?',
                args: [username, passwordHash, accountId, businessId],
            });
            if (role === 'Admin') {
                await tx.execute({ sql: 'UPDATE platform_businesses SET admin_username=? WHERE id=?', args: [username, businessId] });
            }
            await tx.commit();
        } catch (error) {
            await tx.rollback();
            throw error;
        }
        return NextResponse.json({ success: true, account: { id: accountId, username, role } });
    } catch (error) { return failed(error); }
}
