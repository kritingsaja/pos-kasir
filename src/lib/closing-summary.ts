export interface ClosingTransaction {
    tanggal: string;
    total: number | string;
    metode_bayar?: string | null;
    rincian_bayar?: string | null;
}

export function summarizeClosing(transactions: ClosingTransaction[], date: string) {
    const summary = { cash: 0, qris: 0, other: 0, cashCount: 0, qrisCount: 0, otherCount: 0, count: 0, total: 0 };
    for (const transaction of transactions) {
        if (transaction.tanggal !== date) continue;
        const total = Number(transaction.total);
        if (!Number.isFinite(total) || total < 0) throw new Error('Nominal transaksi tidak valid.');
        let breakdown: Record<string, unknown> | null = null;
        if (transaction.rincian_bayar) {
            try {
                const parsed: unknown = JSON.parse(transaction.rincian_bayar);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) breakdown = parsed as Record<string, unknown>;
            } catch { /* Older rows and malformed legacy data fall back to their saved method. */ }
        }
        if (breakdown) {
            const cash = Number(breakdown.tunai || 0);
            const qris = Number(breakdown.qris || 0);
            const other = Number(breakdown.lainnya || 0);
            if ([cash, qris, other].some(value => !Number.isFinite(value) || value < 0)) throw new Error('Rincian pembayaran tidak valid.');
            if (cash + qris + other !== total) throw new Error('Rincian pembayaran tidak sama dengan total transaksi.');
            summary.cash += cash;
            summary.qris += qris;
            summary.other += other;
            if (cash > 0) summary.cashCount++;
            if (qris > 0) summary.qrisCount++;
            if (other > 0) summary.otherCount++;
        } else {
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
        }
        summary.count++;
        summary.total += total;
    }
    return summary;
}
