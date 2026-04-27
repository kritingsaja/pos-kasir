'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Transaction, formatRupiah, formatDate, CartItem } from '@/lib/utils';

/* ── Month names in Indonesian ── */
const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

export default function LaporanPage() {
    const today = new Date().toISOString().split('T')[0];

    const [reportPeriod, setReportPeriod] = useState<'harian' | 'bulanan' | 'tahunan'>('harian');
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
    const [selectedDayData, setSelectedDayData] = useState<{ date: string; formattedDate: string; transactions: Transaction[] } | null>(null);

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [reportView, setReportView] = useState<'transactions' | 'products' | 'categories'>('transactions');
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [expandedTrx, setExpandedTrx] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string>('');
    const [toast, setToast] = useState<{ message: string; type: string } | null>(null);

    const effectiveDates = useMemo(() => {
        if (reportPeriod === 'tahunan') {
            return { start: `${selectedYear}-01-01`, end: `${selectedYear}-12-31` };
        }
        if (reportPeriod === 'bulanan') {
            const [y, m] = selectedMonth.split('-');
            if (y && m) {
                const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
                return { start: `${y}-${m}-01`, end: `${y}-${m}-${lastDay.toString().padStart(2, '0')}` };
            }
        }
        return { start: startDate, end: endDate };
    }, [reportPeriod, selectedYear, selectedMonth, startDate, endDate]);

    useEffect(() => { fetchProducts(); fetchUser(); }, []);
    useEffect(() => { fetchTransactions(effectiveDates.start, effectiveDates.end); }, [effectiveDates.start, effectiveDates.end]);

    async function fetchProducts() {
        try { const res = await fetch('/api/products'); const d = await res.json(); if (d.success) setProducts(d.data); } catch (e) { console.error(e); }
    }
    const fetchUser = async () => {
        try { const res = await fetch('/api/auth/me'); const d = await res.json(); if (d.success) setUserRole(d.user?.role || ''); } catch (e) { console.error(e); }
    };
    async function fetchTransactions(start: string, end: string) {
        setLoading(true);
        try { const res = await fetch(`/api/transactions?start=${start}&end=${end}`); const d = await res.json(); if (d.success && Array.isArray(d.data)) setTransactions(d.data); }
        catch (e) { console.error(e); } finally { setLoading(false); }
    }

    const annualSummary = useMemo(() => {
        if (reportPeriod !== 'tahunan') return [];
        const map: Record<string, { count: number; total: number }> = {};
        transactions.forEach(t => {
            const m = t.tanggal.split('-')[1];
            if (!map[m]) map[m] = { count: 0, total: 0 };
            map[m].count++;
            map[m].total += t.total || 0;
        });
        return Array.from({ length: 12 }, (_, i) => {
            const mm = (i + 1).toString().padStart(2, '0');
            return {
                mm,
                monthVal: `${selectedYear}-${mm}`,
                monthName: BULAN_ID[i],
                total: map[mm]?.total || 0,
                count: map[mm]?.count || 0,
            };
        });
    }, [transactions, reportPeriod, selectedYear]);

    const monthlySummary = useMemo(() => {
        if (reportPeriod !== 'bulanan') return [];
        const map: Record<string, { date: string; formattedDate: string; total: number; count: number; transactions: Transaction[] }> = {};
        transactions.forEach(t => {
            if (!map[t.tanggal]) map[t.tanggal] = { date: t.tanggal, formattedDate: formatDate(t.tanggal), total: 0, count: 0, transactions: [] };
            map[t.tanggal].total += t.total || 0;
            map[t.tanggal].count++;
            map[t.tanggal].transactions.push(t);
        });
        return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
    }, [transactions, reportPeriod]);

    const totalPenjualan = useMemo(() => transactions.reduce((s, t) => s + (t.total || 0), 0), [transactions]);
    const avgTransaction = transactions.length > 0 ? Math.round(totalPenjualan / transactions.length) : 0;

    const getCategory = (item: CartItem) => {
        if (item.kategori) return item.kategori;
        return products.find(p => p.kode_barang === item.kode_barang)?.kategori || 'Lain-lain';
    };

    const productSummary = useMemo(() => {
        const m: Record<string, { nama: string; qty: number; total: number; category: string }> = {};
        transactions.forEach(t => {
            try { (JSON.parse(t.items) as CartItem[]).forEach(item => {
                const k = item.kode_barang || item.nama_barang;
                if (!m[k]) m[k] = { nama: item.nama_barang, qty: 0, total: 0, category: getCategory(item) };
                m[k].qty += item.qty; m[k].total += item.subtotal;
            }); } catch {}
        });
        return Object.values(m).sort((a, b) => b.total - a.total);
    }, [transactions, products]);

    const categorySummary = useMemo(() => {
        const m: Record<string, { nama: string; total: number; qty: number }> = {};
        transactions.forEach(t => {
            try { (JSON.parse(t.items) as CartItem[]).forEach(item => {
                const c = getCategory(item);
                if (!m[c]) m[c] = { nama: c, total: 0, qty: 0 };
                m[c].qty += item.qty; m[c].total += item.subtotal;
            }); } catch {}
        });
        return Object.values(m).sort((a, b) => b.total - a.total);
    }, [transactions, products]);

    const categoryMax = categorySummary[0]?.total || 1;
    const productMax = productSummary[0]?.total || 1;
    const annualMax = Math.max(...annualSummary.map(m => m.total), 1);

    function parseItems(s: string) { try { return JSON.parse(s); } catch { return []; } }
    function showToast(msg: string, type = 'success') { setToast({ message: msg, type }); setTimeout(() => setToast(null), 3000); }

    async function handleDeleteTransaction(id: string) {
        if (!confirm('Hapus transaksi ini?')) return;
        try {
            const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
            if (res.ok) { showToast('Transaksi berhasil dihapus'); fetchTransactions(effectiveDates.start, effectiveDates.end); }
            else showToast('Gagal menghapus', 'error');
        } catch { showToast('Kesalahan jaringan', 'error'); }
    }

    async function handleExport() {
        if (!transactions.length) { showToast('Tidak ada transaksi', 'error'); return; }
        setExporting(true);
        try {
            const res = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start: effectiveDates.start, end: effectiveDates.end }) });
            const d = await res.json();
            if (d.success) showToast('Berhasil diexport ke Google Sheets!');
            else showToast('Gagal export: ' + d.error, 'error');
        } catch { showToast('Gagal export!', 'error'); }
        finally { setExporting(false); }
    }

    function openDayModal(d: { date: string; formattedDate: string; transactions: Transaction[] }) {
        setSelectedDayData(d); setExpandedTrx(null);
        (document.getElementById('modal_hari') as HTMLDialogElement)?.showModal();
    }

    /* ── Period label for header subtitle ── */
    const periodLabel = useMemo(() => {
        if (reportPeriod === 'tahunan') return `Tahun ${selectedYear}`;
        if (reportPeriod === 'bulanan') {
            const [y, m] = selectedMonth.split('-');
            return `${BULAN_ID[parseInt(m) - 1]} ${y}`;
        }
        if (startDate === endDate) return formatDate(startDate);
        return `${formatDate(startDate)} – ${formatDate(endDate)}`;
    }, [reportPeriod, selectedYear, selectedMonth, startDate, endDate]);

    /* ── Transaction Accordion Row ── */
    function TrxAccordion({ list, inModal = false }: { list: Transaction[]; inModal?: boolean }) {
        return (
            <div className="lp-trx-list">
                {list.map(t => {
                    const items = parseItems(t.items);
                    const isExp = expandedTrx === t.id;
                    const isTunai = t.metode_bayar === 'tunai';
                    return (
                        <div key={t.id} className={`lp-trx-card ${isExp ? 'expanded' : ''}`}>
                            <div
                                className="lp-trx-header"
                                onClick={() => setExpandedTrx(isExp ? null : t.id)}
                            >
                                <div className="lp-trx-left">
                                    <div className="lp-trx-avatar">
                                        {(t.nama_pelanggan || 'U')[0].toUpperCase()}
                                    </div>
                                    <div className="lp-trx-info">
                                        <div className="lp-trx-name">{t.nama_pelanggan || 'Umum'}</div>
                                        <div className="lp-trx-meta">
                                            <span>{t.waktu}</span>
                                            <span className="lp-dot">·</span>
                                            <span>{items.length} item</span>
                                            <span className="lp-dot">·</span>
                                            <span className={`lp-method-badge ${isTunai ? 'tunai' : 'transfer'}`}>
                                                {isTunai ? '💵' : '💳'} {t.metode_bayar}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="lp-trx-right">
                                    <div className="lp-trx-total">{formatRupiah(t.total)}</div>
                                    <div className="lp-trx-chevron">{isExp ? '▲' : '▼'}</div>
                                </div>
                            </div>
                            {isExp && (
                                <div className="lp-trx-detail">
                                    <div className="lp-trx-detail-label">Rincian Item</div>
                                    {items.map((item: any, i: number) => (
                                        <div key={i} className="lp-trx-item-row">
                                            <span className="lp-trx-item-name">
                                                <span className="lp-trx-qty">{item.qty}×</span> {item.nama_barang}
                                            </span>
                                            <span className="lp-trx-item-sub">{formatRupiah(item.subtotal)}</span>
                                        </div>
                                    ))}
                                    {!inModal && userRole.toLowerCase() === 'admin' && (
                                        <button
                                            className="lp-delete-btn"
                                            onClick={(e) => { e.stopPropagation(); handleDeleteTransaction(t.id); }}
                                        >
                                            🗑️ Hapus Transaksi
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    /* ══════════════════ RENDER ══════════════════ */
    return (
        <>
            {/* ── PAGE HEADER ── */}
            <div className="page-header">
                <h1>📊 Laporan Penjualan</h1>
                <p>{periodLabel}</p>
            </div>

            {/* ── PERIOD SELECTOR PILLS ── */}
            <div className="lp-period-tabs">
                {(['harian', 'bulanan', 'tahunan'] as const).map(p => (
                    <button
                        key={p}
                        className={`lp-period-pill ${reportPeriod === p ? 'active' : ''}`}
                        onClick={() => setReportPeriod(p)}
                    >
                        {p === 'harian' ? '📅 Harian' : p === 'bulanan' ? '🗓️ Bulanan' : '📆 Tahunan'}
                    </button>
                ))}
            </div>

            {/* ── DATE FILTER PANEL ── */}
            <div className="lp-filter-panel">
                {reportPeriod === 'harian' && (
                    <div className="lp-filter-row">
                        <div className="lp-filter-group">
                            <label className="lp-filter-label">Dari</label>
                            <input type="date" className="lp-filter-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        </div>
                        <div className="lp-filter-group">
                            <label className="lp-filter-label">Sampai</label>
                            <input type="date" className="lp-filter-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
                        </div>
                        <button className="lp-export-btn" onClick={handleExport} disabled={exporting || !transactions.length}>
                            {exporting ? <span className="lp-spinner" /> : '📤'} Export
                        </button>
                    </div>
                )}
                {reportPeriod === 'bulanan' && (
                    <div className="lp-filter-row">
                        <div className="lp-filter-group" style={{ flex: 1 }}>
                            <label className="lp-filter-label">Pilih Bulan</label>
                            <input type="month" className="lp-filter-input" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
                        </div>
                        <button className="lp-export-btn" onClick={handleExport} disabled={exporting || !transactions.length}>
                            {exporting ? <span className="lp-spinner" /> : '📤'} Export
                        </button>
                    </div>
                )}
                {reportPeriod === 'tahunan' && (
                    <div className="lp-filter-row">
                        <div className="lp-filter-group">
                            <label className="lp-filter-label">Tahun</label>
                            <input type="number" min="2000" max="2100" className="lp-filter-input" style={{ maxWidth: 120 }} value={selectedYear} onChange={e => setSelectedYear(e.target.value)} />
                        </div>
                        <button className="lp-export-btn" onClick={handleExport} disabled={exporting || !transactions.length}>
                            {exporting ? <span className="lp-spinner" /> : '📤'} Export
                        </button>
                    </div>
                )}
            </div>

            {/* ── SUMMARY STAT CARDS ── */}
            <div className="lp-stats-row">
                <div className="lp-stat-card green">
                    <div className="lp-stat-icon">💰</div>
                    <div className="lp-stat-body">
                        <div className="lp-stat-value">{formatRupiah(totalPenjualan)}</div>
                        <div className="lp-stat-label">Total Penjualan</div>
                    </div>
                </div>
                <div className="lp-stat-card blue">
                    <div className="lp-stat-icon">🧾</div>
                    <div className="lp-stat-body">
                        <div className="lp-stat-value">{transactions.length}</div>
                        <div className="lp-stat-label">Transaksi</div>
                    </div>
                </div>
                <div className="lp-stat-card amber">
                    <div className="lp-stat-icon">📈</div>
                    <div className="lp-stat-body">
                        <div className="lp-stat-value">{formatRupiah(avgTransaction)}</div>
                        <div className="lp-stat-label">Rata-rata/Trx</div>
                    </div>
                </div>
            </div>

            {/* ── VIEW TABS ── */}
            <div className="lp-view-tabs">
                {(['transactions', 'products', 'categories'] as const).map(v => (
                    <button
                        key={v}
                        onClick={() => setReportView(v)}
                        className={`lp-view-tab ${reportView === v ? 'active' : ''}`}
                    >
                        {v === 'transactions' ? '🧾 Transaksi' : v === 'products' ? '📦 Produk' : '🏷️ Kategori'}
                    </button>
                ))}
            </div>

            {/* ── CONTENT ── */}
            {loading ? (
                <div className="lp-loading">
                    <span className="lp-spinner large" />
                    <span>Memuat data...</span>
                </div>
            ) : (
                <div className="lp-content">

                    {/* ══ TRANSAKSI / TAHUNAN ══ */}
                    {reportView === 'transactions' && reportPeriod === 'tahunan' && (
                        <div className="lp-annual-grid">
                            {annualSummary.map(m => (
                                <div key={m.mm} className="lp-annual-card" onClick={() => { setSelectedMonth(m.monthVal); setReportPeriod('bulanan'); }}>
                                    <div className="lp-annual-card-top">
                                        <div>
                                            <div className="lp-annual-month">{m.monthName}</div>
                                            <div className="lp-annual-count">{m.count} transaksi</div>
                                        </div>
                                        <div className="lp-annual-arrow">›</div>
                                    </div>
                                    <div className="lp-annual-bar-wrap">
                                        <div
                                            className="lp-annual-bar"
                                            style={{ width: `${m.total > 0 ? Math.max(6, (m.total / annualMax) * 100) : 0}%` }}
                                        />
                                    </div>
                                    <div className="lp-annual-total">{formatRupiah(m.total)}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ══ TRANSAKSI / BULANAN (daily list) ══ */}
                    {reportView === 'transactions' && reportPeriod === 'bulanan' && (
                        monthlySummary.length === 0 ? (
                            <div className="lp-empty">
                                <div className="lp-empty-icon">📅</div>
                                <p>Tidak ada transaksi bulan ini</p>
                            </div>
                        ) : (
                            <div className="lp-daily-list">
                                {monthlySummary.map(d => (
                                    <div key={d.date} className="lp-daily-card" onClick={() => openDayModal(d)}>
                                        <div className="lp-daily-left">
                                            <div className="lp-daily-date-box">
                                                <span className="lp-daily-dd">{d.date.split('-')[2]}</span>
                                                <span className="lp-daily-mmm">{BULAN_ID[parseInt(d.date.split('-')[1]) - 1]?.slice(0, 3)}</span>
                                            </div>
                                            <div>
                                                <div className="lp-daily-title">{d.formattedDate}</div>
                                                <div className="lp-daily-count">{d.count} transaksi</div>
                                            </div>
                                        </div>
                                        <div className="lp-daily-right">
                                            <div className="lp-daily-total">{formatRupiah(d.total)}</div>
                                            <div className="lp-daily-chevron">›</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}

                    {/* ══ TRANSAKSI / HARIAN ══ */}
                    {reportView === 'transactions' && reportPeriod === 'harian' && (
                        transactions.length === 0 ? (
                            <div className="lp-empty">
                                <div className="lp-empty-icon">📋</div>
                                <p>Tidak ada transaksi pada periode ini</p>
                            </div>
                        ) : (
                            <TrxAccordion list={transactions} />
                        )
                    )}

                    {/* ══ PRODUK ══ */}
                    {reportView === 'products' && (
                        productSummary.length === 0 ? (
                            <div className="lp-empty">
                                <div className="lp-empty-icon">📦</div>
                                <p>Tidak ada data produk</p>
                            </div>
                        ) : (
                            <div className="lp-rank-list">
                                {productSummary.map((p, i) => (
                                    <div key={i} className="lp-rank-card">
                                        <div className={`lp-rank-num ${i < 3 ? 'top' : ''}`}>
                                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                                        </div>
                                        <div className="lp-rank-info">
                                            <div className="lp-rank-name">{p.nama}</div>
                                            <div className="lp-rank-sub">
                                                <span className="lp-category-badge">{p.category}</span>
                                                <span>{p.qty} terjual</span>
                                            </div>
                                            <div className="lp-rank-bar-wrap">
                                                <div className="lp-rank-bar" style={{ width: `${(p.total / productMax) * 100}%` }} />
                                            </div>
                                        </div>
                                        <div className="lp-rank-total">{formatRupiah(p.total)}</div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}

                    {/* ══ KATEGORI ══ */}
                    {reportView === 'categories' && (
                        categorySummary.length === 0 ? (
                            <div className="lp-empty">
                                <div className="lp-empty-icon">🏷️</div>
                                <p>Tidak ada data kategori</p>
                            </div>
                        ) : (
                            <div className="lp-cat-list">
                                {categorySummary.map((c, i) => {
                                    const pct = Math.round((c.total / categoryMax) * 100);
                                    return (
                                        <div key={i} className="lp-cat-card">
                                            <div className="lp-cat-top">
                                                <div>
                                                    <div className="lp-cat-name">{c.nama}</div>
                                                    <div className="lp-cat-sub">{c.qty} item terjual</div>
                                                </div>
                                                <div>
                                                    <div className="lp-cat-total">{formatRupiah(c.total)}</div>
                                                    <div className="lp-cat-pct">{pct}%</div>
                                                </div>
                                            </div>
                                            <div className="lp-cat-bar-track">
                                                <div className="lp-cat-bar-fill" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    )}

                </div>
            )}

            {/* ── TOAST ── */}
            {toast && (
                <div className="toast-container">
                    <div className={`toast ${toast.type}`}>
                        {toast.type === 'success' ? '✅' : '❌'} {toast.message}
                    </div>
                </div>
            )}

            {/* ── MODAL: RINCIAN HARI ── */}
            <dialog id="modal_hari" className="lp-modal-dialog">
                <div className="lp-modal-box">
                    <div className="lp-modal-header">
                        <div>
                            <div className="lp-modal-eyebrow">Rincian Hari</div>
                            <div className="lp-modal-title">{selectedDayData?.formattedDate ?? ''}</div>
                        </div>
                        <div className="lp-modal-header-right">
                            <div className="lp-modal-summary">
                                <span className="lp-modal-summary-count">{selectedDayData?.transactions.length ?? 0} transaksi</span>
                                <span className="lp-modal-summary-total">
                                    {formatRupiah(selectedDayData?.transactions.reduce((s, t) => s + t.total, 0) ?? 0)}
                                </span>
                            </div>
                            <form method="dialog">
                                <button className="lp-modal-close" onClick={() => setExpandedTrx(null)}>✕</button>
                            </form>
                        </div>
                    </div>

                    <div className="lp-modal-body">
                        {selectedDayData && selectedDayData.transactions.length > 0 ? (
                            <TrxAccordion list={selectedDayData.transactions} inModal />
                        ) : (
                            <div className="lp-empty" style={{ padding: '40px 20px' }}>
                                <div className="lp-empty-icon">📋</div>
                                <p>Tidak ada transaksi</p>
                            </div>
                        )}
                    </div>

                    <div className="lp-modal-footer">
                        <form method="dialog">
                            <button className="lp-modal-close-btn" onClick={() => setExpandedTrx(null)}>Tutup</button>
                        </form>
                    </div>
                </div>
                <form method="dialog" className="lp-modal-backdrop">
                    <button onClick={() => setExpandedTrx(null)}>close</button>
                </form>
            </dialog>
        </>
    );
}
