import { NextResponse } from 'next/server';
import { setProductRecipe, getProductRecipe } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');
    
    if (!productId) {
      return NextResponse.json({ error: 'Product ID wajib disertakan' }, { status: 400 });
    }

    const recipe = await getProductRecipe(Number(productId));
    return NextResponse.json(recipe);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { product_id, materials } = body; // materials: [{ material_id, qty_used }]
    
    if (!product_id || !Array.isArray(materials)) {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
    }

    await setProductRecipe(Number(product_id), materials);
    
    return NextResponse.json({ message: 'Resep berhasil diperbarui' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
