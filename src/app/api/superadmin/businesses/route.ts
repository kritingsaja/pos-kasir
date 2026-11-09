import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createClient } from '@libsql/client';
import { ensurePlatformSchema, getPlatformDb, listPlatformBusinesses, getPlatformSummary, platformStorageConfigured, tenantProvisioningConfigured, createTursoDatabase, deleteTursoDatabase, encryptDatabaseToken, addPlatformBusiness, setPlatformBusinessStatus, getBusinessDatabase } from '@/lib/platform-db';
import { requireSuperadmin } from '@/lib/superadmin-auth';
import { initializeDatabase } from '@/lib/db';

function errorResponse(error: unknown) {
    const message = error instanceof Error ? error.message : 'Operasi gagal.';
    const status = /Unauthorized/.test(message) ? 401 : /Forbidden/.test(message) ? 403 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
    try {
        await requireSuperadmin(request);
        if (!platformStorageConfigured()) {
            return NextResponse.json({
                success: true,
                configured: false,
                provisioningConfigured: tenantProvisioningConfigured(),
                missing: ['PLATFORM_TURSO_URL', 'PLATFORM_TURSO_AUTH_TOKEN', 'TURSO_ORG', 'TURSO_API_TOKEN', 'JWT_SECRET'].filter(key => !process.env[key]),
                businesses: [],
                summary: { total: 0, active: 0, suspended: 0, cafe: 0, stockist: 0 },
            });
        }
        await ensurePlatformSchema();
        const businesses = await listPlatformBusinesses();
        const health = await Promise.all(businesses.map(async (business: any) => {
            if (business.status !== 'active') return { id: String(business.id), state: 'suspended' };
            try {
                const db = await getBusinessDatabase(String(business.id));
                await db.execute('SELECT 1');
                return { id: String(business.id), state: 'connected' };
            } catch {
                return { id: String(business.id), state: 'error' };
            }
        }));
        return NextResponse.json({
            success: true,
            configured: true,
            provisioningConfigured: tenantProvisioningConfigured(),
            businesses: businesses.map((business: any) => ({
                ...business,
                health: health.find(item => item.id === String(business.id))?.state || 'unknown',
            })),
            summary: await getPlatformSummary(),
        });
    } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
    let createdDbName: string | null = null;
    try {
        await requireSuperadmin(request);
        if (!tenantProvisioningConfigured()) {
            return NextResponse.json({
                success: false,
                error: 'Atur PLATFORM_TURSO_URL, PLATFORM_TURSO_AUTH_TOKEN, TURSO_ORG, TURSO_API_TOKEN, dan JWT_SECRET di Vercel terlebih dahulu.',
            }, { status: 503 });
        }
        const body = await request.json();
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const businessType = body.businessType === 'stockist' ? 'stockist' : body.businessType === 'cafe' ? 'cafe' : '';
        const username = typeof body.adminUsername === 'string' ? body.adminUsername.trim() : '';
        const password = typeof body.adminPassword === 'string' ? body.adminPassword : '';
        const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
        if (name.length < 2 || name.length > 100) return NextResponse.json({ success: false, error: 'Nama bisnis harus 2–100 karakter.' }, { status: 400 });
        if (!businessType) return NextResponse.json({ success: false, error: 'Jenis bisnis wajib dipilih.' }, { status: 400 });
        if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(slug)) return NextResponse.json({ success: false, error: 'Kode bisnis hanya boleh huruf kecil, angka, dan tanda hubung.' }, { status: 400 });
        if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) return NextResponse.json({ success: false, error: 'Username Admin 3–40 karakter, tanpa spasi.' }, { status: 400 });
        if (password.length < 10 || password.length > 128) return NextResponse.json({ success: false, error: 'Password Admin harus 10–128 karakter.' }, { status: 400 });

        await ensurePlatformSchema();
        const db = getPlatformDb();
        const duplicate = await db.execute({
            sql: 'SELECT 1 FROM platform_businesses WHERE slug=? UNION SELECT 1 FROM platform_accounts WHERE username=? LIMIT 1',
            args: [slug, username],
        });
        if (duplicate.rows.length) return NextResponse.json({ success: false, error: 'Kode bisnis atau username Admin sudah dipakai.' }, { status: 409 });

        const id = randomUUID();
        const databaseName = ('pos-' + slug).slice(0, 64);
        createdDbName = databaseName;
        const provisioned = await createTursoDatabase(databaseName);
        const tenantClient = createClient({ url: provisioned.url, authToken: provisioned.token });
        await initializeDatabase(tenantClient, { seedUsers: false, throwOnError: true, databaseUrl: provisioned.url, businessType });
        await tenantClient.execute({ sql: 'UPDATE settings SET value=? WHERE key=?', args: [name, 'nama_toko'] });
        const passwordHash = await bcrypt.hash(password, 12);
        await tenantClient.execute({
            sql: 'INSERT INTO users (username,password,role) VALUES (?,?,?)',
            args: [username, passwordHash, 'Admin'],
        });
        const record = {
            id, name, slug, business_type: businessType as 'cafe' | 'stockist',
            status: 'active' as const, database_name: databaseName, database_url: provisioned.url,
            database_token_encrypted: encryptDatabaseToken(provisioned.token), admin_username: username,
            created_at: new Date().toISOString(),
        };
        await addPlatformBusiness(record, { id: randomUUID(), username, passwordHash });
        createdDbName = null;
        return NextResponse.json({ success: true, data: { id, name, slug, businessType, adminUsername: username, status: 'active' } }, { status: 201 });
    } catch (error) {
        if (createdDbName) await deleteTursoDatabase(createdDbName);
        return errorResponse(error);
    }
}

export async function PATCH(request: NextRequest) {
    try {
        await requireSuperadmin(request);
        if (!platformStorageConfigured()) return NextResponse.json({ success: false, error: 'Database platform belum dikonfigurasi.' }, { status: 503 });
        const body = await request.json();
        const id = typeof body.id === 'string' ? body.id : '';
        const status = body.status === 'suspended' ? 'suspended' : body.status === 'active' ? 'active' : '';
        if (!id || !status) return NextResponse.json({ success: false, error: 'ID dan status bisnis tidak valid.' }, { status: 400 });
        await ensurePlatformSchema();
        const changed = await setPlatformBusinessStatus(id, status);
        if (!changed) return NextResponse.json({ success: false, error: 'Bisnis tidak ditemukan.' }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error) { return errorResponse(error); }
}
