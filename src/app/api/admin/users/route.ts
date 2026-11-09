import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { ensurePlatformSchema, getPlatformDb, getBusinessDatabase } from '@/lib/platform-db';

function adminBusiness(request: NextRequest) {
    const role = request.headers.get('x-user-role');
    const businessId = request.headers.get('x-business-id');
    if (role !== 'Admin' || !businessId) throw new Error('Forbidden: hanya Admin bisnis yang dapat mengelola akun Kasir.');
    return businessId;
}
function fail(error: unknown) {
    const message = error instanceof Error ? error.message : 'Operasi akun gagal.';
    return NextResponse.json({ success: false, error: message }, { status: /Forbidden/.test(message) ? 403 : 400 });
}
function validCredentials(username: unknown, password: unknown) {
    return typeof username === 'string' && /^[a-zA-Z0-9._-]{3,40}$/.test(username.trim())
        && typeof password === 'string' && password.length >= 10 && password.length <= 128;
}

export async function GET(request: NextRequest) {
    try {
        const businessId = adminBusiness(request);
        await ensurePlatformSchema();
        const result = await getPlatformDb().execute({
            sql: "SELECT id,username,role,active,created_at FROM platform_accounts WHERE business_id=? ORDER BY CASE role WHEN 'Admin' THEN 0 ELSE 1 END,username",
            args: [businessId],
        });
        return NextResponse.json({ success: true, accounts: result.rows });
    } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest) {
    let insertedUsername: string | null = null;
    try {
        const businessId = adminBusiness(request);
        const body = await request.json();
        const username = typeof body.username === 'string' ? body.username.trim() : '';
        const password = body.password;
        if (!validCredentials(username, password)) {
            return NextResponse.json({ success: false, error: 'Username harus 3–40 karakter tanpa spasi; password minimal 10 karakter.' }, { status: 400 });
        }
        await ensurePlatformSchema();
        const platformDb = getPlatformDb();
        const duplicate = await platformDb.execute({ sql: 'SELECT 1 FROM platform_accounts WHERE username=? LIMIT 1', args: [username] });
        if (duplicate.rows.length) return NextResponse.json({ success: false, error: 'Username sudah dipakai akun lain.' }, { status: 409 });

        const id = randomUUID();
        const passwordHash = await bcrypt.hash(password, 12);
        const tenantDb = await getBusinessDatabase(businessId);
        await tenantDb.execute({ sql: 'INSERT INTO users (username,password,role) VALUES (?,?,?)', args: [username, passwordHash, 'Kasir'] });
        insertedUsername = username;
        await platformDb.execute({
            sql: "INSERT INTO platform_accounts (id,business_id,username,password_hash,role,active) VALUES (?,?,?,?, 'Kasir',1)",
            args: [id, businessId, username, passwordHash],
        });
        insertedUsername = null;
        return NextResponse.json({ success: true, account: { id, username, role: 'Kasir', active: 1 } }, { status: 201 });
    } catch (error) {
        if (insertedUsername) {
            try {
                const businessId = adminBusiness(request);
                const tenantDb = await getBusinessDatabase(businessId);
                await tenantDb.execute({ sql: 'DELETE FROM users WHERE username=? AND role=?', args: [insertedUsername, 'Kasir'] });
            } catch {}
        }
        return fail(error);
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const businessId = adminBusiness(request);
        const body = await request.json();
        const accountId = typeof body.accountId === 'string' ? body.accountId : '';
        const username = typeof body.username === 'string' ? body.username.trim() : '';
        const password = body.password;
        if (!accountId || !validCredentials(username, password)) {
            return NextResponse.json({ success: false, error: 'Username baru valid dan password minimal 10 karakter wajib diisi.' }, { status: 400 });
        }
        await ensurePlatformSchema();
        const platformDb = getPlatformDb();
        const current = await platformDb.execute({
            sql: "SELECT username FROM platform_accounts WHERE id=? AND business_id=? AND role='Kasir'",
            args: [accountId, businessId],
        });
        if (!current.rows.length) return NextResponse.json({ success: false, error: 'Akun Kasir tidak ditemukan.' }, { status: 404 });
        const oldUsername = String(current.rows[0].username);
        const duplicate = await platformDb.execute({
            sql: 'SELECT 1 FROM platform_accounts WHERE username=? AND id<>? LIMIT 1',
            args: [username, accountId],
        });
        if (duplicate.rows.length) return NextResponse.json({ success: false, error: 'Username sudah dipakai akun lain.' }, { status: 409 });
        const passwordHash = await bcrypt.hash(password, 12);
        const tenantDb = await getBusinessDatabase(businessId);
        await tenantDb.execute({
            sql: 'UPDATE users SET username=?,password=? WHERE username=? AND role=?',
            args: [username, passwordHash, oldUsername, 'Kasir'],
        });
        await platformDb.execute({
            sql: 'UPDATE platform_accounts SET username=?,password_hash=? WHERE id=? AND business_id=?',
            args: [username, passwordHash, accountId, businessId],
        });
        return NextResponse.json({ success: true, account: { id: accountId, username, role: 'Kasir' } });
    } catch (error) { return fail(error); }
}
