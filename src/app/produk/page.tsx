'use client';

import { useState, useEffect } from 'react';
import { Product, formatRupiah } from '@/lib/utils';

export default function ProdukPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Array<{ id: number; nama: string }>>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editProduct, setEditProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState({
        kode_barang: '',
        nama_barang: '',
        harga_jual: 0,
        diskon: 0,
        tipe_diskon: 1,
        kategori: '',
        stok: 999,
    });
    const [toast, setToast] = useState<{ message: string; type: string } | null>(null);

    useEffect(() => {
        fetchProducts();
        fetchCategories();
    }, []);

    async function fetchProducts() {
        try {
            const res = await fetch('/api/products');
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                setProducts(data.data);
            }
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    }

    async function fetchCategories() {
        try {
            const res = await fetch('/api/categories');
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) setCategories(data.data);
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    }

    function showToast(message: string, type: string = 'success') {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }

    const filtered = searchQuery.trim()
        ? products.filter(
            (p) =>
                p.kode_barang.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.nama_barang.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : products;

    function openAddModal() {
        setEditProduct(null);
        setFormData({
            kode_barang: '',
            nama_barang: '',
            harga_jual: 0,
            diskon: 0,
            tipe_diskon: 1,
            kategori: '',
            stok: 999,
        });
        setShowModal(true);
    }

    function openEditModal(product: Product) {
        setEditProduct(product);
        setFormData({
            kode_barang: product.kode_barang,
            nama_barang: product.nama_barang,
            harga_jual: product.harga_jual,
            diskon: product.diskon,
            tipe_diskon: product.tipe_diskon,
            kategori: product.kategori,
            stok: product.stok,
        });
        setShowModal(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        try {
            if (editProduct) {
                const res = await fetch('/api/products', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: editProduct.id, ...formData }),
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Produk berhasil diupdate');
                    setShowModal(false);
                    fetchProducts();
                } else {
                    showToast(data.error || 'Gagal update produk', 'error');
                }
            } else {
                const res = await fetch('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData),
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Produk berhasil ditambahkan');
                    setShowModal(false);
                    fetchProducts();
                } else {
                    showToast(data.error || 'Gagal menambah produk', 'error');
                }
            }
        } catch (error) {
            console.error('Error:', error);
            showToast('Terjadi kesalahan', 'error');
        }
    }

    async function handleDelete(id: number) {
        if (!confirm('Yakin ingin menghapus produk ini?')) return;
        try {
            const res = await fetch(`/api/products?id=${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showToast('Produk berhasil dihapus');
                fetchProducts();
            }
        } catch (error) {
            console.error('Error:', error);
            showToast('Gagal menghapus produk', 'error');
        }
    }

    return (
        <>
            {/* Page header */}
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h1>Produk</h1>
                        <p>Kelola data produk dan harga</p>
                    </div>
                    <button className="btn btn-primary" onClick={openAddModal} style={{ flexShrink: 0 }}>
                        + Tambah
                    </button>
                </div>
            </div>

            <div className="card">
                {/* Search bar — full width on mobile */}
                <div style={{ marginBottom: '16px' }}>
                    <div className="search-bar">
                        <span className="search-icon">🔍</span>
                        <input
                            type="search"
                            placeholder="Cari produk..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="loading" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Memuat data produk...
                    </div>
                ) : (
                    <>
                        {/* Desktop table */}
                        <div className="produk-desktop-view table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Kode</th>
                                        <th>Nama Barang</th>
                                        <th>Kategori</th>
                                        <th>Harga Jual</th>
                                        <th>Diskon</th>
                                        <th>Stok</th>
                                        <th>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((product) => (
                                        <tr key={product.id}>
                                            <td>
                                                <span className="badge badge-info">{product.kode_barang}</span>
                                            </td>
                                            <td>{product.nama_barang}</td>
                                            <td>
                                                {product.kategori
                                                    ? <span className="badge badge-warning">{product.kategori}</span>
                                                    : <span style={{ color: 'var(--text-300)', fontSize: '12px' }}>—</span>}
                                            </td>
                                            <td style={{ fontWeight: 600 }}>{formatRupiah(product.harga_jual)}</td>
                                            <td>
                                                {product.diskon > 0
                                                    ? product.tipe_diskon === 1
                                                        ? formatRupiah(product.diskon)
                                                        : `${product.diskon}%`
                                                    : '-'}
                                            </td>
                                            <td>{product.stok}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => openEditModal(product)}
                                                    >
                                                        ✏️ Edit
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-danger"
                                                        onClick={() => handleDelete(product.id)}
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filtered.length === 0 && (
                                        <tr>
                                            <td colSpan={7}>
                                                <div className="empty-state">
                                                    <div className="empty-icon">📦</div>
                                                    <p>Tidak ada produk ditemukan</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile card list */}
                        <div className="produk-mobile-view">
                            {filtered.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-icon">📦</div>
                                    <p>Tidak ada produk ditemukan</p>
                                </div>
                            ) : (
                                filtered.map((product) => (
                                    <div key={product.id} className="produk-mobile-card">
                                        <div className="produk-mobile-card-header">
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-900)' }}>{product.nama_barang}</div>
                                                <div style={{ marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    <span className="badge badge-info">{product.kode_barang}</span>
                                                    {product.kategori && <span className="badge badge-warning">{product.kategori}</span>}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--success)' }}>{formatRupiah(product.harga_jual)}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-500)', marginTop: '2px' }}>Stok: {product.stok}</div>
                                            </div>
                                        </div>
                                        {product.diskon > 0 && (
                                            <div style={{ fontSize: '12px', color: 'var(--warning)', marginBottom: '10px' }}>
                                                Diskon: {product.tipe_diskon === 1 ? formatRupiah(product.diskon) : `${product.diskon}%`}
                                            </div>
                                        )}
                                        <div className="produk-mobile-card-actions">
                                            <button
                                                className="btn btn-sm btn-secondary"
                                                style={{ flex: 1 }}
                                                onClick={() => openEditModal(product)}
                                            >
                                                ✏️ Edit
                                            </button>
                                            <button
                                                className="btn btn-sm btn-danger"
                                                style={{ flex: 1 }}
                                                onClick={() => handleDelete(product.id)}
                                            >
                                                🗑️ Hapus
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}

                <div style={{ padding: '12px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                    Total: {filtered.length} produk
                </div>
            </div>

            {/* Modal Tambah/Edit Produk */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editProduct ? 'Edit Produk' : 'Tambah Produk Baru'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="input-group">
                                    <label>Kode Barang *</label>
                                    <input
                                        type="text"
                                        value={formData.kode_barang}
                                        onChange={(e) => setFormData({ ...formData, kode_barang: e.target.value })}
                                        required
                                        disabled={!!editProduct}
                                    />
                                </div>
                                <div className="input-group">
                                    <label>Nama Barang *</label>
                                    <input
                                        type="text"
                                        value={formData.nama_barang}
                                        onChange={(e) => setFormData({ ...formData, nama_barang: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="input-group">
                                    <label>Harga Jual (Rp) *</label>
                                    <input
                                        type="number"
                                        value={formData.harga_jual}
                                        onChange={(e) => setFormData({ ...formData, harga_jual: parseInt(e.target.value) || 0 })}
                                        required
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div className="input-group">
                                        <label>Tipe Diskon</label>
                                        <select
                                            value={formData.tipe_diskon}
                                            onChange={(e) => setFormData({ ...formData, tipe_diskon: parseInt(e.target.value) })}
                                        >
                                            <option value={1}>Rupiah</option>
                                            <option value={2}>Persen</option>
                                        </select>
                                    </div>
                                    <div className="input-group">
                                        <label>Diskon</label>
                                        <input
                                            type="number"
                                            value={formData.diskon}
                                            onChange={(e) => setFormData({ ...formData, diskon: parseInt(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                                <div className="input-group">
                                    <label>Kategori</label>
                                    <select
                                        value={formData.kategori}
                                        onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                                    >
                                        <option value="">Tanpa Kategori</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.nama}>{cat.nama}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label>Stok</label>
                                    <input
                                        type="number"
                                        value={formData.stok}
                                        onChange={(e) => setFormData({ ...formData, stok: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Batal
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editProduct ? 'Update' : 'Simpan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Toast */}
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
