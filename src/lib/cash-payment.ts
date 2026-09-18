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
