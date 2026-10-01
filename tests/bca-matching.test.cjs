const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const now = Date.parse('2026-10-01T14:19:20+07:00');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Date: class extends Date { static now() { return now; } },
    require: name => {
      if (name === '@libsql/client' || name === 'jose') return {};
      return name.startsWith('.') ? load(resolve(dirname(file), name)) : require(name);
    },
    console, process: { env: {} }, setTimeout, clearTimeout, URL, Intl,
  }, { filename: file });
  return exports;
}
const { parseCreditRow, validatePayment, candidatePayments } = load(resolve(__dirname, '../src/lib/bca-matching.js'));
const { claimForSale } = load(resolve(__dirname, '../src/lib/bca-check.js'));
const nmid = 'ID1234567890123';
const date = '2026-10-01';
const timestamp = new Date(now).toISOString();
const checkoutId = 'fixture-checkout-123';
const incoming = (rrn, time = '14.19', amount = '+ Rp 2') => ({
  reference: `RRN: ${rrn} | ${time} WIB`,
  merchant: `FIXTURE CAFE (NMID: ${nmid})`,
  description: 'Menerima pembayaran dari DANA a.n. ****', amount,
});

test('observed QRMS formats: alphanumeric wallet RRNs and numeric bank RRNs coexist', () => {
  // Synthetic references and NMID; retain only the screenshot's format, time and amounts.
  const rows = [
    incoming('1abc23456789', '14.19', '+ Rp 2'),
    incoming('1abcn0e12345', '11.35', '+ Rp 3'),
    incoming('610412123456', '10.50', '+ Rp 7'),
    incoming('610415123456', '07.59', '+ Rp 10.000'),
  ].map(row => parseCreditRow(row, date));
  assert.deepEqual(rows.map(row => row.amount), [2, 3, 7, 10000]);
  assert.equal(rows[0].rrn, '1abc23456789');
  assert.equal(rows[1].rrn, '1abcn0e12345');
  assert.equal(rows[0].timePrecision, 'minute');
  const payment = validatePayment({ amount: 2, timestamp, checkoutId, rrn: rows[0].rrn }, now);
  assert.equal(candidatePayments(rows, payment, nmid)[0].rrn, rows[0].rrn);
});

test('RRNs stay text, preserving case and leading zeroes through parsing and selection', () => {
  for (const rrn of ['001234567890', '1abc23456789', '1AbC23456789']) {
    assert.equal(parseCreditRow(incoming(rrn), date).rrn, rrn);
    assert.equal(validatePayment({ amount: 2, timestamp, checkoutId, rrn }, now).rrn, rrn);
  }
});

test('invalid references fail closed in both scraped rows and requested selections', () => {
  for (const rrn of ['', '12345678901', '1234567890123', '1abc-3456789', '1abc 3456789', '1abc2345678_', '1abc2345678\n', '\uFF11abc23456789']) {
    assert.throws(() => parseCreditRow(incoming(rrn), date), error => error.code === 'PORTAL_CHANGED');
    assert.throws(() => validatePayment({ amount: 2, timestamp, checkoutId, rrn }, now), error => error.code === 'INVALID_RRN');
  }
  assert.throws(() => validatePayment({ amount: 2, timestamp, rrn: 123456789012 }, now), error => error.code === 'INVALID_RRN');
  assert.throws(() => validatePayment({ amount: 2, timestamp, rrn: '1abc23456789\n' }, now), error => error.code === 'INVALID_RRN');
});

test('supporting wallet references does not weaken amount, merchant, time or credit checks', () => {
  const valid = parseCreditRow(incoming('1abc23456789'), date);
  const payment = validatePayment({ amount: 2, timestamp, checkoutId }, now);
  assert.equal(candidatePayments([valid, valid], payment, nmid).length, 1);
  assert.equal(candidatePayments([valid], { ...payment, amount: 3 }, nmid).length, 0);
  assert.equal(candidatePayments([valid], payment, 'ID9999999999999').length, 0);
  assert.equal(candidatePayments([valid], { ...payment, instant: now + 30 * 60_000 }, nmid).length, 0);
  for (const amount of ['- Rp 2', '+ Rp 2,50', '+ Rp 0', '+ Rp 1.00']) {
    assert.throws(() => parseCreditRow(incoming('1abc23456789', '14.19', amount), date), error => error.code === 'PORTAL_CHANGED');
  }
  assert.throws(() => parseCreditRow(incoming('1abc23456789', '24.19'), date), error => error.code === 'PORTAL_CHANGED');
  assert.equal(parseCreditRow({ ...incoming('1abc23456789'), description: 'Pengembalian dana' }, date), null);
});

function claimFixture() {
  const detail = parseCreditRow(incoming('1abc23456789'), date);
  const claim = { owner_id: '1', nmid, amount: 2, qr_timestamp: timestamp, rrn: detail.rrn,
    detail: JSON.stringify(detail), checked_at: timestamp, transaction_id: null };
  const tlv = (tag, value) => tag + String(value.length).padStart(2, '0') + value;
  const payload = tlv('51', tlv('00', 'ID.CO.QRIS.WWW') + tlv('02', nmid));
  const db = { execute: async ({ sql }) => {
    if (sql.includes('FROM bca_qris_claims')) return { rows: [claim] };
    if (sql.includes('FROM settings')) return { rows: [{ value: payload }] };
    throw new Error('Unexpected database query');
  } };
  const input = { amount: 2, transactionId: checkoutId, ownerId: '1',
    verification: { checkoutId, timestamp, rrn: detail.rrn } };
  return { db, claim, input };
}

test('wallet references survive sale validation, while ownership and reuse safeguards remain', async () => {
  const { db, claim, input } = claimFixture();
  assert.equal((await claimForSale(db, input)).rrn, '1abc23456789');
  claim.transaction_id = checkoutId;
  assert.equal((await claimForSale(db, input)).rrn, '1abc23456789');
  await assert.rejects(claimForSale(db, { ...input, transactionId: 'different-sale' }), error => error.code === 'PAYMENT_ALREADY_USED');
  await assert.rejects(claimForSale(db, { ...input, ownerId: '2' }), error => error.code === 'CHECKOUT_CHANGED');
  await assert.rejects(claimForSale(db, { ...input, amount: 3 }), error => error.code === 'CHECKOUT_CHANGED');
  await assert.rejects(claimForSale(db, { ...input, verification: { ...input.verification, rrn: '1abc23456780' } }), error => error.code === 'CHECKOUT_CHANGED');
});
