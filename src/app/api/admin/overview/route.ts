import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { apiFailure, dateParam, jakartaDate, json, requireAdmin } from '@/lib/api-access';
import { summarizeClosing } from '@/lib/closing-summary';
import type { CartItem, Transaction } from '@/lib/utils';

export async function GET(request: NextRequest) {
    try {
        await requireAdmin(request);
        const date = dateParam(request.nextUrl.searchParams.get('date'), jakartaDate());
        const db = getDb();
        const results = await Promise.all([
            db.execute({ sql: 'SELECT id,tanggal,waktu,total,metode_bayar,nama_pelanggan,items FROM transactions WHERE tanggal = ? ORDER BY waktu DESC,id DESC', args: [date] }),
            db.execute('SELECT COUNT(*) AS count FROM products WHERE aktif = 1'),
            db.execute('SELECT COUNT(*) AS count FROM drafts'),
            db.execute({ sql: 'SELECT tanggal,SUM(total) AS total FROM transactions WHERE tanggal LIKE ? GROUP BY tanggal ORDER BY tanggal', args: [`${date.slice(0, 7)}-%`] }),
            db.execute({ sql: 'SELECT substr(tanggal,1,7) AS month,SUM(total) AS total FROM transactions WHERE tanggal LIKE ? GROUP BY month ORDER BY month', args: [`${date.slice(0, 4)}-%`] }),
        ]);
        const transactions = results[0].rows as unknown as Transaction[];
        const summary = summarizeClosing(transactions, date);
        const hourly = Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, '0')}:00`, total: 0 }));
        const products = new Map<string, { nama: string; qty: number; total: number }>();
        for (const transaction of transactions) {
            const hour = Number(transaction.waktu.split(/[:.]/)[0]);
            if (Number.isInteger(hour) && hour >= 0 && hour < 24) hourly[hour].total += Number(transaction.total);
            const items: CartItem[] = JSON.parse(transaction.items);
            for (const item of items) {
                const product = products.get(item.kode_barang) || { nama: item.nama_barang, qty: 0, total: 0 };
                product.qty += Number(item.qty);
                product.total += Number(item.subtotal);
                products.set(item.kode_barang, product);
            }
        }
        const days = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();
        const daily = Array.from({ length: days }, (_, i) => ({ label: String(i + 1), total: Number(results[3].rows.find(row => row.tanggal === `${date.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`)?.total || 0) }));
        const monthly = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'].map((label, i) => ({ label, total: Number(results[4].rows.find(row => row.month === `${date.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`)?.total || 0) }));
        return json({ success: true, data: {
            date, ...summary, average: summary.count ? summary.total / summary.count : 0,
            activeMenus: Number(results[1].rows[0].count), drafts: Number(results[2].rows[0].count),
            topProducts: [...products.values()].sort((a, b) => b.qty - a.qty).slice(0, 5),
            recent: transactions.slice(0, 6).map(({ id, waktu, total, metode_bayar, nama_pelanggan }) => ({ id, waktu, total, metode_bayar, nama_pelanggan })),
            graphs: { hourly, daily, monthly },
        } });
    } catch (error) { return apiFailure(error); }
}
