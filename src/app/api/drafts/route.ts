import { NextResponse } from 'next/server';
import { getAllDrafts, addDraft, normalizeDraftDate } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const drafts = await getAllDrafts();
        return NextResponse.json({ success: true, data: drafts });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { nama_draft, items, subtotal, diskon_total, total } = body;
        let tanggal_pesanan: string;
        try { tanggal_pesanan = normalizeDraftDate(body.tanggal_pesanan); }
        catch (error: any) { return NextResponse.json({ success: false, error: error.message }, { status: 400 }); }

        if (!nama_draft || !items) {
            return NextResponse.json({ success: false, error: 'Nama draft and items are required' }, { status: 400 });
        }

        const result = await addDraft({
            nama_draft,
            items: typeof items === 'string' ? items : JSON.stringify(items),
            subtotal,
            diskon_total,
            total,
            tanggal_pesanan,
        });

        return NextResponse.json({ success: true, data: result });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
