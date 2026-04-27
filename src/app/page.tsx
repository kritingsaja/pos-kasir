'use client';

import { useState, useEffect } from 'react';
import { formatRupiah } from '@/lib/utils';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface DashboardStats {
  total_transaksi: number;
  total_penjualan: number;
  rata_rata: number;
  topProducts: { nama: string; qty: number; total: number }[];
}

interface GraphData {
  hourly: { hour: string; total: number }[];
  daily: { date: string; day: number; total: number }[];
  monthly: { month: string; fullMonth: string; total: number }[];
}

type CustomTooltipProps = {
  active?: boolean;
  payload?: Array<{ value?: number; color?: string }>;
  label?: string;
};

function DashboardTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length && typeof payload[0]?.value === 'number') {
    return (
      <div style={{ background: 'var(--bg-primary)', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>{label}</p>
        <p style={{ margin: 0, color: payload[0].color }}>
          Penjualan: {formatRupiah(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [graphs, setGraphs] = useState<GraphData | null>(null);

  async function fetchStats() {
    try {
      const res = await fetch('/api/transactions?stats=today');
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }

  async function fetchGraphs() {
    try {
      const res = await fetch('/api/dashboard/graphs');
      const data = await res.json();
      if (data.success) {
        setGraphs(data.data);
      }
    } catch (error) {
      console.error('Error fetching graphs:', error);
    }
  }

  useEffect(() => {
    // This page intentionally fetches data on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchStats();
    void fetchGraphs();
  }, []);

  const loading = !stats || !graphs;

  const totalPenjualan = stats?.total_penjualan || 0;
  const totalTransaksi = stats?.total_transaksi || 0;

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Ringkasan penjualan hari ini</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon purple">💰</div>
          <div className="stat-value">
            {loading ? '...' : formatRupiah(totalPenjualan)}
          </div>
          <div className="stat-label">Total Penjualan Hari Ini</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">🧾</div>
          <div className="stat-value">
            {loading ? '...' : totalTransaksi}
          </div>
          <div className="stat-label">Jumlah Transaksi</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">📈</div>
          <div className="stat-value">
            {loading ? '...' : formatRupiah(Math.round(stats?.rata_rata || 0))}
          </div>
          <div className="stat-label">Rata-rata Transaksi</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">⭐</div>
          <div className="stat-value">
            {loading ? '...' : stats?.topProducts?.[0]?.nama || '-'}
          </div>
          <div className="stat-label">Produk Terlaris</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px', marginTop: '24px' }}>
        <div className="card">
          <div className="card-header">
            <h2>📈 Penjualan Hari Ini (Realtime)</h2>
          </div>
          <div style={{ height: '300px', padding: '16px' }}>
            {loading ? (
              <div className="loading" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Memuat grafik...</div>
            ) : graphs?.hourly && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={graphs.hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="hour" stroke="var(--text-muted)" fontSize={12} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={(val) => `Rp ${val / 1000}k`} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip content={DashboardTooltip as any} />
                  <Line type="monotone" dataKey="total" stroke="var(--accent-primary)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginTop: '24px' }}>
        <div className="card">
          <div className="card-header">
            <h2>📊 Penjualan Bulan Ini</h2>
          </div>
          <div style={{ height: '300px', padding: '16px' }}>
            {loading ? (
              <div className="loading" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Memuat grafik...</div>
            ) : graphs?.daily && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={graphs.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={12} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={(val) => `Rp ${val / 1000}k`} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip content={DashboardTooltip as any} />
                  <Bar dataKey="total" fill="var(--accent-secondary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>📉 Penjualan Tahun Ini</h2>
          </div>
          <div style={{ height: '300px', padding: '16px' }}>
            {loading ? (
              <div className="loading" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Memuat grafik...</div>
            ) : graphs?.monthly && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={graphs.monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={12} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={(val) => `Rp ${val / 1000}k`} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip content={DashboardTooltip as any} />
                  <Bar dataKey="total" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px', marginTop: '24px' }}>
        <div className="card">
          <div className="card-header">
            <h2>🏆 Produk Terlaris Hari Ini</h2>
          </div>
          {loading ? (
            <div className="loading" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Memuat data...
            </div>
          ) : stats?.topProducts && stats.topProducts.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Produk</th>
                    <th>Qty</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topProducts.map((p, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{p.nama}</td>
                      <td>{p.qty}</td>
                      <td>{formatRupiah(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <p>Belum ada transaksi hari ini</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
