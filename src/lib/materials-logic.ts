import { getAllMaterials, getMaterialUsageStats, getRestockTotals } from './db';

export async function getMaterialsWithStock() {
  const materials = await getAllMaterials();
  const usage = await getMaterialUsageStats();
  const restocks = await getRestockTotals();

  return (materials as any[]).map((m: any) => {
    const totalRestock = (restocks as any[]).find(r => r.material_id === m.id)?.total || 0;
    const totalUsage = usage[m.id] || 0;
    const estimatedStock = m.stok_awal + totalRestock - totalUsage;
    
    return {
      ...m,
      total_restock: totalRestock,
      total_usage: totalUsage,
      estimated_stock: estimatedStock,
      status: estimatedStock < m.min_stok ? 'warning' : 'ok'
    };
  });
}
