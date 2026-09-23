import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export type ApiScope = 'menu' | 'orders';
export class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization, Cookie' };
export function json(data: unknown, status = 200) {
    return NextResponse.json(data, { status, headers: privateHeaders });
}
export function apiFailure(error: unknown) {
    if (error instanceof ApiError) return json({ success: false, error: error.message }, error.status);
    console.error('API access failed:', error instanceof Error ? error.message : 'Unknown error');
    return json({ success: false, error: 'Layanan tidak tersedia. Coba lagi.' }, 500);
}
export function jakartaDate() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function dateParam(value: string | null, fallback: string) {
    const date = value || fallback;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
        throw new ApiError(400, 'Tanggal harus valid dengan format YYYY-MM-DD.');
    }
    return date;
}
export function pagination(url: URL) {
    const limit = Number(url.searchParams.get('limit') || 50);
    const offset = Number(url.searchParams.get('offset') || 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1000000) {
        throw new ApiError(400, 'Limit 1-100 dan offset 0-1000000.');
    }
    return { limit, offset };
}
export async function requireAdmin(request: NextRequest) {
    if (!process.env.JWT_SECRET) throw new ApiError(503, 'JWT_SECRET belum dikonfigurasi.');
    const token = request.cookies.get('token')?.value;
    if (!token) throw new ApiError(401, 'Silakan login sebagai admin.');
    let role: unknown;
    try {
        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        role = (await jwtVerify(token, secret, { algorithms: ['HS256'] })).payload.role;
    } catch { throw new ApiError(401, 'Sesi tidak valid atau kedaluwarsa.'); }
    if (role !== 'Admin') throw new ApiError(403, 'Hanya admin yang dapat mengakses.');
    const origin = request.headers.get('origin');
    if (request.method !== 'GET' && origin && origin !== request.nextUrl.origin) throw new ApiError(403, 'Origin tidak diizinkan.');
}

export async function ensureApiSchema() {
    const db = getDb();
    await db.execute(`CREATE TABLE IF NOT EXISTS integration_keys (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('menu','orders')),
        token_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL, revoked_at INTEGER, last_used_at INTEGER,
        request_window INTEGER NOT NULL DEFAULT 0, request_count INTEGER NOT NULL DEFAULT 0
    )`);
    await db.execute(`CREATE TABLE IF NOT EXISTS integration_orders (
        key_id TEXT NOT NULL, request_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
        draft_id INTEGER NOT NULL, total REAL NOT NULL, created_at INTEGER NOT NULL,
        PRIMARY KEY (key_id, request_id)
    )`);
}
export function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
export function newApiKey(scope: ApiScope) {
    const token = `pos_${scope}_${randomBytes(32).toString('hex')}`;
    return { id: randomUUID(), token, hash: tokenHash(token), prefix: `${token.slice(0, scope === 'menu' ? 17 : 19)}...` };
}
export async function requireApiKey(request: Request, scope: ApiScope) {
    const auth = request.headers.get('authorization');
    if (!auth || !/^Bearer pos_(menu|orders)_[a-f0-9]{64}$/.test(auth)) throw new ApiError(401, 'Bearer API key diperlukan.');
    await ensureApiSchema();
    const db = getDb();
    const found = await db.execute({ sql: 'SELECT id, scope, expires_at, revoked_at FROM integration_keys WHERE token_hash = ?', args: [tokenHash(auth.slice(7))] });
    const key = found.rows[0];
    if (!key || key.revoked_at !== null || Number(key.expires_at) <= Date.now()) throw new ApiError(401, 'API key tidak valid, dicabut, atau kedaluwarsa.');
    if (key.scope !== scope) throw new ApiError(403, 'API key tidak memiliki akses ke data ini.');
    const now = Date.now();
    const window = Math.floor(now / 60000);
    const update = await db.execute({
        sql: `UPDATE integration_keys SET last_used_at = ?, request_count = CASE WHEN request_window = ? THEN request_count + 1 ELSE 1 END, request_window = ?
              WHERE id = ? AND revoked_at IS NULL AND expires_at > ? AND (request_window != ? OR request_count < 120)`,
        args: [now, window, window, key.id, now, window],
    });
    if (!update.rowsAffected) throw new ApiError(429, 'Batas 120 request per menit. Coba lagi nanti.');
    return String(key.id);
}
export async function readJson(request: Request): Promise<Record<string, unknown>> {
    if (Number(request.headers.get('content-length') || 0) > 32768) throw new ApiError(413, 'Payload terlalu besar.');
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError(400, 'Body JSON diperlukan.');
    const decoder = new TextDecoder();
    let text = ''; let size = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 32768) { await reader.cancel(); throw new ApiError(413, 'Payload terlalu besar.'); }
        text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    try {
        const body = JSON.parse(text);
        if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error();
        return body;
    } catch { throw new ApiError(400, 'Body JSON tidak valid.'); }
}
