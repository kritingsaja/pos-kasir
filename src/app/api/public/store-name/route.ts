import { NextResponse } from 'next/server';
import { ensureDb, getSetting } from '@/lib/db';

export async function GET() {
    try {
        await ensureDb();
        const name = await getSetting('nama_toko');
        return NextResponse.json({ success: true, data: { name: String(name || 'KasirPOS') } }, {
            headers: { 'Cache-Control': 'no-store, max-age=0' },
        });
    } catch {
        return NextResponse.json({ success: true, data: { name: 'KasirPOS' } }, {
            headers: { 'Cache-Control': 'no-store, max-age=0' },
        });
    }
}
