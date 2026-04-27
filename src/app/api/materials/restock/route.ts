import { NextResponse } from 'next/server';
import { addRestockLog } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { material_id, jumlah, catatan } = body;
    
    if (!material_id || !jumlah) {
      return NextResponse.json({ error: 'Material ID dan jumlah wajib diisi' }, { status: 400 });
    }

    await addRestockLog({ 
      material_id: Number(material_id), 
      jumlah: Number(jumlah), 
      catatan: catatan || '' 
    });
    
    return NextResponse.json({ message: 'Restok berhasil dicatat' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
