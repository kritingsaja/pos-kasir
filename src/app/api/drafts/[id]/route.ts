import { NextResponse } from 'next/server';
import { deleteDraft, updateDraft } from '@/lib/db';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: rawId } = await params;
        const id = parseInt(rawId);
        if (isNaN(id)) {
            return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
        }

        const result = await deleteDraft(id);
        return NextResponse.json({ success: true, data: result });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: rawId } = await params;
        const id = parseInt(rawId);
        if (isNaN(id)) {
            return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
        }

        const body = await request.json();
        const { nama_draft, items, subtotal, diskon_total, total } = body;

        const result = await updateDraft(id, {
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
