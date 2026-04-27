import { NextResponse } from 'next/server';
import { getAllCategories, addCategory, updateCategory, deleteCategory } from '@/lib/db';

export async function GET() {
    try {
        const categories = await getAllCategories();
        return NextResponse.json({ success: true, data: categories });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Gagal mengambil kategori' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { nama } = await request.json();
        if (!nama) return NextResponse.json({ success: false, error: 'Nama wajib diisi' }, { status: 400 });
        await addCategory(nama);
        return NextResponse.json({ success: true, message: 'Kategori berhasil ditambahkan' });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Gagal menambah kategori' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const { id, nama } = await request.json();
        if (!id || !nama) return NextResponse.json({ success: false, error: 'ID dan nama wajib diisi' }, { status: 400 });
        await updateCategory(id, nama);
        return NextResponse.json({ success: true, message: 'Kategori berhasil diupdate' });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Gagal mengupdate kategori' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ success: false, error: 'ID wajib diisi' }, { status: 400 });
        await deleteCategory(parseInt(id));
        return NextResponse.json({ success: true, message: 'Kategori berhasil dihapus' });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Gagal menghapus kategori' }, { status: 500 });
    }
}
