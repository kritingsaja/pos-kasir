'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, LoaderCircle, RefreshCw } from 'lucide-react';
import type { BcaVerification, QrisPaymentIntent } from '@/lib/bca-payment';
import { formatRupiah } from '@/lib/utils';

interface BankRow { rrn: string; amount: number; date?: string }
interface CheckResult {
    success: boolean;
    matched?: boolean;
    ambiguous?: boolean;
    data?: BankRow[] | BankRow;
    candidates?: BankRow[];
    transactions?: BankRow[];
    checkedAt?: string;
    message?: string;
    error?: string;
}

interface Props {
    intent: QrisPaymentIntent;
    ready: boolean;
    remainingCash: number;
    cashReceived: number;
    onVerified: (verification: BcaVerification) => void;
    onBusyChange: (busy: boolean) => void;
}

export default function BcaMutasiPanel({ intent, ready, remainingCash, cashReceived, onVerified, onBusyChange }: Props) {
    const [configured, setConfigured] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(false);
    const [rows, setRows] = useState<BankRow[]>([]);
    const [candidates, setCandidates] = useState<BankRow[]>([]);
    const [message, setMessage] = useState('');
    const [checkedAt, setCheckedAt] = useState('');
    const pending = useRef<AbortController | null>(null);
    const mounted = useRef(false);

    useEffect(() => {
        mounted.current = true;
        const controller = new AbortController();
        void fetch('/api/cek-mutasi-bca', { cache: 'no-store', signal: controller.signal })
            .then(async response => {
                const result = await response.json();
                if (mounted.current && !controller.signal.aborted) {
                    setConfigured(response.ok && result.success && result.configured === true);
                }
            }).catch(() => {
                if (mounted.current && !controller.signal.aborted) setConfigured(false);
            });
        return () => {
            mounted.current = false;
            controller.abort();
            pending.current?.abort();
            onBusyChange(false);
        };
    }, [onBusyChange]);

    async function check(mode: 'list' | 'match', rrn?: string) {
        if (pending.current || !configured || (mode === 'match' && intent.verification)) return;
        const controller = new AbortController();
        pending.current = controller;
        const timer = setTimeout(() => controller.abort(), 125_000);
        setBusy(true);
        onBusyChange(true);
        setMessage('');
        try {
            const response = await fetch('/api/cek-mutasi-bca', {
                method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mode === 'list' ? { mode } : {
                    checkoutId: intent.checkoutId, amount: intent.amount, timestamp: intent.timestamp,
                    ...(rrn ? { rrn } : {}),
                }),
            });
            const result: CheckResult = await response.json();
            if (!mounted.current || controller.signal.aborted) return;
            if (!response.ok || !result.success) throw new Error(result.error || 'Pengecekan BCA gagal.');
            setCheckedAt(result.checkedAt ?? '');
            if (mode === 'list') {
                const list = Array.isArray(result.data) ? result.data : [];
                setRows(list);
                setMessage(list.length ? '' : 'Belum ada mutasi hari ini.');
                return;
            }
            setCandidates(result.candidates ?? []);
            if (result.transactions) setRows(result.transactions);
            if (result.matched && result.data && !Array.isArray(result.data) && result.checkedAt) {
                onVerified({ checkoutId: intent.checkoutId, timestamp: intent.timestamp,
                    amount: intent.amount, rrn: result.data.rrn, checkedAt: result.checkedAt });
                setRows(current => current.length ? current : [result.data as BankRow]);
                setCandidates([]);
                setMessage('Pembayaran QRIS ditemukan.');
            } else {
                setMessage(result.message ?? 'Pembayaran belum ditemukan.');
            }
        } catch (error) {
            if (mounted.current) setMessage(error instanceof Error && error.name !== 'AbortError'
                ? error.message : 'Pengecekan berhenti. Tekan cek lagi untuk pesanan ini.');
        } finally {
            clearTimeout(timer);
            if (pending.current === controller) pending.current = null;
            if (mounted.current) { setBusy(false); onBusyChange(false); }
        }
    }

    const paid = Boolean(intent.verification) && cashReceived >= remainingCash;
    return (
        <section className="bca-mutasi-panel" aria-label="Mutasi BCA" aria-busy={busy}>
            <div className="bca-mutasi-heading">
                <strong>Mutasi BCA</strong>
                <button type="button" className="btn btn-secondary btn-sm" disabled={!configured || busy} onClick={() => void check('list')}>
                    <RefreshCw size={14} aria-hidden="true" /> Muat
                </button>
            </div>
            {intent.verification && <div className="bca-payment-confirmed"><CheckCircle2 size={16} aria-hidden="true" />
                <span>{paid ? 'LUNAS' : 'QRIS diterima · menunggu tunai'}</span>
            </div>}
            <div className="bca-mutasi-table-wrap">
                <table className="bca-mutasi-table">
                    <thead><tr><th scope="col">RRN</th><th scope="col">Jumlah</th></tr></thead>
                    <tbody>{rows.map(row => <tr key={`${row.date ?? ''}:${row.rrn}`}><td>{row.rrn}</td><td>{formatRupiah(row.amount)}</td></tr>)}</tbody>
                </table>
                {!rows.length && <p className="bca-mutasi-empty">Tekan Muat untuk melihat transaksi terbaru.</p>}
            </div>
            {candidates.length > 1 && <div className="bca-mutasi-candidates">
                <p>Pilih RRN sesuai bukti pembayaran pelanggan:</p>
                {candidates.map(row => <button type="button" className="btn btn-secondary" disabled={busy}
                    key={`${row.date}:${row.rrn}`} onClick={() => void check('match', row.rrn)}>
                    {row.rrn} · {formatRupiah(row.amount)}
                </button>)}
            </div>}
            <button type="button" className="btn btn-primary bca-check-button" disabled={!configured || busy || !ready || !!intent.verification}
                onClick={() => void check('match')}>
                {busy && <LoaderCircle size={16} className="bca-loading-icon" aria-hidden="true" />}
                {busy ? 'Sedang mengecek…' : intent.verification ? 'QRIS sudah terverifikasi' : 'Cek Pembayaran QRIS'}
            </button>
            <p className="bca-mutasi-message" role="status" aria-live="polite">
                {message || (configured === false ? 'Pengecekan BCA belum tersedia. Periksa pembayaran secara manual.' : '')}
            </p>
            {checkedAt && <small>Diperbarui {new Date(checkedAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</small>}
        </section>
    );
}
