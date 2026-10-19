import { NextRequest, NextResponse } from 'next/server';
import { getTransactionsByDate } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const tanggal = request.nextUrl.searchParams.get('tanggal') || new Date().toISOString().split('T')[0];
    const rows = await getTransactionsByDate(tanggal);

    let cash = 0;
    let qris = 0;
    for (const row of rows as any[]) {
      const amount = Number(row.total || 0);
      if (String(row.metode_bayar || 'tunai').toLowerCase() === 'qris') qris += amount;
      else cash += amount;
    }

    return NextResponse.json({
      success: true,
      data: {
        tanggal,
        cash,
        qris,
        total: cash + qris,
        total_transaksi: rows.length,
      },
    });
  } catch (error) {
    console.error('Failed to build payment summary:', error);
    return NextResponse.json({ success: false, error: 'Gagal mengambil ringkasan pembayaran' }, { status: 500 });
  }
}
