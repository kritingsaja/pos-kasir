import { getDb } from './db';

// Data produk dari spreadsheet user
const products = [
    { kode_barang: '1', nama_barang: 'Mie goreng sapi refill', harga_jual: 17000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: '12', nama_barang: 'Freshmilk', harga_jual: 10000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'AE', nama_barang: 'Air Es', harga_jual: 4000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'Air', nama_barang: 'Air Mineral', harga_jual: 6000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'AK', nama_barang: 'Ayam Kremes', harga_jual: 24000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'AP', nama_barang: 'Ayam Penyet', harga_jual: 24000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'AS', nama_barang: 'Ayam Sambal', harga_jual: 24000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'AyG', nama_barang: 'Ayam Goreng', harga_jual: 22000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'Blb', nama_barang: 'Black Le Berry', harga_jual: 16000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'BOS', nama_barang: 'Beef Onion Slice', harga_jual: 30000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'bsksk', nama_barang: 'Bakso', harga_jual: 4000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'CC', nama_barang: 'Cappuccino', harga_jual: 14000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'CJ', nama_barang: 'Caramel Jelly', harga_jual: 16000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'CK', nama_barang: 'Chicken Katsu', harga_jual: 28000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'CM', nama_barang: 'Coklat Milkshake', harga_jual: 16000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'CP', nama_barang: 'Chicken Popcorn', harga_jual: 18000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'DT', nama_barang: 'Dimsum Telur', harga_jual: 12000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'EJ', nama_barang: 'Es Jeruk', harga_jual: 10000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'ET', nama_barang: 'Es Teh', harga_jual: 6000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'FF', nama_barang: 'French Fries', harga_jual: 16000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'GC', nama_barang: 'Green Coffee', harga_jual: 12000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'GT', nama_barang: 'Green Tea Latte', harga_jual: 16000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'IK', nama_barang: 'Indomie Kuah', harga_jual: 12000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'IG', nama_barang: 'Indomie Goreng', harga_jual: 12000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'JM', nama_barang: 'Jus Mangga', harga_jual: 14000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'KC', nama_barang: 'Kopi Coklat', harga_jual: 14000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'KG', nama_barang: 'Kopi Gula Aren', harga_jual: 14000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'KH', nama_barang: 'Kopi Hitam', harga_jual: 10000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'KS', nama_barang: 'Kopi Susu', harga_jual: 14000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'LM', nama_barang: 'Lemon Tea', harga_jual: 12000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'MC', nama_barang: 'Matcha', harga_jual: 16000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'MG', nama_barang: 'Mie Goreng', harga_jual: 16000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'MK', nama_barang: 'Mie Kuah', harga_jual: 16000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'NS', nama_barang: 'Nasi Putih', harga_jual: 5000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'NG', nama_barang: 'Nasi Goreng', harga_jual: 18000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'OC', nama_barang: 'Oreo Cream', harga_jual: 16000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'RC', nama_barang: 'Red Coffee', harga_jual: 14000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'RJ', nama_barang: 'Roti John', harga_jual: 20000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'RM', nama_barang: 'Red Melon', harga_jual: 14000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'SM', nama_barang: 'Strawberry Milkshake', harga_jual: 16000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'TG', nama_barang: 'Tahu Goreng', harga_jual: 8000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'TH', nama_barang: 'Teh Hangat', harga_jual: 5000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'TP', nama_barang: 'Tempe Penyet', harga_jual: 14000, diskon: 0, tipe_diskon: 1 },
    { kode_barang: 'VM', nama_barang: 'Vanilla Milkshake', harga_jual: 16000, diskon: 0, tipe_diskon: 1 },
];

export async function seedProducts() {
    const db = getDb();
    const countRes = await db.execute('SELECT COUNT(*) as c FROM products');
    const count = countRes.rows[0]?.c as number;

    if (count === 0) {
        const ops = products.map(item => ({
            sql: `INSERT OR IGNORE INTO products (kode_barang, nama_barang, harga_jual, diskon, tipe_diskon, stok)
                  VALUES (?, ?, ?, ?, ?, 999)`,
            args: [item.kode_barang, item.nama_barang, item.harga_jual, item.diskon, item.tipe_diskon]
        }));

        await db.batch(ops);
        console.log(`✅ Seeded ${products.length} products`);
        return products.length;
    }

    return 0;
}
