const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const ts = require('typescript');

function loader(overrides = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(code, {
      exports, require: name => overrides[name] ?? (name.startsWith('.') ? load(resolve(dirname(file), name)) : require(name)),
      process: { env: { BCA_USER: 'fixture@example.invalid', BCA_PASS: 'fixture-only' } },
      console: { info() {}, error() {} }, setTimeout, clearTimeout, URL, Date, Intl,
    }, { filename: file });
    return exports;
  }
  return name => load(resolve(__dirname, '..', 'src/lib', name));
}
const portal = loader()('bca-portal.js');
const timeoutError = () => Object.assign(new Error('Navigation timeout'), { name: 'TimeoutError' });
const handle = value => ({ jsonValue: async () => value, dispose: async () => {} });

test('a timed-out navigation cannot reuse the previous document as a fresh response', () => {
  const result = vm.runInNewContext(`(${portal.portalReady.toString()})({expected: 'entry', previousTimeOrigin: 42})`, {
    performance: { timeOrigin: 42 },
    document: { querySelectorAll() { throw new Error('stale DOM must not be read'); } },
  });
  assert.equal(result, false);
});

test('a late-rendered login form can succeed after document lifecycle timeout', async () => {
  let waits = 0;
  const reports = [];
  const page = { evaluate: async () => 1, goto: async () => { throw timeoutError(); }, waitForFunction: async () => { waits++; return handle({ kind: 'login' }); } };
  const state = await portal.openPortal(page, '/login', 'entry', { report: item => reports.push(item) });
  assert.equal(state.kind, 'login');
  assert.equal(waits, 1);
  assert.equal(reports[0].transport, 'TIMEOUT');
});

test('only transient GET failures retry; HTTP rejection and certificate failures stop', async t => {
  for (const failure of ['reset', 'http', 'tls', 'challenge']) {
    await t.test(failure, async () => {
      let attempts = 0;
      const page = {
        goto: async () => {
          attempts++;
          if (failure === 'reset' && attempts === 1) throw new Error('net::ERR_CONNECTION_RESET');
          if (failure === 'tls') throw new Error('net::ERR_CERT_AUTHORITY_INVALID');
          return { status: () => failure === 'http' ? 403 : 200 };
        },
        waitForFunction: async () => handle({ kind: failure === 'challenge' ? 'challenge' : 'login' }),
        evaluate: async () => ({ documentState: 'loading', bodyLength: 0 }),
      };
      if (failure === 'reset') {
        assert.equal((await portal.openPortal(page, '/login', 'entry')).kind, 'login');
        assert.equal(attempts, 2);
      } else {
        const code = { http: 'BCA_HTTP_ERROR', tls: 'BCA_NETWORK_ERROR', challenge: 'BCA_VERIFICATION_REQUIRED' }[failure];
        await assert.rejects(portal.openPortal(page, '/login', 'entry'), error => error.code === code);
        assert.equal(attempts, 1);
      }
    });
  }
});

test('calendar highlight cannot make old rows eligible while new bank data is pending', async () => {
  const page = new EventEmitter();
  const tracker = portal.trackBankData(page);
  const request = { resourceType: () => 'xhr', url: () => 'https://qr.klikbca.com/fixture' };
  const since = tracker.revision;
  page.emit('request', request);
  let settled = false;
  const wait = tracker.settle(since, { timeout: 2_000, requireActivity: true }).then(() => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.equal(settled, false, 'old rows with the same count must not be accepted');
  page.emit('requestfinished', request);
  await wait;
  assert.equal(settled, true);
  tracker.dispose();
  assert.equal(page.listenerCount('request'), 0);
});

test('data request failure and a date change without any request fail closed', async () => {
  const page = new EventEmitter();
  const tracker = portal.trackBankData(page);
  await assert.rejects(tracker.settle(0, { timeout: 60, requireActivity: true }), error => error.code === 'BCA_DATA_REQUEST_TIMEOUT');
  const request = { resourceType: () => 'fetch', url: () => 'https://qr.klikbca.com/fixture' };
  page.emit('request', request);
  page.emit('response', { request: () => request, status: () => 500 });
  page.emit('requestfinished', request);
  await assert.rejects(tracker.settle(0, { timeout: 100 }), error => error.code === 'BCA_DATA_REQUEST_FAILED');
  tracker.dispose();
});

function browserFixture({ restoreCookies = false, navigationFailure = false } = {}) {
  const metrics = { launches: 0, pages: 0, submits: 0, fills: 0, closes: 0, visits: [] };
  const merchantNmid = 'ID1234567890123';
  const date = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const [, month, day] = date.split('-').map(Number);
  const monthLabel = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][month - 1];
  const browsers = [];
  const launch = async () => {
    metrics.launches++;
    let loggedIn = false;
    let pathname = '/login';
    let timeOrigin = 1;
    const page = new EventEmitter();
    const input = { getClientRects: () => [1] };
    const calendarButton = {
      querySelector: selector => ({ innerText: selector === 'h4' ? String(day) : monthLabel }),
      classList: { contains: () => true },
    };
    const rowValues = {
      '.reference-number': 'RRN: 123456789012 | 10.00 WIB',
      'td .text-primary': `Fixture Cafe (NMID: ${merchantNmid})`,
      '.font-size-detail-trx': 'Menerima pembayaran dari BANK FIXTURE',
      'td.text-right h4': '+ Rp 50.000',
    };
    const row = { querySelector: selector => rowValues[selector] ? { innerText: rowValues[selector] } : null };
    const document = {
      readyState: 'complete',
      body: { get innerText() { return pathname === '/home' ? 'TOTAL TRANSAKSI Fixture Cafe ( 1 )\nRp 50.000' : ''; } },
      querySelector: selector => pathname === '/login' && selector.startsWith('input[') ? input : null,
      querySelectorAll: selector => {
        if (selector === 'p') return pathname === '/menu' ? [{ innerText: 'MID: 123' }, { innerText: `NMID: ${merchantNmid}` }] : [];
        if (selector === 'button.button-blue') return pathname === '/home' ? [calendarButton] : [];
        if (selector === 'table .reference-number') return pathname === '/home' ? [row.querySelector('.reference-number')] : [];
        if (selector === 'table tr') return pathname === '/home' ? [row] : [];
        return [];
      },
    };
    const evaluate = (fn, ...args) => vm.runInNewContext(`(${fn.toString()})(...args)`, {
      document, location: { pathname }, performance: {timeOrigin}, args, localStorage: { length: 1 }, sessionStorage: { length: 1 }, Intl, Date,
    });
    Object.assign(page, {
      setDefaultTimeout() {}, setDefaultNavigationTimeout() {}, emulateTimezone: async () => {}, isClosed: () => false,
      goto: async url => {
        metrics.visits.push(new URL(url).pathname);
        if (navigationFailure) throw new Error('net::ERR_CONNECTION_RESET');
        timeOrigin++;
        pathname = loggedIn ? new URL(url).pathname : '/login';
        return { status: () => 200 };
      },
      evaluate: async (fn, ...args) => evaluate(fn, ...args),
      waitForFunction: async (fn, options, ...args) => {
        const value = evaluate(fn, ...args);
        if (!value) throw timeoutError();
        return handle(value);
      },
      locator: () => ({ fill: async () => { metrics.fills++; } }),
      $$: async selector => selector === 'button' ? [{
        evaluate: async (fn, arg) => fn({ innerText: 'Masuk' }, arg),
        click: async () => { metrics.submits++; loggedIn = true; pathname = '/menu'; },
      }] : [{ evaluate: async (fn, arg) => fn(calendarButton, arg) }],
      cookies: async () => [],
    });
    const browser = {
      connected: true,
      newPage: async () => { metrics.pages++; return page; },
      setCookie: async () => { loggedIn = restoreCookies; },
      close: async () => { metrics.closes++; browser.connected = false; },
    };
    browsers.push(browser);
    return browser;
  };
  const load = loader({
    'puppeteer-core': { defaultArgs: async () => [], launch },
    '@sparticuz/chromium': { args: [], executablePath: async () => '/fixture/chromium' },
  });
  const { scrapeBcaPayments } = load('bca-scraper.js');
  return { metrics, browsers, check: options => scrapeBcaPayments({ instant: Date.now(), expectedNmid: merchantNmid, dates: [date], ...options }) };
}

test('full scrape: one login, same tab on second request, new browser after disconnect', async () => {
  const { metrics, browsers, check } = browserFixture();
  const rows = await check();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 50_000);
  assert.equal(rows[0].rrn, '123456789012');
  await check();
  assert.equal(metrics.submits, 1);
  assert.equal(metrics.launches, 1);
  assert.equal(metrics.pages, 1);
  browsers[0].connected = false;
  await check();
  assert.equal(metrics.launches, 2);
  assert.equal(metrics.submits, 2);
  await assert.rejects(check({ expectedNmid: 'ID9999999999999' }), error => error.code === 'WRONG_MERCHANT');
});

test('restored cookie session skips login; expired cookie session uses the existing form once', async () => {
  for (const restored of [true, false]) {
    const { metrics, check } = browserFixture({ restoreCookies: restored });
    await check({ sessionCookies: [{ name: 'fixture', value: 'fixture', domain: 'qr.klikbca.com', path: '/' }] });
    assert.equal(metrics.submits, restored ? 0 : 1);
    assert.equal(metrics.visits.filter(path => path === '/login').length, 0);
  }
});

test('failure to restore due to network never submits credentials, and discards unhealthy browser', async () => {
  const { metrics, check } = browserFixture({ navigationFailure: true });
  await assert.rejects(check({ sessionCookies: [{ name: 'fixture', value: 'fixture' }] }), error => error.code === 'BCA_NAVIGATION_TIMEOUT');
  assert.equal(metrics.submits, 0);
  assert.equal(metrics.visits.length, 2);
  assert.ok(metrics.visits.every(path => path === '/menu'));
  assert.equal(metrics.closes, 1);
});
