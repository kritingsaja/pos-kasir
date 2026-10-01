'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, LoaderCircle } from 'lucide-react';
import QrisPaymentPanel from './QrisPaymentPanel';
import BcaMutasiPanel from './BcaMutasiPanel';
import type { BcaVerification, QrisPaymentIntent } from '@/lib/bca-payment';
import { formatRupiah } from '@/lib/utils';

interface Props {
    staticPayload: string;
    amount: number;
    total: number;
    intent: QrisPaymentIntent | null;
    ready: boolean;
    busy: boolean;
    saving: boolean;
    cashReceived: number | null;
    onCashChange: (value: number | null) => void;
    onReady: (ready: boolean) => void;
    onVerified: (verification: BcaVerification) => void;
    onBusyChange: (busy: boolean) => void;
    onBack: () => void;
    onSave: () => void;
}

export default function QrisCheckoutScreen(props: Props) {
    const { staticPayload, amount, total, intent, ready, busy, saving, cashReceived,
        onCashChange, onReady, onVerified, onBusyChange, onBack, onSave } = props;
    const [viewport, setViewport] = useState<CSSProperties>({});
    const backButton = useRef<HTMLButtonElement>(null);
    const content = useRef<HTMLDivElement>(null);
    const remaining = Math.max(0, total - amount);
    const locked = busy || saving || Boolean(intent?.verification);

    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        backButton.current?.focus({ preventScroll: true });
        const vv = window.visualViewport;
        const update = () => {
            const height = vv?.height || window.innerHeight;
            setViewport({ height, top: vv?.offsetTop || 0, '--qris-screen-height': height + 'px' } as CSSProperties);
        };
        update();
        const contentSize = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry?.target instanceof HTMLElement) {
                entry.target.style.setProperty('--qris-content-height', entry.contentRect.height + 'px');
            }
        });
        if (content.current) contentSize.observe(content.current);
        vv?.addEventListener('resize', update);
        vv?.addEventListener('scroll', update);
        window.addEventListener('resize', update);
        return () => {
            document.body.style.overflow = previousOverflow;
            contentSize.disconnect();
            vv?.removeEventListener('resize', update);
            vv?.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
            previousFocus?.focus({ preventScroll: true });
        };
    }, []);

    return createPortal(
        <section className={'qris-checkout-screen' + (typeof viewport.height === 'number' && viewport.height <= 520 ? ' qris-checkout-screen--short' : '')} style={viewport} aria-label="Pembayaran QRIS">
            <header className="qris-screen-header">
                <button ref={backButton} type="button" className="qris-screen-back" aria-label="Kembali ke pembayaran"
                    title="Kembali ke pembayaran" disabled={locked} onClick={onBack}>
                    <ArrowLeft size={20} aria-hidden="true" />
                </button>
                <h2>Pembayaran QRIS</h2>
                {remaining > 0 && <span>Tagihan {formatRupiah(total)}</span>}
            </header>
            <div ref={content} className={remaining > 0 ? 'qris-screen-content qris-screen-content--split' : 'qris-screen-content'}>
                <QrisPaymentPanel compact staticPayload={staticPayload} amount={amount} onReady={onReady} />
                {remaining > 0 && <div className="qris-screen-cash">
                    <label htmlFor="qris-screen-cash">Sisa tunai <strong>{formatRupiah(remaining)}</strong></label>
                    <input id="qris-screen-cash" type="number" min={0} inputMode="numeric"
                        disabled={saving || busy} value={cashReceived ?? ''} placeholder="Uang diterima"
                        onChange={event => onCashChange(event.target.value === '' ? null : Math.max(0, Number.parseInt(event.target.value, 10) || 0))} />
                    <span>Kembalian <strong>{formatRupiah(Math.max(0, (cashReceived ?? 0) - remaining))}</strong></span>
                </div>}
            </div>
            <footer className="qris-screen-footer">
                {intent ? <BcaMutasiPanel key={intent.checkoutId} compact intent={intent} ready={ready} disabled={saving}
                    remainingCash={remaining} cashReceived={cashReceived ?? 0}
                    onVerified={onVerified} onBusyChange={onBusyChange} onManualConfirm={onSave} /> :
                    <button type="button" className="btn btn-primary" disabled>Menyiapkan pembayaran...</button>}
                {intent?.verification && <button type="button" className="btn btn-success qris-save-button"
                    disabled={saving || busy || (cashReceived ?? 0) < remaining} onClick={onSave}>
                    {saving ? <LoaderCircle size={18} className="bca-loading-icon" aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
                    {saving ? 'Menyimpan pembayaran...' : 'Simpan Pembayaran'}
                </button>}
            </footer>
        </section>,
        document.body,
    );
}
