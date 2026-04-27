import { NextResponse } from 'next/server';
import { getProductRecipe, getTransactionItemsByDate } from '@/lib/db';
import { getMaterialsWithStock } from '@/lib/materials-logic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const today = new Date().toISOString().split('T')[0];
    const tanggal = searchParams.get('tanggal') || today;

    // Get transactions for that date
    const transactions = await getTransactionItemsByDate(tanggal);
    
    // Get all materials and recipes to calculate usage
    const allMaterials = await getMaterialsWithStock();
    
    // Refined usage logic for report
    const dailyUsage: Record<number, number> = {};
    
    for (const t of (transactions as any[])) {
      try {
        const items = JSON.parse(t.items);
        for (const item of items) {
          const productId = item.product_id || item.id;
          if (!productId) continue;
          
          const recipe = await getProductRecipe(Number(productId));
          for (const r of recipe) {
            if (!dailyUsage[r.material_id]) dailyUsage[r.material_id] = 0;
            dailyUsage[r.material_id] += (Number(item.qty) * Number(r.qty_used));
          }
        }
      } catch (e) {}
    }

    const report = {
      tanggal,
      total_transaksi: transactions.length,
      pemakaian: allMaterials.map((m: any) => ({
        nama: m.nama,
        satuan: m.satuan,
        jumlah_pakai: dailyUsage[m.id] || 0,
        sisa_estimasi: m.estimated_stock
      }))
    };

    return NextResponse.json(report);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
