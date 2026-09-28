export class BcaError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = 'BcaError';
    this.code = code;
    this.status = status;
  }
}

export const WINDOW_MS = 10 * 60 * 1000;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function wibDate(milliseconds) {
  return new Date(milliseconds + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function validatePayment(input, now = Date.now()) {
  if (!Number.isSafeInteger(input?.amount) || input.amount < 1 || input.amount > 10_000_000) {
    throw new BcaError('INVALID_AMOUNT', 'Nominal QRIS harus Rp1 sampai Rp10.000.000.', 400);
  }
  if (typeof input.timestamp !== 'string' || !/T.+(?:Z|[+-]\d{2}:\d{2})$/.test(input.timestamp)) {
    throw new BcaError('INVALID_TIME', 'Timestamp harus berformat ISO dengan zona waktu.', 400);
  }
  const instant = Date.parse(input.timestamp);
  if (!Number.isFinite(instant) || instant > now + 60_000 || instant < now - 6 * 86400_000) {
    throw new BcaError('INVALID_TIME', 'Waktu pembayaran tidak tersedia pada kalender portal.', 400);
  }
  if (input.checkoutId !== undefined && (typeof input.checkoutId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.checkoutId))) {
    throw new BcaError('INVALID_CHECKOUT', 'ID pesanan tidak valid.', 400);
  }
  if (input.rrn !== undefined && (typeof input.rrn !== 'string' || !/^\d{12}$/.test(input.rrn))) {
    throw new BcaError('INVALID_RRN', 'RRN tidak valid.', 400);
  }
  return { ...input, instant, timestamp: new Date(instant).toISOString() };
}

export function datesToRead(instant, now = Date.now()) {
  return [...new Set([wibDate(instant - WINDOW_MS), wibDate(Math.min(instant + WINDOW_MS, now))])];
}

export function nmidFromQris(payload) {
  const fields = (value) => {
    const result = new Map();
    let cursor = 0;
    while (cursor < value.length) {
      const tag = value.slice(cursor, cursor + 2);
      const length = value.slice(cursor + 2, cursor + 4);
      if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(length)) throw new Error('Invalid TLV');
      const end = cursor + 4 + Number(length);
      if (end > value.length) throw new Error('Invalid TLV length');
      result.set(tag, value.slice(cursor + 4, end));
      cursor = end;
    }
    return result;
  };
  try {
    const qris = fields(String(payload ?? '').trim());
    const account = fields(qris.get('51') ?? '');
    const nmid = account.get('02');
    if (account.get('00') !== 'ID.CO.QRIS.WWW' || !/^ID\d{13}$/.test(nmid ?? '')) throw new Error('Missing NMID');
    return nmid;
  } catch {
    throw new BcaError('QRIS_CONFIG', 'NMID tidak dapat dibaca dari QRIS pada Pengaturan.', 503);
  }
}

export function parseCreditRow(row, date) {
  // Only the positive incoming-payment rows observed in QRMS are eligible.
  if (!/^Menerima pembayaran dari\b/i.test(row.description?.trim() ?? '')) return null;
  const reference = row.reference?.trim().match(/^RRN:\s*(\d{12})\s*\|\s*(\d{2})[.:](\d{2})\s+WIB$/);
  const merchant = row.merchant?.match(/\bNMID:\s*(ID\d{13})\b/);
  const nominal = row.amount?.trim().match(/^\+\s*Rp\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?$/);
  if (!reference || !merchant || !nominal || (nominal[2] && nominal[2] !== '00')) {
    throw new BcaError('PORTAL_CHANGED', 'Format transaksi QRMS berubah. Periksa secara manual.');
  }
  const hour = Number(reference[2]);
  const minute = Number(reference[3]);
  const amount = Number(nominal[1].replaceAll('.', ''));
  if (hour > 23 || minute > 59 || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new BcaError('PORTAL_CHANGED', 'Waktu atau nominal QRMS tidak dapat dibaca.');
  }
  // QRMS exposes only minutes. Do not pretend it provides exact seconds.
  const minuteStart = Date.parse(`${date}T${reference[2]}:${reference[3]}:00+07:00`);
  if (!Number.isFinite(minuteStart)) throw new BcaError('PORTAL_CHANGED', 'Tanggal QRMS tidak valid.');
  return {
    rrn: reference[1], nmid: merchant[1], amount, date,
    timeWib: `${reference[2]}:${reference[3]}`, timestamp: new Date(minuteStart).toISOString(),
    timePrecision: 'minute', minuteStart, minuteEnd: minuteStart + 59_999,
    status: 'PENERIMAAN_TERCATAT',
  };
}

export function candidatePayments(rows, payment, nmid) {
  const unique = new Map();
  for (const row of rows) {
    if (row.nmid === nmid && row.amount === payment.amount &&
        row.minuteEnd >= payment.instant - WINDOW_MS && row.minuteStart <= payment.instant + WINDOW_MS) {
      unique.set(`${row.nmid}:${row.date}:${row.rrn}`, row);
    }
  }
  return [...unique.values()].sort((a, b) => b.minuteStart - a.minuteStart);
}

export function publicTransaction(row) {
  const { minuteStart, minuteEnd, ...result } = row;
  return result;
}
