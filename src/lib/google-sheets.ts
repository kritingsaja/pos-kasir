import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getAuthClient() {
    const credentialsJson = process.env.GOOGLE_CREDENTIALS;
    if (!credentialsJson) {
        throw new Error('GOOGLE_CREDENTIALS environment variable is not defined');
    }
    try {
        const credentials = JSON.parse(credentialsJson);
        return new google.auth.GoogleAuth({
            credentials: {
                client_email: credentials.client_email,
                private_key: credentials.private_key,
            },
            scopes: SCOPES,
        });
    } catch (error) {
        throw new Error('Failed to parse GOOGLE_CREDENTIALS: ' + (error as Error).message);
    }
}

export async function appendTransactionsToSheet(spreadsheetId: string, transactions: any[]) {
    if (!spreadsheetId) {
        throw new Error('Spreadsheet ID is not configured');
    }
    const auth = getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const rows = transactions.map((t) => [
        t.id,
        t.tanggal,
        t.waktu,
        t.subtotal,
        t.diskon_total,
        t.total,
        t.metode_bayar,
        t.kasir || 'Admin'
    ]);

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Sheet1!A1:H1',
        });
        if (!response.data.values || response.data.values.length === 0) {
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: 'Sheet1!A1',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [['No. Transaksi', 'Tanggal', 'Waktu', 'Subtotal', 'Diskon', 'Total', 'Metode', 'Kasir']],
                },
            });
        }
    } catch (error: any) {
        console.error('Error checking sheet header:', error.message);
    }

    const response = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Sheet1!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows },
    });
    return response.data;
}
