import { NextResponse } from 'next/server';
import { getAllProducts, searchProducts, addProduct, updateProduct, deleteProduct } from '@/lib/db';
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q');
        const sort = searchParams.get('sort');
        
        let products;
        if (query) {
            products = await searchProducts(query);
        } else if (sort === 'popularity') {
            products = await getAllProductsSortedByPopularity();
        } else {
            products = await getAllProducts();
        }
        
        return NextResponse.json({ success: true, data: products });
    } catch (error) {
        console.error('Error fetching products:', error);
        return NextResponse.json({ success: false, error: 'Gagal mengambil data produk' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { kode_barang, nama_barang, harga_jual, diskon, tipe_diskon, kategori, stok } = body;

        if (!kode_barang || !nama_barang || harga_jual === undefined) {
            return NextResponse.json(
                { success: false, error: 'Kode barang, nama barang, dan harga jual wajib diisi' },
                { status: 400 }
            );
        }

        await addProduct({ kode_barang, nama_barang, harga_jual, diskon, tipe_diskon, kategori, stok });
        return NextResponse.json({ success: true, message: 'Produk berhasil ditambahkan' });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        if (errMsg.includes('UNIQUE constraint')) {
            return NextResponse.json({ success: false, error: 'Kode barang sudah ada' }, { status: 400 });
        }
        console.error('Error adding product:', error);
        return NextResponse.json({ success: false, error: 'Gagal menambah produk' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ success: false, error: 'ID produk wajib diisi' }, { status: 400 });
        }

        await updateProduct(id, updates);
        return NextResponse.json({ success: true, message: 'Produk berhasil diupdate' });
    } catch (error) {
        console.error('Error updating product:', error);
        return NextResponse.json({ success: false, error: 'Gagal mengupdate produk' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ success: false, error: 'ID produk wajib diisi' }, { status: 400 });
        }

        await deleteProduct(parseInt(id));
        return NextResponse.json({ success: true, message: 'Produk berhasil dihapus' });
    } catch (error) {
        console.error('Error deleting product:', error);
        return NextResponse.json({ success: false, error: 'Gagal menghapus produk' }, { status: 500 });
    }
}
