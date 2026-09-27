export interface BcaVerification {
    checkoutId: string;
    timestamp: string;
    rrn: string;
    amount: number;
    checkedAt: string;
}

export interface QrisPaymentIntent {
    fingerprint: string;
    checkoutId: string;
    timestamp: string;
    amount: number;
    verification?: BcaVerification;
}
