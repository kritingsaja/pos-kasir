import { NextResponse } from 'next/server';
import { addMaterial, updateMaterial, deleteMaterial } from '@/lib/db';
import { getMaterialsWithStock } from '@/lib/materials-logic';

export async function GET() {
  try {
    const materials = await getMaterialsWithStock();
    return NextResponse.json(materials);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nama, satuan, stok_awal, min_stok } = body;
    
    if (!nama || !satuan) {
      return NextResponse.json({ error: 'Nama dan Satuan wajib diisi' }, { status: 400 });
    }

    await addMaterial({ 
      nama, 
      satuan, 
      stok_awal: Number(stok_awal) || 0, 
      min_stok: Number(min_stok) || 0 
    });
    
    return NextResponse.json({ message: 'Bahan baku berhasil ditambahkan' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, nama, satuan, stok_awal, min_stok } = body;
    
    if (!id || !nama || !satuan) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    await updateMaterial(Number(id), { 
      nama, 
      satuan, 
      stok_awal: Number(stok_awal) || 0, 
      min_stok: Number(min_stok) || 0 
    });
    
    return NextResponse.json({ message: 'Bahan baku berhasil diperbarui' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'ID wajib disertakan' }, { status: 400 });
    }

    await deleteMaterial(Number(id));
    
    return NextResponse.json({ message: 'Bahan baku berhasil dihapus' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
