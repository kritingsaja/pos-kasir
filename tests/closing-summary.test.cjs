const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}, globals = {}) {
    const { outputText } = ts.transpileModule(readFileSync(resolve(__dirname, '..', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    });
    const exports = {};
    vm.runInNewContext(outputText, { exports, require: (name) => dependencies[name], Error, AbortController, ...globals });
    return exports;
}

const date = '2026-09-18';
const summaryModule = load('src/lib/closing-summary.ts');
const rows = [
    { tanggal: date, total: 72000, bayar: 100000, kembalian: 28000, metode_bayar: 'tunai' },
    { tanggal: date, total: '43000', metode_bayar: ' QRIS ' },
    { tanggal: date, total: 15000, metode_bayar: 'Cash' },
    { tanggal: '2026-09-17', total: 999999, metode_bayar: 'tunai' },
];

test('closing counts today only and uses sales totals rather than tendered cash', () => {
    const summary = summaryModule.summarizeClosing(rows, date);
    assert.equal(summary.cash, 87000);
    assert.equal(summary.qris, 43000);
    assert.equal(summary.total, 130000);
    assert.equal(summary.count, 3);
    assert.equal(summary.cashCount, 2);
    assert.equal(summary.qrisCount, 1);
});

test('empty days, legacy cash and other methods reconcile without dropping sales', () => {
    assert.equal(summaryModule.summarizeClosing([], date).total, 0);
    const summary = summaryModule.summarizeClosing([
        { tanggal: date, total: 10000 }, { tanggal: date, total: 20000, metode_bayar: 'transfer' },
    ], date);
    assert.equal(summary.cash, 10000);
    assert.equal(summary.other, 20000);
    assert.equal(summary.count, 2);
    assert.equal(summary.total, summary.cash + summary.qris + summary.other);
    assert.throws(() => summaryModule.summarizeClosing([{ tanggal: date, total: 'invalid' }], date));
});

function flatten(tree) {
    if (tree == null || typeof tree === 'boolean') return '';
    if (Array.isArray(tree)) return tree.map(flatten).join('');
    return typeof tree === 'object' ? flatten(tree.props?.children) : String(tree);
}

function harness({ online = true, pending = 0, responseRows = rows, fail = false } = {}) {
    const state = [];
    const effects = [];
    const requests = [];
    let index;
    const { default: Component } = load('src/components/ClosingSummary.tsx', {
        react: {
            useState(initial) {
                const slot = index++;
                if (!(slot in state)) state[slot] = initial;
                return [state[slot], (value) => { state[slot] = typeof value === 'function' ? value(state[slot]) : value; }];
            },
            useEffect: (effect) => effects.push(effect), useRef: () => ({ current: null }),
        },
        'react/jsx-runtime': require('react/jsx-runtime'), '@/lib/closing-summary': summaryModule,
        '@/lib/utils': { getTodayDate: () => date, formatRupiah: (value) => `Rp${value}` },
    }, {
        fetch: async (url, options) => {
            requests.push({ url, options });
            return { ok: !fail, json: async () => ({ success: !fail, data: responseRows }) };
        },
    });
    const props = { isOnline: online, pendingCount: pending, onClose() {} };
    function render() { index = 0; effects.length = 0; return Component(props); }
    async function fetchSummary() {
        render();
        const cleanup = effects[1]();
        await new Promise((done) => setImmediate(done));
        return { tree: render(), cleanup };
    }
    return { state, requests, props, render, fetchSummary };
}

test('closing fetches the full current day and displays cash, QRIS and total', async () => {
    const app = harness({ pending: 2 });
    const { tree, cleanup } = await app.fetchSummary();
    assert.equal(app.requests[0].url, `/api/transactions?tanggal=${date}`);
    assert.equal(app.requests[0].options.cache, 'no-store');
    const text = flatten(tree);
    assert.ok(text.includes('Rp87000') && text.includes('Rp43000') && text.includes('Rp130000'));
    assert.ok(text.includes('2 transaksi offline belum tersinkron'));
    cleanup();
    assert.equal(app.requests[0].options.signal.aborted, true);
});

test('closing distinguishes empty results from failed/offline fetches', async () => {
    const empty = harness({ responseRows: [] });
    assert.ok(flatten((await empty.fetchSummary()).tree).includes('Belum ada transaksi hari ini.'));
    const failed = harness({ fail: true });
    assert.ok(flatten((await failed.fetchSummary()).tree).includes('Gagal mengambil ringkasan'));
    assert.equal(failed.state[0], null);
    const offline = harness({ online: false });
    assert.ok(flatten((await offline.fetchSummary()).tree).includes('Tidak ada koneksi'));
    assert.equal(offline.requests.length, 0);
});
