'use client';

import { useEffect, useRef, useState } from 'react';
import { formatRupiah, getTodayDate } from '@/lib/utils';
import { summarizeClosing } from '@/lib/closing-summary';

interface ClosingSummaryProps {
    isOnline: boolean;
    pendingCount: number;
    onClose: () => void;
}

export default function ClosingSummary({ isOnline, pendingCount, onClose }: ClosingSummaryProps) {
    const [result, setResult] = useState<{ date: string; summary: ReturnType<typeof summarizeClosing> } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [refresh, setRefresh] = useState(0);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null;
        const panel = panelRef.current;
        panel?.focus();
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
            if (event.key !== 'Tab' || !panel) return;
            const controls = panel.querySelectorAll<HTMLElement>('button:not(:disabled)');
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
                event.preventDefault();
                first?.focus();
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('keydown', handleKey);
            previousFocus?.focus();
        };
    }, [onClose]);

    useEffect(() => {
        const controller = new AbortController();
        async function loadSummary() {
            setLoading(true);
            setError('');
            setResult(null);
            try {
                if (!isOnline) throw new Error('Tidak ada koneksi. Ringkasan hari ini belum dapat diambil.');
                const date = getTodayDate();
                const response = await fetch(`/api/transactions?tanggal=${date}`, {
                    cache: 'no-store', signal: controller.signal,
                });
                const data = await response.json();
                if (!response.ok || !data.success || !Array.isArray(data.data)) {
                    throw new Error(data.error || 'Gagal mengambil ringkasan hari ini.');
                }
                const summary = summarizeClosing(data.data, date);
                if (!controller.signal.aborted) setResult({ date, summary });
            } catch (cause) {
                if (!controller.signal.aborted) {
                    setError(cause instanceof Error ? cause.message : 'Gagal mengambil ringkasan hari ini.');
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        void loadSummary();
        return () => controller.abort();
    }, [isOnline, pendingCount, refresh]);

    const date = result?.date || getTodayDate();
    const summary = result?.summary;

    return (
        <div className="laporan-overlay" onClick={onClose}>
            <div className="laporan-drawer closing-drawer" role="dialog" aria-modal="true"
                aria-labelledby="closing-title" ref={panelRef} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
                <div className="laporan-drawer-header">
                    <div>
                        <h2 id="closing-title">Closing Kasir</h2>
                        <p className="closing-date">{new Date(`${date}T12:00:00`).toLocaleDateString('id-ID', {
                            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                        })}</p>
                    </div>
                    <button type="button" className="modal-close" aria-label="Tutup closing" title="Tutup" onClick={onClose}>&times;</button>
                </div>
                <div className="closing-body" aria-live="polite" aria-busy={loading}>
                    {loading ? <p role="status">Memuat ringkasan...</p> : error ? (
                        <p className="closing-notice" role="alert">{error}</p>
                    ) : summary ? (
                        <>
                            {pendingCount > 0 && <p className="closing-notice" role="status">
                                {pendingCount} transaksi offline belum tersinkron. Ringkasan belum termasuk transaksi tersebut.
                            </p>}
                            <dl className="closing-totals">
                                <div><dt>Cash<small>{summary.cashCount} transaksi</small></dt><dd className="closing-cash">{formatRupiah(summary.cash)}</dd></div>
                                <div><dt>QRIS<small>{summary.qrisCount} transaksi</small></dt><dd className="closing-qris">{formatRupiah(summary.qris)}</dd></div>
                                {summary.otherCount > 0 && <div><dt>Metode Lain<small>{summary.otherCount} transaksi</small></dt><dd>{formatRupiah(summary.other)}</dd></div>}
                                <div className="closing-grand-total"><dt>Total Penjualan</dt><dd>{formatRupiah(summary.total)}</dd></div>
                                <div><dt>Total Transaksi</dt><dd>{summary.count}</dd></div>
                            </dl>
                            {summary.count === 0 && <p className="closing-empty">Belum ada transaksi hari ini.</p>}
                        </>
                    ) : null}
                </div>
                <div className="laporan-drawer-footer closing-footer">
                    <button type="button" className="btn btn-secondary" disabled={loading}
                        onClick={() => setRefresh((value) => value + 1)}><span aria-hidden="true">&#8635;</span> Muat Ulang</button>
                    <button type="button" className="btn btn-primary" onClick={onClose}>Tutup</button>
                </div>
            </div>
        </div>
    );
}
