'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function PengaturanPage() {
    const [settings, setSettings] = useState({
        nama_toko: 'TOKO SAYA',
        alamat_toko: 'Jl. Contoh No. 123',
        telepon_toko: '08123456789',
        header_nota: '',
        footer_nota: 'Terima Kasih atas Kunjungan Anda!',
        spreadsheet_id: '',
        telegram_bot_token: '',
        telegram_chat_id: '',
    });
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
    const [unlimitedStock, setUnlimitedStock] = useState(true);

    async function fetchSettings() {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (data.success && data.data) {
                setSettings(prev => ({ ...prev, ...data.data }));
            }
        } catch (error) {
            console.error('Error:', error);
        }
    }

    useEffect(() => {
        fetchSettings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function showToast(message: string, type: string = 'success') {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            const data = await res.json();
            if (data.success) {
                showToast('Pengaturan berhasil disimpan');
            } else {
                showToast('Gagal menyimpan', 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showToast('Gagal menyimpan', 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <div className="page-header">
                <h1>Pengaturan</h1>
                <p>Konfigurasi toko dan nota</p>
            </div>

            <div style={{ maxWidth: '600px' }}>
                {/* ── Organisasi Produk ── */}
                <div className="card" style={{ marginBottom: '20px' }}>
                    <div className="card-header">
                        <h2>📁 Organisasi Produk</h2>
                    </div>
                    <div className="modal-body">
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                            Kelola kategori untuk mengelompokkan produk Anda.
                        </p>
                        <Link href="/pengaturan/kategori" className="btn btn-secondary" style={{ width: '100%', textAlign: 'center', display: 'block' }}>
                            📁 Kelola Kategori Produk
                        </Link>
                    </div>
                </div>

                {/* ── Informasi Toko ── */}
                <div className="card">
                    <div className="card-header">
                        <h2>🏪 Informasi Toko</h2>
                    </div>

                    <form onSubmit={handleSave}>
                        <div className="modal-body">
                            <div className="input-group">
                                <label>Nama Toko</label>
                                <input
                                    type="text"
                                    value={settings.nama_toko}
                                    onChange={(e) => setSettings({ ...settings, nama_toko: e.target.value })}
                                />
                            </div>
                            <div className="input-group">
                                <label>Alamat</label>
                                <input
                                    type="text"
                                    value={settings.alamat_toko}
                                    onChange={(e) => setSettings({ ...settings, alamat_toko: e.target.value })}
                                />
                            </div>
                            <div className="input-group">
                                <label>Telepon</label>
                                <input
                                    type="text"
                                    value={settings.telepon_toko}
                                    onChange={(e) => setSettings({ ...settings, telepon_toko: e.target.value })}
                                />
                            </div>
                            <div className="input-group">
                                <label>Google Spreadsheet ID</label>
                                <input
                                    type="text"
                                    placeholder="Masukkan ID Spreadsheet..."
                                    value={settings.spreadsheet_id}
                                    onChange={(e) => setSettings({ ...settings, spreadsheet_id: e.target.value })}
                                />
                                <small style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                                    ID bisa ditemukan di URL spreadsheet Anda.
                                </small>
                            </div>
                        </div>
                    </form>
                </div>

                {/* ── Telegram Bot (BARU) ── */}
                <div className="card" style={{ marginTop: '20px' }}>
                    <div className="card-header">
                        <h2>🤖 Notifikasi Telegram (11 PM)</h2>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                            Bot akan mengirim laporan stok setiap jam 11 malam jika dikonfigurasi.
                        </p>
                    </div>

                    <form onSubmit={handleSave}>
                        <div className="modal-body">
                            <div className="input-group">
                                <label>Bot Token</label>
                                <input
                                    type="password"
                                    placeholder="Masukkan Bot Token dari @BotFather..."
                                    value={settings.telegram_bot_token}
                                    onChange={(e) => setSettings({ ...settings, telegram_bot_token: e.target.value })}
                                />
                            </div>
                            <div className="input-group">
                                <label>Chat ID</label>
                                <input
                                    type="text"
                                    placeholder="Masukkan Chat ID Anda..."
                                    value={settings.telegram_chat_id}
                                    onChange={(e) => setSettings({ ...settings, telegram_chat_id: e.target.value })}
                                />
                                <small style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                                    Gunakan @userinfobot di Telegram untuk mendapatkan ID Anda.
                                </small>
                            </div>
                            
                            <button 
                                type="button" 
                                className="btn btn-secondary" 
                                style={{ width: '100%', marginTop: '10px' }}
                                onClick={async () => {
                                    if (!settings.telegram_bot_token || !settings.telegram_chat_id) {
                                        alert('Isi Token dan Chat ID dulu!');
                                        return;
                                    }
                                    try {
                                        const res = await fetch('/api/cron/check-stock');
                                        const data = await res.json();
                                        if (data.success) alert('✅ Pesan tes berhasil dikirim!');
                                        else alert('❌ Gagal: ' + (data.error || 'Cek token/ID'));
                                    } catch {
                                        alert('❌ Error koneksi');
                                    }
                                }}
                            >
                                🔔 Tes Kirim Notifikasi
                            </button>
                        </div>
                        <div className="modal-footer">
                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? '⏳ Menyimpan...' : '💾 Simpan Konfigurasi Telegram'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* ── Header & Footer Cetak (BARU) ── */}
                <div className="card" style={{ marginTop: '20px' }}>
                    <div className="card-header">
                        <h2>🖨️ Tampilan Nota Cetak</h2>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                            Teks yang muncul di awal dan akhir struk printer
                        </p>
                    </div>

                    <form onSubmit={handleSave}>
                        <div className="modal-body">
                            {/* Preview mini */}
                            <div className="nota-preview">
                                <div className="nota-preview-section header-section">
                                    <span className="nota-preview-label">HEADER</span>
                                    <div className="nota-preview-content">
                                        <div style={{ fontWeight: 700, textAlign: 'center' }}>{settings.nama_toko || 'NAMA TOKO'}</div>
                                        <div style={{ fontSize: '11px', textAlign: 'center', color: '#888' }}>{settings.alamat_toko}</div>
                                        <div style={{ fontSize: '11px', textAlign: 'center', color: '#888' }}>Telp: {settings.telepon_toko}</div>
                                        {settings.header_nota && (
                                            <div className="nota-preview-custom">{settings.header_nota}</div>
                                        )}
                                    </div>
                                </div>
                                <div className="nota-preview-divider">- - - - - - - - - - - - - - - -</div>
                                <div style={{ fontSize: '11px', color: '#aaa', textAlign: 'center', padding: '4px 0' }}>
                                    [item-item transaksi]
                                </div>
                                <div className="nota-preview-divider">- - - - - - - - - - - - - - - -</div>
                                <div className="nota-preview-section footer-section">
                                    <span className="nota-preview-label">FOOTER</span>
                                    <div className="nota-preview-content">
                                        {settings.footer_nota && (
                                            <div className="nota-preview-custom">{settings.footer_nota}</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="input-group">
                                <label>📋 Header Nota <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '11px' }}>(opsional — muncul setelah nama toko)</span></label>
                                <textarea
                                    rows={3}
                                    placeholder="Contoh: Promo Maret: diskon 10% semua menu!&#10;Selamat datang di warung kami."
                                    value={settings.header_nota}
                                    onChange={(e) => setSettings({ ...settings, header_nota: e.target.value })}
                                    style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '14px' }}
                                />
                                <small style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                                    Bisa multi-baris — tekan Enter untuk baris baru.
                                </small>
                            </div>

                            <div className="input-group">
                                <label>📋 Footer Nota <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '11px' }}>(muncul di bawah struk)</span></label>
                                <textarea
                                    rows={3}
                                    placeholder="Contoh: Terima kasih sudah mampir!&#10;Wifi: NamaWifi | Pass: abc123"
                                    value={settings.footer_nota}
                                    onChange={(e) => setSettings({ ...settings, footer_nota: e.target.value })}
                                    style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '14px' }}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? '⏳ Menyimpan...' : '💾 Simpan Tampilan Nota'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* ── Tentang Aplikasi ── */}
                <div className="card" style={{ marginTop: '20px' }}>
                    <div className="card-header">
                        <h2>ℹ️ Tentang Aplikasi</h2>
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                        <p><strong>KasirPOS</strong> v1.0</p>
                        <p>Aplikasi kasir modern berbasis web</p>
                        <p>Database: SQLite (lokal)</p>
                        <p>Laporan: Google Sheets (opsional)</p>
                    </div>
                </div>

                {/* ── Import Data Excel ── */}
                <div className="card" style={{ marginTop: '20px' }}>
                    <div className="card-header">
                        <h2>📥 Import Data Excel</h2>
                    </div>
                    <div className="modal-body">
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                            Import data produk dari file Excel (.xlsx / .xls) sekaligus.
                        </p>

                        <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                            <div style={{ padding: '8px 12px', background: 'var(--border-soft)', fontSize: '11px', fontWeight: '700', color: 'var(--text-500)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Sheet: <strong>Produk</strong> — Kolom yang diperlukan
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ fontSize: '12px', margin: 0 }}>
                                    <thead>
                                        <tr>
                                            <th>Kode Barang</th>
                                            <th>Nama Barang</th>
                                            <th>Harga Jual</th>
                                            <th>Diskon</th>
                                            <th>Tipe Diskon</th>
                                            <th>Kategori</th>
                                            <th>Stok</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td><code>P001</code></td>
                                            <td><code>Nasi Goreng</code></td>
                                            <td><code>15000</code></td>
                                            <td><code>0</code></td>
                                            <td><code>1</code> (Rp) / <code>2</code> (%)</td>
                                            <td><code>Makanan</code></td>
                                            <td><code>100</code></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div style={{ padding: '8px 12px', background: 'var(--border-soft)', fontSize: '11px', fontWeight: '700', color: 'var(--text-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '1px' }}>
                                Sheet: <strong>Kategori</strong> (opsional)
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ fontSize: '12px', margin: 0 }}>
                                    <thead><tr><th>Nama</th></tr></thead>
                                    <tbody><tr><td><code>Makanan</code></td></tr></tbody>
                                </table>
                            </div>
                        </div>

                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '12px',
                            background: unlimitedStock ? 'var(--success-bg)' : 'var(--bg-base)',
                            border: `1px solid ${unlimitedStock ? 'var(--success)' : 'var(--border)'}`,
                            borderRadius: '10px', padding: '12px 14px', marginBottom: '14px',
                            cursor: 'pointer', transition: 'all 0.2s ease'
                        }} onClick={() => setUnlimitedStock(!unlimitedStock)}>
                            <div style={{
                                width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0,
                                background: unlimitedStock ? 'var(--success)' : 'var(--bg-surface)',
                                border: `1.5px solid ${unlimitedStock ? 'var(--success)' : 'var(--border-strong)'}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: '13px', fontWeight: 700
                            }}>
                                {unlimitedStock && '✓'}
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-900)' }}>♾️ Stok Tidak Terbatas</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-500)', marginTop: '2px' }}>
                                    Abaikan kolom Stok dari Excel — semua produk akan memiliki stok 999.999 (unlimited)
                                </div>
                            </div>
                        </div>

                        <label
                            className="btn btn-primary"
                            style={{ width: '100%', textAlign: 'center', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px' }}
                        >
                            📊 Pilih File Excel & Import
                            <input
                                type="file"
                                accept=".xlsx,.xls"
                                style={{ display: 'none' }}
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const formData = new FormData();
                                    formData.append('file', file);
                                    formData.append('unlimited_stock', unlimitedStock ? '1' : '0');
                                    try {
                                        const res = await fetch('/api/import', {
                                            method: 'POST',
                                            body: formData,
                                        });
                                        const data = await res.json();
                                        if (data.success) {
                                            alert(`✅ Berhasil import ${data.count || 0} produk!`);
                                            window.location.reload();
                                        } else {
                                            alert('❌ Gagal import: ' + (data.error || 'Terjadi kesalahan'));
                                        }
                                    } catch {
                                        alert('❌ Terjadi kesalahan saat mengupload file');
                                    }
                                    e.target.value = '';
                                }}
                            />
                        </label>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
                            Produk dengan kode yang sama akan diperbarui (upsert).
                        </p>
                    </div>
                </div>
            </div>

            {toast && (
                <div className="toast-container">
                    <div className={`toast ${toast.type}`}>
                        {toast.type === 'success' ? '✅' : '❌'} {toast.message}
                    </div>
                </div>
            )}
        </>
    );
}
