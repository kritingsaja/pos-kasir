const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { resolve } = require('node:path');
const { tmpdir } = require('node:os');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const { createClient } = require('@libsql/client');
const { NextRequest } = require('next/server');
const { SignJWT } = require('jose');
const secret = 'isolated-test-secret-not-for-production';

function loader(db) {
    const cache = new Map();
    function load(file) {
        if (cache.has(file)) return cache.get(file);
        const exports = {};
        cache.set(file, exports);
        const source = readFileSync(resolve(__dirname, '..', file), 'utf8');
        const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
        vm.runInNewContext(outputText, {
            exports, require: name => name === '@/lib/db' ? { getDb: () => db } : name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`) : require(name),
            process: { env: { JWT_SECRET: secret } }, console, TextEncoder, TextDecoder, Request, Response, Headers, URL,
        }, { filename: file });
        return exports;
    }
    return load;
}

test('scoped API keys and external orders against a real libsql database', async t => {
    const dir = mkdtempSync(resolve(tmpdir(), 'pos-api-test-'));
    const db = createClient({ url: `file:${resolve(dir, 'test.db').replaceAll('\\', '/')}` });
    t.after(() => {
        db.close();
        assert.ok(dir.startsWith(resolve(tmpdir(), 'pos-api-test-')));
        try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
        catch (error) {
            if (process.platform !== 'win32' || !['EPERM', 'EBUSY'].includes(error.code)) throw error;
            t.diagnostic('Windows retained a temporary libsql file handle; fixture remains in the system temp directory.');
        }
    });
    await db.batch([
        'CREATE TABLE products (kode_barang TEXT PRIMARY KEY,nama_barang TEXT,harga_jual INTEGER,diskon INTEGER,tipe_diskon INTEGER,kategori TEXT,aktif INTEGER)',
        'CREATE TABLE settings (key TEXT PRIMARY KEY,value TEXT)',
        'CREATE TABLE drafts (id INTEGER PRIMARY KEY AUTOINCREMENT,nama_draft TEXT,items TEXT,subtotal INTEGER,diskon_total INTEGER,total INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
        'CREATE TABLE transactions (id TEXT PRIMARY KEY,tanggal TEXT,waktu TEXT,total INTEGER,metode_bayar TEXT,nama_pelanggan TEXT,items TEXT)',
        "INSERT INTO products VALUES ('TEA','Lemon Tea',15000,1000,1,'Minuman',1),('OFF','Nonaktif',10000,0,1,'Minuman',0)",
    ], 'write');
    const load = loader(db);
    const access = load('src/lib/api-access.ts');
    const keys = load('src/app/api/admin/api-keys/route.ts');
    const menu = load('src/app/api/v1/menu/route.ts');
    const orders = load('src/app/api/v1/orders/route.ts');
    const overview = load('src/app/api/admin/overview/route.ts');
    async function admin(method, body, role = 'Admin', suffix = '') {
        const token = await new SignJWT({ role }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(secret));
        return new NextRequest(`http://localhost/api/admin/api-keys${suffix}`, { method, headers: { cookie: `token=${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    }
    function external(path, token, body, id = 'order-test-0001') {
        return new Request(`http://localhost/api/v1/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': id }, ...(body ? { body: JSON.stringify(body) } : {}) });
    }
    let menuKey, orderKey;
    await t.test('admin-only management and scoped secrets stored as hashes', async () => {
        assert.equal((await keys.GET(await admin('GET', null, 'Kasir'))).status, 403);
        assert.equal((await keys.GET(new NextRequest('http://localhost/api/admin/api-keys'))).status, 401);
        for (const scope of ['menu', 'orders']) {
            const response = await keys.POST(await admin('POST', { scope, name: `Test ${scope}`, days: 30 }));
            assert.equal(response.status, 201);
            const created = (await response.json()).data;
            if (scope === 'menu') menuKey = created; else orderKey = created;
            const row = (await db.execute({ sql: 'SELECT * FROM integration_keys WHERE id=?', args: [created.id] })).rows[0];
            assert.equal(row.token_hash, access.tokenHash(created.token));
            assert.equal(Object.values(row).includes(created.token), false);
        }
        const list = await (await keys.GET(await admin('GET'))).text();
        assert.equal(list.includes(menuKey.token), false);
        assert.equal(list.includes('token_hash'), false);
    });
    await t.test('no auth, wrong scope, pagination and active-only menu', async () => {
        assert.equal((await menu.GET(new Request('http://localhost/api/v1/menu'))).status, 401);
        assert.equal((await menu.GET(external('menu', orderKey.token))).status, 403);
        assert.equal((await menu.GET(external('menu?limit=101', menuKey.token))).status, 400);
        const response = await menu.GET(external('menu', menuKey.token));
        assert.match(response.headers.get('cache-control'), /no-store/);
        const data = (await response.json()).data;
        assert.equal(data.length, 1); assert.equal(data[0].kode_barang, 'TEA'); assert.equal(data[0].tersedia, true);
        assert.equal(orders.GET, undefined);
    });
    const body = { nama_pelanggan: 'Meja 5', total: 1, items: [{ kode_barang: 'TEA', qty: 2, harga_jual: 1, catatan: 'Less sugar' }] };
    await t.test('server calculates prices, creates unpaid draft once, retry is idempotent', async () => {
        assert.equal((await orders.POST(external('orders', menuKey.token, body))).status, 403);
        assert.equal((await orders.POST(external('orders', orderKey.token, body, ''))).status, 400);
        const response = await orders.POST(external('orders', orderKey.token, body));
        assert.equal(response.status, 201);
        const data = (await response.json()).data;
        assert.equal(data.total, 28000); assert.equal(data.status, 'pending_payment');
        for (let i = 0; i < 3; i++) {
            const retry = await orders.POST(external('orders', orderKey.token, body));
            assert.equal(retry.status, 200);
            assert.equal((await retry.json()).data.draft_id, data.draft_id);
        }
        assert.equal((await db.execute('SELECT COUNT(*) AS n FROM drafts')).rows[0].n, 1);
        assert.equal((await db.execute('SELECT COUNT(*) AS n FROM transactions')).rows[0].n, 0);
        const items = JSON.parse((await db.execute('SELECT items FROM drafts')).rows[0].items);
        assert.equal(items[0].catatan, 'Less sugar'); assert.equal(items[0].harga_jual, 15000);
        assert.equal((await orders.POST(external('orders', orderKey.token, { ...body, nama_pelanggan: 'Different' }))).status, 409);
    });
    await t.test('unavailable menus and malformed orders roll back, next-day availability resets', async () => {
        await db.batch([
            { sql: 'INSERT INTO settings VALUES (?,?)', args: ['daily_unavailable_menu_date', access.jakartaDate()] },
            { sql: 'INSERT INTO settings VALUES (?,?)', args: ['daily_unavailable_menu_codes', '["TEA"]'] },
        ]);
        assert.equal((await (await menu.GET(external('menu', menuKey.token))).json()).data[0].tersedia, false);
        assert.equal((await orders.POST(external('orders', orderKey.token, body, 'order-blocked-0002'))).status, 409);
        assert.equal((await db.execute('SELECT COUNT(*) AS n FROM integration_orders')).rows[0].n, 1);
        for (const qty of [0, -1, 1.5, '2', 101]) {
            assert.equal((await orders.POST(external('orders', orderKey.token, { ...body, items: [{ kode_barang: 'TEA', qty }] }, 'order-invalid-0003'))).status, 400);
        }
        assert.equal((await orders.POST(external('orders', orderKey.token, { ...body, items: [{ kode_barang: 'OFF', qty: 1 }] }, 'order-off-0004'))).status, 409);
        await db.execute("UPDATE settings SET value='2000-01-01' WHERE key='daily_unavailable_menu_date'");
        assert.equal((await orders.POST(external('orders', orderKey.token, body, 'order-blocked-0002'))).status, 201);
    });
    await t.test('rate limit, expiry and immediate revocation', async () => {
        await db.execute({ sql: 'UPDATE integration_keys SET request_count=120,request_window=? WHERE id=?', args: [Math.floor(Date.now()/60000), menuKey.id] });
        assert.equal((await menu.GET(external('menu', menuKey.token))).status, 429);
        await db.execute({ sql: 'UPDATE integration_keys SET expires_at=1 WHERE id=?', args: [menuKey.id] });
        assert.equal((await menu.GET(external('menu', menuKey.token))).status, 401);
        assert.equal((await keys.DELETE(await admin('DELETE', null, 'Admin', `?id=${orderKey.id}`))).status, 200);
        assert.equal((await orders.POST(external('orders', orderKey.token, body))).status, 401);
    });
    await t.test('dashboard totals exclude drafts and separate cash/QRIS', async () => {
        const date = access.jakartaDate();
        await db.batch([
            { sql: 'INSERT INTO transactions VALUES (?,?,?,?,?,?,?)', args: ['CASH', date, '10:00:00', 28000, 'tunai', 'Meja 1', JSON.stringify([{ kode_barang: 'TEA', nama_barang: 'Lemon Tea', qty: 2, subtotal: 28000 }])] },
            { sql: 'INSERT INTO transactions VALUES (?,?,?,?,?,?,?)', args: ['QRIS', date, '11.00.00', 14000, 'qris', '', JSON.stringify([{ kode_barang: 'TEA', nama_barang: 'Lemon Tea', qty: 1, subtotal: 14000 }])] },
        ]);
        const response = await overview.GET(await admin('GET'));
        assert.equal(response.status, 200);
        const data = (await response.json()).data;
        assert.equal(data.cash, 28000); assert.equal(data.qris, 14000); assert.equal(data.count, 2); assert.equal(data.total, 42000);
        assert.equal(data.drafts, 2); assert.equal(data.topProducts[0].qty, 3); assert.equal(data.graphs.hourly[11].total, 14000);
    });
});
