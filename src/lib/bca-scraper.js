import { BcaError, MONTHS, datesToRead, parseCreditRow } from './bca-matching.js';

const ORIGIN = 'https://qr.klikbca.com';
const BROWSER_IDLE_TIMEOUT_MS = 10 * 60_000;

// Reuse a QRMS browser profile while this Vercel function instance stays warm.
// Vercel may replace the instance at any time; the encrypted cookie cache is the fallback.
let reusableBrowser;
let reusableBrowserIdleTimer;

export async function scrapeBcaPayments({ instant, expectedNmid, dates = datesToRead(instant), sessionCookies = null, onSessionUpdate = async () => {}, onProgress = () => {} }) {
  const { BCA_USER, BCA_PASS } = process.env;
  if (!BCA_USER || !BCA_PASS) throw new BcaError('BCA_CONFIG', 'BCA_USER dan BCA_PASS belum disiapkan.', 503);
  let browser;
  let page;
  let browserReused = false;
  let deadline;
  let stage = 'loading_dependencies';
  function progress(next) { stage = next; onProgress(next); }
  try {
    progress('loading_dependencies');
    const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
      import('puppeteer-core'), import('@sparticuz/chromium'),
    ]);
    progress('launching_browser');
    if (reusableBrowser?.isConnected()) {
      browser = reusableBrowser;
      browserReused = true;
      clearTimeout(reusableBrowserIdleTimer);
      reusableBrowserIdleTimer = undefined;
    } else {
      reusableBrowser = undefined;
      browser = await puppeteer.launch({
        args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
        executablePath: await chromium.executablePath(),
        headless: 'shell', defaultViewport: { width: 1280, height: 900 }, timeout: 25_000,
      });
      reusableBrowser = browser;
    }
    deadline = setTimeout(() => { void browser.close().catch(() => {}); }, 80_000);
    page = await browser.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(15_000);
    // QRMS builds its calendar in the browser; keep its local date aligned with WIB matching.
    await page.emulateTimezone('Asia/Jakarta');
    progress('reading_merchant');
    let sessionRestored = false;
    if (browserReused || (Array.isArray(sessionCookies) && sessionCookies.length > 0)) {
      progress('restoring_session');
      try {
        if (!browserReused) await page.setCookie(...sessionCookies);
        await page.goto(`${ORIGIN}/menu`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => location.pathname === '/login' ||
          Array.from(document.querySelectorAll('p')).some(p => /^MID:\s*\d+/.test(p.innerText.trim())),
        { timeout: 8_000 });
        sessionRestored = await page.evaluate(() => location.pathname !== '/login' &&
          Array.from(document.querySelectorAll('p')).some(p => /^MID:\s*\d+/.test(p.innerText.trim())));
      } catch {
        sessionRestored = false;
      }
    }

    if (!sessionRestored) {
      progress('opening_login');
      // Placeholders observed on the public login screen. No CAPTCHA bypass or login retries.
      const email = 'input[placeholder="louis.briyant@mail.com"]';
      const password = 'input[placeholder="Contoh: Bca12345"]';
      try {
        await page.goto(`${ORIGIN}/login`, { waitUntil: 'domcontentloaded', timeout: 10_000 });
      } catch {
        // Sometimes QRMS finishes the page lifecycle late even though its form is already usable.
        const formIsPresent = await page.$(email).then(Boolean).catch(() => false);
        if (!formIsPresent) {
          throw new BcaError('BCA_LOGIN_PAGE_UNAVAILABLE', 'Halaman login QRMS belum merespons. Coba lagi atau periksa portal BCA secara manual.');
        }
      }
      progress('waiting_login_form');
      await page.waitForSelector(email, { visible: true });
      await page.waitForSelector(password, { visible: true });
      progress('logging_in');
      await page.type(email, BCA_USER);
      await page.type(password, BCA_PASS);
      const buttons = await page.$$('button');
      const loginButton = await findByText(buttons, 'Masuk');
      if (!loginButton) throw new BcaError('PORTAL_CHANGED', 'Tombol login QRMS berubah.');
      await loginButton.click();
      try {
        await page.waitForFunction(() => location.pathname !== '/login', { timeout: 25_000 });
      } catch {
        throw new BcaError('BCA_LOGIN_FAILED', 'Login QRMS gagal atau memerlukan verifikasi. Periksa akun secara manual.', 502);
      }
      await page.goto(`${ORIGIN}/menu`, { waitUntil: 'domcontentloaded' });
    }

    // MID is obtained from the signed-in profile, rather than an environment variable.
    progress('reading_merchant');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('p')).some(p => /^MID:\s*\d+/.test(p.innerText.trim())));
    const merchant = await page.evaluate(() => {
      const fields = Array.from(document.querySelectorAll('p')).map(p => p.innerText.trim());
      return {
        mid: fields.map(text => text.match(/^MID:\s*(\d+)$/)?.[1]).find(Boolean),
        nmid: fields.map(text => text.match(/^NMID:\s*(ID\d{13})$/)?.[1]).find(Boolean),
      };
    });
    if (!merchant.mid || merchant.nmid !== expectedNmid) {
      throw new BcaError('WRONG_MERCHANT', 'Merchant pada akun BCA berbeda dari QRIS di Pengaturan.', 409);
    }
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
    progress('opening_transactions');
    await page.goto(`${ORIGIN}/home?mid=${encodeURIComponent(merchant.mid)}`, { waitUntil: 'domcontentloaded' });
    progress('reading_calendar');
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button.button-blue'));
      return buttons.length > 0 && buttons.every(button =>
        /^\d{1,2}$/.test(button.querySelector('h4')?.innerText.trim() ?? '') &&
        Boolean(button.querySelector('h6')?.innerText.trim()));
    });
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
        await selected.click();
        await page.waitForFunction(wanted => Array.from(document.querySelectorAll('button.button-blue')).some(button =>
          Number(button.querySelector('h4')?.innerText.trim()) === wanted.day &&
          (button.querySelector('h6')?.innerText.trim() ?? '').replace(/\.$/, '').toLowerCase() === wanted.month &&
          button.classList.contains('highlight')),
        { timeout: 10_000 }, { day, month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1].toLowerCase() });
      }
      progress('reading_mutation_rows');
      await page.waitForFunction(() => {
        const count = document.body.innerText.match(/TOTAL TRANSAKSI[^()]*\(\s*(\d+)\s*\)/)?.[1];
        const actual = document.querySelectorAll('table .reference-number').length;
        return count !== undefined && ((Number(count) === 0 && document.body.innerText.includes('Transaksi tidak ada')) || (Number(count) > 0 && actual === Number(count)));
      }, { timeout: 20_000 });
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
    if (page && !page.isClosed()) await page.close().catch(() => {});
    if (browser && browser === reusableBrowser && browser.isConnected()) {
      clearTimeout(reusableBrowserIdleTimer);
      reusableBrowserIdleTimer = setTimeout(() => {
        if (reusableBrowser === browser) reusableBrowser = undefined;
        void browser.close().catch(() => {});
      }, BROWSER_IDLE_TIMEOUT_MS);
      reusableBrowserIdleTimer.unref?.();
    } else if (browser) {
      await browser.close().catch(() => {});
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
  reading_merchant: { code: 'BCA_PROFILE_UNAVAILABLE', message: 'Server belum dapat membaca profil merchant setelah proses login BCA.' },
  opening_transactions: { code: 'BCA_TRANSACTION_PAGE_UNAVAILABLE', message: 'Halaman transaksi BCA belum dapat dibuka setelah membaca profil merchant.' },
  reading_calendar: { code: 'BCA_CALENDAR_UNAVAILABLE', message: 'Kalender transaksi BCA belum selesai dimuat atau formatnya berubah.' },
  restoring_session: { code: 'BCA_SESSION_RESTORE_FAILED', message: 'Sesi BCA lama tidak dapat digunakan. Coba login ulang otomatis.' },
  refreshing_mutations: { code: 'BCA_MUTATION_REFRESH_TIMEOUT', message: 'QRMS belum selesai membuka transaksi pada tanggal yang dipilih. Coba muat ulang daftar.' },
  reading_mutation_rows: { code: 'BCA_MUTATION_LIST_TIMEOUT', message: 'Daftar QRIS belum selesai dimuat atau tampilannya berubah. Coba lagi atau cek manual.' },
  reading_mutations: { code: 'BCA_MUTATIONS_UNAVAILABLE', message: 'Halaman BCA sudah terbuka, tetapi daftar mutasi belum dapat dibaca.' },
};

async function findByText(elements, text) {
  for (const element of elements) {
    if (await element.evaluate((node, expected) => node.innerText.trim() === expected, text)) return element;
  }
  return undefined;
}
