import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { jwtVerify } from 'jose';
import { BcaError, validatePayment, nmidFromQris, candidatePayments, publicTransaction, wibDate } from './bca-matching.js';
import { scrapeBcaPayments } from './bca-scraper.js';

let database;

function getDatabase() {
  const url = process.env.TURSO_URL || process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL;
  if (!url) throw new BcaError('DATABASE_CONFIG', 'Database kasir belum dikonfigurasi.', 503);
  database ??= createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN });
  return database;
}

async function authenticate(cookie, db) {
  if (!process.env.JWT_SECRET) throw new BcaError('AUTH_CONFIG', 'JWT_SECRET aplikasi harus dikonfigurasi.', 503);
  const raw = String(cookie ?? '').split(';').map(part => part.trim()).find(part => part.startsWith('token='));
  let payload;
  try {
    const token = decodeURIComponent(raw?.slice(6) ?? '');
    ({ payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET), { algorithms: ['HS256'] }));
    if (!Number.isSafeInteger(payload.id) || typeof payload.username !== 'string') throw new Error('Invalid identity');
  } catch {
    throw new BcaError('UNAUTHORIZED', 'Silakan login kembali ke kasir.', 401);
  }
  const result = await db.execute({ sql: 'SELECT id, username, role FROM users WHERE id = ?', args: [payload.id] });
  const user = result.rows[0];
  if (!user || user.username !== payload.username || !['Kasir', 'Admin'].includes(String(user.role))) {
    throw new BcaError('FORBIDDEN', 'Akun ini tidak dapat memeriksa pembayaran.', 403);
  }
  return String(user.id);
}

async function ensureTables(db) {
  await db.batch([
    { sql: `CREATE TABLE IF NOT EXISTS bca_qris_claims (
      checkout_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL,
      nmid TEXT NOT NULL, bank_date TEXT NOT NULL, rrn TEXT NOT NULL,
      amount INTEGER NOT NULL, qr_timestamp TEXT NOT NULL,
      detail TEXT NOT NULL, checked_at TEXT NOT NULL,
      transaction_id TEXT UNIQUE,
      UNIQUE (nmid, bank_date, rrn)
    )`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS bca_qris_scraper_lock (
      account_key TEXT PRIMARY KEY, owner TEXT NOT NULL,
      lease_until INTEGER NOT NULL, last_started INTEGER NOT NULL
    )`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS bca_qris_session (
      account_key TEXT PRIMARY KEY, cookie_blob TEXT NOT NULL,
      expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`, args: [] },
  ], 'write');
  const columns = await db.execute('PRAGMA table_info(bca_qris_claims)');
  if (!columns.rows.some(column => column.name === 'transaction_id')) {
    try { await db.execute('ALTER TABLE bca_qris_claims ADD COLUMN transaction_id TEXT'); }
    catch (error) {
      const current = await db.execute('PRAGMA table_info(bca_qris_claims)');
      if (!current.rows.some(column => column.name === 'transaction_id')) throw error;
    }
  }
  await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_bca_qris_transaction ON bca_qris_claims(transaction_id)');
}

function bcaAccountKey() {
  return createHash('sha256').update(process.env.BCA_USER.trim().toLowerCase()).digest('hex');
}

function bcaSessionKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new BcaError('AUTH_CONFIG', 'JWT_SECRET aplikasi harus dikonfigurasi.', 503);
  return createHmac('sha256', secret).update('pos-kasir:bca-qris-session:v1').digest();
}

function bcaSessionCacheKey() {
  return createHmac('sha256', bcaSessionKey()).update(bcaAccountKey()).digest('hex');
}

function encryptBcaCookies(cookies) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', bcaSessionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(cookies), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptBcaCookies(blob) {
  const [version, ivText, tagText, encryptedText] = String(blob).split('.');
  if (version !== 'v1' || !ivText || !tagText || !encryptedText) throw new Error('Invalid BCA session');
  const decipher = createDecipheriv('aes-256-gcm', bcaSessionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  const cookies = JSON.parse(plaintext);
  if (!Array.isArray(cookies) || cookies.length > 100) throw new Error('Invalid BCA session');
  return cookies;
}

async function readBcaSession(db, accountKey) {
  const now = Date.now();
  try {
    const result = await db.execute({
      sql: 'SELECT cookie_blob, expires_at FROM bca_qris_session WHERE account_key = ?', args: [accountKey],
    });
    const row = result.rows[0];
    if (!row) return null;
    if (Number(row.expires_at) <= now) {
      await db.execute({ sql: 'DELETE FROM bca_qris_session WHERE account_key = ?', args: [accountKey] });
      return null;
    }
    return decryptBcaCookies(String(row.cookie_blob));
  } catch {
    // A missing, expired or unreadable cache only means this request must sign in again.
    await db.execute({ sql: 'DELETE FROM bca_qris_session WHERE account_key = ?', args: [accountKey] }).catch(() => {});
    return null;
  }
}

async function saveBcaSession(db, accountKey, cookies) {
  try {
    if (!Array.isArray(cookies) || cookies.length === 0 || cookies.length > 100) return false;
    const now = Date.now();
    const expirations = cookies.map(cookie => Number(cookie.expires)).filter(value => Number.isFinite(value) && value > now / 1000);
    const expiresAt = Math.min(now + 8 * 60 * 60 * 1000,
      expirations.length ? Math.min(...expirations) * 1000 : now + 8 * 60 * 60 * 1000);
    if (expiresAt <= now) return false;
    const cookieBlob = encryptBcaCookies(cookies);
    await db.execute({
      sql: `INSERT INTO bca_qris_session (account_key, cookie_blob, expires_at, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(account_key) DO UPDATE SET
        cookie_blob = excluded.cookie_blob, expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
      args: [accountKey, cookieBlob, expiresAt, now],
    });
    return true;
  } catch {
    // Cache persistence is best-effort; a successful BCA check must still succeed.
    return false;
  }
}

export async function authenticatedBcaUser(cookie) {
  return authenticate(cookie, getDatabase());
}

// Called inside the same database transaction that writes the sale.
export async function claimForSale(db, { verification, amount, transactionId, ownerId }) {
  if (!verification || typeof verification !== 'object' || Array.isArray(verification)) {
    throw new BcaError('INVALID_VERIFICATION', 'Referensi BCA tidak valid.', 400);
  }
  const payment = validatePayment({ amount, timestamp: verification.timestamp,
    checkoutId: verification.checkoutId, rrn: verification.rrn });
  if (!payment.checkoutId || !payment.rrn) throw new BcaError('INVALID_VERIFICATION', 'Referensi BCA tidak lengkap.', 400);
  const claim = await readClaim(db, payment.checkoutId);
  if (!claim) throw new BcaError('PAYMENT_NOT_VERIFIED', 'Pembayaran belum diverifikasi oleh BCA.', 409);
  const setting = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'qris_static_payload'", args: [] });
  const nmid = nmidFromQris(setting.rows[0]?.value);
  const result = resultFromClaim(claim, payment, ownerId, nmid);
  if (claim.transaction_id && claim.transaction_id !== transactionId) {
    throw new BcaError('PAYMENT_ALREADY_USED', 'RRN sudah dibukukan pada transaksi lain.', 409);
  }
  return { checkoutId: payment.checkoutId, timestamp: payment.timestamp,
    rrn: result.data.rrn, nmid, date: result.data.date,
    timeWib: result.data.timeWib, checkedAt: result.checkedAt };
}

async function readClaim(db, checkoutId) {
  const result = await db.execute({ sql: 'SELECT * FROM bca_qris_claims WHERE checkout_id = ?', args: [checkoutId] });
  return result.rows[0];
}

function resultFromClaim(claim, payment, ownerId, nmid) {
  if (String(claim.owner_id) !== ownerId || claim.nmid !== nmid ||
      Number(claim.amount) !== payment.amount || claim.qr_timestamp !== payment.timestamp ||
      (payment.rrn && claim.rrn !== payment.rrn)) {
    throw new BcaError('CHECKOUT_CHANGED', 'ID pesanan sudah digunakan dengan pembayaran berbeda.', 409);
  }
  return {
    success: true, matched: true, checkoutId: payment.checkoutId,
    data: JSON.parse(String(claim.detail)), checkedAt: claim.checked_at,
  };
}

async function acquireLock(db) {
  if (!process.env.BCA_USER || !process.env.BCA_PASS) {
    throw new BcaError('BCA_CONFIG', 'BCA_USER dan BCA_PASS belum disiapkan.', 503);
  }
  const key = bcaAccountKey();
  const owner = randomUUID();
  const now = Date.now();
  const acquired = await db.execute({
    sql: `INSERT INTO bca_qris_scraper_lock (account_key, owner, lease_until, last_started)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(account_key) DO UPDATE SET
        owner = excluded.owner, lease_until = excluded.lease_until, last_started = excluded.last_started
      WHERE bca_qris_scraper_lock.lease_until < ? AND bca_qris_scraper_lock.last_started < ?`,
    args: [key, owner, now + 150_000, now, now, now - 5_000],
  });
  if (acquired.rowsAffected !== 1) throw new BcaError('BCA_BUSY', 'Pengecekan BCA sedang berjalan. Coba lagi sebentar.', 429);
  return async () => {
    await db.execute({ sql: 'UPDATE bca_qris_scraper_lock SET lease_until = 0 WHERE account_key = ? AND owner = ?', args: [key, owner] });
  };
}

export async function checkMutasiBca({ input, cookie, fetchSite, onProgress = () => {} }) {
  // Browser-generated cross-site requests must not trigger merchant logins or claims.
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    throw new BcaError('FORBIDDEN', 'Permintaan harus berasal dari aplikasi kasir.', 403);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BcaError('INVALID_BODY', 'JSON tidak valid.', 400);
  const warmupOnly = input.mode === 'warmup';
  const listOnly = input.mode === 'list';
  const payment = listOnly || warmupOnly ? null : validatePayment(input);
  if (payment) payment.checkoutId ??= randomUUID();
  const db = getDatabase();
  onProgress('authenticating_pos');
  const ownerId = await authenticate(cookie, db);
  const setting = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'qris_static_payload'", args: [] });
  const nmid = nmidFromQris(setting.rows[0]?.value);
  await ensureTables(db);
  if (payment) {
    const existing = await readClaim(db, payment.checkoutId);
    if (existing) return resultFromClaim(existing, payment, ownerId, nmid);
  }
  onProgress('acquiring_lock');
  const release = await acquireLock(db);
  try {
    const sessionCacheKey = bcaSessionCacheKey();
    const sessionCookies = await readBcaSession(db, sessionCacheKey);
    const rows = await scrapeBcaPayments({
      instant: payment?.instant ?? Date.now(), expectedNmid: nmid,
      sessionCookies,
      onSessionUpdate: cookies => saveBcaSession(db, sessionCacheKey, cookies),
      onProgress,
      ...(listOnly || warmupOnly ? { dates: [wibDate(Date.now())] } : {}),
    });
    const latest = [...rows].sort((a, b) => b.minuteStart - a.minuteStart).slice(0, 10)
      .map(({ rrn, amount }) => ({ rrn, amount }));
    const checkedAt = new Date().toISOString();
    if (warmupOnly) return { success: true, warmed: true, checkedAt };
    if (listOnly) return { success: true, data: latest, checkedAt };

    const bankDates = [...new Set(rows.map(row => row.date))];
    const used = bankDates.length ? await db.execute({
      sql: `SELECT bank_date, rrn FROM bca_qris_claims WHERE nmid = ? AND bank_date IN (${bankDates.map(() => '?').join(',')})`,
      args: [nmid, ...bankDates],
    }) : { rows: [] };
    const claimed = new Set(used.rows.map(row => `${row.bank_date}:${row.rrn}`));
    const eligible = candidatePayments(rows, payment, nmid).filter(row => !claimed.has(`${row.date}:${row.rrn}`));
    const candidates = payment.rrn ? eligible.filter(row => row.rrn === payment.rrn) : eligible;
    if (candidates.length === 0) {
      return { success: true, matched: false, checkoutId: payment.checkoutId,
        message: 'Pembayaran belum ditemukan', transactions: latest, checkedAt };
    }
    if (candidates.length > 1) {
      return { success: true, matched: false, ambiguous: true, checkoutId: payment.checkoutId,
        message: 'Ada beberapa pembayaran yang cocok. Pilih RRN dari bukti pelanggan.',
        candidates: candidates.map(publicTransaction), transactions: latest, checkedAt };
    }
    const transaction = publicTransaction(candidates[0]);
    // Both checkout identity and bank reference are unique in persistent storage.
    await db.execute({
      sql: `INSERT INTO bca_qris_claims
        (checkout_id, owner_id, nmid, bank_date, rrn, amount, qr_timestamp, detail, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      args: [payment.checkoutId, ownerId, nmid, transaction.date, transaction.rrn,
        payment.amount, payment.timestamp, JSON.stringify(transaction), checkedAt],
    });
    const saved = await readClaim(db, payment.checkoutId);
    if (!saved) throw new BcaError('PAYMENT_ALREADY_USED', 'RRN sudah digunakan oleh pesanan lain.', 409);
    return resultFromClaim(saved, payment, ownerId, nmid);
  } finally {
    // If storage is unavailable the finite lease prevents a permanent lock.
    await release().catch(() => {});
  }
}

export function errorResponse(error) {
  if (error instanceof BcaError) return { status: error.status, body: { success: false, code: error.code, error: error.message } };
  return { status: 500, body: { success: false, code: 'INTERNAL_ERROR', error: 'Pengecekan gagal. Coba lagi atau cek manual.' } };
}

export const noCacheHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store, max-age=0',
  'Vercel-CDN-Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
