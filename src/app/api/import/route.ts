import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import * as XLSX from 'xlsx';

function normalizeCategory(str: string) {
    if (!str) return '';
    const s = str.trim().toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// Handle Excel (.xlsx/.xls) upload
export async function POST(request: Request) {
    try {
        const contentType = request.headers.get('content-type') || '';

        let products: any[] = [];
        let categories: any[] = [];

        if (contentType.includes('multipart/form-data')) {
            // Excel file upload
            const formData = await request.formData();
            const file = formData.get('file') as File | null;
            const unlimitedStock = formData.get('unlimited_stock') === '1';

            if (!file) {
                return NextResponse.json({ success: false, error: 'Tidak ada file yang diupload' }, { status: 400 });
            }

            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });

            // Read sheet "Produk" or first sheet
            const sheetName = workbook.SheetNames.includes('Produk')
                ? 'Produk'
                : workbook.SheetNames[0];

            const sheet = workbook.Sheets[sheetName];
            const rows: any[] = XLSX.utils.sheet_to_json(sheet);

            products = rows.map((row: any) => {
                const normalizedRow: any = {};
                for (const key in row) {
                    if (row.hasOwnProperty(key)) {
                        const normKey = key.toLowerCase().replace(/[\s_]+/g, '');
                        normalizedRow[normKey] = row[key];
                    }
                }

                return {
                    kode_barang: String(normalizedRow['kodebarang'] || '').trim(),
                    nama_barang: String(normalizedRow['namabarang'] || '').trim(),
                    harga_jual: Number(normalizedRow['hargajual'] || 0),
                    diskon: Number(normalizedRow['diskon'] || 0),
                    tipe_diskon: Number(normalizedRow['tipediskon'] || 1),
                    kategori: normalizeCategory(String(normalizedRow['kategori'] || '')),
                    stok: unlimitedStock ? 999999 : Number(normalizedRow['stok'] || 0),
                };
            }).filter(p => p.kode_barang && p.nama_barang);
            // Read "Kategori" sheet if it exists
            if (workbook.SheetNames.includes('Kategori')) {
                const catSheet = workbook.Sheets['Kategori'];
                const catRows: any[] = XLSX.utils.sheet_to_json(catSheet);
                categories = catRows.map((row: any) => ({
                    nama: normalizeCategory(String(row['Nama'] || row['nama'] || ''))
                })).filter(c => c.nama);
            // Collect unique categories from products to auto-populate categories table
            const uniqueCats = new Set<string>();
            products.forEach(p => { if (p.kategori) uniqueCats.add(p.kategori); });
                uniqueCats.forEach(name => {
                    if (!categories.find(c => c.nama === name)) {
                        categories.push({ nama: name });
                    }
                });
            }
        } else {
            // JSON body (backward compat)
            const body = await request.json();
            products = body.products || [];
            categories = body.categories || [];
        }

        const db = getDb();

        const importProcess = db.transaction(() => {
            if (categories && Array.isArray(categories)) {
                const insertCat = db.prepare('INSERT OR IGNORE INTO categories (nama) VALUES (?)');
                for (const cat of categories) {
                    if (cat.nama) insertCat.run(cat.nama);
                }
            }

            if (products && Array.isArray(products)) {
                const insertProd = db.prepare(`
                    INSERT OR REPLACE INTO products (kode_barang, nama_barang, harga_jual, diskon, tipe_diskon, kategori, stok)
                    VALUES (@kode_barang, @nama_barang, @harga_jual, @diskon, @tipe_diskon, @kategori, @stok)
                `);

                for (const prod of products) {
                    insertProd.run({
                        kode_barang: prod.kode_barang,
                        nama_barang: prod.nama_barang,
                        harga_jual: prod.harga_jual || 0,
                        diskon: prod.diskon || 0,
                        tipe_diskon: prod.tipe_diskon || 1,
                        kategori: prod.kategori || '',
                        stok: prod.stok || 0
                    });
                }
            }
        });

        importProcess();
        return NextResponse.json({
            success: true,
            message: 'Data berhasil diimport',
            count: products.length
        });
    } catch (error: any) {
        console.error('Import error:', error);
        return NextResponse.json({ success: false, error: 'Gagal mengimport data: ' + error?.message }, { status: 500 });
    }
}
