import { getTodayStats } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function BosPage() {
  const stats = await getTodayStats();
  const cash = Number(stats?.total_cash || 0);
  const qris = Number(stats?.total_qris || 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-100 rounded-full opacity-50 blur-2xl"></div>
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-indigo-100 rounded-full opacity-50 blur-2xl"></div>
        <div className="relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 text-white rounded-full mb-3 shadow-md">💰</div>
          <h1 className="text-xl font-bold text-gray-800 mb-1">Ringkasan Bos</h1>
          <p className="text-xs text-gray-500 mb-6 font-medium">Hari Ini • {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-5 mb-4 shadow-md text-white">
            <p className="text-xs text-blue-100 font-medium mb-1">Total Pendapatan</p>
            <h2 className="text-2xl font-extrabold tracking-tight">Rp {Number(stats?.total_penjualan || 0).toLocaleString('id-ID')}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3 text-left">
            <div className="bg-green-50 rounded-xl p-3 border border-green-100">
              <p className="text-[10px] text-green-700 uppercase font-bold tracking-wider">Cash</p>
              <p className="text-lg font-bold text-gray-800">Rp {cash.toLocaleString('id-ID')}</p>
            </div>
            <div className="bg-sky-50 rounded-xl p-3 border border-sky-100">
              <p className="text-[10px] text-sky-700 uppercase font-bold tracking-wider">QRIS</p>
              <p className="text-lg font-bold text-gray-800">Rp {qris.toLocaleString('id-ID')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-left">
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Transaksi</p>
              <p className="text-lg font-bold text-gray-800">{Number(stats?.total_transaksi || 0)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Rata-rata</p>
              <p className="text-lg font-bold text-gray-800">Rp {Number(stats?.rata_rata || 0).toLocaleString('id-ID')}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-8 text-center"><Link href="/login" className="text-sm font-medium text-blue-600 hover:text-blue-800 bg-white/50 px-4 py-2 rounded-full shadow-sm">← Kembali ke Login</Link></div>
    </div>
  );
}
