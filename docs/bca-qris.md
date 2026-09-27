# Pengecekan QRIS BCA

Endpoint: `/api/cek-mutasi-bca`, Next.js App Router, Node.js, maksimal 120 detik. Login BCA dilakukan pada sesi Chromium baru, menggunakan `BCA_USER` dan `BCA_PASS` di server. Cookie BCA tidak dikirim ke PWA.

## Mengaktifkan di Vercel

1. Tambahkan `BCA_USER` dan `BCA_PASS` untuk environment **Preview**. MID dibaca dari profil QRMS sehingga tidak memerlukan environment variable.
2. Pastikan Preview memiliki `JWT_SECRET` yang sama dengan autentikasi POS, URL/token Turso, dan QRIS yang benar pada Pengaturan. Jika mengganti JWT_SECRET, login ulang ke POS.
3. Deploy ulang branch `codex/bca-qris-check` setelah mengubah environment variables.
4. Pada checkout QRIS, tekan **Muat** untuk melihat 10 mutasi terbaru. Daftar hanya menampilkan RRN dan jumlah.
5. Tekan **Cek Pembayaran QRIS**. Satu kandidat cocok membuat QRIS terverifikasi. Beberapa kandidat memerlukan pilihan RRN sesuai bukti pelanggan.
6. Untuk pembayaran gabungan, masukkan tunai yang benar-benar diterima. Status LUNAS muncul setelah nominal tunai cukup. Tekan **Simpan Pembayaran** untuk membukukan transaksi.

Konfirmasi manual tetap tersedia saat pengecekan portal belum tersedia. Pembayaran terverifikasi BCA harus disimpan online; endpoint transaksi memvalidasi claim dan membukukan penjualan serta referensi dalam satu transaksi database.

Mengaktifkan JWT_SECRET pada Preview membatalkan sesi yang sebelumnya memakai fallback. Endpoint login dan logout tetap dapat diakses ketika cookie lama tidak valid, sehingga pengguna dapat login ulang tanpa menghapus data kasir atau mengganti password. Endpoint lain tetap memvalidasi sesi.

## Jika tombol cek tidak bereaksi

Tombol sekarang selalu memberi pesan ketika ditekan, kecuali sedang memproses atau QRIS sudah terverifikasi. Status konfigurasi mempunyai timeout 12 detik dan diperiksa ulang setiap klik. Respons non-JSON, sesi kasir berakhir, akses preview ditolak, serta konfigurasi belum lengkap ditampilkan sebagai pesan.

Untuk diagnosis, buka `/api/cek-mutasi-bca` pada preview yang sudah login POS. Respons GET hanya menampilkan `configured`, `message`, dan `missing` (nama environment variable yang belum ada), tanpa nilai rahasia. BCA_USER/BCA_PASS saja belum cukup jika JWT_SECRET belum dipasang. Setelah menambah JWT_SECRET, redeploy dan login ulang ke POS. Variabel harus tersedia pada environment Preview untuk branch ini, bukan hanya Production.

Log endpoint menggunakan event `bca.configuration`, `bca.check.start`, `bca.check.progress`, `bca.check.finish` dan `bca.check.error`. Tahap scraper dicatat tanpa password, cookie bank, RRN, nama pelanggan atau body transaksi. Kesalahan dapat ditelusuri dengan requestId dan kode error.

Saat POST gagal, respons juga berisi `code`, `stage`, dan `requestId`. PWA menampilkannya pada **Detail error**. Kirim pesan dan detail tersebut untuk diagnosis, tanpa mengirim kredensial. Kegagalan memuat dependensi, menjalankan Chromium, membuka halaman/form login, mengirim login, membaca profil dan membaca mutasi mempunyai pesan berbeda. `BCA_LOGIN_FAILED` hanya menyatakan proses login belum berhasil, bukan bukti password salah atau portal memblokir server. Kegagalan sebelum `logging_in` berarti login belum dicoba.

## Pencocokan dan penyimpanan

- Timestamp dibuat ketika checkout QRIS dibuka, dipertahankan untuk retry, dan diperbarui bila keranjang/nominal/merchant berubah.
- Pencocokan memakai bagian QRIS dari total dan jendela ±10 menit pada zona WIB.
- Portal hanya menampilkan menit, sehingga pencocokan memakai interval menit. Tidak mengarang detik.
- Daftar tampilan dibatasi 10, tetapi matching memakai semua baris pada tanggal yang relevan, termasuk dua tanggal jika melewati tengah malam.
- Baris harus menyatakan menerima pembayaran, nominal positif, dan NMID harus sama dengan QRIS pada Pengaturan. Portal tidak menyediakan status settlement terpisah; bukti diberi status `PENERIMAAN_TERCATAT`.
- Claim unik berdasarkan checkoutId serta NMID/tanggal/RRN. RRN tidak dapat dialokasikan ke dua checkout atau dibukukan pada dua penjualan.
- Lock database membatasi satu login scraper pada satu akun dalam proyek/database yang sama. Timeout tidak meninggalkan lock permanen.
- Retry dengan checkoutId yang sama mengembalikan claim yang tersimpan. Jangan mengganti ID atau menghapus claim untuk memaksa pemakaian ulang pembayaran.
- Referensi yang telah dibukukan disimpan pada `transactions.rincian_bayar.bca` bersama RRN, NMID, tanggal, waktu, dan waktu pengecekan.
- Transaksi yang sudah dikonfirmasi manual sebelum integrasi belum mempunyai claim; lakukan rekonsiliasi sebelum mengandalkan pencocokan otomatis untuk mutasi lama.

## Batas operasional

Login backend dan Chromium Linux di Vercel masih memerlukan pemeriksaan pada preview. DOM authenticated diamati tanggal 27 September 2026; perubahan portal bisa menyebabkan error `PORTAL_CHANGED`/`BCA_UNAVAILABLE`. Gagal membaca portal tidak dianggap pembayaran belum ditemukan. CAPTCHA/OTP tidak dilewati; gunakan pemeriksaan manual jika bank memintanya. Perilaku login bersamaan dengan portal yang dibuka kasir belum diketahui.

Chromium 153.0.0 dipasangkan dengan Puppeteer Core 25.11.0. Chromium ini untuk Linux serverless dan tidak dijalankan langsung pada Windows. Next.js mengexternalisasi kedua paket dan menyertakan berkas bin pada tracing route. API dan PWA tidak menyimpan hasil di cache jaringan.

## Titik kembali

Versi sebelum integrasi: `634687ccc1a0947a015759f15272243654303a56` di main. Selama PR belum digabung, produksi tetap menggunakan versi ini. Setelah digabung, rollback kode dengan revert commit integrasi dan redeploy. Jangan menghapus tabel claim saat rollback; catatan tersebut mencegah pembayaran yang sama digunakan lagi.

Referensi: [Puppeteer supported browsers](https://pptr.dev/supported-browsers), [Chromium serverless](https://github.com/Sparticuz/chromium), [Vercel function limits](https://vercel.com/docs/functions/limitations).
