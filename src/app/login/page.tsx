'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                // Redirect based on role
                if (data.data.role === 'Superadmin') {
                    router.push('/superadmin');
                } else if (data.data.role === 'Kasir') {
                    router.push('/kasir');
                } else {
                    router.push('/');
                }
            } else {
                setError(data.error || 'Login gagal');
            }
        } catch {
            setError('Terjadi kesalahan, coba lagi');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            background: 'var(--bg-primary)'
        }}>
            <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '32px' }}>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>💰</div>
                    <h1 style={{ margin: 0, color: 'var(--text-primary)' }}>KasirPOS</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Masuk ke akun {storeName}</p>
                </div>

                {error && (
                    <div style={{
                        background: 'var(--bg-danger)',
                        color: 'var(--text-danger)',
                        padding: '12px',
                        borderRadius: '8px',
                        marginBottom: '16px',
                        fontSize: '14px',
                        textAlign: 'center'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="form-group">
                        <label>Username</label>
                        <input
                            type="text"
                            className="form-control"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            placeholder="Masukkan username..."
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="login-password">Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                id="login-password"
                                type={showPassword ? 'text' : 'password'}
                                className="form-control"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                placeholder="Masukkan password..."
                                style={{ paddingRight: 76 }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(value => !value)}
                                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                                aria-pressed={showPassword}
                                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', color: 'var(--text-muted)', padding: '6px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                            >
                                {showPassword ? 'Sembunyikan' : 'Lihat'}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ marginTop: '8px', width: '100%', padding: '12px', fontSize: '16px' }}
                    >
                        {loading ? 'Memproses...' : 'Masuk'}
                    </button>
                </form>
            </div>
        </div>
    );
}
