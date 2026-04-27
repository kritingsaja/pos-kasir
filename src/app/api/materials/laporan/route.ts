import { NextResponse } from 'next/server';
import { getProductRecipe, getTransactionItemsByDate } from '@/lib/db';
import { getMaterialsWithStock } from '@/lib/materials-logic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const today = new Date().toISOString().split('T')[0];
    const tanggal = searchParams.get('tanggal') || today;

    // Get transactions for that date
    const transactions = getTransactionItemsByDate(tanggal);
    
    // Get all materials and recipes to calculate usage
    const allMaterials = getMaterialsWithStock();
    
    // We need usage for THIS DATE only
    const usageOnDate: Record<number, number> = {};
    
    // This is a bit inefficient (re-fetching recipes per item), but manageable for small-medium scale
    for (const t of transactions) {
      try {
        const items = JSON.parse(t.items);
        for (const item of items) {
          const productId = item.product_id || item.id;
          if (!productId) continue;
          
          const recipe = allMaterials.find(m => false); // PLACEHOLDER: we need actual recipes
          // Let's use getProductRecipe but optimized... 
          // Actually, let's just use a simple map of usage.
        }
      } catch {}
    }

    // Refined usage logic for report
    const dailyUsage: Record<number, number> = {};
    // Pre-fetch all recipes for speed
    // (In a more complex app, we'd join this in SQL)
    
    for (const t of transactions) {
      const items = JSON.parse(t.items);
      for (const item of items) {
        const productId = item.product_id || item.id;
        const recipe = getProductRecipe(Number(productId));
        for (const r of recipe) {
          if (!dailyUsage[r.material_id]) dailyUsage[r.material_id] = 0;
          dailyUsage[r.material_id] += (item.qty * r.qty_used);
        }
      }
    }

    const report = {
      tanggal,
      total_transaksi: transactions.length,
      pemakaian: allMaterials.map(m => ({
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
