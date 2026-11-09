'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Building2, CircleAlert, Database, RefreshCw, ShieldCheck, Store, Users } from 'lucide-react';

type Business = {
    id: string; name: string; slug: string; business_type: 'cafe' | 'stockist';
    status: 'active' | 'suspended'; admin_username: string; cashier_count: number;
    database_name: string; created_at: string; health: 'connected' | 'error' | 'suspended' | 'unknown';
};
type Summary = { total: number; active: number; suspended: number; cafe: number; stockist: number };
type Setup = { configured: boolean; provisioningConfigured: boolean; missing?: string[] };

const emptySummary: Summary = { total: 0, active: 0, suspended: 0, cafe: 0, stockist: 0 };

export default function SuperadminDashboard() {
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [summary, setSummary] = useState(emptySummary);
    const [setup, setSetup] = useState<Setup>({ configured: false, provisioningConfigured: false });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [lastCredential, setLastCredential] = useState<{ business: string; username: string; password: string } | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [form, setForm] = useState({ name: '', slug: '', businessType: 'stockist', adminUsername: '', adminPassword: '' });

    const load = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const response = await fetch('/api/superadmin/businesses', { cache: 'no-store' });
            const body = await response.json();
            if (!response.ok || !body.success) throw new Error(body.error || 'Data bisnis gagal dimuat.');
            setBusinesses(body.businesses || []);
            setSummary({ ...emptySummary, ...(body.summary || {}) });
            setSetup({ configured: Boolean(body.configured), provisioningConfigured: Boolean(body.provisioningConfigured), missing: body.missing || [] });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Data bisnis gagal dimuat.');
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { void load(); }, [load]);

    function changeName(value: string) {
        const slug = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
        setForm(current => ({ ...current, name: value, slug }));
    }

    async function createBusiness(event: FormEvent) {
        event.preventDefault(); setSaving(true); setError(''); setSuccess('');
        try {
            const response = await fetch('/api/superadmin/businesses', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
            });
            const body = await response.json();
            if (!response.ok || !body.success) throw new Error(body.error || 'Bisnis gagal dibuat.');
            setLastCredential({ business: form.name, username: form.adminUsername, password: form.adminPassword });
            setSuccess('Bisnis dan database terpisah berhasil dibuat.');
            setForm({ name: '', slug: '', businessType: 'stockist', adminUsername: '', adminPassword: '' });
            setShowForm(false);
            await load();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Bisnis gagal dibuat.');
        } finally { setSaving(false); }
    }

    async function toggleStatus(business: Business) {
        const status = business.status === 'active' ? 'suspended' : 'active';
        if (!window.confirm(status === 'suspended' ? 'Nonaktifkan akses login bisnis ini?' : 'Aktifkan kembali bisnis ini?')) return;
        setError(''); setSuccess('');
        const response = await fetch('/api/superadmin/businesses', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: business.id, status }),
        });
        const body = await response.json();
        if (!response.ok || !body.success) { setError(body.error || 'Status bisnis gagal diperbarui.'); return; }
        setSuccess(status === 'suspended' ? 'Akses login bisnis dihentikan.' : 'Akses login bisnis diaktifkan kembali.');
        await load();
    }

    async function logout() {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.assign('/login');
    }

    const inputStyle: CSSProperties = { display: 'block', width: '100%', marginTop: 6, padding: '11px 12px', border: '1px solid #cbd5e1', borderRadius: 9, color: '#0f172a', background: '#fff' };

    return (
        <main style={{ minHeight: '100vh', background: '#f4f7fb', padding: '28px clamp(14px, 4vw, 56px)', color: '#14202f' }}>
            <div style={{ maxWidth: 1240, margin: '0 auto' }}>
                <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 20 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#0f766e', fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}><ShieldCheck size={16} /> Platform KasirPOS</div>
                        <h1 style={{ margin: '7px 0 3px', fontSize: 'clamp(25px, 4vw, 34px)', letterSpacing: '-.03em' }}>Dashboard Superadmin</h1>
                        <p style={{ margin: 0, color: '#64748b' }}>Kelola akun bisnis dan status database tanpa melihat data penjualan.</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => void load()} disabled={loading} aria-label="Muat ulang" style={{ border: '1px solid #cbd5e1', borderRadius: 9, padding: 10, background: '#fff', cursor: 'pointer' }}><RefreshCw size={17} /></button>
                        <button onClick={logout} style={{ border: '1px solid #cbd5e1', borderRadius: 9, padding: '9px 13px', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Keluar</button>
                    </div>
                </header>

                {error && <div role="alert" style={{ marginTop: 18, padding: 13, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', borderRadius: 10 }}>{error}</div>}
                {success && <div role="status" style={{ marginTop: 18, padding: 13, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: 10 }}>{success}</div>}

                {!setup.configured && !loading && (
                    <section style={{ marginTop: 22, padding: 20, border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: 14 }}>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px', color: '#9a3412', fontSize: 17 }}><CircleAlert size={19} /> Database platform belum dihubungkan</h2>
                        <p style={{ margin: '0 0 12px', color: '#7c2d12', lineHeight: 1.6 }}>Buat satu database Turso kosong khusus untuk data akun bisnis. Aplikasi membuat tabel platform otomatis saat kredensialnya tersedia.</p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {['PLATFORM_TURSO_URL', 'PLATFORM_TURSO_AUTH_TOKEN'].map(key => <code key={key} style={{ background: '#ffedd5', padding: '6px 9px', borderRadius: 7 }}>{key}</code>)}
                        </div>
                        {setup.missing?.length ? <p style={{ margin: '10px 0 0', color: '#9a3412', fontSize: 13 }}>Variabel belum tersedia: {setup.missing.join(', ')}</p> : null}
                    </section>
                )}
                {setup.configured && !setup.provisioningConfigured && !loading && (
                    <section style={{ marginTop: 22, padding: 18, border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: 14 }}>
                        <strong>Database platform terhubung, provisioning Turso belum siap.</strong>
                        <p style={{ margin: '6px 0 0', color: '#7c2d12' }}>Tambahkan TURSO_ORG dan TURSO_API_TOKEN di environment Preview Vercel agar tombol buat bisnis dapat membuat database baru secara otomatis.</p>
                    </section>
                )}

                <section aria-label="Ringkasan akun bisnis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 13, marginTop: 22 }}>
                    {[
                        { label: 'Total bisnis', value: summary.total, icon: Building2, accent: '#0f766e' },
                        { label: 'Aktif', value: summary.active, icon: ShieldCheck, accent: '#16a34a' },
                        { label: 'Cafe', value: summary.cafe, icon: Store, accent: '#2563eb' },
                        { label: 'Stockist', value: summary.stockist, icon: Database, accent: '#7c3aed' },
                    ].map(item => <article key={item.label} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 17, background: '#fff', boxShadow: '0 2px 8px #0f172a08' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 13 }}>{item.label}<item.icon size={18} color={item.accent} /></div>
                        <strong style={{ display: 'block', marginTop: 12, fontSize: 29 }}>{loading ? '—' : Number(item.value || 0).toLocaleString('id-ID')}</strong>
                    </article>)}
                </section>

                <section style={{ marginTop: 22, border: '1px solid #e2e8f0', borderRadius: 15, background: '#fff', overflow: 'hidden', boxShadow: '0 4px 14px #0f172a08' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 18, borderBottom: '1px solid #e2e8f0' }}>
                        <div><h2 style={{ margin: 0, fontSize: 18 }}>Akun bisnis</h2><p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>Setiap bisnis memiliki database sendiri dan Admin pertamanya.</p></div>
                        <button onClick={() => setShowForm(value => !value)} disabled={!setup.provisioningConfigured} style={{ border: 0, borderRadius: 9, padding: '10px 14px', color: '#fff', background: setup.provisioningConfigured ? '#0f766e' : '#94a3b8', fontWeight: 700, cursor: setup.provisioningConfigured ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>{showForm ? 'Tutup' : '+ Buat bisnis'}</button>
                    </div>

                    {lastCredential && <div style={{ margin: 16, padding: 15, borderRadius: 11, background: '#ecfdf5', border: '1px solid #bbf7d0' }}>
                        <strong>Akun Admin pertama untuk {lastCredential.business}</strong>
                        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 8, fontSize: 14 }}>
                            <span>Username: <b>{lastCredential.username}</b></span>
                            <span>Password: <b>{showPassword ? lastCredential.password : '••••••••••'}</b> <button onClick={() => setShowPassword(value => !value)} style={{ marginLeft: 5, border: 0, color: '#047857', background: 'transparent', textDecoration: 'underline', cursor: 'pointer' }}>{showPassword ? 'Sembunyikan' : 'Tampilkan'}</button></span>
                        </div>
                        <p style={{ margin: '7px 0 0', fontSize: 12, color: '#166534' }}>Simpan sekarang dan berikan kredensial ini kepada Admin bisnis. Password tidak dapat ditampilkan lagi setelah halaman ditutup.</p>
                    </div>}

                    {showForm && <form onSubmit={createBusiness} style={{ margin: 16, padding: 18, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 13 }}>
                        <label style={{ fontSize: 13, fontWeight: 700 }}>Nama bisnis<input required value={form.name} onChange={e => changeName(e.target.value)} style={inputStyle} placeholder="Contoh: Toko Sumber Rejeki" /></label>
                        <label style={{ fontSize: 13, fontWeight: 700 }}>Kode bisnis<input required value={form.slug} onChange={e => setForm(current => ({ ...current, slug: e.target.value.toLowerCase() }))} style={inputStyle} placeholder="toko-sumber-rejeki" /></label>
                        <label style={{ fontSize: 13, fontWeight: 700 }}>Jenis usaha<select value={form.businessType} onChange={e => setForm(current => ({ ...current, businessType: e.target.value }))} style={inputStyle}><option value="stockist">Stockist</option><option value="cafe">Cafe / restoran</option></select></label>
                        <label style={{ fontSize: 13, fontWeight: 700 }}>Username Admin<input required value={form.adminUsername} onChange={e => setForm(current => ({ ...current, adminUsername: e.target.value }))} style={inputStyle} autoComplete="off" /></label>
                        <label style={{ fontSize: 13, fontWeight: 700 }}>Password awal Admin<input required type="password" minLength={10} value={form.adminPassword} onChange={e => setForm(current => ({ ...current, adminPassword: e.target.value }))} style={inputStyle} autoComplete="new-password" /></label>
                        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <span style={{ color: '#64748b', fontSize: 12 }}>Password ditentukan Superadmin dan hanya ditampilkan sekali setelah dibuat.</span>
                            <button disabled={saving} style={{ border: 0, borderRadius: 9, padding: '11px 18px', color: '#fff', background: '#0f766e', fontWeight: 700 }}>{saving ? 'Membuat database…' : 'Buat bisnis & Admin'}</button>
                        </div>
                    </form>}

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760, textAlign: 'left' }}>
                            <thead style={{ color: '#64748b', fontSize: 12, background: '#f8fafc' }}><tr>{['Bisnis', 'Jenis', 'Admin', 'Kasir', 'Database', 'Koneksi', 'Status', 'Aksi'].map(header => <th key={header} style={{ padding: '12px 14px', fontWeight: 700 }}>{header}</th>)}</tr></thead>
                            <tbody>
                                {businesses.map(business => <tr key={business.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: '14px', fontWeight: 700 }}>{business.name}<small style={{ display: 'block', marginTop: 3, color: '#64748b', fontWeight: 400 }}>{business.slug}</small></td>
                                    <td style={{ padding: '14px' }}>{business.business_type === 'stockist' ? 'Stockist' : 'Cafe'}</td>
                                    <td style={{ padding: '14px' }}>{business.admin_username}</td><td style={{ padding: '14px' }}>{business.cashier_count}</td>
                                    <td style={{ padding: '14px' }}><code>{business.database_name}</code></td>
                                    <td style={{ padding: '14px', color: business.health === 'connected' ? '#15803d' : business.health === 'error' ? '#b91c1c' : '#64748b' }}>{business.health === 'connected' ? 'Terhubung' : business.health === 'error' ? 'Bermasalah' : business.health === 'suspended' ? 'Ditangguhkan' : '—'}</td>
                                    <td style={{ padding: '14px' }}>{business.status === 'active' ? 'Aktif' : 'Ditangguhkan'}</td>
                                    <td style={{ padding: '14px' }}><button onClick={() => void toggleStatus(business)} style={{ border: '1px solid #cbd5e1', borderRadius: 7, padding: '6px 9px', background: '#fff', cursor: 'pointer' }}>{business.status === 'active' ? 'Tangguhkan' : 'Aktifkan'}</button></td>
                                </tr>)}
                                {!loading && !businesses.length && <tr><td colSpan={8} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>{setup.configured ? 'Belum ada akun bisnis. Buat akun bisnis pertama.' : 'Hubungkan database platform untuk memuat daftar bisnis.'}</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </section>
                <footer style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 14, color: '#64748b', fontSize: 12 }}><Users size={14} /> Superadmin hanya mengelola akun, status, dan koneksi database.</footer>
            </div>
        </main>
    );
}
