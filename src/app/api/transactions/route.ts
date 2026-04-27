import { NextResponse } from 'next/server';
import { addTransaction, getTransactionsByDate, getTransactionsRange, getTodayStats, getTopProducts } from '@/lib/db';
import { seedProducts } from '@/lib/seed';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tanggal = searchParams.get('tanggal');
        const startDate = searchParams.get('start');
        const endDate = searchParams.get('end');
        const stats = searchParams.get('stats');

        if (stats === 'today') {
            const todayStats = await getTodayStats();
            const topProducts = await getTopProducts(new Date().toISOString().split('T')[0]);
            return NextResponse.json({ success: true, data: { ...todayStats, topProducts } });
        }

        let transactions;
        if (startDate && endDate) {
            transactions = await getTransactionsRange(startDate, endDate);
        } else if (tanggal) {
            transactions = await getTransactionsByDate(tanggal);
        } else {
            const today = new Date().toISOString().split('T')[0];
            transactions = await getTransactionsByDate(today);
        }

        return NextResponse.json({ success: true, data: transactions });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        return NextResponse.json({ success: false, error: 'Gagal mengambil data transaksi' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { id, tanggal, waktu, items, subtotal, diskon_total, total, bayar, kembalian, metode_bayar, kasir, nama_pelanggan } = body;

        if (!id || !tanggal || !items || total === undefined || bayar === undefined) {
            return NextResponse.json(
                { success: false, error: 'Data transaksi tidak lengkap' },
                { status: 400 }
            );
        }

        await addTransaction({
            id,
            tanggal,
            waktu: waktu || new Date().toLocaleTimeString('id-ID'),
            items: typeof items === 'string' ? items : JSON.stringify(items),
            subtotal: subtotal || total,
            diskon_total: diskon_total || 0,
            total,
            bayar,
            kembalian: kembalian || 0,
            metode_bayar: metode_bayar || 'tunai',
            kasir,
            nama_pelanggan: nama_pelanggan || '',
        });

        return NextResponse.json({ success: true, message: 'Transaksi berhasil disimpan' });
    } catch (error) {
        console.error('Error saving transaction:', error);
        return NextResponse.json({ success: false, error: 'Gagal menyimpan transaksi' }, { status: 500 });
    }
}
