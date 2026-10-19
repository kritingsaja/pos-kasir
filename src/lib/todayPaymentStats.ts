import { getTransactionsByDate } from '@/lib/db';

export async function getTodayPaymentStats() {
  const today = new Date().toISOString().split('T')[0];
  const rows = await getTransactionsByDate(today);
  let cash = 0;
  let qris = 0;

  for (const row of rows as any[]) {
    const amount = Number(row.total || 0);
    if (String(row.metode_bayar || 'tunai').toLowerCase() === 'qris') qris += amount;
    else cash += amount;
  }

  return { cash, qris, total: cash + qris, count: rows.length };
}
