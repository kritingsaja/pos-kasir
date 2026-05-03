import { createClient } from '@libsql/client';
import * as path from 'path';

async function migrate() {
  console.log("Starting migration to Turso...");

  const localDb = createClient({
    url: `file:${path.join(process.cwd(), 'data', 'pos.db')}`,
  });

  const tursoUrl = process.env.TURSO_URL || process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN;

  if (!tursoUrl || !tursoToken) {
    console.error("Error: TURSO_URL or TURSO_AUTH_TOKEN not found in .env.local");
    return;
  }

  const tursoDb = createClient({
    url: tursoUrl,
    authToken: tursoToken,
  });

  try {
    // 1. Migrate Categories
    console.log("Migrating categories...");
    const localCats = await localDb.execute("SELECT * FROM categories");
    for (const row of localCats.rows) {
      await tursoDb.execute({
        sql: "INSERT OR IGNORE INTO categories (id, nama, created_at) VALUES (?, ?, ?)",
        args: [row.id, row.nama, row.created_at]
      });
    }

    // 2. Migrate Products
    console.log("Migrating products...");
    const localProducts = await localDb.execute("SELECT * FROM products");
    for (const row of localProducts.rows) {
      await tursoDb.execute({
        sql: `INSERT OR IGNORE INTO products 
              (id, kode_barang, nama_barang, harga_jual, diskon, tipe_diskon, kategori, stok, aktif, created_at, updated_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          row.id, row.kode_barang, row.nama_barang, row.harga_jual, 
          row.diskon, row.tipe_diskon, row.kategori, row.stok, 
          row.aktif, row.created_at, row.updated_at
        ]
      });
    }

    // 3. Migrate Settings
    console.log("Migrating settings...");
    const localSettings = await localDb.execute("SELECT * FROM settings");
    for (const row of localSettings.rows) {
      await tursoDb.execute({
        sql: "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        args: [row.key, row.value]
      });
    }

    // 4. Migrate Raw Materials
    console.log("Migrating raw materials...");
    try {
      const localMaterials = await localDb.execute("SELECT * FROM raw_materials");
      for (const row of localMaterials.rows) {
        await tursoDb.execute({
          sql: "INSERT OR IGNORE INTO raw_materials (id, nama, satuan, stok_awal, min_stok, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          args: [row.id, row.nama, row.satuan, row.stok_awal, row.min_stok, row.created_at, row.updated_at]
        });
      }
    } catch (e) { console.log("Skipping materials (table might not exist locally)"); }

    console.log("MIGRATION SUCCESSFUL! All data is now in Turso.");
  } catch (error) {
    console.error("Migration failed:", error);
  }
}

migrate();
