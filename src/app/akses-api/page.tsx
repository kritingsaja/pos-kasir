'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, KeyRound, Plus, RefreshCw, ShieldOff, Utensils, ShoppingBag } from 'lucide-react';
import '../admin.css';

type Scope = 'menu' | 'orders';
interface KeyRow { id: string; name: string; scope: Scope; prefix: string; created_at: number; expires_at: number; revoked_at: number | null; last_used_at: number | null; }
const formatDate = (value: number | null) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(new Date(value)) : '-';

export default function ApiAccessPage() {
    const [scope, setScope] = useState<Scope>('menu');
    const [keys, setKeys] = useState<KeyRow[]>([]);
    const [name, setName] = useState('');
    const [days, setDays] = useState(90);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const mutation = useRef(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [revision, setRevision] = useState(0);
    const [secret, setSecret] = useState<{ token: string; name: string; scope: Scope } | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            setLoading(true); setError('');
            try {
                const response = await fetch('/api/admin/api-keys', { cache: 'no-store', signal: controller.signal });
                const body = await response.json();
                if (!response.ok || !body.success) throw new Error(body.error || 'Daftar key gagal dimuat.');
                setKeys(body.data);
            } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Koneksi terputus.'); }
            finally { if (!controller.signal.aborted) setLoading(false); }
        }
        void load();
        return () => controller.abort();
    }, [revision]);
    async function create(event: React.FormEvent) {
        event.preventDefault();
        if (mutation.current || secret) return;
        mutation.current = true; setBusy(true); setError(''); setNotice('');
        try {
            const response = await fetch('/api/admin/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), scope, days }) });
            const body = await response.json();
            if (!response.ok || !body.success) throw new Error(body.error || 'Key gagal dibuat.');
            setSecret({ token: body.data.token, name: name.trim(), scope }); setName(''); setRevision(r => r + 1);
        } catch (e) { setError(e instanceof Error ? e.message : 'Koneksi terputus. Muat ulang daftar key sebelum mencoba lagi.'); }
        finally { mutation.current = false; setBusy(false); }
    }
    async function revoke(key: KeyRow) {
        if (mutation.current || !window.confirm(`Cabut akses "${key.name}"? Aplikasi yang memakai key ini tidak dapat mengakses API lagi.`)) return;
        mutation.current = true; setBusy(true); setError(''); setNotice('');
        try {
            const response = await fetch(`/api/admin/api-keys?id=${encodeURIComponent(key.id)}`, { method: 'DELETE' });
            const body = await response.json();
            if (!response.ok || !body.success) throw new Error(body.error || 'Akses gagal dicabut.');
            setNotice('Akses berhasil dicabut.'); setRevision(r => r + 1);
        } catch (e) { setError(e instanceof Error ? e.message : 'Koneksi terputus.'); }
        finally { mutation.current = false; setBusy(false); }
    }
    async function copySecret() {
        if (!secret) return;
        try { await navigator.clipboard.writeText(secret.token); setNotice('API key tersalin.'); }
        catch { setNotice('Clipboard tidak tersedia. Pilih dan salin key dari kolom di atas.'); }
    }
    const visible = keys.filter(key => key.scope === scope);
    const method = scope === 'menu' ? 'GET' : 'POST';
    const endpoint = `/api/v1/${scope}`;
    const example = scope === 'menu'
        ? `GET /api/v1/menu?limit=50&offset=0\nAuthorization: Bearer <MENU_API_KEY>`
        : `POST /api/v1/orders\nAuthorization: Bearer <ORDERS_API_KEY>\nContent-Type: application/json\nIdempotency-Key: order-20260922-0001\n\n${JSON.stringify({ nama_pelanggan: 'Meja 5', items: [{ kode_barang: 'KODE_MENU', qty: 2, catatan: 'Less sugar' }] }, null, 2)}`;
    return <div className="admin-workspace">
        <header className="admin-header"><div><p className="admin-eyebrow">INTEGRASI</p><h1>Akses API</h1><p>Menu & pesanan</p></div><button className="admin-icon" title="Muat ulang akses" aria-label="Muat ulang akses" disabled={loading || busy} onClick={() => setRevision(r => r + 1)}><RefreshCw size={18} className={loading ? 'admin-spin' : ''} /></button></header>
        <div className="admin-tabs" role="tablist" aria-label="Jenis akses API" onKeyDown={event => {
            if (busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 'menu' : event.key === 'End' ? 'orders' : scope === 'menu' ? 'orders' : 'menu';
            setScope(next);
            document.getElementById(`tab-${next}`)?.focus();
        }}>
            {([{ id: 'menu', label: 'Data Menu', icon: Utensils }, { id: 'orders', label: 'Pesanan', icon: ShoppingBag }] as const).map(tab => <button id={`tab-${tab.id}`} key={tab.id} role="tab" tabIndex={scope === tab.id ? 0 : -1} aria-controls="api-panel" aria-selected={scope === tab.id} disabled={busy} onClick={() => setScope(tab.id)}><tab.icon size={18} />{tab.label}</button>)}
        </div>
        {secret && <section className="admin-secret" aria-label="API key baru"><h2>Key {secret.scope === 'menu' ? 'Menu' : 'Pesanan'}: {secret.name}</h2><p>Key hanya ditampilkan sekali. Simpan secara privat; jangan letakkan di frontend aplikasi.</p><div className="admin-actions"><input aria-label="API key baru" readOnly value={secret.token} onFocus={e => e.currentTarget.select()} autoComplete="off" /><button className="admin-icon" title="Salin API key" aria-label="Salin API key" onClick={copySecret}><Copy size={18} /></button><button className="admin-icon" title="Sudah disimpan, tutup key" aria-label="Sudah disimpan, tutup key" onClick={() => { setSecret(null); setNotice(''); }}><Check size={18} /></button></div></section>}
        {error && <div className="admin-alert" role="alert">{error}</div>}
        <p className="admin-feedback" role="status">{notice}</p>
        <div id="api-panel" role="tabpanel" aria-labelledby={`tab-${scope}`}>
            <section className="admin-section"><div className="admin-section-heading"><h2>{scope === 'menu' ? 'Baca menu' : 'Buat pesanan'}</h2><span className="admin-muted">120 request / menit / key</span></div>
                <div className="admin-endpoint"><span className="admin-status">{method}</span><code>{endpoint}</code><span className="admin-muted">{scope === 'menu' ? 'Read-only' : 'Draft / belum dibayar'}</span></div>
                <details><summary>Referensi request</summary><pre>{example}</pre><p className="admin-muted">{scope === 'menu' ? 'Pagination: limit 1-100, offset mulai 0. tersedia mengikuti menu kosong harian (WIB).' : 'Idempotency-Key: unik per pesanan, tetap sama saat retry. Harga dihitung server. Pembayaran tetap melalui kasir.'}</p></details>
            </section>
            <form className="admin-key-form" onSubmit={create}><label>Nama akses<input required maxLength={80} placeholder="Nama aplikasi / mitra" value={name} onChange={e => setName(e.target.value)} disabled={busy || !!secret} /></label><label>Masa berlaku<select value={days} onChange={e => setDays(Number(e.target.value))} disabled={busy || !!secret}><option value={30}>30 hari</option><option value={90}>90 hari</option><option value={365}>1 tahun</option></select></label><button className="admin-button" type="submit" disabled={busy || !!secret || !name.trim()}><Plus size={18} />{busy ? 'Memproses...' : 'Buat API key'}</button></form>
            <section className="admin-section"><div className="admin-section-heading"><h2>Daftar akses</h2><KeyRound size={18} className="admin-green" /></div><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Nama / key</th><th>Status</th><th>Dibuat</th><th>Berlaku sampai</th><th>Terakhir dipakai</th><th>Aksi</th></tr></thead><tbody>
                {!loading && visible.map(key => { const inactive = !!key.revoked_at || key.expires_at <= Date.now(); return <tr key={key.id}><td><strong>{key.name}</strong><br /><code className="admin-muted">{key.prefix}</code></td><td><span className={`admin-status ${inactive ? 'inactive' : ''}`}>{key.revoked_at ? 'Dicabut' : inactive ? 'Kedaluwarsa' : 'Aktif'}</span></td><td>{formatDate(key.created_at)}</td><td>{formatDate(key.expires_at)}</td><td>{key.last_used_at ? formatDate(key.last_used_at) : 'Belum dipakai'}</td><td><button className="admin-icon" title={`Cabut akses ${key.name}`} aria-label={`Cabut akses ${key.name}`} disabled={busy || inactive} onClick={() => revoke(key)}><ShieldOff size={17} /></button></td></tr>; })}
                {(loading || !visible.length) && <tr><td colSpan={6} className="admin-empty">{loading ? 'Memuat akses...' : error ? 'Daftar akses tidak tersedia' : 'Belum ada API key'}</td></tr>}
            </tbody></table></div></section>
        </div>
    </div>;
}
