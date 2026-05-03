import { getTodayStats } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function BosPage() {
  const stats = await getTodayStats();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-100 rounded-full opacity-50 blur-2xl"></div>
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-indigo-100 rounded-full opacity-50 blur-2xl"></div>
        
        <div className="relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 text-white rounded-full mb-3 shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          
          <h1 className="text-xl font-bold text-gray-800 mb-1">Ringkasan Bos</h1>
          <p className="text-xs text-gray-500 mb-6 font-medium">Hari Ini • {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-5 mb-6 shadow-md text-white transform transition-transform hover:scale-105 duration-300">
            <p className="text-xs text-blue-100 font-medium mb-1">Total Pendapatan</p>
            <h2 className="text-2xl font-extrabold tracking-tight">
              Rp {Number(stats?.total_penjualan || 0).toLocaleString('id-ID')}
            </h2>
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-left">
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center space-x-1.5 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Transaksi</p>
              </div>
              <p className="text-lg font-bold text-gray-800">{Number(stats?.total_transaksi || 0)}</p>
            </div>
            
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center space-x-1.5 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Rata-rata</p>
              </div>
              <p className="text-lg font-bold text-gray-800">Rp {Number(stats?.rata_rata || 0).toLocaleString('id-ID')}</p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-8 text-center">
        <Link href="/login" className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors bg-white/50 px-4 py-2 rounded-full shadow-sm hover:shadow">
          ← Kembali ke Login
        </Link>
      </div>
    </div>
  );
}
