export function formatRupiah(amount: number): string {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

export function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    }).format(date);
}

export function formatTime(timeStr: string): string {
    return timeStr;
}

export function generateTransactionId(): string {
    const now = new Date();
    const date = now.toISOString().split('T')[0].replace(/-/g, '').slice(2); // YYMMDD
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TRX-${date}-${random}`;
}

export function getTodayDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getCurrentTime(): string {
    const now = new Date();
    return now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

export interface CartItem {
    kode_barang: string;
    nama_barang: string;
    harga_jual: number;
    harga_override?: number;  // manual price override by kasir
    qty: number;
    diskon: number;
    tipe_diskon: number;
    subtotal: number;
    kategori?: string; // added for reports
    catatan?: string;  // item note
}

export interface Product {
    id: number;
    kode_barang: string;
    nama_barang: string;
    harga_jual: number;
    diskon: number;
    tipe_diskon: number;
    kategori: string;
    stok: number;
    aktif: number;
}

export interface Transaction {
    id: string;
    tanggal: string;
    waktu: string;
    items: string;
    subtotal: number;
    diskon_total: number;
    total: number;
    bayar: number;
    kembalian: number;
    metode_bayar: string;
    kasir: string;
    nama_pelanggan?: string;
    created_at: string;
}

export function calculateItemSubtotal(harga: number, qty: number, diskon: number, tipeDiskon: number): number {
    let hargaSetelahDiskon = harga;
    if (diskon > 0) {
        if (tipeDiskon === 1) {
            // Diskon rupiah
            hargaSetelahDiskon = harga - diskon;
        } else {
            // Diskon persen
            hargaSetelahDiskon = harga - (harga * diskon / 100);
        }
    }
    return Math.max(0, hargaSetelahDiskon * qty);
}
