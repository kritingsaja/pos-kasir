import { BcaError, MONTHS, datesToRead, parseCreditRow } from './bca-matching.js';

const ORIGIN = 'https://qr.klikbca.com';

export async function scrapeBcaPayments({ instant, expectedNmid, dates = datesToRead(instant), onProgress = () => {} }) {
  const { BCA_USER, BCA_PASS } = process.env;
  if (!BCA_USER || !BCA_PASS) throw new BcaError('BCA_CONFIG', 'BCA_USER dan BCA_PASS belum disiapkan.', 503);
  const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
    import('puppeteer-core'), import('@sparticuz/chromium'),
  ]);
  let browser;
  let page;
  let authenticated = false;
  let deadline;
  let stage = 'launching_browser';
  function progress(next) { stage = next; onProgress(next); }
  try {
    progress('launching_browser');
    browser = await puppeteer.launch({
      args: puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
      executablePath: await chromium.executablePath(),
      headless: 'shell', defaultViewport: { width: 1280, height: 900 }, timeout: 25_000,
    });
    deadline = setTimeout(() => { void browser.close().catch(() => {}); }, 80_000);
    page = await browser.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(15_000);
    progress('opening_login');
    await page.goto(`${ORIGIN}/login`, { waitUntil: 'domcontentloaded' });

    // Placeholders observed on the public login screen. No CAPTCHA bypass or login retries.
    const email = 'input[placeholder="louis.briyant@mail.com"]';
    const password = 'input[placeholder="Contoh: Bca12345"]';
    await page.waitForSelector(email, { visible: true });
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
    authenticated = true;

    // MID is obtained from the signed-in profile, rather than an environment variable.
    progress('reading_merchant');
    await page.goto(`${ORIGIN}/menu`, { waitUntil: 'domcontentloaded' });
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
    await page.goto(`${ORIGIN}/home?mid=${encodeURIComponent(merchant.mid)}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button.button-blue h4');
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
          wanted.months.includes(element.querySelector('h6')?.innerText.trim()),
        { day, months: [MONTHS[month - 1], ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]] });
        if (matches) { selected = button; break; }
      }
      if (!selected) throw new BcaError('DATE_UNAVAILABLE', 'Tanggal pembayaran tidak tersedia di kalender QRMS.', 422);
      await selected.click();
      await page.waitForNetworkIdle({ idleTime: 800, timeout: 15_000 });
      await page.waitForFunction(() => {
        const count = document.body.innerText.match(/TOTAL TRANSAKSI[^()]*\(\s*(\d+)\s*\)/)?.[1];
        const actual = document.querySelectorAll('table .reference-number').length;
        return count !== undefined && ((Number(count) === 0 && document.body.innerText.includes('Transaksi tidak ada')) || (Number(count) > 0 && actual === Number(count)));
      });
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
    console.error(JSON.stringify({ event: 'bca.scraper.error', stage,
      code: error instanceof BcaError ? error.code : 'BCA_UNAVAILABLE',
      kind: error instanceof Error ? error.name : 'UnknownError',
    }));
    if (error instanceof BcaError) throw error;
    throw new BcaError('BCA_UNAVAILABLE', 'Portal BCA tidak dapat dibaca saat ini. Coba lagi atau cek manual.');
  } finally {
    if (deadline) clearTimeout(deadline);
    if (authenticated && page && !page.isClosed()) {
      // Logout only the fresh scraper session. Never use the user's inspection-browser cookies.
      try {
        await page.goto(`${ORIGIN}/menu`, { waitUntil: 'domcontentloaded', timeout: 4_000 });
        const logout = await findByText(await page.$$('table tr'), 'Keluar');
        if (logout) {
          await logout.click();
          await page.waitForFunction(() => location.pathname === '/login', { timeout: 3_000 });
        }
      } catch { /* Closing the local browser is still mandatory when portal logout fails. */ }
    }
    if (browser) await browser.close().catch(() => {});
  }
}

async function findByText(elements, text) {
  for (const element of elements) {
    if (await element.evaluate((node, expected) => node.innerText.trim() === expected, text)) return element;
  }
  return undefined;
}
