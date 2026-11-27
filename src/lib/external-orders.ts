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
    const source = body.source === undefined ? 'api' : body.source;
    if (source !== 'api' && source !== 'booking') throw new ApiError(400, 'Sumber pesanan tidak valid.');
    const tanggal_pesanan = body.tanggal_pesanan === undefined ? jakartaDate() : body.tanggal_pesanan;
    if (typeof tanggal_pesanan !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(tanggal_pesanan)) throw new ApiError(400, 'Tanggal pesanan harus menggunakan format YYYY-MM-DD.');
    const parsedDate = new Date(`${tanggal_pesanan}T00:00:00.000Z`);
    if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== tanggal_pesanan) throw new ApiError(400, 'Tanggal pesanan tidak valid.');
    return { name, source, items, tanggal_pesanan };
}

export async function createExternalOrder(keyId: string, requestId: string, body: Record<string, unknown>, replaceExisting = false) {
    if (!/^[a-zA-Z0-9._:-]{8,100}$/.test(requestId)) throw new ApiError(400, 'Idempotency-Key wajib berisi 8-100 karakter huruf, angka, titik, titik dua, garis bawah, atau tanda hubung.');
    const order = validateOrder(body);
    // Keep legacy idempotency hashes for ordinary API orders; booking source is part of its own payload identity.
    const hashPayload = order.source === 'booking' ? order : { name: order.name, items: order.items };
    const hash = tokenHash(JSON.stringify(hashPayload));
    const tx = await getDb().transaction('write');
    try {
        const previous = await tx.execute({ sql: 'SELECT * FROM integration_orders WHERE key_id = ? AND request_id = ?', args: [keyId, requestId] });
        const previousRow = previous.rows[0];
        let previousDraftExists = false;
        if (previousRow && replaceExisting) {
            const existingDraft = await tx.execute({ sql: 'SELECT id FROM drafts WHERE id = ?', args: [Number(previousRow.draft_id)] });
            previousDraftExists = existingDraft.rows.length > 0;
        }
        if (previousRow && !replaceExisting) {
            if (previousRow.payload_hash !== hash) throw new ApiError(409, 'Idempotency-Key sudah digunakan untuk pesanan berbeda.');
            await tx.commit();
            return { draft_id: Number(previousRow.draft_id), total: Number(previousRow.total), duplicate: true };
        }
        if (previousRow && replaceExisting && previousDraftExists && previousRow.payload_hash === hash) {
            await tx.commit();
            return { draft_id: Number(previousRow.draft_id), total: Number(previousRow.total), duplicate: true };
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

        if (previousRow && replaceExisting && previousDraftExists) {
            const draftId = Number(previousRow.draft_id);
            await tx.execute({
                sql: "UPDATE drafts SET nama_draft = ?, items = ?, subtotal = ?, diskon_total = ?, total = ?, tanggal_pesanan = ?, updated_at = datetime('now','localtime') WHERE id = ?",
                args: [`${order.source === 'booking' ? 'BOOKING' : 'API'} - ${order.name}`, JSON.stringify(items), subtotal, subtotal - total, total, order.tanggal_pesanan, draftId],
            });
            await tx.execute({
                sql: 'UPDATE integration_orders SET payload_hash = ?, total = ? WHERE key_id = ? AND request_id = ?',
                args: [hash, total, keyId, requestId],
            });
            await tx.commit();
            return { draft_id: draftId, total, duplicate: false, updated: true };
        }

        const created = await tx.execute({ sql: 'INSERT INTO drafts (nama_draft,items,subtotal,diskon_total,total,tanggal_pesanan) VALUES (?,?,?,?,?,?)', args: [`${order.source === 'booking' ? 'BOOKING' : 'API'} - ${order.name}`, JSON.stringify(items), subtotal, subtotal - total, total, order.tanggal_pesanan] });
        const draftId = Number(created.lastInsertRowid);
        if (previousRow && replaceExisting) {
            // A deleted POS draft leaves its idempotency record behind. Repoint that same booking key to the replacement.
            await tx.execute({
                sql: 'UPDATE integration_orders SET payload_hash = ?, draft_id = ?, total = ? WHERE key_id = ? AND request_id = ?',
                args: [hash, draftId, total, keyId, requestId],
            });
            await tx.commit();
            return { draft_id: draftId, total, duplicate: false, updated: false, recreated: true };
        }
        await tx.execute({ sql: 'INSERT INTO integration_orders (key_id,request_id,payload_hash,draft_id,total,created_at) VALUES (?,?,?,?,?,?)', args: [keyId, requestId, hash, draftId, total, Date.now()] });
        await tx.commit();
        return { draft_id: draftId, total, duplicate: false, updated: false };
    } catch (error) { await tx.rollback(); throw error; }
    finally { tx.close(); }
}
