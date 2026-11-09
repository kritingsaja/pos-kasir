import { createClient, type Client } from '@libsql/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export type BusinessType = 'cafe' | 'stockist';
export type BusinessStatus = 'active' | 'suspended';

export interface BusinessRecord {
    id: string;
    name: string;
    slug: string;
    business_type: BusinessType;
    status: BusinessStatus;
    database_name: string;
    database_url: string;
    database_token_encrypted: string;
    admin_username: string;
    created_at: string;
}

export interface BusinessAccount {
    id: string;
    business_id: string;
    username: string;
    password_hash: string;
    role: 'Admin' | 'Kasir';
    active: number;
    business_name: string;
    business_status: BusinessStatus;
    business_type: BusinessType;
    database_name: string;
    database_url: string;
    database_token_encrypted: string;
}

let platformClient: Client | null = null;
const tenantClients = new Map<string, Client>();

export function platformStorageConfigured() {
    return Boolean(process.env.PLATFORM_TURSO_URL && process.env.PLATFORM_TURSO_AUTH_TOKEN);
}

export function tenantProvisioningConfigured() {
    return Boolean(platformStorageConfigured() && process.env.TURSO_ORG && process.env.TURSO_API_TOKEN && process.env.JWT_SECRET?.length);
}

export function getPlatformDb(): Client {
    const url = process.env.PLATFORM_TURSO_URL;
    const authToken = process.env.PLATFORM_TURSO_AUTH_TOKEN;
    if (!url || !authToken) throw new Error('Database platform belum dikonfigurasi. Atur PLATFORM_TURSO_URL dan PLATFORM_TURSO_AUTH_TOKEN di Vercel.');
    if (!platformClient) platformClient = createClient({ url, authToken });
    return platformClient;
}

export async function ensurePlatformSchema() {
    const db = getPlatformDb();
    await db.batch([
        { sql: "CREATE TABLE IF NOT EXISTS platform_businesses (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, business_type TEXT NOT NULL CHECK (business_type IN ('cafe','stockist')), status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')), database_name TEXT NOT NULL UNIQUE, database_url TEXT NOT NULL, database_token_encrypted TEXT NOT NULL, admin_username TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))", args: [] },
        { sql: "CREATE TABLE IF NOT EXISTS platform_accounts (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('Admin','Kasir')), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), FOREIGN KEY (business_id) REFERENCES platform_businesses(id))", args: [] },
        { sql: 'CREATE INDEX IF NOT EXISTS idx_platform_accounts_business ON platform_accounts(business_id)', args: [] },
        { sql: 'CREATE INDEX IF NOT EXISTS idx_platform_businesses_status ON platform_businesses(status)', args: [] },
    ]);
    await registerLegacyCafe(db);
}

async function registerLegacyCafe(platformDb: Client) {
    const legacyUrl = process.env.TURSO_URL || process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL;
    const legacyToken = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN;
    if (!legacyUrl || !legacyToken) return;
    const platformUrl = process.env.PLATFORM_TURSO_URL || '';
    const legacyHost = new URL(legacyUrl).host.toLowerCase();
    const platformHost = new URL(platformUrl).host.toLowerCase();
    if (legacyHost && legacyHost === platformHost) {
        throw new Error('Database platform harus database Turso terpisah dari database Cafe yang sudah dipakai.');
    }

    const exists = await platformDb.execute({ sql: 'SELECT id FROM platform_businesses WHERE id=?', args: ['legacy-cafe'] });
    if (!exists.rows.length) {
        const storeName = process.env.LEGACY_BUSINESS_NAME || 'T3A.CO CAFE';
        const databaseName = 'legacy-' + legacyHost.replace(/[^a-z0-9-]/g, '-').slice(0, 44);
        await platformDb.execute({
            sql: 'INSERT OR IGNORE INTO platform_businesses (id,name,slug,business_type,status,database_name,database_url,database_token_encrypted,admin_username) VALUES (?,?,?,?,?,?,?,?,?)',
            args: ['legacy-cafe', storeName, 'teacocafe', 'cafe', 'active', databaseName, legacyUrl, encryptDatabaseToken(legacyToken), 'admin'],
        });
    }

    try {
        const legacyDb = createClient({ url: legacyUrl, authToken: legacyToken });
        const users = await legacyDb.execute("SELECT username,password,role FROM users WHERE role IN ('Admin','Kasir')");
        for (const row of users.rows as any[]) {
            const username = String(row.username || '');
            if (!username || !row.password) continue;
            await platformDb.execute({
                sql: 'INSERT OR IGNORE INTO platform_accounts (id,business_id,username,password_hash,role) VALUES (?,?,?,?,?)',
                args: ['legacy-' + username, 'legacy-cafe', username, String(row.password), String(row.role)],
            });
        }
    } catch {
        // Existing installations may not yet have a users table.
    }
}

function encryptionKey() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) throw new Error('JWT_SECRET minimal 32 karakter diperlukan untuk mengenkripsi kredensial database.');
    return createHash('sha256').update('kasirpos-platform-db:v1:').update(secret).digest();
}

export function encryptDatabaseToken(token: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function decryptDatabaseToken(value: string) {
    const packed = Buffer.from(value, 'base64');
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const encrypted = packed.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export async function createTursoDatabase(name: string) {
    const org = process.env.TURSO_ORG;
    const token = process.env.TURSO_API_TOKEN;
    if (!org || !token) throw new Error('Provisioning Turso belum dikonfigurasi. Atur TURSO_ORG dan TURSO_API_TOKEN di Vercel.');
    const group = process.env.TURSO_GROUP || 'default';
    const base = 'https://api.turso.tech/v1/organizations/' + encodeURIComponent(org) + '/databases';
    const createResponse = await fetch(base, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, group }),
        cache: 'no-store',
    });
    const createBody = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) {
        const message = typeof createBody?.error === 'string' ? createBody.error : 'Turso gagal membuat database baru.';
        throw new Error(message);
    }
    const hostname = createBody?.database?.Hostname || createBody?.database?.hostname;
    if (typeof hostname !== 'string' || !hostname) throw new Error('Turso membuat database tetapi tidak mengembalikan hostname.');

    const tokenResponse = await fetch(base + '/' + encodeURIComponent(name) + '/auth/tokens?authorization=full-access', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        cache: 'no-store',
    });
    const tokenBody = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || typeof tokenBody?.jwt !== 'string') throw new Error('Database dibuat, tetapi Turso gagal menerbitkan access token.');
    return { url: 'libsql://' + hostname, token: tokenBody.jwt };
}

export async function deleteTursoDatabase(name: string) {
    const org = process.env.TURSO_ORG;
    const token = process.env.TURSO_API_TOKEN;
    if (!org || !token) return;
    const url = 'https://api.turso.tech/v1/organizations/' + encodeURIComponent(org) + '/databases/' + encodeURIComponent(name);
    await fetch(url, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' }).catch(() => undefined);
}

export async function addPlatformBusiness(record: BusinessRecord, account: { id: string; username: string; passwordHash: string }) {
    const db = getPlatformDb();
    const tx = await db.transaction('write');
    try {
        await tx.execute({ sql: 'INSERT INTO platform_businesses (id,name,slug,business_type,status,database_name,database_url,database_token_encrypted,admin_username) VALUES (?,?,?,?,?,?,?,?,?)', args: [record.id, record.name, record.slug, record.business_type, record.status, record.database_name, record.database_url, record.database_token_encrypted, record.admin_username] });
        await tx.execute({ sql: 'INSERT INTO platform_accounts (id,business_id,username,password_hash,role) VALUES (?,?,?,?,?)', args: [account.id, record.id, account.username, account.passwordHash, 'Admin'] });
        await tx.commit();
    } catch (error) {
        await tx.rollback();
        throw error;
    }
}

export async function listPlatformBusinesses() {
    const result = await getPlatformDb().execute("SELECT b.id,b.name,b.slug,b.business_type,b.status,b.database_name,b.admin_username,b.created_at,(SELECT COUNT(*) FROM platform_accounts a WHERE a.business_id=b.id AND a.role='Kasir' AND a.active=1) AS cashier_count FROM platform_businesses b ORDER BY b.created_at DESC");
    return result.rows;
}

export async function getPlatformSummary() {
    const result = await getPlatformDb().execute("SELECT COUNT(*) AS total,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,SUM(CASE WHEN status='suspended' THEN 1 ELSE 0 END) AS suspended,SUM(CASE WHEN business_type='stockist' THEN 1 ELSE 0 END) AS stockist,SUM(CASE WHEN business_type='cafe' THEN 1 ELSE 0 END) AS cafe FROM platform_businesses");
    return result.rows[0];
}

export async function setPlatformBusinessStatus(id: string, status: BusinessStatus) {
    const result = await getPlatformDb().execute({ sql: 'UPDATE platform_businesses SET status=? WHERE id=?', args: [status, id] });
    return result.rowsAffected > 0;
}

export async function findPlatformAccount(username: string): Promise<BusinessAccount | null> {
    if (!platformStorageConfigured()) return null;
    await ensurePlatformSchema();
    const result = await getPlatformDb().execute({
        sql: "SELECT a.id,a.business_id,a.username,a.password_hash,a.role,a.active,b.name AS business_name,b.status AS business_status,b.business_type,b.database_name,b.database_url,b.database_token_encrypted FROM platform_accounts a JOIN platform_businesses b ON b.id=a.business_id WHERE a.username=? LIMIT 1",
        args: [username],
    });
    return (result.rows[0] as unknown as BusinessAccount) || null;
}

export async function getBusinessDatabase(id: string) {
    const result = await getPlatformDb().execute({ sql: 'SELECT id,status,database_url,database_token_encrypted FROM platform_businesses WHERE id=? LIMIT 1', args: [id] });
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row || row.status !== 'active') throw new Error('Bisnis tidak aktif atau tidak ditemukan.');
    let db = tenantClients.get(id);
    if (!db) {
        db = createClient({ url: String(row.database_url), authToken: decryptDatabaseToken(String(row.database_token_encrypted)) });
        tenantClients.set(id, db);
    }
    return db;
}
