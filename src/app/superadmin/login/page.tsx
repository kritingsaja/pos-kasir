'use client';

import { FormEvent, useState } from 'react';

export default function SuperadminLoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        setLoading(true);
        try {
            const response = await fetch('/api/superadmin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Login gagal.');
            window.location.assign('/superadmin');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Login gagal.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#f5f7fa' }}>
            <form onSubmit={submit} style={{ width: 'min(100%, 400px)', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 28, boxShadow: '0 16px 40px #0f172a12' }}>
                <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>KasirPOS Platform</div>
                <h1 style={{ margin: '8px 0', fontSize: 26, color: '#0f172a' }}>Superadmin</h1>
                <p style={{ margin: '0 0 22px', color: '#64748b', fontSize: 14 }}>Masuk untuk mengelola akun bisnis.</p>
                <label style={{ display: 'block', marginBottom: 14, color: '#334155', fontSize: 14 }}>Username
                    <input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required style={{ display: 'block', width: '100%', marginTop: 6, padding: '11px 12px', border: '1px solid #cbd5e1', borderRadius: 8 }} />
                </label>
                <label style={{ display: 'block', marginBottom: 16, color: '#334155', fontSize: 14 }}>Password
                    <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required style={{ display: 'block', width: '100%', marginTop: 6, padding: '11px 12px', border: '1px solid #cbd5e1', borderRadius: 8 }} />
                </label>
                {error && <p role="alert" style={{ color: '#b91c1c', fontSize: 13, margin: '0 0 14px' }}>{error}</p>}
                <button disabled={loading} style={{ width: '100%', padding: 12, color: '#fff', background: '#0f766e', border: 0, borderRadius: 8, fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>{loading ? 'Memeriksa…' : 'Masuk'}</button>
            </form>
        </main>
    );
}
