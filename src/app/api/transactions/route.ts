import { NextResponse } from 'next/server';
import { addTransactionIdempotent, getDb, getTransactionsByDate, getTransactionsRange, getTodayStats, getTopProducts } from '@/lib/db';
import { QRIS_MAX_TRANSACTION_AMOUNT } from '@/lib/qris';
import { authenticatedBcaUser, claimForSale, errorResponse } from '@/lib/bca-check';
import { BcaError } from '@/lib/bca-matching';

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
        let qrisPortion = 0;
        let cashPortion = 0;
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
            qrisPortion = qris;
            cashPortion = cash;
        }

        const transaction = {
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
        };
        let inserted;
        if (body.bca_verification !== undefined) {
            if (qrisPortion <= 0 || !['qris', 'campuran'].includes(metode_bayar)) {
                throw new BcaError('INVALID_VERIFICATION', 'Referensi BCA harus disertai rincian QRIS.', 400);
            }
            if (!Number.isSafeInteger(Number(bayar)) || Number(bayar) < Number(total) || Number(kembalian ?? 0) !== Number(bayar) - Number(total)) {
                throw new BcaError('INVALID_PAYMENT', 'Nominal pembayaran atau kembalian tidak valid.', 400);
            }
            const ownerId = await authenticatedBcaUser(request.headers.get('cookie'));
            const dbTransaction = await getDb().transaction('write');
            try {
                const reference = await claimForSale(dbTransaction, {
                    verification: body.bca_verification, amount: qrisPortion, transactionId: String(id), ownerId,
                });
                const existing = await dbTransaction.execute({ sql: 'SELECT rincian_bayar FROM transactions WHERE id = ?', args: [String(id)] });
                if (existing.rows.length) {
                    const previous = JSON.parse(String(existing.rows[0].rincian_bayar || '{}'));
                    if (previous.bca?.checkoutId !== reference.checkoutId || previous.qris !== qrisPortion || previous.tunai !== cashPortion) {
                        throw new BcaError('TRANSACTION_CONFLICT', 'ID transaksi sudah digunakan untuk pembayaran berbeda.', 409);
                    }
                }
                transaction.rincian_bayar = JSON.stringify({ qris: qrisPortion, tunai: cashPortion, bca: reference });
                inserted = await addTransactionIdempotent(transaction, dbTransaction);
                await dbTransaction.execute({ sql: 'UPDATE bca_qris_claims SET transaction_id = ? WHERE checkout_id = ?', args: [String(id), reference.checkoutId] });
                await dbTransaction.commit();
            } catch (error) {
                await dbTransaction.rollback();
                throw error;
            } finally {
                dbTransaction.close();
            }
        } else {
            inserted = await addTransactionIdempotent(transaction);
        }

        return NextResponse.json({
            success: true,
            duplicate: !inserted,
            message: inserted ? 'Transaksi berhasil disimpan' : 'Transaksi sudah tersimpan sebelumnya',
        });
    } catch (error) {
        if (error instanceof BcaError) {
            const result = errorResponse(error);
            return NextResponse.json(result.body, { status: result.status });
        }
        console.error('Error saving transaction:', error);
        return NextResponse.json({ success: false, error: 'Gagal menyimpan transaksi' }, { status: 500 });
    }
}
