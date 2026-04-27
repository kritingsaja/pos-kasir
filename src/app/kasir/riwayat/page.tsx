'use client';

import { useState, useEffect } from 'react';
import Receipt from '@/components/Receipt';
import Link from 'next/link';

export default function KasirRiwayat() {
    type HistoryTransaction = {
        id: string;
        tanggal: string;
        waktu: string;
        items: Array<{ kode_barang: string; nama_barang: string; qty: number; harga_jual: number; diskon: number; tipe_diskon: number; subtotal: number; catatan?: string }>;
        subtotal: number;
        diskonTotal: number;
        total: number;
        bayar: number;
        kembalian: number;
        metode_bayar: string;
        kasir?: string;
        nama_pelanggan?: string;
        created_at: string;
    };

    const [transactions, setTransactions] = useState<HistoryTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedTransaction, setSelectedTransaction] = useState<HistoryTransaction | null>(null);
    const [userRole, setUserRole] = useState<string>('');
    const [settings, setSettings] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        fetchTransactions();
        fetchUser();
        fetchSettings();
    }, []);

    const fetchUser = async () => {
        try {
            const res = await fetch('/api/auth/me');
            const data = await res.json();
            if (data.success) {
                setUserRole(data.user?.role || '');
            }
        } catch (err) {
            console.error('Fetch user error:', err);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (data.success) {
                setSettings(data.data || {});
            }
        } catch (err) {
            console.error('Fetch settings error:', err);
        }
    };

    const fetchTransactions = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/transactions/history');
            const data = await res.json();
            if (data.success) {
                setTransactions(data.data);
            } else {
                setError(data.message || 'Gagal mengambil riwayat');
            }
        } catch {
            setError('Terjadi kesalahan jaringan');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteTransaction = async (id: string) => {
        if (!confirm('Hapus transaksi ini secara permanen?')) return;
        try {
            const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
            if (res.ok) fetchTransactions();
        } catch (err) {
            console.error('Delete error:', err);
        }
    };

    const formatRupiah = (number: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(number);
    };

    return (
        <>
            <div className="page-header">
                <div>
                    <h1>Riwayat Kasir</h1>
                    <p>Daftar transaksi terbaru</p>
                </div>
                <div>
                    <Link href="/kasir" className="btn btn-secondary">
                        ⬅️ Kembali ke Kasir
                    </Link>
                </div>
            </div>

            <div className="history-container" style={{ marginTop: '20px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>Memuat data...</div>
                ) : error ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--danger)' }}>{error}</div>
                ) : transactions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Belum ada transaksi</div>
                ) : (
                    <>
                        {/* DESKTOP VIEW: Table */}
                        <div className="history-desktop-view">
                            <div className="card" style={{ overflowX: 'auto' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Waktu</th>
                                            <th>ID Transaksi</th>
                                            <th>Pelanggan</th>
                                            <th>Metode</th>
                                            <th>Total</th>
                                            <th>Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.map((trx) => (
                                            <tr key={trx.id}>
                                                <td>{new Date(trx.created_at).toLocaleString('id-ID')}</td>
                                                <td>#{trx.id}</td>
                                                <td>{trx.nama_pelanggan || '-'}</td>
                                                <td>
                                                    <span className={`badge badge-${trx.metode_bayar === 'Tunai' ? 'success' : 'info'}`}>
                                                        {trx.metode_bayar}
                                                    </span>
                                                </td>
                                                <td style={{ fontWeight: '600' }}>{formatRupiah(trx.subtotal)}</td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '10px' }}>
                                                        <button
                                                            className="btn btn-sm btn-primary"
                                                            onClick={() => setSelectedTransaction(trx)}
                                                        >
                                                            🖨️ Cetak
                                                        </button>
                                                        {userRole === 'Admin' && (
                                                            <button
                                                                className="btn btn-sm btn-danger"
                                                                onClick={() => handleDeleteTransaction(trx.id)}
                                                            >
                                                                🗑️ Hapus
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* MOBILE VIEW: Cards */}
                        <div className="history-mobile-view">
                            {transactions.map((trx) => (
                                <div key={trx.id} className="history-card">
                                    <div className="card-header">
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span className="trx-id">#{trx.id}</span>
                                            {trx.nama_pelanggan && <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>👤 {trx.nama_pelanggan}</span>}
                                        </div>
                                        <span className="trx-time">
                                            {new Date(trx.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className="card-body">
                                        <div className="trx-info">
                                            <span className={`badge badge-${trx.metode_bayar === 'Tunai' ? 'success' : 'info'}`}>
                                                {trx.metode_bayar}
                                            </span>
                                            <div className="trx-total">{formatRupiah(trx.total)}</div>
                                        </div>
                                        <div className="trx-date">
                                            {new Date(trx.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                        <button
                                            className="btn btn-primary btn-reprint-mobile"
                                            style={{ flex: 1 }}
                                            onClick={() => setSelectedTransaction(trx)}
                                        >
                                            🖨️ Cetak Ulang
                                        </button>
                                        {userRole === 'Admin' && (
                                            <button
                                                className="btn btn-danger btn-reprint-mobile"
                                                style={{ flex: 1 }}
                                                onClick={() => handleDeleteTransaction(trx.id)}
                                            >
                                                🗑️ Hapus
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Reprint Modal */}
            {selectedTransaction && (
                <div className="modal-overlay" style={{ overflowY: 'auto' }}>
                    <div className="modal" style={{
                        maxWidth: '500px',
                        width: '90%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '20px',
                        alignItems: 'center',
                        border: 'none',
                        margin: '20px auto',
                        padding: '0'
                    }}>

                        {/* Action buttons panel (Moved to Top for Visibility) */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            width: '100%',
                            background: 'var(--bg-surface)',
                            padding: '16px',
                            borderRadius: '12px',
                            boxShadow: 'var(--shadow-sm)',
                            boxSizing: 'border-box',
                            border: '1px solid var(--border)',
                            position: 'sticky',
                            top: '0',
                            zIndex: '100'
                        }}>
                            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setSelectedTransaction(null)}>
                                Tutup
                            </button>
                        </div>

                        {/* Receipts display */}
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div className="receipt-container client-receipt">
                                <Receipt
                                    transactionId={selectedTransaction.id}
                                    items={selectedTransaction.items}
                                    subtotal={selectedTransaction.subtotal}
                                    diskonTotal={selectedTransaction.diskonTotal}
                                    total={selectedTransaction.total}
                                    bayar={selectedTransaction.bayar}
                                    kembalian={selectedTransaction.kembalian}
                                    metodeBayar={selectedTransaction.metode_bayar || "Tunai"}
                                    nama_pelanggan={selectedTransaction.nama_pelanggan}
                                    namaToko={settings.nama_toko}
                                    alamatToko={settings.alamat_toko}
                                    teleponToko={settings.telepon_toko}
                                    headerNota={settings.header_nota}
                                    footerNota={settings.footer_nota}
                                    tanggal={selectedTransaction.tanggal}
                                    waktu={selectedTransaction.waktu}
                                />
                            </div>

                            {/* Kitchen Receipt (Hidden normally, shown when "Cetak Dapur" is triggered using CSS) */}
                            <div className="receipt-container kitchen-receipt" style={{ display: 'none' }}>
                                <div className="receipt-preview">
                                    <div className="receipt-header">
                                        <h3>RESI DAPUR <br /><small>(Cetak Ulang)</small></h3>
                                        <p>ID: {selectedTransaction.id}</p>
                                        {selectedTransaction.nama_pelanggan && <p><strong>Plgn: {selectedTransaction.nama_pelanggan}</strong></p>}
                                    </div>
                                    <div className="receipt-items">
                                        {selectedTransaction.items.map((item, index: number) => (
                                            <div key={index} className="receipt-item">
                                                <div className="item-line">
                                                    <span style={{ fontWeight: 'bold', fontSize: '14px' }}>x{item.qty} {item.nama_barang}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
