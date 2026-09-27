export const DEFAULT_QRIS_STATIC_PAYLOAD = '00020101021126650013ID.CO.BCA.WWW011893600014000101195202150008850010119520303UMI51440014ID.CO.QRIS.WWW0215ID10200471870560303UMI5204581453033605802ID5911T3A.CO CAFE6006KENDAL61055137262070703A0163045194';
export const QRIS_MAX_TRANSACTION_AMOUNT = 10_000_000;

type QrisField = { tag: string; value: string };

function parseFields(payload: string): QrisField[] {
    const fields: QrisField[] = [];
    let offset = 0;
    while (offset < payload.length) {
        if (offset + 4 > payload.length) throw new Error('Data QRIS tidak lengkap.');
        const tag = payload.slice(offset, offset + 2);
        const lengthText = payload.slice(offset + 2, offset + 4);
        if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) throw new Error('Format QRIS tidak valid.');
        const length = Number(lengthText);
        const valueStart = offset + 4;
        const valueEnd = valueStart + length;
        if (valueEnd > payload.length) throw new Error('Panjang data QRIS tidak sesuai.');
        fields.push({ tag, value: payload.slice(valueStart, valueEnd) });
        offset = valueEnd;
    }
    return fields;
}

function encodeField({ tag, value }: QrisField): string {
    if (value.length > 99) throw new Error(`Field QRIS ${tag} terlalu panjang.`);
    return `${tag}${String(value.length).padStart(2, '0')}${value}`;
}

function crc16Ccitt(value: string): string {
    let crc = 0xffff;
    for (let i = 0; i < value.length; i++) {
        crc ^= value.charCodeAt(i) << 8;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function validateStaticQris(payload: string): string | null {
    try {
        const fields = parseFields(payload.trim());
        const crcField = fields[fields.length - 1];
        if (crcField?.tag !== '63' || crcField.value.length !== 4) return 'QRIS harus memiliki checksum yang lengkap.';
        if (crc16Ccitt(payload.trim().slice(0, -4)) !== crcField.value.toUpperCase()) return 'Checksum QRIS tidak cocok. Periksa kembali data QRIS.';
        if (fields.find(field => field.tag === '01')?.value !== '11') return 'QRIS yang dimasukkan harus QRIS statis.';
        if (fields.find(field => field.tag === '53')?.value !== '360') return 'QRIS harus menggunakan mata uang Rupiah (IDR).';
        if (fields.some(field => field.tag === '54')) return 'QRIS ini sudah memiliki nominal; masukkan QRIS statis.';
        return null;
    } catch (error) {
        return error instanceof Error ? error.message : 'Format QRIS tidak valid.';
    }
}

export function convertStaticQrisToDynamic(payload: string, amount: number): string {
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > QRIS_MAX_TRANSACTION_AMOUNT) {
        throw new Error('Nominal QRIS harus antara Rp1 dan Rp10.000.000.');
    }
    const cleanPayload = payload.trim();
    const validationError = validateStaticQris(cleanPayload);
    if (validationError) throw new Error(validationError);

    const fields = parseFields(cleanPayload).filter(field => field.tag !== '63');
    const amountField = { tag: '54', value: String(amount) };
    const output: QrisField[] = [];
    let insertedAmount = false;
    for (const field of fields) {
        output.push(field.tag === '01' ? { ...field, value: '12' } : field);
        if (field.tag === '53') {
            output.push(amountField);
            insertedAmount = true;
        }
    }
    if (!insertedAmount) throw new Error('Field mata uang QRIS tidak ditemukan.');

    const withoutCrc = `${output.map(encodeField).join('')}6304`;
    return `${withoutCrc}${crc16Ccitt(withoutCrc)}`;
}
