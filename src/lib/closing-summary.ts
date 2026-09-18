export interface ClosingTransaction {
    tanggal: string;
    total: number | string;
    metode_bayar?: string | null;
}

export function summarizeClosing(transactions: ClosingTransaction[], date: string) {
    const summary = { cash: 0, qris: 0, other: 0, cashCount: 0, qrisCount: 0, otherCount: 0, count: 0, total: 0 };
    for (const transaction of transactions) {
        if (transaction.tanggal !== date) continue;
        const total = Number(transaction.total);
        if (!Number.isFinite(total) || total < 0) throw new Error('Nominal transaksi tidak valid.');
        const method = (transaction.metode_bayar || 'tunai').trim().toLowerCase();
        if (method === 'tunai' || method === 'cash') {
            summary.cash += total;
            summary.cashCount++;
        } else if (method === 'qris') {
            summary.qris += total;
            summary.qrisCount++;
        } else {
            summary.other += total;
            summary.otherCount++;
        }
        summary.count++;
        summary.total += total;
    }
    return summary;
}
