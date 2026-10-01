import { BcaError, MONTHS, datesToRead, parseCreditRow } from './bca-matching.js';
import { QRMS_ORIGIN, LOGIN_EMAIL, LOGIN_PASSWORD, openPortal, waitForPortal, trackBankData, transportCode } from './bca-portal.js';

const ORIGIN = QRMS_ORIGIN;
const BROWSER_IDLE_TIMEOUT_MS = 10 * 60_000;
const SESSION_MAX_AGE_MS = 8 * 60 * 60_000;

// Reuse a QRMS browser profile while this Vercel function instance stays warm.
// Vercel may replace the instance at any time; the encrypted cookie cache is the fallback.
let reusableBrowser;
let reusablePage;
let reusableAccount;
let reusableMerchant;
let reusableUntil = 0;
let reusableBrowserIdleTimer;

export async function scrapeBcaPayments({ instant, expectedNmid, dates = datesToRead(instant), warmupOnly = false, sessionCookies = null, onSessionUpdate = async () => {}, onProgress = () => {} }) {
  const { BCA_USER, BCA_PASS } = process.env;
  if (!BCA_USER || !BCA_PASS) throw new BcaError('BCA_CONFIG', 'BCA_USER dan BCA_PASS belum disiapkan.', 503);
  let browser;
  let page;
  let browserReused = false;
  let deadline;
  let bankData;
  let requestFailed;
  let authenticated = false;
  const started = Date.now();
  const account = `${BCA_USER.trim().toLowerCase()}:${expectedNmid}`;
  const limit = milliseconds => {
    const remaining = 95_000 - (Date.now() - started);
    if (remaining <= 0) throw new BcaError('BCA_CHECK_TIMEOUT', 'Pengecekan QRMS melewati batas waktu. Coba lagi atau periksa secara manual.');
    return Math.min(milliseconds, remaining);
  };
  let stage = 'loading_dependencies';
  function progress(next) { stage = next; onProgress(next); }
  const report = detail => console.info(JSON.stringify({ event: 'bca.navigation', stage, ...detail }));
  try {
    progress('loading_dependencies');
    const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
      import('puppeteer-core'), import('@sparticuz/chromium'),
    ]);
    progress('launching_browser');
    clearTimeout(reusableBrowserIdleTimer);
    reusableBrowserIdleTimer = undefined;
    if (reusableBrowser?.connected && reusableAccount === account && reusableUntil > Date.now()) {
      browser = reusableBrowser;
      browserReused = true;
      page = reusablePage && !reusablePage.isClosed() ? reusablePage : undefined;
    } else {
      if (reusableBrowser) await closeBrowser(reusableBrowser);
      reusableBrowser = undefined;
      reusablePage = undefined;
      reusableMerchant = undefined;
      browser = await puppeteer.launch({
        args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
        executablePath: await chromium.executablePath(),
        headless: 'shell', defaultViewport: { width: 1280, height: 900 }, timeout: 25_000,
      });
      reusableBrowser = browser;
      reusableAccount = account;
      reusableUntil = Date.now() + SESSION_MAX_AGE_MS;
    }
    deadline = setTimeout(() => { void closeBrowser(browser); }, limit(95_000));
    page ??= await browser.newPage();
    reusablePage = page;
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(15_000);
    requestFailed = request => {
      if (!['document', 'script'].includes(request.resourceType())) return;
      if (!request.url().startsWith(`${ORIGIN}/`)) return;
      report({ resource: request.resourceType(), transport: transportCode({ message: request.failure()?.errorText }) });
    };
    page.on('requestfailed', requestFailed);
    bankData = trackBankData(page);
    // QRMS builds its calendar in the browser; keep its local date aligned with WIB matching.
    await page.emulateTimezone('Asia/Jakarta');
    const hasCookies = Array.isArray(sessionCookies) && sessionCookies.length > 0;
    if (!browserReused && hasCookies) await browser.setCookie(...sessionCookies);
    let merchant;
    if (browserReused && reusableMerchant && !warmupOnly) {
      // Same account/NMID and authenticated browser. Still reload /home for fresh bank data below.
      merchant = reusableMerchant;
      authenticated = true;
      progress('reusing_session');
    } else {
      progress(browserReused || hasCookies ? 'restoring_session' : 'opening_login');
      // A network failure is not evidence of an expired login. Only a rendered login form triggers login.
      const entry = await openPortal(page, browserReused || hasCookies ? '/menu' : '/login', 'entry', { limit, report });
      const sessionRestored = entry.kind === 'merchant';

      if (!sessionRestored) {
        progress('logging_in');
        await page.locator(LOGIN_EMAIL).fill(BCA_USER.trim());
        await page.locator(LOGIN_PASSWORD).fill(BCA_PASS);
        const buttons = await page.$$('button');
        const loginButton = await findByText(buttons, 'Masuk');
        if (!loginButton) throw new BcaError('PORTAL_CHANGED', 'Tombol login QRMS berubah.');
        await loginButton.click();
        progress('waiting_login_result');
        try {
          await waitForPortal(page, 'signed_in', limit(25_000));
        } catch (error) {
          if (error instanceof BcaError) throw error;
          throw new BcaError('BCA_LOGIN_FAILED', 'Login QRMS gagal atau memerlukan verifikasi. Periksa akun secara manual.', 502);
        }
        progress('reading_merchant');
        await openPortal(page, '/menu', 'merchant', { limit, report });
      }

      // MID is obtained from the signed-in profile, rather than an environment variable.
      progress('reading_merchant');
      merchant = await page.evaluate(() => {
        const fields = Array.from(document.querySelectorAll('p')).map(p => p.innerText.trim());
        return {
          mid: fields.map(text => text.match(/^MID:\s*(\d+)$/)?.[1]).find(Boolean),
          nmid: fields.map(text => text.match(/^NMID:\s*(ID\d{13})$/)?.[1]).find(Boolean),
        };
      });
      if (!merchant.mid || merchant.nmid !== expectedNmid) {
        throw new BcaError('WRONG_MERCHANT', 'Merchant pada akun BCA berbeda dari QRIS di Pengaturan.', 409);
      }
      authenticated = true;
      reusableMerchant = merchant;
      // Reuse the authenticated session next time, but only after verifying the expected merchant.
      const sessionStored = await onSessionUpdate(await page.cookies(ORIGIN).then(cookies => cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        ...(cookie.expires > 0 ? { expires: cookie.expires } : {}),
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}),
        ...(cookie.priority ? { priority: cookie.priority } : {}),
        ...(cookie.sourceScheme ? { sourceScheme: cookie.sourceScheme } : {}),
        ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}),
      }))));
      const storageCounts = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
      console.info(JSON.stringify({ event: 'bca.session', browserReused, sessionRestored,
        stored: sessionStored === true, storageCounts }));
    }
    if (warmupOnly) {
      progress('connection_ready');
      return [];
    }
    progress('opening_transactions');
    const initialDataRevision = bankData.revision;
    const transactionScreen = await openPortal(page, `/home?mid=${encodeURIComponent(merchant.mid)}`, 'calendar', { limit, report });
    if (transactionScreen.kind === 'login') {
      authenticated = false;
      throw new BcaError('BCA_SESSION_EXPIRED', 'Sesi BCA berakhir saat membuka mutasi. Coba lagi untuk login ulang.');
    }
    progress('reading_calendar');
    await bankData.settle(initialDataRevision, { timeout: limit(20_000) });
    const calendar = await page.evaluate(() => {
      const now = new Date();
      return {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        browserDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        buttons: Array.from(document.querySelectorAll('button.button-blue')).map(button => ({
          day: button.querySelector('h4')?.innerText.trim(),
          month: button.querySelector('h6')?.innerText.trim(),
        })),
      };
    });
    // Date labels only. Never include merchant data, bank rows, credentials or cookies.
    console.info(JSON.stringify({ event: 'bca.calendar', requestedDates: dates, ...calendar }));
    const rows = [];
    progress('reading_mutations');
    for (const date of dates) {
      const [year, month, day] = date.split('-').map(Number);
      void year; // The portal calendar covers the current seven days; request age is validated.
      const dateButtons = await page.$$('button.button-blue');
      let selected;
      for (const button of dateButtons) {
        const matches = await button.evaluate((element, wanted) =>
          Number(element.querySelector('h4')?.innerText.trim()) === wanted.day &&
          wanted.months.includes((element.querySelector('h6')?.innerText.trim() ?? '').replace(/\.$/, '').toLowerCase()),
        { day, months: [MONTHS[month - 1], ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]].map(value => value.toLowerCase()) });
        if (matches) { selected = button; break; }
      }
      if (!selected) throw new BcaError('DATE_UNAVAILABLE', `Tanggal pembayaran ${date} tidak tersedia di kalender QRMS.`, 422);
      const alreadySelected = await selected.evaluate(element => element.classList.contains('highlight'));
      if (!alreadySelected) {
        progress('refreshing_mutations');
        const revision = bankData.revision;
        await selected.click();
        await page.waitForFunction(wanted => Array.from(document.querySelectorAll('button.button-blue')).some(button =>
          Number(button.querySelector('h4')?.innerText.trim()) === wanted.day &&
          wanted.months.includes((button.querySelector('h6')?.innerText.trim() ?? '').replace(/\.$/, '').toLowerCase()) &&
          button.classList.contains('highlight')),
        { timeout: limit(10_000) }, { day, months: [MONTHS[month - 1], ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]].map(value => value.toLowerCase()) });
        await bankData.settle(revision, { timeout: limit(20_000), requireActivity: true });
      }
      progress('reading_mutation_rows');
      await page.waitForFunction(() => {
        const count = document.body.innerText.match(/TOTAL TRANSAKSI[^\n]*\(\s*(\d+)\s*\)/i)?.[1];
        const actual = document.querySelectorAll('table .reference-number').length;
        return count !== undefined && ((Number(count) === 0 && document.body.innerText.includes('Transaksi tidak ada')) || (Number(count) > 0 && actual === Number(count)));
      }, { timeout: limit(20_000) });
      const rawRows = await page.evaluate(() => Array.from(document.querySelectorAll('table tr'))
        .filter(row => row.querySelector('.reference-number'))
        .map(row => ({
          reference: row.querySelector('.reference-number')?.innerText ?? '',
          merchant: row.querySelector('td .text-primary')?.innerText ?? '',
          description: row.querySelector('.font-size-detail-trx')?.innerText ?? '',
          amount: row.querySelector('td.text-right h4')?.innerText ?? '',
        })));
      // Match all loaded rows in the window, not only ten, to avoid false negatives at busy times.
      for (const raw of rawRows) {
        const transaction = parseCreditRow(raw, date);
        if (transaction) rows.push(transaction);
      }
    }
    return rows;
  } catch (error) {
    const launchDetail = stage === 'launching_browser' && error instanceof Error
      ? error.message.replace(/[\r\n\t]+/g, ' ').slice(0, 240)
      : undefined;
    console.error(JSON.stringify({ event: 'bca.scraper.error', stage,
      code: error instanceof BcaError ? error.code : 'BCA_UNAVAILABLE',
      kind: error instanceof Error ? error.name : 'UnknownError',
      ...(launchDetail ? { detail: launchDetail } : {}),
    }));
    if (error instanceof BcaError) throw error;
    const failure = STAGE_FAILURES[stage];
    throw new BcaError(failure?.code ?? 'BCA_UNAVAILABLE',
      failure?.message ?? 'Portal BCA tidak dapat dibaca saat ini. Coba lagi atau cek manual.');
  } finally {
    if (deadline) clearTimeout(deadline);
    bankData?.dispose();
    if (page && requestFailed) page.off('requestfailed', requestFailed);
    if (authenticated && browser && browser === reusableBrowser && browser.connected && page && !page.isClosed()) {
      clearTimeout(reusableBrowserIdleTimer);
      reusableBrowserIdleTimer = setTimeout(() => {
        if (reusableBrowser === browser) { reusableBrowser = undefined; reusablePage = undefined; reusableMerchant = undefined; }
        void closeBrowser(browser);
      }, Math.max(0, Math.min(BROWSER_IDLE_TIMEOUT_MS, reusableUntil - Date.now())));
      reusableBrowserIdleTimer.unref?.();
    } else if (browser) {
      if (reusableBrowser === browser) { reusableBrowser = undefined; reusablePage = undefined; reusableMerchant = undefined; }
      await closeBrowser(browser);
    }
  }
}

// Fixed messages only: never return raw browser errors, bank HTML or credential values.
const STAGE_FAILURES = {
  loading_dependencies: { code: 'BCA_BROWSER_DEPENDENCIES', message: 'Komponen browser pengecekan BCA gagal dimuat di server.' },
  launching_browser: { code: 'BCA_BROWSER_START_FAILED', message: 'Browser pengecekan BCA gagal dijalankan di server. Login BCA belum dicoba.' },
  opening_login: { code: 'BCA_LOGIN_PAGE_UNAVAILABLE', message: 'Server belum berhasil membuka halaman login BCA.' },
  waiting_login_form: { code: 'BCA_LOGIN_FORM_UNAVAILABLE', message: 'Form login BCA belum dapat dibaca oleh server. Login BCA belum dicoba.' },
  logging_in: { code: 'BCA_LOGIN_FAILED', message: 'Login BCA dari server belum berhasil. Periksa login manual dan apakah BCA meminta verifikasi tambahan.' },
  waiting_login_result: { code: 'BCA_LOGIN_FAILED', message: 'Login BCA belum selesai. Periksa portal secara manual.' },
  reading_merchant: { code: 'BCA_PROFILE_UNAVAILABLE', message: 'Server belum dapat membaca profil merchant setelah proses login BCA.' },
  opening_transactions: { code: 'BCA_TRANSACTION_PAGE_UNAVAILABLE', message: 'Halaman transaksi BCA belum dapat dibuka setelah membaca profil merchant.' },
  reading_calendar: { code: 'BCA_CALENDAR_UNAVAILABLE', message: 'Kalender transaksi BCA belum selesai dimuat atau formatnya berubah.' },
  restoring_session: { code: 'BCA_SESSION_RESTORE_FAILED', message: 'Sesi BCA lama tidak dapat digunakan. Coba login ulang otomatis.' },
  refreshing_mutations: { code: 'BCA_MUTATION_REFRESH_TIMEOUT', message: 'QRMS belum selesai membuka transaksi pada tanggal yang dipilih. Coba muat ulang daftar.' },
  reading_mutation_rows: { code: 'BCA_MUTATION_LIST_TIMEOUT', message: 'Daftar QRIS belum selesai dimuat atau tampilannya berubah. Coba lagi atau cek manual.' },
  reading_mutations: { code: 'BCA_MUTATIONS_UNAVAILABLE', message: 'Halaman BCA sudah terbuka, tetapi daftar mutasi belum dapat dibaca.' },
};

async function closeBrowser(browser) {
  let timer;
  try {
    await Promise.race([browser.close().catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, 3_000); })]);
  } finally { clearTimeout(timer); }
}

async function findByText(elements, text) {
  for (const element of elements) {
    if (await element.evaluate((node, expected) => node.innerText.trim() === expected, text)) return element;
  }
  return undefined;
}

