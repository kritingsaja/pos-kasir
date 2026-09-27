export function getCashReceived(total: number, amount: number | null): number {
    return amount ?? total;
}

export function getQuickCashAmounts(total: number): number[] {
    const first = total < 20000 ? 20000 : (Math.floor(total / 5000) + 1) * 5000;
    const roundedTenThousand = (Math.floor(total / 10000) + 1) * 10000;
    const second = roundedTenThousand > first
        ? roundedTenThousand
        : (Math.floor(first / 50000) + 1) * 50000;
    const third = (Math.floor(second / 100000) + 1) * 100000;
    return [first, second, third];
}

export function getPaymentMethodLabel(method: string | null | undefined): string {
    const normalized = (method || 'tunai').trim().toLowerCase();
    if (normalized === 'qris') return 'QRIS';
    if (normalized === 'campuran') return 'QRIS + Tunai';
    if (normalized === 'tunai' || normalized === 'cash') return 'Tunai';
    return method || 'Tunai';
}

export function formatPaymentBreakdown(value: string | null | undefined): string {
    if (!value) return '';
    try {
        const breakdown: unknown = JSON.parse(value);
        if (!breakdown || typeof breakdown !== 'object' || Array.isArray(breakdown)) return '';
        const entries = Object.entries(breakdown as Record<string, unknown>)
            .filter(([, amount]) => Number(amount) > 0)
            .map(([method, amount]) => `${getPaymentMethodLabel(method)} ${new Intl.NumberFormat('id-ID').format(Number(amount))}`);
        return entries.join(' · ');
    } catch {
        return '';
    }
}
