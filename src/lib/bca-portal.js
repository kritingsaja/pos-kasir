import { BcaError } from './bca-matching.js';

export const QRMS_ORIGIN = 'https://qr.klikbca.com';
export const LOGIN_EMAIL = 'input[type="email"]';
export const LOGIN_PASSWORD = 'input[name="password"]';

// Serialized by Puppeteer: this function must not refer to module variables.
export function portalReady({ expected, previousTimeOrigin }) {
  // Never accept the old document after a navigation timed out before committing.
  if (typeof previousTimeOrigin === 'number' && performance.timeOrigin === previousTimeOrigin) return false;
  const visible = element => element && element.getClientRects().length > 0;
  if (Array.from(document.querySelectorAll('input[autocomplete="one-time-code"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]')).some(visible)) {
    return { kind: 'challenge' };
  }
  const login = visible(document.querySelector('input[type="email"]')) &&
    visible(document.querySelector('input[name="password"]'));
  const fields = Array.from(document.querySelectorAll('p')).map(p => p.innerText.trim());
  const merchant = fields.some(text => /^MID:\s*\d+$/.test(text)) &&
    fields.some(text => /^NMID:\s*ID\d{13}$/.test(text));
  if (expected === 'entry' && login) return { kind: 'login' };
  if ((expected === 'entry' || expected === 'merchant') && merchant) return { kind: 'merchant' };
  if (expected === 'signed_in' && !login && ['/menu', '/home'].includes(location.pathname)) return { kind: 'signed_in' };
  if (expected === 'calendar') {
    if (login) return { kind: 'login' };
    const buttons = Array.from(document.querySelectorAll('button.button-blue'));
    if (buttons.length && buttons.every(button => /^\d{1,2}$/.test(button.querySelector('h4')?.innerText.trim() ?? '') &&
      Boolean(button.querySelector('h6')?.innerText.trim()))) return { kind: 'calendar' };
  }
  return false;
}

export function transportCode(error) {
  return String(error?.message ?? '').match(/\bnet::(ERR_[A-Z0-9_]+)/)?.[1] ??
    (error?.name === 'TimeoutError' ? 'TIMEOUT' : 'UNKNOWN');
}

export async function waitForPortal(page, expected, timeout, previousTimeOrigin) {
  const handle = await page.waitForFunction(portalReady, { timeout }, { expected, previousTimeOrigin });
  try {
    const state = await handle.jsonValue();
    if (state.kind === 'challenge') throw new BcaError('BCA_VERIFICATION_REQUIRED', 'BCA meminta verifikasi tambahan. Buka portal BCA secara manual.');
    return state;
  } finally {
    await handle.dispose();
  }
}

// A navigation timeout does not mean the Angular form failed to render.
// Wait for the actual screen, and keep HTTP/TLS/network failures distinguishable.
export async function openPortal(page, path, expected, { limit, report = () => {}, retry = true } = {}) {
  const budget = limit ?? (ms => ms);
  for (let attempt = 1; attempt <= (retry ? 2 : 1); attempt++) {
    const start = Date.now();
    const timeout = budget(attempt === 1 ? 25_000 : 15_000);
    let transport;
    let status;
    let state;
    try {
      const previousTimeOrigin = await page.evaluate(() => performance.timeOrigin);
      try {
        const response = await page.goto(`${QRMS_ORIGIN}${path}`, {
          waitUntil: 'domcontentloaded', timeout: Math.min(15_000, timeout),
        });
        status = response?.status();
      } catch (error) {
        transport = transportCode(error);
        if (transport !== 'TIMEOUT' && transport !== 'ERR_ABORTED') throw error;
      }
      if (status >= 400) {
        throw new BcaError(status === 429 ? 'BCA_RATE_LIMITED' : 'BCA_HTTP_ERROR',
          status === 429 ? 'Portal BCA membatasi permintaan. Tunggu sebelum mencoba lagi.' : `Portal BCA mengembalikan HTTP ${status}. Coba lagi atau periksa portal secara manual.`);
      }
      state = await waitForPortal(page, expected, Math.max(1, timeout - (Date.now() - start)), previousTimeOrigin);
      report({ attempt, screen: expected, status, transport, ready: state.kind, durationMs: Date.now() - start });
      return state;
    } catch (error) {
      transport ??= transportCode(error);
      // No URLs, HTML, input values, cookies, tokens or bank rows in diagnostics.
      const screen = await page.evaluate(() => ({
        documentState: document.readyState,
        bodyLength: document.body?.innerText.length ?? 0,
        hasEmail: Boolean(document.querySelector('input[type="email"]')),
        hasPassword: Boolean(document.querySelector('input[name="password"]')),
      })).catch(() => ({}));
      report({ attempt, screen: expected, status, transport, ...screen, durationMs: Date.now() - start });
      if (error instanceof BcaError) throw error;
      if (transport === 'UNKNOWN') throw error;
      const transient = ['TIMEOUT', 'ERR_TIMED_OUT', 'ERR_CONNECTION_RESET', 'ERR_CONNECTION_CLOSED', 'ERR_NETWORK_CHANGED', 'ERR_ABORTED', 'ERR_EMPTY_RESPONSE'].includes(transport);
      if (retry && attempt === 1 && transient) continue; // Retry GET only, never the login submission.
      throw new BcaError(transient ? 'BCA_NAVIGATION_TIMEOUT' : 'BCA_NETWORK_ERROR',
        transient ? 'Server belum berhasil memuat halaman QRMS dalam batas waktu. Coba lagi atau periksa portal BCA secara manual.' : 'Koneksi server ke QRMS gagal. Periksa detail error atau gunakan portal BCA secara manual.');
    }
  }
}

// Track only bank XHR/fetch requests. Analytics or images must not hold up a check.
// A new calendar date must finish a new data request before its rows can be used.
export function trackBankData(page) {
  let revision = 0;
  let changedAt = Date.now();
  const pending = new Set();
  const failures = [];
  const tracked = request => {
    try { return ['xhr', 'fetch'].includes(request.resourceType()) && new URL(request.url()).origin === QRMS_ORIGIN; }
    catch { return false; }
  };
  const request = value => {
    if (!tracked(value)) return;
    revision++;
    pending.add(value);
    changedAt = Date.now();
  };
  const finished = value => { if (pending.delete(value)) changedAt = Date.now(); };
  const failed = value => {
    if (pending.has(value)) failures.push({ revision, type: 'network' });
    finished(value);
  };
  const response = value => {
    if (pending.has(value.request()) && value.status() >= 400) failures.push({ revision, type: 'http', status: value.status() });
  };
  page.on('request', request);
  page.on('requestfinished', finished);
  page.on('requestfailed', failed);
  page.on('response', response);
  return {
    get revision() { return revision; },
    async settle(since, { timeout, requireActivity = false }) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const error = failures.find(item => item.revision > since);
        if (error) throw new BcaError('BCA_DATA_REQUEST_FAILED', 'Permintaan data mutasi QRMS gagal. Daftar lama tidak digunakan untuk verifikasi.');
        if ((!requireActivity || revision > since) && pending.size === 0 && Date.now() - changedAt >= 500) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new BcaError('BCA_DATA_REQUEST_TIMEOUT', 'Pembaruan mutasi QRMS belum selesai. Coba muat ulang daftar.');
    },
    dispose() {
      page.off('request', request);
      page.off('requestfinished', finished);
      page.off('requestfailed', failed);
      page.off('response', response);
    },
  };
}
