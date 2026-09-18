const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadModule(file, dependencies = {}, globals = {}) {
    const source = readFileSync(resolve(__dirname, '..', file), 'utf8');
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    });
    const exports = {};
    vm.runInNewContext(outputText, {
        exports, require: (name) => dependencies[name], console, ...globals,
    }, { filename: file });
    return exports;
}

const payment = loadModule('src/lib/cash-payment.ts');
const utils = loadModule('src/lib/utils.ts');

test('quick cash matches the requested examples and stays distinct above the total', () => {
    for (const [total, expected] of [
        [72000, [75000, 80000, 100000]], [15000, [20000, 50000, 100000]],
        [43000, [45000, 50000, 100000]],
    ]) assert.deepEqual(Array.from(payment.getQuickCashAmounts(total)), expected);
    for (const total of [0, 5000, 19999, 20000, 45000, 75000, 99999, 100000, 200000, 999999]) {
        const amounts = payment.getQuickCashAmounts(total);
        assert.equal(amounts.length, 3);
        assert.equal(new Set(amounts).size, 3);
        assert.ok(amounts[0] > total && amounts[1] > amounts[0] && amounts[2] > amounts[1]);
    }
});

function nodes(tree, predicate) {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, predicate));
    return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

function text(tree) {
    if (tree == null || typeof tree === 'boolean') return '';
    if (Array.isArray(tree)) return tree.map(text).join('');
    return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}

function cashier({ amount = null, method = 'tunai', online = true, discount = '' } = {}) {
    const source = readFileSync(resolve(__dirname, '../src/app/kasir/page.tsx'), 'utf8');
    const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const stateNames = [];
    function visit(node) {
        if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) &&
            node.initializer && ts.isCallExpression(node.initializer) &&
            node.initializer.expression.getText(ast) === 'useState') {
            stateNames.push(node.name.elements[0].name.getText(ast));
        }
        ts.forEachChild(node, visit);
    }
    visit(ast);
    const state = {
        step: 'payment', bayar: amount, metodeBayar: method, globalDiskon: discount,
        cart: [{ kode_barang: 'TEST', nama_barang: 'Test', harga_jual: 72000,
            qty: 1, diskon: 0, tipe_diskon: 1, subtotal: 72000 }],
    };
    let index = 0;
    const saved = [];
    const react = {
        useState(initial) {
            const name = stateNames[index++];
            if (!(name in state)) state[name] = initial;
            return [state[name], (value) => { state[name] = typeof value === 'function' ? value(state[name]) : value; }];
        },
        useEffect() {}, useCallback: (callback) => callback,
    };
    const { default: Page } = loadModule('src/app/kasir/page.tsx', {
        react, 'react/jsx-runtime': require('react/jsx-runtime'), '@/lib/utils': utils,
        '@/lib/cash-payment': payment, '@/components/Receipt': { default: () => null },
        '@/lib/useOfflineSync': { useOfflineSync: () => ({
            isOnline: online, saveOfflineTransaction: async (payload) => saved.push(payload),
        }) },
    }, {
        fetch: async (url, options) => {
            assert.equal(url, '/api/transactions');
            saved.push(JSON.parse(options.body));
            return { json: async () => ({ success: true }) };
        },
        setTimeout: () => 0,
        localStorage: { removeItem() {} },
    });
    function render() { index = 0; return Page(); }
    function input(tree) {
        return nodes(tree, (node) => node.type === 'input' && node.props.placeholder === 'Masukkan jumlah bayar...')[0];
    }
    async function checkout(tree) {
        const button = nodes(tree, (node) => node.type === 'button' &&
            ['Bayar & Simpan', 'QRIS Dibayar & Simpan'].includes(text(node)))[0];
        assert.ok(button);
        assert.ok(!button.props.disabled);
        button.props.onClick();
        await new Promise((done) => setImmediate(done));
    }
    return { render, input, checkout, saved, state };
}

test('blank cash checks out as exact payment online and offline', async () => {
    for (const online of [true, false]) {
        const app = cashier({ online });
        const tree = app.render();
        assert.equal(app.input(tree).props.value, '');
        await app.checkout(tree);
        assert.equal(app.saved[0].bayar, 72000);
        assert.equal(app.saved[0].kembalian, 0);
        assert.equal(app.saved[0].metode_bayar, 'tunai');
        assert.equal(app.state.bayar, null);
        assert.equal(app.state.step, 'receipt');
    }
});

test('entered cash keeps change calculation; zero and insufficient amounts are rejected', async () => {
    for (const amount of [100000, 72000, 70000, 0]) {
        const app = cashier({ amount });
        await app.checkout(app.render());
        if (amount < 72000) {
            assert.equal(app.saved.length, 0);
            assert.equal(app.state.toast.message, 'Jumlah bayar kurang!');
        } else {
            assert.equal(app.saved[0].bayar, amount);
            assert.equal(app.saved[0].kembalian, amount - 72000);
        }
    }
});

test('quick cash fills the input, shows change, and clears back to exact payment', async () => {
    const app = cashier();
    let tree = app.render();
    const quickCash = nodes(tree, (node) => node.props?.className === 'quick-cash')[0];
    const buttons = nodes(quickCash, (node) => node.type === 'button');
    assert.equal(buttons.length, 3);
    buttons[2].props.onClick();
    tree = app.render();
    assert.equal(app.input(tree).props.value, 100000);
    assert.ok(text(tree).includes(utils.formatRupiah(28000)));
    app.input(tree).props.onChange({ target: { value: '' } });
    tree = app.render();
    assert.equal(app.input(tree).props.value, '');
    await app.checkout(tree);
    assert.equal(app.saved[0].bayar, 72000);
    assert.equal(app.saved[0].kembalian, 0);
});

test('discounted total determines both blank payment and quick cash; QRIS stays unchanged', async () => {
    const discounted = cashier({ discount: '29000' });
    const tree = discounted.render();
    const quickCash = nodes(tree, (node) => node.props?.className === 'quick-cash')[0];
    const labels = nodes(quickCash, (node) => node.type === 'button').map(text);
    assert.deepEqual(labels, [45000, 50000, 100000].map(utils.formatRupiah));
    await discounted.checkout(tree);
    assert.equal(discounted.saved[0].total, 43000);
    assert.equal(discounted.saved[0].bayar, 43000);
    for (const amount of [null, 100000]) {
        const app = cashier({ method: 'qris', amount });
        await app.checkout(app.render());
        assert.equal(app.saved[0].bayar, 72000);
        assert.equal(app.saved[0].kembalian, 0);
        assert.equal(app.saved[0].metode_bayar, 'qris');
    }
});
