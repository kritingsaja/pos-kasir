const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function fixture(fetcher) {
  let now = Date.now();
  const timers = new Map();
  const events = new Map();
  let nextTimer = 0;
  let calls = 0;
  const navigator = { onLine: true };
  const exports = {};
  let unsubscribe;
  const context = {
    exports, navigator, AbortController, Promise, Number,
    Date: class extends Date { static now() { return now; } },
    require: () => ({ useSyncExternalStore: (subscribe, snapshot) => { unsubscribe ??= subscribe(() => {}); return snapshot(); } }),
    fetch: async (...args) => { calls++; return fetcher(...args); },
    window: {
      setTimeout: (fn, ms) => { timers.set(++nextTimer, { fn, at: now + ms, repeat: 0 }); return nextTimer; },
      clearTimeout: id => timers.delete(id),
      setInterval: (fn, ms) => { timers.set(++nextTimer, { fn, at: now + ms, repeat: ms }); return nextTimer; },
      clearInterval: id => timers.delete(id),
      addEventListener: (event, fn) => events.set(event, fn),
      removeEventListener: event => events.delete(event),
    },
  };
  const source = readFileSync(resolve(__dirname, '../src/lib/bca-connection.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return {
    api: exports, get: () => exports.useBcaConnection(), calls: () => calls, now: () => now,
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) if (timer.at <= now) {
        if (timer.repeat) timer.at = now + timer.repeat; else timers.delete(id);
        timer.fn();
      }
    },
    offline() { navigator.onLine = false; events.get('offline')?.(); },
    online() { navigator.onLine = true; events.get('online')?.(); },
  };
}
const response = body => ({ ok: true, json: async () => body });

test('warmup is shared; payment check waits for warmup and the server throttle', async () => {
  let resolveRequest;
  const f = fixture(() => new Promise(resolve => { resolveRequest = resolve; }));
  const first = f.api.warmBcaConnection();
  assert.equal(f.api.warmBcaConnection(), first);
  assert.equal(f.get().state, 'checking');
  assert.equal(f.calls(), 1);
  let paymentReleased = false;
  const wait = f.api.waitForBcaWarmup().then(() => { paymentReleased = true; });
  await Promise.resolve();
  assert.equal(paymentReleased, false);
  resolveRequest(response({ success: true, warmed: true, connectionCheckedAt: new Date(f.now()).toISOString() }));
  await first;
  assert.equal(f.get().state, 'connected');
  assert.equal(paymentReleased, false);
  f.advance(5_100);
  await wait;
  assert.equal(paymentReleased, true);
});

test('configuration or cached claims cannot turn the indicator green', async () => {
  const f = fixture(() => response({ success: true, warmed: true, configured: true }));
  await f.api.warmBcaConnection();
  assert.equal(f.get().state, 'unknown');
  f.api.bcaConnected();
  assert.equal(f.get().state, 'unknown');
  f.api.bcaConnected(new Date(f.now() - 6 * 60_000).toISOString());
  assert.equal(f.get().state, 'unknown');
});

test('successful connection expires conservatively and offline is never green', () => {
  const f = fixture(() => response({}));
  f.api.bcaConnected(new Date(f.now()).toISOString());
  assert.equal(f.get().state, 'connected');
  f.advance(5 * 60_000);
  assert.equal(f.get().state, 'unknown');
  f.api.bcaConnected(new Date(f.now()).toISOString());
  f.offline();
  assert.equal(f.get().state, 'offline');
  f.api.bcaConnected(new Date(f.now()).toISOString());
  assert.equal(f.get().state, 'offline');
  f.online();
  assert.equal(f.get().state, 'unknown');
});

test('bank errors end in error; a later successful response can recover', async () => {
  const f = fixture(() => { throw new Error('network'); });
  await f.api.warmBcaConnection();
  assert.equal(f.get().state, 'error');
  f.api.bcaChecking();
  assert.equal(f.get().state, 'checking');
  f.api.bcaConnected(new Date(f.now()).toISOString());
  assert.equal(f.get().state, 'connected');
  f.api.bcaFailed();
  assert.equal(f.get().state, 'error');
});

test('warmup timeout releases waiting clients and never leaves a green indicator', async () => {
  const f = fixture((url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('timeout')));
  }));
  const pending = f.api.warmBcaConnection();
  assert.equal(f.get().state, 'checking');
  f.advance(115_000);
  await pending;
  await f.api.waitForBcaWarmup();
  assert.equal(f.get().state, 'error');
});
