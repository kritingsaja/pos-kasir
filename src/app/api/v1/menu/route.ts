import { getDb } from '@/lib/db';
import { apiFailure, jakartaDate, json, pagination, requireApiKey } from '@/lib/api-access';

export async function GET(request: Request) {
    try {
        await requireApiKey(request, 'menu');
        const { limit, offset } = pagination(new URL(request.url));
        const db = getDb();
        const [products, settings] = await Promise.all([
            db.execute({ sql: 'SELECT kode_barang, nama_barang, harga_jual, diskon, tipe_diskon, kategori FROM products WHERE aktif = 1 ORDER BY kode_barang LIMIT ? OFFSET ?', args: [limit + 1, offset] }),
            db.execute("SELECT key, value FROM settings WHERE key IN ('daily_unavailable_menu_date','daily_unavailable_menu_codes')"),
        ]);
        const values = Object.fromEntries(settings.rows.map(row => [String(row.key), String(row.value)]));
        const codes = values.daily_unavailable_menu_date === jakartaDate() ? JSON.parse(values.daily_unavailable_menu_codes || '[]') : [];
        return json({ success: true, data: products.rows.slice(0, limit).map(row => ({ ...row, tersedia: !codes.includes(row.kode_barang) })), pagination: { limit, offset, has_more: products.rows.length > limit } });
    } catch (error) { return apiFailure(error); }
}
