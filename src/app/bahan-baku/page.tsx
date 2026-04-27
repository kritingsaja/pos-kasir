'use client';

import { useState, useEffect } from 'react';

interface Material {
  id: number;
  nama: string;
  satuan: string;
  stok_awal: number;
  min_stok: number;
  estimated_stock: number;
  status: 'ok' | 'warning';
}

interface Product {
  id: number;
  nama_barang: string;
  kode_barang: string;
}

interface RecipeItem {
  material_id: number;
  nama: string;
  qty_used: number;
  satuan: string;
}

export default function BahanBakuPage() {
  const [activeTab, setActiveTab] = useState<'materials' | 'recipes'>('materials');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Form states
  const [newMaterial, setNewMaterial] = useState({ nama: '', satuan: '', stok_awal: 0, min_stok: 0 });
  const [restockData, setRestockData] = useState({ jumlah: 0, catatan: '' });
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([]);

  const fetchMaterials = async () => {
    try {
      const res = await fetch('/api/materials');
      if (res.ok) setMaterials(await res.json());
    } catch (error) { console.error(error); }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const result = await res.json();
        if (result.success) setProducts(result.data);
      }
    } catch (error) { console.error(error); }
  };

  useEffect(() => {
    setLoading(true);
    if (activeTab === 'materials') fetchMaterials().finally(() => setLoading(false));
    else fetchProducts().finally(() => setLoading(false));
  }, [activeTab]);

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = selectedMaterial ? 'PUT' : 'POST';
    const body = selectedMaterial ? { ...newMaterial, id: selectedMaterial.id } : newMaterial;
    
    const res = await fetch('/api/materials', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setShowAddModal(false);
      setSelectedMaterial(null);
      setNewMaterial({ nama: '', satuan: '', stok_awal: 0, min_stok: 0 });
      fetchMaterials();
    }
  };

  const handleDeleteMaterial = async (id: number) => {
    if (!confirm('Yakin ingin menghapus bahan ini? Semua resep terkait akan ikut terhapus.')) return;
    const res = await fetch(`/api/materials?id=${id}`, { method: 'DELETE' });
    if (res.ok) fetchMaterials();
    else alert('Gagal menghapus bahan');
  };

  const handleRestock = async (e: React.FormEvent) => {
// ... (rest of the code remains same)
    e.preventDefault();
    if (!selectedMaterial) return;
    const res = await fetch('/api/materials/restock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ material_id: selectedMaterial.id, jumlah: restockData.jumlah, catatan: restockData.catatan }),
    });
    if (res.ok) {
      setShowRestockModal(false);
      setRestockData({ jumlah: 0, catatan: '' });
      fetchMaterials();
    }
  };

  const openRecipeModal = async (product: Product) => {
    setSelectedProduct(product);
    setRecipeItems([]);
    try {
      const res = await fetch(`/api/materials/recipe?product_id=${product.id}`);
      if (res.ok) setRecipeItems(await res.json());
    } catch (error) {}
    setShowRecipeModal(true);
  };

  const handleSaveRecipe = async () => {
    if (!selectedProduct) return;
    const res = await fetch('/api/materials/recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: selectedProduct.id,
        materials: recipeItems.map(item => ({ material_id: item.material_id, qty_used: item.qty_used }))
      }),
    });
    if (res.ok) setShowRecipeModal(false);
  };

  return (
    <div className="container" style={{ padding: '24px' }}>
      <div className="header-container">
        <h1 style={{ margin: 0 }}>📦 Manajemen Inventaris</h1>
        <div className="tab-group">
           <button 
             className={`tab-btn ${activeTab === 'materials' ? 'active' : ''}`}
             onClick={() => setActiveTab('materials')}
           >
             Master Bahan
           </button>
           <button 
             className={`tab-btn ${activeTab === 'recipes' ? 'active' : ''}`}
             onClick={() => setActiveTab('recipes')}
           >
             Resep Produk
           </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Memuat data...</div>
      ) : activeTab === 'materials' ? (
        <div className="card">
          <div style={{ padding: '16px', display: 'flex', justifyContent: 'flex-end' }}>
             <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ Tambah Bahan</button>
          </div>
          <div className="table-responsive">
            <table className="table mobile-table">
              <thead>
                <tr>
                  <th>Nama Bahan</th>
                  <th>Sisa Stok</th>
                  <th>Satuan</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Bahan"><strong>{m.nama}</strong></td>
                    <td data-label="Stok" style={{ color: m.status === 'warning' ? 'var(--danger-color)' : 'inherit', fontWeight: 'bold' }}>
                      {m.estimated_stock.toFixed(2)}
                    </td>
                    <td data-label="Satuan">{m.satuan}</td>
                    <td data-label="Status">
                      <span className={`badge ${m.status === 'warning' ? 'badge-danger' : 'badge-success'}`}>
                        {m.status === 'warning' ? 'Low' : 'Aman'}
                      </span>
                    </td>
                    <td data-label="Aksi">
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedMaterial(m); setShowRestockModal(true); }}>Restok</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => { 
                          setSelectedMaterial(m); 
                          setNewMaterial({ nama: m.nama, satuan: m.satuan, stok_awal: m.stok_awal, min_stok: m.min_stok });
                          setShowAddModal(true); 
                        }}>Edit</button>
                        <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleDeleteMaterial(m.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
            <input 
              type="text" 
              className="form-control" 
              placeholder="🔍 Cari produk (nama atau kode)..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="table-responsive">
            <table className="table mobile-table">
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Kode</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {products
                  .filter(p => 
                    p.nama_barang.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    p.kode_barang.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((p) => (
                    <tr key={p.id}>
                      <td data-label="Produk"><strong>{p.nama_barang}</strong></td>
                      <td data-label="Kode">{p.kode_barang}</td>
                      <td data-label="Aksi">
                        <button className="btn btn-secondary btn-sm" onClick={() => openRecipeModal(p)}>⚙️ Atur Resep</button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Recipe */}
      {showRecipeModal && selectedProduct && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <h2>Resep: {selectedProduct.nama_barang}</h2>
            <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '16px' }}>
               <table className="table mobile-table">
                 <thead>
                   <tr>
                     <th>Bahan</th>
                     <th>Jumlah</th>
                     <th>Satuan</th>
                     <th>Aksi</th>
                   </tr>
                 </thead>
                 <tbody>
                   {recipeItems.map((item, idx) => (
                     <tr key={idx}>
                       <td data-label="Bahan">{item.nama}</td>
                       <td data-label="Jumlah">
                         <input 
                           type="number" 
                           step="any"
                           style={{ width: '80px', padding: '6px' }}
                           value={item.qty_used} 
                           onChange={(e) => {
                             const newItems = [...recipeItems];
                             newItems[idx].qty_used = Number(e.target.value);
                             setRecipeItems(newItems);
                           }} 
                         />
                       </td>
                       <td data-label="Satuan">{item.satuan}</td>
                       <td data-label="Aksi">
                         <button className="btn btn-danger btn-sm" style={{ width: '100%' }} onClick={() => setRecipeItems(recipeItems.filter((_, i) => i !== idx))}>Hapus</button>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
               <div style={{ marginTop: '12px' }}>
                 <select 
                   className="form-control"
                   onChange={(e) => {
                     const mat = materials.find(m => m.id === Number(e.target.value));
                     if (mat && !recipeItems.find(ri => ri.material_id === mat.id)) {
                       setRecipeItems([...recipeItems, { material_id: mat.id, nama: mat.nama, qty_used: 1, satuan: mat.satuan }]);
                     }
                   }}
                   defaultValue=""
                 >
                   <option value="" disabled>+ Tambah bahan ke resep...</option>
                   {materials.map(m => <option key={m.id} value={m.id}>{m.nama} ({m.satuan})</option>)}
                 </select>
               </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveRecipe}>Simpan Resep</button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowRecipeModal(false)}>Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Logic for Modal Add/Restock same as before (omitted for brevity in this slide or kept below) */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h2>{selectedMaterial ? 'Edit Bahan Baku' : 'Tambah Bahan Baru'}</h2>
            <form onSubmit={handleAddMaterial}>
                <div className="form-group"><label>Nama Bahan</label><input type="text" className="form-control" value={newMaterial.nama} required onChange={e => setNewMaterial({...newMaterial, nama: e.target.value})}/></div>
                <div className="form-group"><label>Satuan</label><input type="text" className="form-control" value={newMaterial.satuan} required onChange={e => setNewMaterial({...newMaterial, satuan: e.target.value})}/></div>
                <div className="form-group"><label>Stok Awal</label><input type="number" step="any" className="form-control" value={newMaterial.stok_awal} onChange={e => setNewMaterial({...newMaterial, stok_awal: Number(e.target.value)})}/></div>
                <div className="form-group"><label>Min. Stok</label><input type="number" step="any" className="form-control" value={newMaterial.min_stok} onChange={e => setNewMaterial({...newMaterial, min_stok: Number(e.target.value)})}/></div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                    <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Simpan</button>
                    <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setShowAddModal(false); setSelectedMaterial(null); setNewMaterial({ nama: '', satuan: '', stok_awal: 0, min_stok: 0 }); }}>Batal</button>
                </div>
            </form>
          </div>
        </div>
      )}

      {showRestockModal && selectedMaterial && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h2>Restok: {selectedMaterial.nama}</h2>
            <form onSubmit={handleRestock}>
                <div className="form-group"><label>Jumlah Tambah ({selectedMaterial.satuan})</label><input type="number" step="any" className="form-control" required autoFocus onChange={e => setRestockData({...restockData, jumlah: Number(e.target.value)})}/></div>
                <div className="form-group"><label>Catatan</label><input type="text" className="form-control" onChange={e => setRestockData({...restockData, catatan: e.target.value})}/></div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                    <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Simpan</button>
                    <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowRestockModal(false)}>Batal</button>
                </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: flex-start; justify-content: center; z-index: 1000; overflow-y: auto; padding: 20px; }
        .modal-content { background: white; padding: 20px; border-radius: 12px; width: 100%; margin-top: auto; margin-bottom: auto; }
        .form-group { margin-bottom: 12px; }
        .form-group label { display: block; margin-bottom: 4px; font-weight: 600; font-size: 13px; }
        .form-control { width: 100%; padding: 10px; border: 1.5px solid #eee; border-radius: 8px; font-size: 14px; }
        .badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .badge-danger { background: #fee2e2; color: #dc2626; }
        .badge-success { background: #dcfce7; color: #16a34a; }
        
        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          gap: 16px;
        }

        .tab-group {
          display: flex;
          gap: 6px;
          background: #eee;
          padding: 4px;
          border-radius: 10px;
        }

        .tab-btn {
          padding: 8px 16px;
          border: none;
          background: transparent;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          color: #666;
        }

        .tab-btn.active {
          background: white;
          color: var(--brand);
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }

        @media (max-width: 768px) {
          .header-container {
            flex-direction: column;
            align-items: stretch;
          }
          .tab-group {
            width: 100%;
          }
          .tab-btn {
            flex: 1;
            padding: 10px;
          }
          .container {
            padding: 16px !important;
          }
          h1 {
            font-size: 20px !important;
            margin-bottom: 8px !important;
          }
          
          /* Mobile Card View for Tables */
          .mobile-table thead {
            display: none;
          }
          .mobile-table tr {
            display: block;
            border-bottom: 10px solid #f8f9fa;
            padding: 12px 0;
          }
          .mobile-table td {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border: none !important;
            padding: 6px 0 !important;
          }
          .mobile-table td::before {
            content: attr(data-label);
            font-weight: 600;
            font-size: 12px;
            color: #888;
            text-transform: uppercase;
          }
          .mobile-table td:last-child {
            flex-direction: column;
            align-items: stretch;
            margin-top: 10px;
            padding-top: 12px !important;
            border-top: 1px solid #eee !important;
          }
        }
      `}</style>
    </div>
  );
}
