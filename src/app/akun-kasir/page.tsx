'use client';

import { useCallback, useEffect, useState } from 'react';

type Account = { id: string; username: string; role: 'Admin' | 'Kasir'; active: number; created_at?: string };

export default function AkunKasirPage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [editing, setEditing] = useState<Account | null>(null);
    const [editUsername, setEditUsername] = useState('');
    const [editPassword, setEditPassword] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/admin/users', { cache: 'no-store' });
            const body = await response.json();
            if (!response.ok || !body.success) throw new Error(body.error || 'Daftar akun gagal dimuat.');
            setAccounts(body.accounts || []);
            setError('');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Daftar akun gagal dimuat.');
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { void load(); }, [load]);

    async function createAccount(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true); setError(''); setSuccess('');
        try {
            const response = await fetch('/api/admin/users', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const body = await response.json();
            if (!response.ok || !body.success) throw new Error(body.error || 'Akun Kasir gagal dibuat.');
            setUsername(''); setPassword('');
            setSuccess('Akun Kasir berhasil dibuat. Berikan username dan password ini kepada Kasir.');
            await load();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Akun Kasir gagal dibuat.');
        } finally { setSaving(false); }
    }

    async function saveCredentials(event: React.FormEvent) {
        event.preventDefault();
        if (!editing) return;
        setSaving(true); setError(''); setSuccess('');
        try {
            const response = await fetch('/api/admin/users', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: editing.id, username: editUsername, password: editPassword }),
            });
            const body = await response.json();
            if (!response.ok || !body.success) throw new Error(body.error || 'Kredensial gagal diperbarui.');
            setEditing(null); setEditPassword('');
            setSuccess('Username dan password Kasir berhasil diperbarui.');
            await load();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Kredensial gagal diperbarui.');
        } finally { setSaving(false); }
    }

    return (
        <main style={{ maxWidth: 1000, margin: '0 auto', padding: '24px clamp(14px, 3vw, 30px)' }}>
            <div className="page-header">
                <h1>Akun Kasir</h1>
                <p>Buat akun login Kasir untuk bisnis ini dan atur ulang username atau passwordnya.</p>
            </div>
            {error && <div role="alert" style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: '#fff1f2', color: '#be123c' }}>{error}</div>}
            {success && <div role="status" style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: '#ecfdf5', color: '#047857' }}>{success}</div>}

            <section className="card" style={{ marginBottom: 20 }}>
                <div className="card-header"><h2>Tambah Kasir</h2></div>
                <form onSubmit={createAccount}>
                    <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
                        <div className="input-group"><label htmlFor="cashier-username">Username</label><input id="cashier-username" required minLength={3} maxLength={40} autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} placeholder="contoh: kasir-pagi" /></div>
                        <div className="input-group"><label htmlFor="cashier-password">Password awal</label><input id="cashier-password" required type="password" minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimal 10 karakter" /></div>
                    </div>
                    <div className="modal-footer"><button className="btn btn-primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Buat Akun Kasir'}</button></div>
                </form>
            </section>

            <section className="card">
                <div className="card-header"><h2>Daftar Akun Bisnis</h2><p>Username harus unik di seluruh aplikasi.</p></div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 540 }}>
                        <thead><tr>{['Username', 'Peran', 'Status', 'Aksi'].map(label => <th key={label} style={{ textAlign: 'left', padding: 12, borderBottom: '1px solid var(--border-color)' }}>{label}</th>)}</tr></thead>
                        <tbody>
                            {accounts.map(account => <tr key={account.id}>
                                <td style={{ padding: 12, borderBottom: '1px solid var(--border-color)', fontWeight: 600 }}>{account.username}</td>
                                <td style={{ padding: 12, borderBottom: '1px solid var(--border-color)' }}>{account.role}</td>
                                <td style={{ padding: 12, borderBottom: '1px solid var(--border-color)' }}>{account.active ? 'Aktif' : 'Nonaktif'}</td>
                                <td style={{ padding: 12, borderBottom: '1px solid var(--border-color)' }}>
                                    {account.role === 'Kasir' && <button type="button" className="btn btn-secondary" onClick={() => { setEditing(account); setEditUsername(account.username); setEditPassword(''); }}>Ubah login</button>}
                                </td>
                            </tr>)}
                            {!loading && accounts.length === 0 && <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center' }}>Belum ada akun.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>

            {editing && <div role="presentation" onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16, background: '#0f172a88' }}>
                <section role="dialog" aria-modal="true" aria-labelledby="edit-cashier-title" onClick={event => event.stopPropagation()} className="card" style={{ width: 'min(100%, 460px)', padding: 20 }}>
                    <h2 id="edit-cashier-title" style={{ marginTop: 0 }}>Ubah login Kasir</h2>
                    <form onSubmit={saveCredentials}>
                        <div className="input-group"><label htmlFor="edit-cashier-username">Username baru</label><input id="edit-cashier-username" required minLength={3} maxLength={40} autoComplete="off" value={editUsername} onChange={e => setEditUsername(e.target.value)} /></div>
                        <div className="input-group"><label htmlFor="edit-cashier-password">Password baru</label><input id="edit-cashier-password" required type="password" minLength={10} maxLength={128} autoComplete="new-password" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="Minimal 10 karakter" /></div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}><button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Batal</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan login'}</button></div>
                    </form>
                </section>
            </div>}
        </main>
    );
}
