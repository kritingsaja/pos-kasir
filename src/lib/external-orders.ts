import { getDb } from '@/lib/db';
import { ApiError, jakartaDate, tokenHash } from '@/lib/api-access';
import { calculateItemSubtotal } from '@/lib/utils';

export function validateOrder(body: Record<string, unknown>) {
    const name = typeof body.nama_pelanggan === 'string' ? body.nama_pelanggan.trim() : '';
    if (!name || name.length > 80) throw new ApiError(400, 'Nama pelanggan wajib diisi, maksimal 80 karakter.');
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) throw new ApiError(400, 'Pesanan harus berisi 1-50 menu.');
    const seen = new Set<string>();
    const items = body.items.map((item: unknown) => {
        if (!item || typeof item !== 'object') throw new ApiError(400, 'Item tidak valid.');
        const row = item as Record<string, unknown>;
        const code = typeof row.kode_barang === 'string' ? row.kode_barang.trim() : '';
        if (!code || code.length > 100 || seen.has(code)) throw new ApiError(400, 'Kode menu tidak valid atau berulang.');
        seen.add(code);
        if (typeof row.qty !== 'number' || !Number.isInteger(row.qty) || row.qty < 1 || row.qty > 100) throw new ApiError(400, 'Qty harus bilangan bulat 1-100.');
        if (row.catatan !== undefined && (typeof row.catatan !== 'string' || row.catatan.length > 300)) throw new ApiError(400, 'Catatan maksimal 300 karakter.');
        return { kode_barang: code, qty: row.qty, catatan: String(row.catatan || '').trim() };
    });
    return { name, items };
}

export async function createExternalOrder(keyId: string, requestId: string, body: Record<string, unknown>) {
    if (!/^[a-zA-Z0-9._:-]{8,100}$/.test(requestId)) throw new ApiError(400, 'Idempotency-Key wajib berisi 8-100 karakter huruf, angka, titik, titik dua, garis bawah, atau tanda hubung.');
    const order = validateOrder(body);
    const hash = tokenHash(JSON.stringify(order));
    const tx = await getDb().transaction('write');
    try {
        const previous = await tx.execute({ sql: 'SELECT * FROM integration_orders WHERE key_id = ? AND request_id = ?', args: [keyId, requestId] });
        if (previous.rows[0]) {
            const row = previous.rows[0];
            if (row.payload_hash !== hash) throw new ApiError(409, 'Idempotency-Key sudah digunakan untuk pesanan berbeda.');
            await tx.commit();
            return { draft_id: Number(row.draft_id), total: Number(row.total), duplicate: true };
        }
        const settings = await tx.execute("SELECT key,value FROM settings WHERE key IN ('daily_unavailable_menu_date','daily_unavailable_menu_codes')");
        const values = Object.fromEntries(settings.rows.map(row => [String(row.key), String(row.value)]));
        const unavailable: string[] = values.daily_unavailable_menu_date === jakartaDate() ? JSON.parse(values.daily_unavailable_menu_codes || '[]') : [];
        const found = await tx.execute({ sql: `SELECT kode_barang,nama_barang,harga_jual,diskon,tipe_diskon,kategori FROM products WHERE aktif = 1 AND kode_barang IN (${order.items.map(() => '?').join(',')})`, args: order.items.map(item => item.kode_barang) });
        const products = new Map(found.rows.map(row => [String(row.kode_barang), row]));
        const items = order.items.map(item => {
            const product = products.get(item.kode_barang);
            if (!product || unavailable.includes(item.kode_barang)) throw new ApiError(409, `Menu ${item.kode_barang} tidak tersedia.`);
            const price = Number(product.harga_jual);
            const discount = Number(product.diskon);
            const type = Number(product.tipe_diskon);
            const subtotal = Math.max(0, calculateItemSubtotal(price, item.qty, discount, type));
            if (!Number.isFinite(subtotal)) throw new ApiError(500, 'Harga menu tidak valid.');
            return { ...item, nama_barang: String(product.nama_barang), harga_jual: price, diskon: discount, tipe_diskon: type, kategori: String(product.kategori || ''), subtotal };
        });
        const subtotal = items.reduce((sum, item) => sum + item.harga_jual * item.qty, 0);
        const total = items.reduce((sum, item) => sum + item.subtotal, 0);
        const created = await tx.execute({ sql: 'INSERT INTO drafts (nama_draft,items,subtotal,diskon_total,total) VALUES (?,?,?,?,?)', args: [`API - ${order.name}`, JSON.stringify(items), subtotal, subtotal - total, total] });
        const draftId = Number(created.lastInsertRowid);
        await tx.execute({ sql: 'INSERT INTO integration_orders (key_id,request_id,payload_hash,draft_id,total,created_at) VALUES (?,?,?,?,?,?)', args: [keyId, requestId, hash, draftId, total, Date.now()] });
        await tx.commit();
        return { draft_id: draftId, total, duplicate: false };
    } catch (error) { await tx.rollback(); throw error; }
    finally { tx.close(); }
}
