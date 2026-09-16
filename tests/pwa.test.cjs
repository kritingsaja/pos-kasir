const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');

function loadModule(file, dependencies, globals = {}) {
    const source = readFileSync(resolve(__dirname, '..', file), 'utf8');
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    });
    const exports = {};
    vm.runInNewContext(outputText, {
        exports, require: (name) => dependencies[name], process: { env: {} },
        TextEncoder, Headers, URL, console, ...globals,
    }, { filename: file });
    return exports;
}

test('PWA assets bypass login while protected routes retain authentication', async () => {
    const jose = await import('jose');
    const { middleware } = loadModule('src/middleware.ts', {
        'next/server': require('next/server'), jose,
    });
    const secret = new TextEncoder().encode('fallback_secret_key_for_pos_kasir_app');
    const cashier = await new jose.SignJWT({ role: 'Kasir', username: 'test' })
        .setProtectedHeader({ alg: 'HS256' }).sign(secret);
    const admin = await new jose.SignJWT({ role: 'Admin', username: 'test' })
        .setProtectedHeader({ alg: 'HS256' }).sign(secret);
    const assets = ['/sw.js', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png',
        '/workbox-f1770938.js', '/worker-9db29e3b70fe1019.js', '/swe-worker-5c72df51bb1f6ee0.js'];
    for (const token of [null, cashier, admin, 'expired-token']) {
        for (const path of assets) {
            const request = new NextRequest(`https://kasir.example${path}`);
            if (token) request.cookies.set('token', token);
            const response = await middleware(request);
            assert.equal(response.status, 200, `${path}, token=${token}`);
            assert.equal(response.headers.get('location'), null);
        }
    }
    for (const path of ['/api/products', '/api/products.json', '/api/icons/icon-192.png',
        '/kasir', '/worker-admin', '/icons/private']) {
        const response = await middleware(new NextRequest(`https://kasir.example${path}`));
        assert.equal(response.status, path.startsWith('/api/') ? 401 : 307, path);
    }
    const denied = new NextRequest('https://kasir.example/produk');
    denied.cookies.set('token', cashier);
    assert.equal((await middleware(denied)).headers.get('location'), 'https://kasir.example/kasir');
});

test('service worker registers after page load, only in supported production contexts', async () => {
    for (const [environment, secure, supported, expected] of [
        ['production', true, true, 1], ['development', true, true, 0],
        ['production', false, true, 0], ['production', true, false, 0],
    ]) {
        const effects = [];
        const calls = [];
        const react = {
            useEffect: (effect) => effects.push(effect),
            useState: (value) => [value, () => {}],
            useSyncExternalStore: () => false,
        };
        const { default: ClientLayout } = loadModule('src/components/ClientLayout.tsx', {
            react, 'react/jsx-runtime': require('react/jsx-runtime'),
            'next/navigation': { usePathname: () => '/login' },
            '@/components/Sidebar': { default: () => null },
        }, {
            process: { env: { NODE_ENV: environment } },
            window: { isSecureContext: secure },
            navigator: supported ? { serviceWorker: {
                register: (...args) => { calls.push(args); return Promise.resolve({}); },
            } } : {},
        });
        ClientLayout({ children: null });
        effects.at(-1)();
        await Promise.resolve();
        assert.equal(calls.length, expected);
        if (expected) {
            assert.equal(calls[0][0], '/sw.js');
            assert.equal(calls[0][1].scope, '/');
            assert.equal(calls[0][1].updateViaCache, 'none');
        }
    }
});
