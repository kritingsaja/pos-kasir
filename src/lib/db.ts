import { createClient, Client } from '@libsql/client';
import path from 'path';

const isProd = process.env.NODE_ENV === 'production';
const url = process.env.TURSO_URL || `file:${path.join(process.cwd(), 'data', 'pos.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

let client: Client | null = null;
let initialized = false;

export function getDb(): Client {
  if (!client) {
    client = createClient({
      url: url,
      authToken: authToken,
    });
  }
  return client;
}

export async function ensureDb() {
  if (!initialized) {
    await initializeDatabase();
    initialized = true;
  }
}

export async function initializeDatabase() {
  const db = getDb();
  
  // Separate multiple statements for compatibility if needed, 
  // though Turso supports multi-statement strings in execute() sometimes, 
  // it's safer to use batch or multiple calls for migrations.
  const schema = [
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kode_barang TEXT UNIQUE NOT NULL,
      nama_barang TEXT NOT NULL,
      harga_jual INTEGER NOT NULL DEFAULT 0,
      diskon INTEGER NOT NULL DEFAULT 0,
      tipe_diskon INTEGER NOT NULL DEFAULT 1,
      kategori TEXT DEFAULT '',
      stok INTEGER DEFAULT 0,
      aktif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      tanggal TEXT NOT NULL,
      waktu TEXT NOT NULL,
      items TEXT NOT NULL,
      subtotal INTEGER NOT NULL DEFAULT 0,
      diskon_total INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      bayar INTEGER NOT NULL DEFAULT 0,
      kembalian INTEGER NOT NULL DEFAULT 0,
      metode_bayar TEXT NOT NULL DEFAULT 'tunai',
      kasir TEXT DEFAULT 'Admin',
      nama_pelanggan TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama_draft TEXT NOT NULL,
      items TEXT NOT NULL,
      subtotal INTEGER NOT NULL DEFAULT 0,
      diskon_total INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('Admin', 'Kasir')),
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS raw_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      satuan TEXT NOT NULL,
      stok_awal REAL DEFAULT 0,
      min_stok REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS product_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      material_id INTEGER NOT NULL,
      qty_used REAL NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (material_id) REFERENCES raw_materials(id)
    )`,
    `CREATE TABLE IF NOT EXISTS restock_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      jumlah REAL NOT NULL,
      catatan TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (material_id) REFERENCES raw_materials(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_tanggal ON transactions(tanggal)`
  ];

  for (const sql of schema) {
    await db.execute(sql);
  }

  // Migration: Add columns if they don't exist
  try {
    const tableInfo = await db.execute("PRAGMA table_info(transactions)");
    const cols = tableInfo.rows.map(r => r.name);
    if (!cols.includes('kasir')) {
      await db.execute("ALTER TABLE transactions ADD COLUMN kasir TEXT DEFAULT 'Admin'");
    }
    if (!cols.includes('nama_pelanggan')) {
      await db.execute("ALTER TABLE transactions ADD COLUMN nama_pelanggan TEXT DEFAULT ''");
    }
  } catch (e) {
    console.error("Migration error:", e);
  }

  // Default values
  await db.execute({
    sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
    args: ['nama_toko', 'TOKO SAYA']
  });
  await db.execute({
    sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
    args: ['alamat_toko', 'Jl. Contoh No. 123']
  });
  await db.execute({
    sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
    args: ['telepon_toko', '08123456789']
  });
  await db.execute({
    sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
    args: ['footer_nota', 'Terima Kasih atas Kunjungan Anda!']
  });

  // Default users
  const defaultPassword = '$2b$10$khdhhXUoPcA1fv1t8zKmAe4mXTEyguJw7DTZZ/M7QDEybnSzUjTH.';
  await db.execute({
    sql: 'INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)',
    args: ['admin', defaultPassword, 'Admin']
  });
  await db.execute({
    sql: 'INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)',
    args: ['kasir', defaultPassword, 'Kasir']
  });

  // Default categories
  const countCats = await db.execute('SELECT COUNT(*) as c FROM categories');
  if (Number(countCats.rows[0]?.c) === 0) {
    const cats = ['Makanan', 'Minuman', 'Snack', 'Lain-lain'];
    for (const cat of cats) {
      await db.execute({ sql: 'INSERT INTO categories (nama) VALUES (?)', args: [cat] });
    }
  }
}

// Users
export async function getUserByUsername(username: string) {
  const db = getDb();
  const res = await db.execute({
    sql: 'SELECT * FROM users WHERE username = ?',
    args: [username]
  });
  return res.rows[0];
}

// Categories
export async function getAllCategories() {
  const db = getDb();
  const res = await db.execute('SELECT * FROM categories ORDER BY nama ASC');
  return res.rows;
}

export async function addCategory(nama: string) {
  const db = getDb();
  return await db.execute({
    sql: 'INSERT INTO categories (nama) VALUES (?)',
    args: [nama]
  });
}

export async function updateCategory(id: number, nama: string) {
  const db = getDb();
  return await db.execute({
    sql: 'UPDATE categories SET nama = ? WHERE id = ?',
    args: [nama, id]
  });
}

export async function deleteCategory(id: number) {
  const db = getDb();
  return await db.execute({
    sql: 'DELETE FROM categories WHERE id = ?',
    args: [id]
  });
}

// Products
export async function getAllProducts() {
  const db = getDb();
  const res = await db.execute('SELECT * FROM products WHERE aktif = 1 ORDER BY nama_barang ASC');
  return res.rows;
}

export async function getAllProductsSortedByPopularity() {
  const db = getDb();
  const products = await getAllProducts();
  
  const transRes = await db.execute('SELECT items FROM transactions');
  const transactions = transRes.rows;
  
  const popularity: Record<string, number> = {};
  
  for (const t of transactions) {
    try {
      const items = JSON.parse(t.items as string);
      for (const item of items) {
        const key = item.kode_barang;
        if (key) {
          popularity[key] = (popularity[key] || 0) + (Number(item.qty) || 0);
        }
      }
    } catch {}
  }
  
  return (products as any[]).sort((a, b) => {
    const popA = popularity[a.kode_barang] || 0;
    const popB = popularity[b.kode_barang] || 0;
    if (popA === popB) return a.nama_barang.localeCompare(b.nama_barang);
    return popB - popA;
  });
}

export async function searchProducts(query: string) {
  const db = getDb();
  const res = await db.execute({
    sql: 'SELECT * FROM products WHERE aktif = 1 AND (kode_barang LIKE ? OR nama_barang LIKE ?) ORDER BY nama_barang ASC',
    args: [`%${query}%`, `%${query}%`]
  });
  return res.rows;
}

export async function getProductByKode(kode: string) {
  const db = getDb();
  const res = await db.execute({
    sql: 'SELECT * FROM products WHERE kode_barang = ?',
    args: [kode]
  });
  return res.rows[0];
}

export async function addProduct(product: any) {
  const db = getDb();
  return await db.execute({
    sql: `INSERT INTO products (kode_barang, nama_barang, harga_jual, diskon, tipe_diskon, kategori, stok)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      product.kode_barang,
      product.nama_barang,
      product.harga_jual,
      product.diskon || 0,
      product.tipe_diskon || 1,
      product.kategori || '',
      product.stok || 0
    ]
  });
}

export async function updateProduct(id: number, product: any) {
  const db = getDb();
  const fields = Object.keys(product)
    .filter(k => k !== 'id')
    .map((key) => `${key} = ?`)
    .join(', ');
  const args = [...Object.values(product).filter((_, i) => Object.keys(product)[i] !== 'id'), id];
  
  return await db.execute({
    sql: `UPDATE products SET ${fields}, updated_at = datetime('now','localtime') WHERE id = ?`,
    args: args as any[]
  });
}

export async function deleteProduct(id: number) {
  const db = getDb();
  return await db.execute({
    sql: 'UPDATE products SET aktif = 0 WHERE id = ?',
    args: [id]
  });
}

// Transactions
export async function addTransaction(t: any) {
  const db = getDb();
  return await db.execute({
    sql: `INSERT INTO transactions (id, tanggal, waktu, items, subtotal, diskon_total, total, bayar, kembalian, metode_bayar, kasir, nama_pelanggan)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      t.id, t.tanggal, t.waktu, t.items, t.subtotal, t.diskon_total, 
      t.total, t.bayar, t.kembalian, t.metode_bayar, 
      t.kasir || 'Admin', t.nama_pelanggan || ''
    ]
  });
}

export async function deleteTransaction(id: string) {
  const db = getDb();
  return await db.execute({
    sql: 'DELETE FROM transactions WHERE id = ?',
    args: [id]
  });
}

export async function getTransactionsByDate(tanggal: string) {
  const db = getDb();
  const res = await db.execute({
    sql: 'SELECT * FROM transactions WHERE tanggal = ? ORDER BY created_at DESC',
    args: [tanggal]
  });
  return res.rows;
}

export async function getTransactionsRange(startDate: string, endDate: string) {
  const db = getDb();
  const res = await db.execute({
    sql: 'SELECT * FROM transactions WHERE tanggal >= ? AND tanggal <= ? ORDER BY created_at DESC',
    args: [startDate, endDate]
  });
  return res.rows;
}

export async function getTodayStats() {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const res = await db.execute({
    sql: `SELECT 
            COUNT(*) as total_transaksi,
            COALESCE(SUM(total), 0) as total_penjualan,
            COALESCE(AVG(total), 0) as rata_rata
          FROM transactions WHERE tanggal = ?`,
    args: [today]
  });
  return res.rows[0];
}

export async function getTopProducts(tanggal?: string) {
  const db = getDb();
  const sql = tanggal 
    ? { sql: 'SELECT items FROM transactions WHERE tanggal = ?', args: [tanggal] }
    : { sql: 'SELECT items FROM transactions', args: [] };
  
  const res = await db.execute(sql);
  const transactions = res.rows;
  const productCount: Record<string, { nama: string; qty: number; total: number }> = {};

  for (const t of transactions) {
    try {
      const items = JSON.parse(t.items as string);
      for (const item of items) {
        const key = item.kode_barang || item.nama_barang;
        if (!productCount[key]) {
          productCount[key] = { nama: item.nama_barang, qty: 0, total: 0 };
        }
        productCount[key].qty += Number(item.qty);
        productCount[key].total += Number(item.subtotal);
      }
    } catch {}
  }

  return Object.values(productCount)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);
}

// Drafts
export async function addDraft(draft: any) {
  const db = getDb();
  return await db.execute({
    sql: 'INSERT INTO drafts (nama_draft, items, subtotal, diskon_total, total) VALUES (?, ?, ?, ?, ?)',
    args: [draft.nama_draft, draft.items, draft.subtotal, draft.diskon_total, draft.total]
  });
}

export async function getAllDrafts() {
  const db = getDb();
  const res = await db.execute('SELECT * FROM drafts ORDER BY updated_at DESC');
  return res.rows;
}

export async function getDraftById(id: number) {
  const db = getDb();
  const res = await db.execute({
    sql: 'SELECT * FROM drafts WHERE id = ?',
    args: [id]
  });
  return res.rows[0];
}

export async function deleteDraft(id: number) {
  const db = getDb();
  return await db.execute({
    sql: 'DELETE FROM drafts WHERE id = ?',
    args: [id]
  });
}

// Settings
export async function getSetting(key: string) {
  const db = getDb();
  const res = await db.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: [key]
  });
  return (res.rows[0] as any)?.value;
}

export async function updateSetting(key: string, value: string) {
  const db = getDb();
  return await db.execute({
    sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    args: [key, value]
  });
}

export async function getAllSettings() {
  const db = getDb();
  const res = await db.execute('SELECT * FROM settings');
  const settings: Record<string, string> = {};
  for (const row of res.rows as any[]) {
    settings[row.key] = row.value;
  }
  return settings;
}

// Materials
export async function getAllMaterials() {
  const db = getDb();
  const res = await db.execute('SELECT * FROM raw_materials ORDER BY nama ASC');
  return res.rows;
}

export async function addMaterial(m: any) {
  const db = getDb();
  return await db.execute({
    sql: 'INSERT INTO raw_materials (nama, satuan, stok_awal, min_stok) VALUES (?, ?, ?, ?)',
    args: [m.nama, m.satuan, m.stok_awal, m.min_stok]
  });
}

export async function updateMaterial(id: number, m: any) {
  const db = getDb();
  return await db.execute({
    sql: 'UPDATE raw_materials SET nama = ?, satuan = ?, stok_awal = ?, min_stok = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?',
    args: [m.nama, m.satuan, m.stok_awal, m.min_stok, id]
  });
}

export async function deleteMaterial(id: number) {
  const db = getDb();
  // Libsql doesn't support nested transactions in the same way, but batch works
  return await db.batch([
    { sql: 'DELETE FROM product_materials WHERE material_id = ?', args: [id] },
    { sql: 'DELETE FROM restock_logs WHERE material_id = ?', args: [id] },
    { sql: 'DELETE FROM raw_materials WHERE id = ?', args: [id] }
  ]);
}

export async function addRestockLog(log: any) {
  const db = getDb();
  return await db.batch([
    { sql: 'INSERT INTO restock_logs (material_id, jumlah, catatan) VALUES (?, ?, ?)', args: [log.material_id, log.jumlah, log.catatan || ''] },
    { sql: 'UPDATE raw_materials SET updated_at = datetime(\'now\',\'localtime\') WHERE id = ?', args: [log.material_id] }
  ]);
}

export async function getProductRecipe(product_id: number) {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT pm.*, rm.nama, rm.satuan 
          FROM product_materials pm
          JOIN raw_materials rm ON pm.material_id = rm.id
          WHERE pm.product_id = ?`,
    args: [product_id]
  });
  return res.rows;
}

export async function setProductRecipe(product_id: number, materials: any[]) {
  const db = getDb();
  const ops = [
    { sql: 'DELETE FROM product_materials WHERE product_id = ?', args: [product_id] }
  ];
  for (const m of materials) {
    ops.push({ 
      sql: 'INSERT INTO product_materials (product_id, material_id, qty_used) VALUES (?, ?, ?)', 
      args: [product_id, m.material_id, m.qty_used] 
    });
  }
  return await db.batch(ops);
}

export async function getMaterialUsageStats() {
  const db = getDb();
  const transRes = await db.execute('SELECT items FROM transactions');
  const recipesRes = await db.execute('SELECT * FROM product_materials');
  
  const transactions = transRes.rows;
  const recipes = recipesRes.rows as any[];
  
  const usage: Record<number, number> = {};

  for (const t of transactions) {
    try {
      const items = JSON.parse(t.items as string);
      for (const item of items) {
        const productId = item.product_id || item.id; 
        if (!productId) continue;

        const productRecipes = recipes.filter(r => r.product_id === productId);
        for (const r of productRecipes) {
          if (!usage[r.material_id]) usage[r.material_id] = 0;
          usage[r.material_id] += (Number(item.qty) * Number(r.qty_used));
        }
      }
    } catch {}
  }
  return usage;
}

export async function getRestockTotals() {
  const db = getDb();
  const res = await db.execute('SELECT material_id, SUM(jumlah) as total FROM restock_logs GROUP BY material_id');
  return res.rows;
}

export async function getTransactionItemsByDate(tanggal: string) {
  const db = getDb();
  const res = await db.execute({
    sql: 'SELECT items FROM transactions WHERE tanggal = ?',
    args: [tanggal]
  });
  return res.rows;
}
