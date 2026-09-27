'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { convertStaticQrisToDynamic, QRIS_MAX_TRANSACTION_AMOUNT } from '@/lib/qris';
import { formatRupiah } from '@/lib/utils';

interface QrisPaymentPanelProps {
    staticPayload: string;
    amount: number;
    total: number;
    remaining: number;
    onReady: (ready: boolean) => void;
    onAmountChange: (amount: number) => void;
}

export default function QrisPaymentPanel({ staticPayload, amount, total, remaining, onReady, onAmountChange }: QrisPaymentPanelProps) {
    const [qrImage, setQrImage] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        setQrImage('');
        setError('');
        onReady(false);
        if (!Number.isSafeInteger(amount) || amount < 1) {
            setError('Masukkan nominal QRIS lebih dari Rp0.');
            return () => { active = false; };
        }

        try {
            const payload = convertStaticQrisToDynamic(staticPayload, amount);
            void import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 280 }))
                .then((dataUrl) => { if (active) { setQrImage(dataUrl); onReady(true); } })
                .catch(() => { if (active) { setError('QR tidak dapat dibuat. Periksa data QRIS di Pengaturan.'); onReady(false); } });
        } catch (conversionError) {
            setError(conversionError instanceof Error ? conversionError.message : 'Format QRIS tidak valid.');
            onReady(false);
        }

        return () => { active = false; };
    }, [staticPayload, amount, onReady]);

    return (
        <section className="qris-panel" aria-label="Pembayaran QRIS">
            <div className="input-group">
                <label htmlFor="qris-amount">Nominal QRIS</label>
                <input
                    id="qris-amount"
                    type="number"
                    min={1}
                    max={Math.min(total, QRIS_MAX_TRANSACTION_AMOUNT)}
                    step={1}
                    value={amount || ''}
                    onChange={(event) => onAmountChange(Math.max(0, Number.parseInt(event.target.value, 10) || 0))}
                    inputMode="numeric"
                />
                <small>Isi penuh atau sebagian. Maksimal QRIS {formatRupiah(Math.min(total, QRIS_MAX_TRANSACTION_AMOUNT))} per transaksi.</small>
            </div>

            {remaining > 0 && (
                <div className="qris-remainder">
                    Sisa dibayar tunai <strong>{formatRupiah(remaining)}</strong>
                </div>
            )}

            {error ? <p className="qris-error" role="alert">{error}</p> : qrImage ? (
                <div className="qris-image-wrap">
                    <Image src={qrImage} alt={`QRIS pembayaran ${formatRupiah(amount)}`} width={280} height={280} unoptimized />
                    <strong>{formatRupiah(amount)}</strong>
                    <small>Periksa pembayaran di aplikasi BCA sebelum menekan tombol konfirmasi.</small>
                </div>
            ) : <p className="qris-loading">Membuat QRIS…</p>}
        </section>
    );
}
