import { NextResponse } from 'next/server';
import { deleteTransaction } from '@/lib/db';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        if (!id) return NextResponse.json({ success: false, error: 'ID wajib diisi' }, { status: 400 });
        await deleteTransaction(id);
        return NextResponse.json({ success: true, message: 'Transaksi berhasil dihapus' });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Gagal menghapus transaksi' }, { status: 500 });
    }
}
