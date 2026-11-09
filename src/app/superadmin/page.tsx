'use client';

import { useState } from 'react';

export default function SuperadminDashboard() {
    const [busy, setBusy] = useState(false);

    async function logout() {
        setBusy(true);
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.assign('/superadmin/login');
        } finally {
            setBusy(false);
        }
    }

    return (
        <main style={{ minHeight: '100vh', background: '#f5f7fa', padding: '32px clamp(16px, 5vw, 64px)', color: '#0f172a' }}>
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 18 }}>
                <div><div style={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>KasirPOS Platform</div><h1 style={{ margin: '6px 0 0', fontSize: 28 }}>Superadmin</h1></div>
                <button onClick={logout} disabled={busy} style={{ padding: '9px 14px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }}>{busy ? 'Keluar…' : 'Keluar'}</button>
            </header>
            <section style={{ maxWidth: 860, margin: '32px auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 24 }}>
                <h2 style={{ marginTop: 0, fontSize: 20 }}>Akun bisnis</h2>
                <p style={{ color: '#475569', lineHeight: 1.6 }}>Login Superadmin sudah aktif. Pengelolaan akun bisnis belum diaktifkan karena database platform dan provisioning database per bisnis belum dikonfigurasi.</p>
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: 14, color: '#9a3412', fontSize: 14 }}>
                    Belum bisa membuat akun bisnis dari halaman ini. Data kasir lama tetap menggunakan database saat ini.
                </div>
            </section>
        </main>
    );
}
