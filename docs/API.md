# API Menu dan Pesanan

Base URL produksi: `https://kasir.teacocafe.my.id`.

Admin membuat key di **Akses API**. Key Menu dan Pesanan terpisah. Key hanya
ditampilkan satu kali, disimpan sebagai hash SHA-256, bisa dicabut, dan berlaku
30/90/365 hari. `JWT_SECRET` wajib diset untuk pengelolaan admin. Tabel tambahan
`integration_keys` dan `integration_orders` dibuat otomatis tanpa mengubah data lama.

Gunakan API dari backend aplikasi lain dengan HTTPS. Jangan menyimpan key di
JavaScript publik, URL, atau repository. Tidak ada akses langsung database atau
CORS untuk browser pihak ketiga. Batas 120 request/menit/key. Response tidak dicache.

## Baca Menu

```http
GET /api/v1/menu?limit=50&offset=0
Authorization: Bearer <MENU_API_KEY>
```

Response: `{ "success": true, "data": [...], "pagination": { "limit": 50,
"offset": 0, "has_more": false } }`.

Setiap menu berisi `kode_barang`, `nama_barang`, `harga_jual`, `diskon`,
`tipe_diskon` (1 = rupiah per item, selainnya persen), `kategori`, `tersedia`.
Hanya menu aktif ditampilkan. `tersedia` mengikuti menu kosong harian Asia/Jakarta.
Naikkan offset sebanyak limit selama `has_more` bernilai true. Limit 1-100.

## Buat Pesanan

```http
POST /api/v1/orders
Authorization: Bearer <ORDERS_API_KEY>
Content-Type: application/json
Idempotency-Key: order-mitra-000001

{
  "source": "booking",
  "tanggal_pesanan": "2026-02-10",
  "nama_pelanggan": "ASDSA · 10/02 · INDOOR-SOFA · ADD70A22",
  "items": [
    { "kode_barang": "KODE_DARI_API_MENU", "qty": 2, "catatan": "Less sugar" }
  ]
}
```

`tanggal_pesanan` wajib YYYY-MM-DD (jika tidak dikirim, tanggal hari ini Asia/Jakarta). Nama wajib 1-80 karakter, 1-50 menu berbeda, qty integer 1-100/menu,
catatan opsional maksimal 300 karakter. Harga, diskon dan total dihitung server;
harga dari aplikasi pemanggil diabaikan. Menu nonaktif/kosong ditolak.

Response baru (201):

```json
{"success":true,"data":{"draft_id":123,"total":28000,"duplicate":false,"status":"pending_payment"}}
```

Jika `source` bernilai `booking`, draft menggunakan prefix `BOOKING -` dan tanggal pesanan mengikuti `tanggal_pesanan` (tanggal kunjungan booking). Nama
pelanggan berisi ringkasan reservasi: nama pelanggan, tanggal kunjungan,
zona/lokasi meja, dan 8 karakter terakhir kode booking. Tanpa `source` atau
dengan nilai `api`, prefix tetap `API -`. Pesanan bukan transaksi lunas.
Buka menu Draft di kasir untuk mengambil daftar terbaru dan melanjutkan pembayaran
Cash/QRIS seperti biasa. API tidak memberikan akses riwayat penjualan dan tidak
menandai pembayaran lunas.

Untuk mengganti isi draft reservasi yang sama (misalnya pelanggan menambah atau
mengubah pilihan menu), gunakan `PUT /api/v1/orders` dengan API key dan
`Idempotency-Key` yang sama. Isi draft pada kasir akan **ditimpa** dengan daftar
menu terbaru, tetapi `draft_id` tetap sama sehingga tidak membuat draft ganda.
Jika draft sebelumnya sudah tidak ada di kasir, API mengembalikan `409` dan
tidak membuat draft duplikat. `POST` tetap menggunakan perilaku idempotensi
ketat: kunci yang sama dengan payload berbeda ditolak.

Simpan Idempotency-Key unik untuk setiap pesanan, 8-100 karakter `[a-zA-Z0-9._:-]`.
Saat timeout/retry, gunakan key dan payload yang sama: response 200, duplicate true,
draft_id tetap, tidak menambah draft. Key sama dengan payload berbeda menghasilkan
409. Idempotensi terikat API key; jangan mengganti API key pada retry pesanan lama.
Referensi deduplikasi tetap disimpan setelah draft dibayar/dihapus. Response retry
menggambarkan penerimaan awal, bukan status pembayaran terbaru.

## Error

Format `{ "success": false, "error": "..." }`.

- 400: JSON, input, pagination atau Idempotency-Key tidak valid.
- 401: key tidak valid, kedaluwarsa atau dicabut.
- 403: scope salah / bukan admin untuk endpoint admin.
- 409: menu tidak tersedia atau konflik Idempotency-Key.
- 413: payload lebih dari 32 KiB.
- 429: rate limit. Tunggu sampai menit berikutnya, ulangi dengan Idempotency-Key yang sama.
- 500/503: layanan atau konfigurasi bermasalah; jangan ganti Idempotency-Key saat retry.
- 405: metode tidak didukung (Menu hanya GET, Pesanan hanya POST).

## Checkpoint

Sebelum fitur: `032b53eb6135f39343e959c63cedc7f4dbeaed5b`.
Rollback kode tidak menghapus draft/pesanan yang sudah diterima. Cabut key aktif
sebelum menonaktifkan integrasi. Tabel baru boleh tetap ada saat rollback.

Tes: `node --test tests/*.test.cjs`, `npx tsc --noEmit`, `npm run build`.
