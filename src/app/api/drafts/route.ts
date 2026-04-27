import { NextResponse } from 'next/server';
import { getAllDrafts, addDraft } from '@/lib/db';

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

        if (!nama_draft || !items) {
            return NextResponse.json({ success: false, error: 'Nama draft and items are required' }, { status: 400 });
        }

        const result = await addDraft({
            nama_draft,
            items: typeof items === 'string' ? items : JSON.stringify(items),
            subtotal,
            diskon_total,
            total,
        });

        return NextResponse.json({ success: true, data: result });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
