const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadSource(file, imports = {}) {
    const exports = {};
    const code = ts.transpileModule(readFileSync(resolve(__dirname, '..', file), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(code, {
        exports, require: name => imports[name] || require(name),
        fetch: async () => ({}), navigator: { userAgent: 'receipt-test' },
        console, Date, setTimeout, clearTimeout, Uint8Array,
    });
    return exports;
}

const { BluetoothPrinter } = loadSource('src/lib/bluetooth-printer.ts');
const Receipt = loadSource('src/components/Receipt.tsx', {
    '@/lib/bluetooth-printer': { printer: {} },
}).default;
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function fixture(override, qty = 2, isDraft = false) {
    const price = override ?? 10000;
    return {
        namaToko: 'Fixture Cafe', alamatToko: '', teleponToko: '',
        transactionId: 'fixture-sale', tanggal: '08/10/2026', waktu: '10:00', kasir: 'Kasir',
        items: [{ nama_barang: 'Lemon Tea', qty, harga_jual: 10000,
            ...(override !== undefined ? { harga_override: override } : {}), subtotal: price * qty }],
        subtotal: price * qty, diskonTotal: 0, total: price * qty,
        bayar: price * qty, kembalian: 0, metodeBayar: 'tunai', footerNota: '', isDraft,
    };
}

for (const [label, override, qty, isDraft] of [
    ['regular menu price', undefined, 2, false],
    ['lower cashier price', 7000, 2, false],
    ['higher cashier price', 15000, 3, false],
    ['zero cashier price', 0, 1, false],
    ['draft with cashier price', 7000, 2, true],
]) {
    test(label + ': Bluetooth and browser receipt use the same unit price', async () => {
        // JSON roundtrip also covers reprinting saved transaction and draft items.
        const data = JSON.parse(JSON.stringify(fixture(override, qty, isDraft)));
        const printer = new BluetoothPrinter();
        let printed;
        printer.sendBytes = async bytes => { printed = Buffer.from(bytes).toString('utf8'); };
        await printer.printReceipt(data);
        const price = override ?? 10000;
        assert(printed.includes('  ' + qty + ' x ' + price + ' = ' + data.total));
        assert(printed.includes('TOTAL: ' + data.total));
        if (override !== undefined) assert(!printed.includes(' x 10000 = '));
        assert.equal(data.items[0].harga_jual, 10000);
        const html = renderToStaticMarkup(React.createElement(Receipt, data));
        assert(html.includes(qty + ' x Rp ' + price.toLocaleString('id-ID')));
    });
}
