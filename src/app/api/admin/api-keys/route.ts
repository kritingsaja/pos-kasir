import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { ApiError, apiFailure, ensureApiSchema, json, newApiKey, readJson, requireAdmin } from '@/lib/api-access';

export async function GET(request: NextRequest) {
    try {
        await requireAdmin(request);
        await ensureApiSchema();
        const result = await getDb().execute('SELECT id, name, scope, prefix, created_at, expires_at, revoked_at, last_used_at FROM integration_keys ORDER BY created_at DESC');
        return json({ success: true, data: result.rows });
    } catch (error) { return apiFailure(error); }
}
export async function POST(request: NextRequest) {
    try {
        await requireAdmin(request);
        const body = await readJson(request);
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > 80 || !['menu', 'orders'].includes(String(body.scope))) throw new ApiError(400, 'Nama akses dan jenis akses wajib diisi.');
        const days = Number(body.days ?? 90);
        if (![30, 90, 365].includes(days)) throw new ApiError(400, 'Masa berlaku tidak valid.');
        await ensureApiSchema();
        const scope = body.scope as 'menu' | 'orders';
        const key = newApiKey(scope);
        const now = Date.now();
        await getDb().execute({ sql: 'INSERT INTO integration_keys (id,name,scope,token_hash,prefix,created_at,expires_at) VALUES (?,?,?,?,?,?,?)', args: [key.id, name, scope, key.hash, key.prefix, now, now + days * 86400000] });
        return json({ success: true, data: { id: key.id, token: key.token } }, 201);
    } catch (error) { return apiFailure(error); }
}
export async function DELETE(request: NextRequest) {
    try {
        await requireAdmin(request);
        const id = request.nextUrl.searchParams.get('id');
        if (!id) throw new ApiError(400, 'ID akses diperlukan.');
        await ensureApiSchema();
        const result = await getDb().execute({ sql: 'UPDATE integration_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', args: [Date.now(), id] });
        if (!result.rowsAffected) throw new ApiError(404, 'Akses tidak ditemukan atau sudah dicabut.');
        return json({ success: true });
    } catch (error) { return apiFailure(error); }
}
