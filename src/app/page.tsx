'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Banknote, KeyRound, Package, QrCode, ReceiptText, RefreshCw, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatRupiah } from '@/lib/utils';
import './admin.css';

interface Overview {
  date: string; total: number; count: number; cash: number; qris: number; other: number;
  cashCount: number; qrisCount: number; average: number; activeMenus: number; drafts: number;
  topProducts: { nama: string; qty: number; total: number }[];
  recent: { id: string; waktu: string; total: number; metode_bayar: string; nama_pelanggan: string }[];
  graphs: Record<'hourly' | 'daily' | 'monthly', { label: string; total: number }[]>;
}
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()); }

export default function DashboardPage() {
  const [date, setDate] = useState(today);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [period, setPeriod] = useState<'hourly' | 'daily' | 'monthly'>('hourly');
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      setLoading(true); setError('');
      try {
        const response = await fetch(`/api/admin/overview?date=${date}`, { cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.error || 'Ringkasan gagal dimuat.');
        setData(body.data);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Koneksi terputus.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void refresh();
    return () => controller.abort();
  }, [date, revision]);
  const ready = !loading && !error && data?.date === date && data;
  return (
    <div className="admin-workspace">
      <header className="admin-header">
        <div><p className="admin-eyebrow">ADMINISTRASI</p><h1>Dashboard</h1><p>Penjualan & operasional</p></div>
        <div className="admin-actions">
          <input aria-label="Tanggal ringkasan" type="date" value={date} max={today()} onChange={e => e.target.value && setDate(e.target.value)} />
          <button className="admin-icon" title="Muat ulang ringkasan" aria-label="Muat ulang ringkasan" disabled={loading} onClick={() => setRevision(r => r + 1)}><RefreshCw size={18} className={loading ? 'admin-spin' : ''} /></button>
        </div>
      </header>
      {error && <div className="admin-alert" role="alert">{error}<button onClick={() => setRevision(r => r + 1)}>Coba lagi</button></div>}
      <section className="admin-metrics" aria-label="Ringkasan penjualan" aria-busy={loading}>
        {[
          { label: 'Total penjualan', value: formatRupiah(data?.total || 0), note: 'Transaksi lunas', icon: Wallet, color: 'green' },
          { label: 'Cash', value: formatRupiah(data?.cash || 0), note: `${data?.cashCount || 0} transaksi`, icon: Banknote, color: 'blue' },
          { label: 'QRIS', value: formatRupiah(data?.qris || 0), note: `${data?.qrisCount || 0} transaksi`, icon: QrCode, color: 'pink' },
          { label: 'Transaksi', value: String(data?.count || 0), note: `Rata-rata ${formatRupiah(data?.average || 0)}`, icon: ReceiptText, color: 'green' },
        ].map(item => <article className="admin-metric" key={item.label}><div><span>{item.label}</span><item.icon size={19} className={`admin-${item.color}`} /></div><strong>{ready ? item.value : loading ? '...' : '-'}</strong><small>{ready ? item.note : ' '}</small></article>)}
      </section>
      {ready && data.other > 0 && <p className="admin-muted">Metode pembayaran lainnya: {formatRupiah(data.other)}</p>}
      <nav className="admin-shortcuts" aria-label="Menu admin">
        <Link href="/produk"><Package size={19} /><span>Data menu <small>{ready ? `${data.activeMenus} aktif` : ''}</small></span><ArrowUpRight size={17} /></Link>
        <Link href="/laporan"><ReceiptText size={19} /><span>Laporan penjualan <small>{ready ? `${data.drafts} draft belum dibayar` : ''}</small></span><ArrowUpRight size={17} /></Link>
        <Link href="/akses-api"><KeyRound size={19} /><span>Akses API <small>Menu & pesanan</small></span><ArrowUpRight size={17} /></Link>
      </nav>
      <div className="admin-columns">
        <section className="admin-section">
          <div className="admin-section-heading"><div><h2>Tren penjualan</h2><p>{period === 'hourly' ? date : period === 'daily' ? date.slice(0, 7) : date.slice(0, 4)} <span className="admin-muted">/ WIB</span></p></div>
            <div className="admin-segment" role="group" aria-label="Periode grafik">{([{ id: 'hourly', label: 'Hari' }, { id: 'daily', label: 'Bulan' }, { id: 'monthly', label: 'Tahun' }] as const).map(p => <button key={p.id} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>)}</div>
          </div>
          <div className="admin-chart">{ready ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data.graphs[period]} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e5e9e8" /><XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} /><YAxis width={58} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={value => `${Number(value) / 1000} rb`} /><Tooltip formatter={value => [formatRupiah(Number(value)), 'Penjualan']} cursor={{ fill: '#f0f5f2' }} /><Bar dataKey="total" fill="#278368" radius={[3, 3, 0, 0]} maxBarSize={32} /></BarChart></ResponsiveContainer> : <div className="admin-empty">{loading ? 'Memuat ringkasan...' : 'Ringkasan tidak tersedia'}</div>}</div>
        </section>
        <section className="admin-section"><div className="admin-section-heading"><h2>Menu terlaris</h2><span className="admin-muted">{date}</span></div>
          {ready && data.topProducts.length ? <ol className="admin-top-list">{data.topProducts.map((p, i) => <li key={`${i}-${p.nama}`}><span className="admin-rank">{String(i + 1).padStart(2, '0')}</span><div><strong>{p.nama}</strong><small>{formatRupiah(p.total)}</small></div><b>{p.qty} <small>item</small></b></li>)}</ol> : <p className="admin-empty">{loading ? 'Memuat...' : error ? 'Data tidak tersedia' : 'Belum ada menu terjual'}</p>}
        </section>
      </div>
      <section className="admin-section"><div className="admin-section-heading"><h2>Transaksi terbaru</h2><Link href="/laporan" className="admin-text-link">Laporan <ArrowUpRight size={15} /></Link></div>
        <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Transaksi</th><th>Waktu</th><th>Pelanggan</th><th>Pembayaran</th><th className="admin-number">Total</th></tr></thead><tbody>
          {ready && data.recent.map(t => <tr key={t.id}><td className="admin-code">{t.id}</td><td>{t.waktu}</td><td>{t.nama_pelanggan || '-'}</td><td><span className={`admin-status ${t.metode_bayar?.toLowerCase() === 'qris' ? 'pink' : ''}`}>{t.metode_bayar?.toLowerCase() === 'qris' ? 'QRIS' : ['tunai','cash'].includes(t.metode_bayar?.toLowerCase()) || !t.metode_bayar ? 'Cash' : t.metode_bayar}</span></td><td className="admin-number">{formatRupiah(Number(t.total))}</td></tr>)}
          {(!ready || !data.recent.length) && <tr><td colSpan={5} className="admin-empty">{loading ? 'Memuat...' : error ? 'Data tidak tersedia' : 'Belum ada transaksi pada tanggal ini'}</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );
}
