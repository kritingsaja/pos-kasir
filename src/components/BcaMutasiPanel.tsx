'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
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
    code?: string;
    stage?: string;
    requestId?: string;
}

interface ConfigurationResult {
    success: boolean;
    configured?: boolean;
    message?: string;
    error?: string;
}

async function readResponse<T>(response: Response): Promise<T> {
    if (response.status === 401) throw new Error('Sesi kasir berakhir. Login kembali, lalu coba lagi.');
    if (response.status === 403) throw new Error('Akses preview atau kasir ditolak. Login kembali ke akun yang sesuai.');
    if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Respons server tidak dapat dibaca. Muat ulang preview dan login kembali.');
    }
    return response.json() as Promise<T>;
}

async function readConfiguration(controller: AbortController): Promise<ConfigurationResult> {
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
        const response = await fetch(`/api/cek-mutasi-bca?status=${Date.now()}`, {
            cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
        });
        const result = await readResponse<ConfigurationResult>(response);
        if (!response.ok || !result.success) throw new Error(result.error || 'Konfigurasi pengecekan BCA tidak dapat dibaca.');
        return result;
    } finally { clearTimeout(timer); }
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
    const [configurationMessage, setConfigurationMessage] = useState('Menyiapkan pengecekan BCA…');
    const [phase, setPhase] = useState('');
    const [busy, setBusy] = useState(false);
    const [rows, setRows] = useState<BankRow[]>([]);
    const [candidates, setCandidates] = useState<BankRow[]>([]);
    const [message, setMessage] = useState('');
    const [diagnostic, setDiagnostic] = useState('');
    const [checkedAt, setCheckedAt] = useState('');
    const pending = useRef<AbortController | null>(null);
    const mounted = useRef(false);

    useEffect(() => {
        mounted.current = true;
        let active = true;
        const controller = new AbortController();
        void readConfiguration(controller)
            .then(result => {
                if (active && mounted.current && !controller.signal.aborted) {
                    setConfigured(result.configured === true);
                    setConfigurationMessage(result.configured ? '' : result.message || 'Pengecekan BCA belum diaktifkan untuk aplikasi ini.');
                }
            }).catch((error: unknown) => {
                if (active && mounted.current) {
                    setConfigured(false);
                    setConfigurationMessage(error instanceof Error && error.name !== 'AbortError'
                        ? error.message : 'Status BCA belum dapat dibaca. Tekan Muat untuk mencoba lagi.');
                }
            });
        return () => {
            active = false;
            mounted.current = false;
            controller.abort();
            pending.current?.abort();
            onBusyChange(false);
        };
    }, [onBusyChange]);

    async function check(mode: 'list' | 'match', rrn?: string) {
        if (pending.current) return;
        if (mode === 'match' && intent.verification) { setMessage('Pembayaran QRIS sudah terverifikasi.'); return; }
        if (mode === 'match' && !ready) { setMessage('Tunggu sampai QRIS selesai dibuat.'); return; }
        const controller = new AbortController();
        pending.current = controller;
        const timer = setTimeout(() => controller.abort(), 125_000);
        setBusy(true);
        onBusyChange(true);
        setMessage('');
        setDiagnostic('');
        setCandidates([]);
        setRows([]);
        setCheckedAt('');
        try {
            setPhase('Memeriksa koneksi…');
            const configuration = await readConfiguration(controller);
            if (!mounted.current) return;
            if (controller.signal.aborted) throw new Error('Pengecekan koneksi melewati batas waktu. Coba lagi.');
            setConfigured(configuration.configured === true);
            setConfigurationMessage(configuration.configured ? '' : configuration.message || 'Pengecekan BCA belum diaktifkan untuk aplikasi ini.');
            if (!configuration.configured) throw new Error(configuration.message || 'Pengecekan BCA belum diaktifkan untuk aplikasi ini.');
            setPhase('Memuat dan mencocokkan mutasi BCA…');
            const response = await fetch('/api/cek-mutasi-bca', {
                method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mode === 'list' ? { mode } : {
                    checkoutId: intent.checkoutId, amount: intent.amount, timestamp: intent.timestamp,
                    ...(rrn ? { rrn } : {}),
                }),
            });
            const result = await readResponse<CheckResult>(response);
            if (!mounted.current) return;
            if (controller.signal.aborted) throw new Error('Portal BCA belum merespons dalam batas waktu. Coba lagi.');
            if (!response.ok || !result.success) {
                setDiagnostic([result.code, result.stage, result.requestId].filter(Boolean).join(' · '));
                throw new Error(result.error || 'Pengecekan BCA gagal.');
            }
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
                ? error.message : 'Pengecekan belum selesai. Periksa koneksi, lalu tekan cek lagi untuk pesanan ini.');
        } finally {
            clearTimeout(timer);
            if (pending.current === controller) pending.current = null;
            if (mounted.current) { setBusy(false); setPhase(''); onBusyChange(false); }
        }
    }

    const paid = Boolean(intent.verification) && cashReceived >= remainingCash;
    return (
        <section className="bca-mutasi-panel" aria-label="Mutasi BCA" aria-busy={busy}>
            <div className="bca-mutasi-heading">
                <strong>Mutasi BCA</strong>
            </div>
            {intent.verification && <div className="bca-payment-confirmed"><CheckCircle2 size={16} aria-hidden="true" />
                <span>{paid ? 'LUNAS' : 'QRIS diterima · menunggu tunai'}</span>
            </div>}
            <div className="bca-mutasi-table-wrap">
                <table className="bca-mutasi-table">
                    <thead><tr><th scope="col">RRN</th><th scope="col">Jumlah</th></tr></thead>
                    <tbody>{rows.map(row => <tr key={`${row.date ?? ''}:${row.rrn}`}><td>{row.rrn}</td><td>{formatRupiah(row.amount)}</td></tr>)}</tbody>
                </table>
                {!rows.length && <p className="bca-mutasi-empty">Tekan Muat untuk memuat dan mencocokkan transaksi terbaru.</p>}
            </div>
            {candidates.length > 1 && <div className="bca-mutasi-candidates">
                <p>Pilih RRN sesuai bukti pembayaran pelanggan:</p>
                {candidates.map(row => <button type="button" className="btn btn-secondary" disabled={busy}
                    key={`${row.date}:${row.rrn}`} onClick={() => void check('match', row.rrn)}>
                    {row.rrn} · {formatRupiah(row.amount)}
                </button>)}
            </div>}
            <button type="button" className="btn btn-primary bca-check-button" disabled={busy || !!intent.verification}
                onClick={() => void check('match')}>
                {busy && <LoaderCircle size={16} className="bca-loading-icon" aria-hidden="true" />}
                {busy ? phase || 'Sedang mengecek…' : intent.verification ? 'QRIS sudah terverifikasi' : 'Cek Pembayaran'}
            </button>
            <p className="bca-mutasi-message" role="status" aria-live="polite">
                {busy ? phase : message || (configured !== true ? configurationMessage : '')}
            </p>
            {diagnostic && <details><summary>Detail error</summary><small style={{ overflowWrap: 'anywhere' }}>{diagnostic}</small></details>}
            {checkedAt && <small>Diperbarui {new Date(checkedAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</small>}
        </section>
    );
}
