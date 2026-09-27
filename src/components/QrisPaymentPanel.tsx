'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ScanLine, ShieldCheck } from 'lucide-react';
import { convertStaticQrisToDynamic } from '@/lib/qris';
import { formatRupiah } from '@/lib/utils';

interface QrisPaymentPanelProps {
    staticPayload: string;
    amount: number;
    onReady: (ready: boolean) => void;
}

export default function QrisPaymentPanel({ staticPayload, amount, onReady }: QrisPaymentPanelProps) {
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
            void import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 3, width: 640 }))
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
            <div className="qris-card-heading">
                <span className="qris-wordmark">QRIS</span>
                <span className="qris-card-badge"><ScanLine size={14} aria-hidden="true" /> Scan & bayar</span>
            </div>
            <p className="qris-card-title">Scan untuk membayar</p>
            <p className="qris-card-subtitle">Gunakan aplikasi bank atau dompet digital.</p>
            <div className="qris-image-wrap" aria-busy={!error && !qrImage}>
                {error ? <p className="qris-error" role="alert">{error}</p> : qrImage ? (
                    <Image src={qrImage} alt={`QRIS pembayaran ${formatRupiah(amount)}`} width={640} height={640} unoptimized />
                ) : <div className="qris-loading" role="status"><ScanLine size={36} aria-hidden="true" /><span>Membuat QRIS…</span></div>}
            </div>
            <div className="qris-scan-amount">
                <span>Nominal yang dipindai</span>
                <strong>{formatRupiah(amount)}</strong>
            </div>
            <div className="qris-verification-note">
                <ShieldCheck size={18} aria-hidden="true" />
                <p>Tekan Cek Pembayaran QRIS di kasir, atau periksa BCA untuk konfirmasi manual.</p>
            </div>
        </section>
    );
}
