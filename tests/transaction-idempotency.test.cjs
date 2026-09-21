const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadDb() {
    const source = readFileSync(resolve(__dirname, '../src/lib/db.ts'), 'utf8');
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    });
    const exports = {};
    const saved = new Map();
    const database = {
        async execute(statement) {
            assert.match(statement.sql, /ON CONFLICT\(id\) DO NOTHING/);
            const id = statement.args[0];
            if (saved.has(id)) return { rowsAffected: 0 };
            saved.set(id, statement.args);
            return { rowsAffected: 1 };
        },
    };
    const isolatedProcess = { ...process, env: { ...process.env, NODE_ENV: 'test', LIBSQL_URL: 'libsql://test' } };
    vm.runInNewContext(outputText, {
        exports, require: (name) => name === '@libsql/client'
            ? { createClient: () => database }
            : require(name),
        process: isolatedProcess, console,
    }, { filename: 'src/lib/db.ts' });
    return { dbModule: exports, saved };
}

test('the database inserts a transaction ID only once', async () => {
    const { dbModule, saved } = loadDb();
    const transaction = {
        id: 'TRX-IDEMPOTENT', tanggal: '2026-09-21', waktu: '10:00:00', items: '[]',
        subtotal: 72000, diskon_total: 0, total: 72000, bayar: 100000,
        kembalian: 28000, metode_bayar: 'tunai', kasir: 'Kasir', nama_pelanggan: '',
    };
    assert.equal(await dbModule.addTransactionIdempotent(transaction), true);
    assert.equal(await dbModule.addTransactionIdempotent({ ...transaction, total: 999999 }), false);
    assert.equal(saved.size, 1);
    assert.equal(saved.get('TRX-IDEMPOTENT')[6], 72000);
});
