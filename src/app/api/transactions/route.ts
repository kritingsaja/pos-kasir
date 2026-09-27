import { NextResponse } from 'next/server';
import { addTransactionIdempotent, getTransactionsByDate, getTransactionsRange, getTodayStats, getTopProducts } from '@/lib/db';
import { QRIS_MAX_TRANSACTION_AMOUNT } from '@/lib/qris';

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
        const { id, tanggal, waktu, items, subtotal, diskon_total, total, bayar, kembalian, metode_bayar, rincian_bayar, kasir, nama_pelanggan } = body;

        if (!id || !tanggal || !items || total === undefined || bayar === undefined) {
            return NextResponse.json(
                { success: false, error: 'Data transaksi tidak lengkap' },
                { status: 400 }
            );
        }

        let paymentBreakdown = '';
        if (rincian_bayar !== undefined) {
            if (typeof rincian_bayar !== 'string' || !Number.isSafeInteger(Number(total)) || Number(total) < 0) {
                return NextResponse.json({ success: false, error: 'Rincian pembayaran tidak valid' }, { status: 400 });
            }
            let parsed: Record<string, unknown>;
            try {
                const value: unknown = JSON.parse(rincian_bayar);
                if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
                parsed = value as Record<string, unknown>;
            } catch {
                return NextResponse.json({ success: false, error: 'Rincian pembayaran tidak valid' }, { status: 400 });
            }
            const qris = Number(parsed.qris ?? 0);
            const cash = Number(parsed.tunai ?? 0);
            if (!Number.isSafeInteger(qris) || !Number.isSafeInteger(cash) || qris < 0 || qris > QRIS_MAX_TRANSACTION_AMOUNT || cash < 0 || qris + cash !== Number(total)) {
                return NextResponse.json({ success: false, error: 'Nominal metode pembayaran harus sama dengan total transaksi' }, { status: 400 });
            }
            const validMethod = (metode_bayar === 'qris' && qris === Number(total) && cash === 0)
                || (metode_bayar === 'tunai' && qris === 0 && cash === Number(total))
                || (metode_bayar === 'campuran' && qris > 0 && cash > 0);
            if (!validMethod) return NextResponse.json({ success: false, error: 'Metode dan rincian pembayaran tidak cocok' }, { status: 400 });
            paymentBreakdown = JSON.stringify({ qris, tunai: cash });
        }

        const inserted = await addTransactionIdempotent({
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
            rincian_bayar: paymentBreakdown,
            kasir,
            nama_pelanggan: nama_pelanggan || '',
        });

        return NextResponse.json({
            success: true,
            duplicate: !inserted,
            message: inserted ? 'Transaksi berhasil disimpan' : 'Transaksi sudah tersimpan sebelumnya',
        });
    } catch (error) {
        console.error('Error saving transaction:', error);
        return NextResponse.json({ success: false, error: 'Gagal menyimpan transaksi' }, { status: 500 });
    }
}
