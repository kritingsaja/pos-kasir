'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function CategoryPage() {
    const [categories, setCategories] = useState<Array<{ id: number; nama: string }>>([]);
    const [newCat, setNewCat] = useState('');
    const [editingCat, setEditingCat] = useState<{ id: number; nama: string } | null>(null);
    const [editName, setEditName] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCategories();
    }, []);

    async function fetchCategories() {
        setLoading(true);
        try {
            const res = await fetch('/api/categories');
            const data = await res.json();
            if (data.success) setCategories(data.data);
        } catch (error) {
            console.error('Fetch error:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleAdd() {
        if (!newCat.trim()) return;
        try {
            const res = await fetch('/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nama: newCat })
            });
            if (res.ok) {
                setNewCat('');
                fetchCategories();
            }
        } catch (error) {
            console.error('Add error:', error);
        }
    }

    async function handleUpdate() {
        if (!editName.trim() || !editingCat) return;
        try {
            const res = await fetch('/api/categories', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editingCat.id, nama: editName })
            });
            if (res.ok) {
                setEditingCat(null);
                setEditName('');
                fetchCategories();
            }
        } catch (error) {
            console.error('Update error:', error);
        }
    }

    async function handleDelete(id: number) {
        if (!confirm('Hapus kategori ini? Produk dengan kategori ini tidak akan terhapus, namun kategorinya akan menjadi kosong.')) return;
        try {
            const res = await fetch(`/api/categories?id=${id}`, { method: 'DELETE' });
            if (res.ok) fetchCategories();
        } catch (error) {
            console.error('Delete error:', error);
        }
    }

    return (
        <>
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Link href="/pengaturan" className="btn btn-sm btn-secondary">← Kembali</Link>
                    <h1>Manajemen Kategori</h1>
                </div>
                <p className="subtitle">Kelola kategori produk untuk mempermudah pencarian di kasir.</p>
            </div>

            <div className="card" style={{ maxWidth: '600px', marginBottom: '24px' }}>
                <div className="card-header">
                    <h2>Tambah Kategori Baru</h2>
                </div>
                <div className="input-row">
                    <input
                        type="text"
                        placeholder="Nama kategori (contoh: Kopi, Roti, dll)"
                        value={newCat}
                        onChange={(e) => setNewCat(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    />
                    <button className="btn btn-primary" onClick={handleAdd}>Tambah</button>
                </div>
            </div>

            <div className="card" style={{ maxWidth: '600px' }}>
                <div className="card-header">
                    <h2>Daftar Kategori</h2>
                </div>
                {loading ? (
                    <p style={{ textAlign: 'center', padding: '20px' }}>Memuat...</p>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Nama Kategori</th>
                                    <th style={{ width: '120px', textAlign: 'right' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {categories.map(cat => (
                                    <tr key={cat.id}>
                                        <td>
                                            {editingCat?.id === cat.id ? (
                                                <input
                                                    type="text"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    autoFocus
                                                />
                                            ) : (
                                                cat.nama
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                {editingCat?.id === cat.id ? (
                                                    <>
                                                        <button className="btn btn-sm btn-success" onClick={handleUpdate}>💾</button>
                                                        <button className="btn btn-sm btn-danger" onClick={() => setEditingCat(null)}>✕</button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button className="btn btn-sm btn-secondary" onClick={() => {
                                                            setEditingCat(cat);
                                                            setEditName(cat.nama);
                                                        }}>✏️</button>
                                                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(cat.id)}>🗑️</button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {categories.length === 0 && (
                                    <tr>
                                        <td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Belum ada kategori</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}
