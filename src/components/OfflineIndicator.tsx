"use client";

import { useOfflineSync } from '@/lib/useOfflineSync';

export default function OfflineIndicator() {
  const { isOnline, pendingCount, triggerSync } = useOfflineSync();

  if (isOnline && pendingCount === 0) return null;

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 text-white text-sm py-2 px-4 flex justify-between items-center transition-colors ${isOnline ? 'bg-orange-500' : 'bg-red-600'}`}>
      <div>
        {!isOnline ? (
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            Anda sedang offline. Transaksi akan disimpan di perangkat ini.
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            Koneksi pulih. Ada {pendingCount} transaksi yang menunggu sinkronisasi.
          </span>
        )}
      </div>
      {isOnline && pendingCount > 0 && (
        <button 
          onClick={triggerSync}
          className="bg-white text-orange-600 px-3 py-1 rounded text-xs font-bold hover:bg-orange-50 transition-colors"
        >
          Sinkronkan Sekarang
        </button>
      )}
    </div>
  );
}
