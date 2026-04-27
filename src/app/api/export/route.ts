import { NextResponse } from 'next/server';
import { getTransactionsByDate, getSetting, getTransactionsRange } from '@/lib/db';
import { appendTransactionsToSheet } from '@/lib/google-sheets';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { tanggal, start, end } = body;

        const spreadsheetId = await getSetting('spreadsheet_id');
        if (!spreadsheetId) {
            return NextResponse.json({
                success: false,
                error: 'Spreadsheet ID belum dikonfigurasi di Pengaturan'
            }, { status: 400 });
        }

        let transactions;
        if (start && end) {
            transactions = await getTransactionsRange(start, end);
        } else if (tanggal) {
            transactions = await getTransactionsByDate(tanggal);
        } else {
            return NextResponse.json({ success: false, error: 'Tanggal or Start/End is required' }, { status: 400 });
        }

        if (transactions.length === 0) {
            return NextResponse.json({ success: false, error: 'Tidak ada transaksi pada periode ini' }, { status: 400 });
        }

        await appendTransactionsToSheet(spreadsheetId, transactions);

        return NextResponse.json({ success: true, message: 'Laporan berhasil diexport ke Google Sheets' });
    } catch (error: any) {
        console.error('Export error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
