import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import * as jose from 'jose';

const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || 'fallback_secret_key_for_pos_kasir_app'
);

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        if (!token) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        try {
            await jose.jwtVerify(token, JWT_SECRET);
        } catch {
            return NextResponse.json({ success: false, message: 'Invalid token' }, { status: 401 });
        }

        const db = getDb();

        const transactionsRes = await db.execute(`
            SELECT id, tanggal, waktu, items, subtotal, diskon_total, total, bayar, kembalian, metode_bayar, kasir, nama_pelanggan, created_at 
            FROM transactions 
            ORDER BY created_at DESC 
            LIMIT 50
        `);
        const transactions = transactionsRes.rows;

        // Parse items JSON for each transaction and map fields for frontend
        const fullTransactions = transactions.map((trx: any) => {
            let parsedItems = [];
            try {
                parsedItems = JSON.parse(trx.items);
            } catch (e) {
                console.error(`Failed to parse items for transaction ${trx.id}`, e);
            }

            return {
                ...trx,
                items: parsedItems,
                // Ensure field names match what the frontend expects
                subtotal: trx.subtotal,
                diskonTotal: trx.diskon_total,
                total: trx.total,
                bayar: trx.bayar,
                kembalian: trx.kembalian
            };
        });

        return NextResponse.json({ success: true, data: fullTransactions });
    } catch (error: any) {
        console.error('Error fetching transactions:', error);
        return NextResponse.json({ success: false, message: 'Failed to fetch transactions' }, { status: 500 });
    }
}
