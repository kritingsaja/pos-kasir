'use client';

import { useState, useEffect, useCallback } from 'react';
import { Product, CartItem, Transaction, formatRupiah, calculateItemSubtotal, generateTransactionId, getTodayDate, getCurrentTime } from '@/lib/utils';
import Receipt from '@/components/Receipt';
import { useOfflineSync } from '@/lib/useOfflineSync';

export default function KasirPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [step, setStep] = useState<'selection' | 'review' | 'payment' | 'receipt'>('selection');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [bayar, setBayar] = useState<number>(0);
    type DraftRow = {
        id: number;
        nama_draft: string;
        items: string;
        subtotal: number;
        diskon_total: number;
        total: number;
        created_at: string;
    };
    const [lastTransaction, setLastTransaction] = useState<{
        id: string;
        items: CartItem[];
        subtotal: number;
        diskonTotal: number;
        total: number;
        bayar: number;
        kembalian: number;
        nama_pelanggan?: string;
        isDraft?: boolean;
        isKitchen?: boolean;
    } | null>(null);
    const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
    const [savedDrafts, setSavedDrafts] = useState<DraftRow[]>([]);
    const [showDraftsList, setShowDraftsList] = useState(false);
    const [loadedDraftId, setLoadedDraftId] = useState<number | null>(null);
    const [showSaveDraftModal, setShowSaveDraftModal] = useState(false);
    const [draftNameInput, setDraftNameInput] = useState('');
    const [selectedDraftForDetail, setSelectedDraftForDetail] = useState<DraftRow | null>(null);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('Semua');
    const [namaPelanggan, setNamaPelanggan] = useState('');
    const [settings, setSettings] = useState<{ [key: string]: string }>({});
    
    // Fitur: Diskon Keseluruhan
    const [globalDiskon, setGlobalDiskon] = useState<string>('');
    const [globalTipeDiskon, setGlobalTipeDiskon] = useState<0 | 1>(1); // 0=persen, 1=rupiah

    const { isOnline, saveOfflineTransaction } = useOfflineSync();

    const [isInitialized, setIsInitialized] = useState(false);

    // Fitur 1: Edit harga & diskon
    const [editingItem, setEditingItem] = useState<string | null>(null);
    const [editHarga, setEditHarga] = useState('');
    const [editDiskon, setEditDiskon] = useState('');
    const [editTipeDiskon, setEditTipeDiskon] = useState<0 | 1>(0); // 0=persen, 1=rupiah

    // Fitur 2: Catatan per item
    const [editingNote, setEditingNote] = useState<string | null>(null);

    // Fitur 3: Panel laporan kasir
    const [showLaporanPanel, setShowLaporanPanel] = useState(false);
    const [laporanTransactions, setLaporanTransactions] = useState<Transaction[]>([]);
    const [laporanLoading, setLaporanLoading] = useState(false);
    const [laporanDate, setLaporanDate] = useState(new Date().toISOString().split('T')[0]);
    const [expandedLaporanTrx, setExpandedLaporanTrx] = useState<string | null>(null);

    // Mobile: pill & footer stays above keyboard
    const [pillBottom, setPillBottom] = useState(20);
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    // Tablet detection (>= 768px)
    const [isTablet, setIsTablet] = useState(false);

    useEffect(() => {
        void fetchProducts();
        void fetchDrafts();
        void fetchCategories();
        void fetchSettings();

        // Restore cart from localStorage
        try {
            const savedCart = localStorage.getItem('pos_cart');
            if (savedCart && savedCart !== 'null') {
                const parsedCart = JSON.parse(savedCart);
                if (Array.isArray(parsedCart) && parsedCart.length > 0) {
                    setCart(parsedCart);
                }
            }
            const savedDraftId = localStorage.getItem('pos_loaded_draft_id');
            if (savedDraftId && savedDraftId !== 'null') {
                const parsedId = parseInt(savedDraftId, 10);
                if (!isNaN(parsedId)) {
                    setLoadedDraftId(parsedId);
                }
            }
        } catch (e) {
            console.error('Failed to load saved cart state', e);
        } finally {
            setIsInitialized(true);
        }

        // Tablet detection
        function checkTablet() {
            setIsTablet(window.innerWidth >= 768);
        }
        checkTablet();
        window.addEventListener('resize', checkTablet);

        // Keyboard-aware bottom elements: track visual viewport
        const vv = window.visualViewport;
        function onViewportResize() {
            if (!vv) return;
            const vh = vv.height || window.innerHeight;
            const vo = vv.offsetTop || 0;
            const kh = window.innerHeight - vh - vo;
            const validKh = isNaN(kh) ? 0 : Math.max(0, kh);
            setKeyboardHeight(validKh);
            setPillBottom(Math.max(20, validKh + 12));
        }
        vv?.addEventListener('resize', onViewportResize);
        vv?.addEventListener('scroll', onViewportResize);
        return () => {
            window.removeEventListener('resize', checkTablet);
            vv?.removeEventListener('resize', onViewportResize);
            vv?.removeEventListener('scroll', onViewportResize);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const handleSyncComplete = (e: Event) => {
            const customEvent = e as CustomEvent;
            const count = customEvent.detail?.count || 0;
            showToast(`${count} transaksi berhasil disinkronkan`);
        };
        window.addEventListener('offline-sync-complete', handleSyncComplete);
        return () => window.removeEventListener('offline-sync-complete', handleSyncComplete);
    }, []);

    useEffect(() => {
        if (!isInitialized) return;
        try {
            localStorage.setItem('pos_cart', JSON.stringify(cart));
            if (loadedDraftId) {
                localStorage.setItem('pos_loaded_draft_id', loadedDraftId.toString());
            } else {
                localStorage.removeItem('pos_loaded_draft_id');
            }
        } catch (e) {
            console.error('Failed to save cart state to localStorage', e);
        }
    }, [cart, loadedDraftId, isInitialized]);

    const filterProducts = useCallback((query: string, category: string, allProducts: Product[]) => {
        let filtered = [...allProducts];
        if (category !== 'Semua') {
            filtered = filtered.filter(p => (p.kategori || '').toLowerCase() === category.toLowerCase());
        }
        if (query.trim()) {
            const q = query.toLowerCase();
            filtered = filtered.filter(
                (p) =>
                    p.kode_barang.toLowerCase().includes(q) ||
                    p.nama_barang.toLowerCase().includes(q)
            );
        }
        setFilteredProducts(filtered);
    }, []);

    useEffect(() => {
        filterProducts(searchQuery, selectedCategory, products);
    }, [searchQuery, selectedCategory, products, filterProducts]);

    async function fetchProducts() {
        try {
            const res = await fetch('/api/products?sort=popularity');
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                setProducts(data.data);
                setFilteredProducts(data.data);
            }
        } catch (error) {
            console.error('Error fetching products:', error);
        }
    }

    async function fetchCategories() {
        try {
            const res = await fetch('/api/categories');
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                const cats = (data.data as Array<{ nama?: unknown }>).map((c) => String(c.nama || '')).filter(Boolean);
                setCategories(['Semua', ...cats]);
            }
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    }

    async function fetchDrafts() {
        try {
            const res = await fetch('/api/drafts');
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                setSavedDrafts(data.data as DraftRow[]);
            }
        } catch (error) {
            console.error('Error fetching drafts:', error);
        }
    }

    async function fetchSettings() {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (data.success) {
                setSettings(data.data || {});
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
        }
    }

    // Fitur 3: Fetch laporan
    async function fetchLaporan(date: string) {
        setLaporanLoading(true);
        try {
            const res = await fetch(`/api/transactions?tanggal=${date}`);
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                setLaporanTransactions(data.data);
            }
        } catch (error) {
            console.error('Error fetching laporan:', error);
        } finally {
            setLaporanLoading(false);
        }
    }

    useEffect(() => {
        if (showLaporanPanel) {
            void fetchLaporan(laporanDate);
        }
    }, [showLaporanPanel, laporanDate]);

    useEffect(() => {
        if (step === 'selection') return;
        const handlePopState = (e: PopStateEvent) => {
            e.preventDefault();
            setStep('selection');
            window.history.pushState(null, '', window.location.href);
        };
        window.history.pushState(null, '', window.location.href);
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [step]);

    function addToCart(product: Product) {
        setCart((prev) => {
            const existing = prev.find((item) => item.kode_barang === product.kode_barang);
            if (existing) {
                return prev.map((item) =>
                    item.kode_barang === product.kode_barang
                        ? {
                            ...item,
                            qty: item.qty + 1,
                            subtotal: calculateItemSubtotal(
                                item.harga_override ?? item.harga_jual,
                                item.qty + 1,
                                item.diskon,
                                item.tipe_diskon
                            ),
                        }
                        : item
                );
            }
            return [
                ...prev,
                {
                    kode_barang: product.kode_barang,
                    nama_barang: product.nama_barang,
                    harga_jual: product.harga_jual,
                    qty: 1,
                    diskon: product.diskon,
                    tipe_diskon: product.tipe_diskon,
                    subtotal: calculateItemSubtotal(product.harga_jual, 1, product.diskon, product.tipe_diskon),
                    kategori: product.kategori,
                },
            ];
        });
    }

    function updateQty(kode: string, delta: number) {
        setCart((prev) =>
            prev
                .map((item) => {
                    if (item.kode_barang === kode) {
                        const newQty = item.qty + delta;
                        if (newQty <= 0) return null;
                        return {
                            ...item,
                            qty: newQty,
                            subtotal: calculateItemSubtotal(
                                item.harga_override ?? item.harga_jual,
                                newQty,
                                item.diskon,
                                item.tipe_diskon
                            ),
                        };
                    }
                    return item;
                })
                .filter(Boolean) as CartItem[]
        );
    }

    function removeFromCart(kode: string) {
        setCart((prev) => prev.filter((item) => item.kode_barang !== kode));
    }

    function clearCart() {
        setCart([]);
        setBayar(0);
        setLoadedDraftId(null);
        setNamaPelanggan('');
        setEditingItem(null);
        setEditingNote(null);
        setGlobalDiskon('');
        setGlobalTipeDiskon(1);
    }

    // ── Fitur 1: update harga & diskon manual ──
    function startEditItem(item: CartItem) {
        setEditingItem(item.kode_barang);
        setEditHarga(String(item.harga_override ?? item.harga_jual));
        setEditDiskon(String(item.diskon));
        setEditTipeDiskon(item.tipe_diskon === 1 ? 1 : 0);
    }

    function applyEditItem(kode: string) {
        const newHarga = parseFloat(editHarga) || 0;
        const newDiskon = parseFloat(editDiskon) || 0;
        setCart((prev) =>
            prev.map((item) => {
                if (item.kode_barang !== kode) return item;
                return {
                    ...item,
                    harga_override: newHarga !== item.harga_jual ? newHarga : undefined,
                    diskon: newDiskon,
                    tipe_diskon: editTipeDiskon,
                    subtotal: calculateItemSubtotal(newHarga, item.qty, newDiskon, editTipeDiskon),
                };
            })
        );
        setEditingItem(null);
    }

    // ── Fitur 2: update catatan per item ──
    function updateItemNote(kode: string, catatan: string) {
        setCart((prev) =>
            prev.map((item) =>
                item.kode_barang === kode ? { ...item, catatan: catatan || undefined } : item
            )
        );
    }

    const subtotal = cart.reduce((sum, item) => sum + (item.harga_override ?? item.harga_jual) * item.qty, 0);

    const itemDiskonTotal = cart.reduce((sum, item) => {
        if (item.diskon > 0) {
            const harga = item.harga_override ?? item.harga_jual;
            if (item.tipe_diskon === 1) return sum + item.diskon * item.qty;
            return sum + (harga * item.diskon / 100) * item.qty;
        }
        return sum;
    }, 0);

    const totalSetelahItemDiskon = subtotal - itemDiskonTotal;

    const gDiskon = parseFloat(globalDiskon) || 0;
    const globalDiskonAmount = gDiskon > 0
        ? (globalTipeDiskon === 1 ? gDiskon : (totalSetelahItemDiskon * gDiskon / 100))
        : 0;

    const diskonTotal = itemDiskonTotal + globalDiskonAmount;
    const total = Math.max(0, subtotal - diskonTotal);
    const kembalian = bayar - total;

    function showToast(message: string, type: string = 'success') {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }

    async function handleSaveDraft() {
        if (cart.length === 0) {
            showToast('Keranjang masih kosong!', 'error');
            return;
        }
        
        // Gunakan nama pelanggan jika sudah ada, atau buat nama default dengan waktu
        if (namaPelanggan.trim()) {
            setDraftNameInput(namaPelanggan.trim());
        } else {
            const timeString = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setDraftNameInput(`Draft - ${timeString}`);
        }
        
        setShowSaveDraftModal(true);
    }

    async function confirmSaveDraft() {
        const finalDraftName = draftNameInput.trim() || `Draft - ${new Date().toLocaleTimeString('id-ID')}`;
        try {
            const url = loadedDraftId ? `/api/drafts/${loadedDraftId}` : '/api/drafts';
            const method = loadedDraftId ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nama_draft: finalDraftName,
                    items: cart,
                    subtotal,
                    diskon_total: diskonTotal,
                    total,
                }),
            });
            const data = await res.json();
            if (data.success) {
                showToast(loadedDraftId ? 'Draft berhasil diperbarui!' : 'Draft berhasil disimpan!');
                fetchDrafts();
                clearCart();
                setStep('selection');
                setShowSaveDraftModal(false);
                setDraftNameInput('');
            } else {
                showToast('Gagal menyimpan draft: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error saving draft:', error);
            showToast('Gagal menyimpan draft!', 'error');
        }
    }

    async function handleDeleteDraft(id: number) {
        if (!confirm('Hapus draft ini?')) return;
        try {
            const res = await fetch(`/api/drafts/${id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast('Draft dihapus');
                fetchDrafts();
            }
        } catch (error) {
            console.error('Error deleting draft:', error);
        }
    }

    function loadDraft(draft: DraftRow) {
        try {
            const parsed: unknown = JSON.parse(draft.items);
            const items = Array.isArray(parsed) ? (parsed as CartItem[]) : [];
            setCart(items);
            setLoadedDraftId(draft.id);
            setNamaPelanggan(draft.nama_draft);
            setShowDraftsList(false);
            setStep('selection');
            showToast(`Draft "${draft.nama_draft}" dimuat`);
        } catch (error) {
            console.error('Error loading draft items:', error);
            showToast('Gagal memuat draft!', 'error');
        }
    }

    async function handleCheckout() {
        if (cart.length === 0) {
            showToast('Keranjang masih kosong!', 'error');
            return;
        }
        if (bayar < total) {
            showToast('Jumlah bayar kurang!', 'error');
            return;
        }

        const transactionId = generateTransactionId();
        const tanggal = getTodayDate();
        const waktu = getCurrentTime();

        const payload = {
            id: transactionId,
            tanggal,
            waktu,
            items: cart,
            subtotal,
            diskon_total: diskonTotal,
            total,
            bayar,
            kembalian,
            metode_bayar: 'tunai',
            kasir: 'Admin',
            nama_pelanggan: namaPelanggan.trim(),
        };

        try {
            if (!isOnline) {
                await saveOfflineTransaction(payload);
            } else {
                const res = await fetch('/api/transactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                const data = await res.json();
                if (!data.success) {
                    showToast('Gagal menyimpan transaksi: ' + data.error, 'error');
                    return;
                }
            }

            if (loadedDraftId) {
                await fetch(`/api/drafts/${loadedDraftId}`, { method: 'DELETE' }).catch(() => null);
                setLoadedDraftId(null);
                fetchDrafts();
            }
            setLastTransaction({
                ...payload,
                items: [...cart],
                diskonTotal,
            });
            showToast(isOnline ? 'Transaksi berhasil disimpan!' : 'Transaksi disimpan offline!');
            clearCart();
        } catch (error) {
            console.error('Error saving transaction:', error);
            showToast('Gagal menyimpan transaksi!', 'error');
        }
    }

    async function handleCheckoutWithTotal(forcedTotal: number) {
        setBayar(forcedTotal);
        const transactionId = generateTransactionId();
        const tanggal = getTodayDate();
        const waktu = getCurrentTime();

        const payload = {
            id: transactionId,
            tanggal,
            waktu,
            items: cart,
            subtotal,
            diskon_total: diskonTotal,
            total,
            bayar: forcedTotal,
            kembalian: 0,
            metode_bayar: 'tunai',
            kasir: 'Admin',
            nama_pelanggan: namaPelanggan.trim(),
        };

        try {
            if (!isOnline) {
                await saveOfflineTransaction(payload);
            } else {
                const res = await fetch('/api/transactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                const data = await res.json();
                if (!data.success) {
                    showToast('Gagal menyimpan transaksi: ' + data.error, 'error');
                    return;
                }
            }

            if (loadedDraftId) {
                await fetch(`/api/drafts/${loadedDraftId}`, { method: 'DELETE' }).catch(() => null);
                setLoadedDraftId(null);
                fetchDrafts();
            }
            setLastTransaction({
                ...payload,
                items: [...cart],
                diskonTotal,
            });
            showToast(isOnline ? 'Transaksi berhasil disimpan!' : 'Transaksi disimpan offline!');
            clearCart();
        } catch (error) {
            console.error('Error saving transaction:', error);
            showToast('Gagal menyimpan transaksi!', 'error');
        }
    }

    const quickCashAmounts = [5000, 10000, 20000, 50000, 100000, 200000];

    // Laporan totals
    const laporanTotal = laporanTransactions.reduce((s, t) => s + t.total, 0);
    const laporanCount = laporanTransactions.length;
    
    const handlePrintDraft = (isKitchen: boolean = false, customData?: any) => {
        const sourceCart = customData ? customData.items : cart;
        const sourceNama = customData ? customData.nama_draft : namaPelanggan;

        if (sourceCart.length === 0) {
            showToast('Keranjang kosong!', 'error');
            return;
        }

        const tempId = customData ? `DRAFT-${customData.id}` : (loadedDraftId ? `DRAFT-${loadedDraftId}` : `DRAFT-${Date.now().toString().slice(-4)}`);

        // Untuk re-calculate dari sourceCart bila diperlukan (misal untuk cetak history draft)
        let cetakSubtotal = subtotal;
        let cetakDiskonTotal = diskonTotal;
        let cetakTotal = total;

        if (customData) {
            cetakSubtotal = customData.subtotal;
            cetakDiskonTotal = customData.diskon_total;
            cetakTotal = customData.total;
        }

        setLastTransaction({
            id: tempId,
            items: [...sourceCart],
            subtotal: cetakSubtotal,
            diskonTotal: cetakDiskonTotal,
            total: cetakTotal,
            bayar: 0,
            kembalian: 0,
            nama_pelanggan: sourceNama.trim(),
            isDraft: true,
            isKitchen
        });
        setStep('receipt');
    };

    function parseItems(s: string) { try { return JSON.parse(s); } catch { return []; } }

    return (
        <>
            <div className="page-header">
                <div className="header-main compact-kasir-header">
                    <div className="kasir-header-title">
                        <h1>Transaction</h1>
                    </div>

                    {step === 'selection' && (
                        <div className="kasir-header-actions">
                            <button
                                className="btn-header-pill sales"
                                onClick={() => setShowLaporanPanel(true)}
                                title="Lihat Hasil Penjualan"
                            >
                                <span className="pill-icon">📊</span>
                                <span className="pill-text">Sales</span>
                            </button>
                            <button
                                className="btn-header-pill draft"
                                onClick={() => setShowDraftsList(true)}
                            >
                                <span className="pill-icon">📋</span>
                                <span className="pill-text">Draft <span className="pill-badge">{savedDrafts.length}</span></span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className={`pos-layout ${step === 'selection' ? 'step-selection' : ''} ${isTablet && step === 'selection' ? 'tablet-pos-layout' : ''}`}>
                {/* STEP 1: PRODUCTS SELECTION */}
                {step === 'selection' && (
                    <>
                        {/* ── LEFT: Product Grid ── */}
                        <div className={`pos-products ${isTablet ? 'tablet-products-col' : ''}`}>
                            <div className="products-header">
                                <div className="search-bar" style={{ flex: 1 }}>
                                    <span className="search-icon">🔍</span>
                                    <input
                                        type="search"
                                        placeholder="Search Name or Code"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {categories.length > 0 && (
                                <div className="category-filter-bar">
                                    {categories.map((cat) => (
                                        <button
                                            key={cat}
                                            className={`category-pill ${selectedCategory === cat ? 'active' : ''}`}
                                            onClick={() => setSelectedCategory(cat)}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className={`products-grid ${isTablet ? 'tablet-products-grid' : ''}`}>
                                {filteredProducts.map((product) => {
                                    const cartItem = cart.find(item => item.kode_barang === product.kode_barang);
                                    const quantity = cartItem ? cartItem.qty : 0;

                                    return (
                                        <div
                                            key={product.id}
                                            className={`product-card ${quantity > 0 ? 'active' : ''}`}
                                            onClick={() => {
                                                addToCart(product);
                                                const searchInput = document.querySelector('.search-bar input') as HTMLInputElement;
                                                if (searchInput) searchInput.focus();
                                            }}
                                        >
                                            <div className="product-info">
                                                <div className="product-name">{product.nama_barang}</div>
                                                <div className="product-price" style={{ fontSize: '13px', fontWeight: 800, color: 'var(--success)' }}>{formatRupiah(product.harga_jual)}</div>
                                            </div>
                                            {quantity > 0 && <div className="product-badge">{quantity}</div>}
                                        </div>
                                    );
                                })}
                                {filteredProducts.length === 0 && (
                                    <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                                        <div className="empty-icon">🔍</div>
                                        <p>Produk tidak ditemukan</p>
                                    </div>
                                )}
                            </div>

                            {/* Mobile only: floating pill */}
                            {!isTablet && cart.length > 0 && (
                                <div
                                    className="selection-cart-pill"
                                    style={{ bottom: `${pillBottom}px`, transition: 'bottom 0.2s ease' }}
                                    onClick={() => setStep('review')}
                                >
                                    <div className="cart-info">
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <span style={{ fontSize: '18px', fontWeight: '800' }}>{formatRupiah(subtotal)}</span>
                                            <span style={{ fontSize: '12px', opacity: 0.8, fontWeight: '500' }}>
                                                {cart.reduce((sum, item) => sum + item.qty, 0)} Item Terpilih
                                            </span>
                                        </div>
                                    </div>
                                    <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); setStep('review'); }}>
                                        CONTINUE <span style={{ fontSize: '18px' }}>›</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* ── RIGHT: Tablet Cart Sidebar (tablet only) ── */}
                        {isTablet && (
                            <div className="tablet-cart-sidebar">
                                <div className="tablet-cart-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '20px' }}>🛒</span>
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-900)' }}>Keranjang</div>
                                            {loadedDraftId && <div style={{ fontSize: '11px', color: 'var(--brand)', fontWeight: 600 }}>✏️ Editing Draft</div>}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        {savedDrafts.length > 0 && (
                                            <button
                                                className="btn btn-sm btn-secondary"
                                                onClick={() => setShowDraftsList(true)}
                                                style={{ fontSize: '12px', padding: '5px 10px' }}
                                            >
                                                📋 <span className="pill-badge" style={{ background: 'var(--brand)', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '11px' }}>{savedDrafts.length}</span>
                                            </button>
                                        )}
                                        {cart.length > 0 && (
                                            <button
                                                className="btn btn-sm btn-danger"
                                                onClick={() => { clearCart(); }}
                                                style={{ fontSize: '12px', padding: '5px 10px' }}
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="tablet-cart-items">
                                    {cart.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-300)' }}>
                                            <div style={{ fontSize: '36px', marginBottom: '10px', opacity: 0.3 }}>🛒</div>
                                            <p style={{ fontSize: '13px' }}>Pilih produk untuk ditambahkan</p>
                                        </div>
                                    ) : (
                                        cart.map((item) => {
                                            const isEditing = editingItem === item.kode_barang;
                                            const isEditingNote = editingNote === item.kode_barang;
                                            const effectiveHarga = item.harga_override ?? item.harga_jual;
                                            const hasPriceOverride = item.harga_override !== undefined && item.harga_override !== item.harga_jual;
                                            const hasDiskon = item.diskon > 0;
                                            return (
                                                <div key={item.kode_barang} className="cart-item-wrap">
                                                    <div className="cart-item">
                                                        <div className="cart-item-info">
                                                            <div className="item-name">{item.nama_barang}</div>
                                                            <div className="item-price">
                                                                {hasPriceOverride ? (
                                                                    <>
                                                                        <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '10px', marginRight: '4px' }}>
                                                                            {formatRupiah(item.harga_jual)}
                                                                        </span>
                                                                        <span style={{ color: 'var(--warning)' }}>{formatRupiah(effectiveHarga)}</span>
                                                                    </>
                                                                ) : (
                                                                    formatRupiah(effectiveHarga)
                                                                )}
                                                                {hasDiskon && (
                                                                    <span className="diskon-badge">
                                                                        -{item.tipe_diskon === 1 ? formatRupiah(item.diskon) : `${item.diskon}%`}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {item.catatan && <div className="item-catatan">📝 {item.catatan}</div>}
                                                        </div>
                                                        <div className="cart-item-qty">
                                                            <button onClick={() => updateQty(item.kode_barang, -1)}>−</button>
                                                            <span className="qty-value">{item.qty}</span>
                                                            <button onClick={() => updateQty(item.kode_barang, 1)}>+</button>
                                                        </div>
                                                        <div className="cart-item-subtotal">{formatRupiah(item.subtotal)}</div>
                                                        <div className="cart-item-actions-group">
                                                            <button
                                                                className="cart-item-action-btn"
                                                                title="Edit harga/diskon"
                                                                onClick={() => isEditing ? setEditingItem(null) : startEditItem(item)}
                                                            >✏️</button>
                                                            <button
                                                                className="cart-item-action-btn"
                                                                title="Tambah catatan"
                                                                onClick={() => setEditingNote(isEditingNote ? null : item.kode_barang)}
                                                            >📝</button>
                                                        </div>
                                                        <button className="cart-item-remove" onClick={() => removeFromCart(item.kode_barang)}>✕</button>
                                                    </div>
                                                    {isEditing && (
                                                        <div className="item-edit-form">
                                                            <div className="item-edit-row">
                                                                <label>Harga (Rp)</label>
                                                                <input type="number" value={editHarga} onChange={e => setEditHarga(e.target.value)} placeholder="Harga baru..." />
                                                            </div>
                                                            <div className="item-edit-row">
                                                                <label>Diskon</label>
                                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                                    <input type="number" value={editDiskon} onChange={e => setEditDiskon(e.target.value)} placeholder="0" style={{ flex: 1 }} />
                                                                    <button className={`tipe-diskon-btn ${editTipeDiskon === 0 ? 'active' : ''}`} onClick={() => setEditTipeDiskon(0)}>%</button>
                                                                    <button className={`tipe-diskon-btn ${editTipeDiskon === 1 ? 'active' : ''}`} onClick={() => setEditTipeDiskon(1)}>Rp</button>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                                                <button className="btn btn-sm btn-secondary" style={{ flex: 1 }} onClick={() => setEditingItem(null)}>Batal</button>
                                                                <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={() => applyEditItem(item.kode_barang)}>Terapkan</button>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {isEditingNote && (
                                                        <div className="item-note-wrap">
                                                            <input
                                                                className="item-note-input"
                                                                type="text"
                                                                placeholder="Contoh: panas less sugar..."
                                                                value={item.catatan || ''}
                                                                onChange={e => updateItemNote(item.kode_barang, e.target.value)}
                                                                onKeyDown={e => { if (e.key === 'Enter') setEditingNote(null); }}
                                                                autoFocus
                                                            />
                                                            <button className="btn btn-sm btn-primary" onClick={() => setEditingNote(null)}>OK</button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                <div className="tablet-cart-footer">
                                    <div className="cart-summary">
                                        <div className="cart-summary-row">
                                            <span>Subtotal</span>
                                            <span>{formatRupiah(subtotal)}</span>
                                        </div>
                                        {diskonTotal > 0 && (
                                            <div className="cart-summary-row">
                                                <span>Diskon</span>
                                                <span>-{formatRupiah(diskonTotal)}</span>
                                            </div>
                                        )}
                                        <div className="cart-summary-row total">
                                            <span>TOTAL</span>
                                            <span>{formatRupiah(total)}</span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                        <input
                                            type="text"
                                            placeholder="Nama pelanggan (opsional)"
                                            value={namaPelanggan}
                                            onChange={(e) => setNamaPelanggan(e.target.value)}
                                            style={{ flex: 1, fontSize: '13px', padding: '8px 12px' }}
                                        />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <button
                                            className="btn btn-warning"
                                            style={{ width: '100%' }}
                                            onClick={handleSaveDraft}
                                            disabled={cart.length === 0}
                                        >
                                            💾 {loadedDraftId ? 'Update' : 'Draft'}
                                        </button>
                                        <button
                                            className="btn btn-success"
                                            style={{ width: '100%' }}
                                            onClick={() => setStep('payment')}
                                            disabled={cart.length === 0}
                                        >
                                            💵 Bayar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* STEP 2: REVIEW CART */}
                {step === 'review' && (
                    <div className="pos-cart" style={{ gridColumn: '1 / -1' }}>
                        <div className="cart-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <button className="btn btn-sm btn-secondary" onClick={() => setStep('selection')}>
                                    ← Kembali
                                </button>
                                <h2>🛒 Review Keranjang</h2>
                            </div>
                            {cart.length > 0 && (
                                <button className="btn btn-sm btn-danger" onClick={() => {
                                    clearCart();
                                    setStep('selection');
                                }}>
                                    Hapus Semua
                                </button>
                            )}
                        </div>

                        {cart.length === 0 ? (
                            <div className="cart-empty">
                                <div className="empty-icon">🛒</div>
                                <p>Keranjang masih kosong</p>
                                <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => setStep('selection')}>
                                    Pilih Menu
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="cart-items">
                                    {cart.map((item) => {
                                        const isEditing = editingItem === item.kode_barang;
                                        const isEditingNote = editingNote === item.kode_barang;
                                        const effectiveHarga = item.harga_override ?? item.harga_jual;
                                        const hasPriceOverride = item.harga_override !== undefined && item.harga_override !== item.harga_jual;
                                        const hasDiskon = item.diskon > 0;
                                        return (
                                            <div key={item.kode_barang} className="cart-item-wrap">
                                                <div className="cart-item">
                                                    <div className="cart-item-info">
                                                        <div className="item-name">{item.nama_barang}</div>
                                                        <div className="item-price">
                                                            {hasPriceOverride ? (
                                                                <>
                                                                    <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '11px', marginRight: '4px' }}>
                                                                        {formatRupiah(item.harga_jual)}
                                                                    </span>
                                                                    <span style={{ color: 'var(--warning)' }}>{formatRupiah(effectiveHarga)}</span>
                                                                </>
                                                            ) : (
                                                                formatRupiah(effectiveHarga)
                                                            )}
                                                            {hasDiskon && (
                                                                <span className="diskon-badge">
                                                                    -{item.tipe_diskon === 1 ? formatRupiah(item.diskon) : `${item.diskon}%`}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {item.catatan && (
                                                            <div className="item-catatan">📝 {item.catatan}</div>
                                                        )}
                                                    </div>
                                                    <div className="cart-item-qty">
                                                        <button onClick={() => updateQty(item.kode_barang, -1)}>−</button>
                                                        <span className="qty-value">{item.qty}</span>
                                                        <button onClick={() => updateQty(item.kode_barang, 1)}>+</button>
                                                    </div>
                                                    <div className="cart-item-subtotal">{formatRupiah(item.subtotal)}</div>
                                                    <div className="cart-item-actions-group">
                                                        <button
                                                            className="cart-item-action-btn"
                                                            title="Edit harga/diskon"
                                                            onClick={() => isEditing ? setEditingItem(null) : startEditItem(item)}
                                                        >
                                                            ✏️
                                                        </button>
                                                        <button
                                                            className="cart-item-action-btn"
                                                            title="Tambah catatan"
                                                            onClick={() => setEditingNote(isEditingNote ? null : item.kode_barang)}
                                                        >
                                                            📝
                                                        </button>
                                                    </div>
                                                    <button
                                                        className="cart-item-remove"
                                                        onClick={() => removeFromCart(item.kode_barang)}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>

                                                {/* Fitur 1: Inline edit harga & diskon */}
                                                {isEditing && (
                                                    <div className="item-edit-form">
                                                        <div className="item-edit-row">
                                                            <label>Harga (Rp)</label>
                                                            <input
                                                                type="number"
                                                                value={editHarga}
                                                                onChange={e => setEditHarga(e.target.value)}
                                                                placeholder="Harga baru..."
                                                            />
                                                        </div>
                                                        <div className="item-edit-row">
                                                            <label>Diskon</label>
                                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                                <input
                                                                    type="number"
                                                                    value={editDiskon}
                                                                    onChange={e => setEditDiskon(e.target.value)}
                                                                    placeholder="0"
                                                                    style={{ flex: 1 }}
                                                                />
                                                                <button
                                                                    className={`tipe-diskon-btn ${editTipeDiskon === 0 ? 'active' : ''}`}
                                                                    onClick={() => setEditTipeDiskon(0)}
                                                                >%</button>
                                                                <button
                                                                    className={`tipe-diskon-btn ${editTipeDiskon === 1 ? 'active' : ''}`}
                                                                    onClick={() => setEditTipeDiskon(1)}
                                                                >Rp</button>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                                            <button className="btn btn-sm btn-secondary" style={{ flex: 1 }} onClick={() => setEditingItem(null)}>Batal</button>
                                                            <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={() => applyEditItem(item.kode_barang)}>Terapkan</button>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Fitur 2: Input catatan */}
                                                {isEditingNote && (
                                                    <div className="item-note-wrap">
                                                        <input
                                                            className="item-note-input"
                                                            type="text"
                                                            placeholder="Contoh: panas less sugar, tidak pedas..."
                                                            value={item.catatan || ''}
                                                            onChange={e => updateItemNote(item.kode_barang, e.target.value)}
                                                            onKeyDown={e => { if (e.key === 'Enter') setEditingNote(null); }}
                                                            autoFocus
                                                        />
                                                        <button className="btn btn-sm btn-primary" onClick={() => setEditingNote(null)}>OK</button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="cart-footer" style={{ bottom: `${keyboardHeight}px`, transition: 'bottom 0.2s ease' }}>
                                    <div className="cart-summary">
                                        <div className="cart-summary-row">
                                            <span>Subtotal</span>
                                            <span>{formatRupiah(subtotal)}</span>
                                        </div>
                                        {diskonTotal > 0 && (
                                            <div className="cart-summary-row">
                                                <span>Diskon</span>
                                                <span>-{formatRupiah(diskonTotal)}</span>
                                            </div>
                                        )}
                                        <div className="cart-summary-row total">
                                            <span>TOTAL</span>
                                            <span>{formatRupiah(total)}</span>
                                        </div>
                                    </div>
                                    <div className="cart-actions">
                                        <button className="btn btn-warning btn-lg" style={{ flex: 1 }} onClick={handleSaveDraft}>
                                            💾 Simpan
                                        </button>
                                        <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={() => setStep('payment')}>
                                            Bayar ➔
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* STEP 3: PAYMENT */}
                {step === 'payment' && (
                    <div className="pos-cart" style={{ gridColumn: '1 / -1', maxWidth: '500px', margin: '0 auto', width: '100%' }}>
                        <div className="cart-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <button className="btn btn-sm btn-secondary" onClick={() => setStep('review')}>
                                    ← Kembali
                                </button>
                                <h2>💵 Pembayaran</h2>
                            </div>
                        </div>

                        <div className="cart-items" style={{ padding: '20px' }}>
                            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                                <p style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Tagihan</p>
                                <h1 style={{ color: 'var(--success)', fontSize: '32px' }}>{formatRupiah(total)}</h1>
                            </div>

                            <div className="payment-section">
                                <p style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '13px' }}>Uang Cepat</p>
                                <div className="quick-cash">
                                    {quickCashAmounts.map((amount) => (
                                        <button key={amount} onClick={() => setBayar(amount)}>
                                            {formatRupiah(amount)}
                                        </button>
                                    ))}
                                </div>

                                <p style={{ color: 'var(--text-secondary)', margin: '16px 0 8px', fontSize: '13px' }}>Nama Pelanggan (Opsional)</p>
                                <div className="payment-input">
                                    <input
                                        type="text"
                                        placeholder="Masukkan nama pelanggan..."
                                        value={namaPelanggan}
                                        onChange={(e) => setNamaPelanggan(e.target.value)}
                                    />
                                </div>

                                <p style={{ color: 'var(--text-secondary)', margin: '16px 0 8px', fontSize: '13px' }}>Nominal Pembayaran</p>
                                <div className="payment-input">
                                    <input
                                        type="number"
                                        placeholder="Masukkan jumlah bayar..."
                                        value={bayar || ''}
                                        onChange={(e) => setBayar(parseInt(e.target.value) || 0)}
                                    />
                                    <button
                                        className="btn btn-sm btn-secondary"
                                        onClick={() => setBayar(total)}
                                    >
                                        Uang Pas
                                    </button>
                                </div>

                                <p style={{ color: 'var(--text-secondary)', margin: '16px 0 8px', fontSize: '13px' }}>Diskon Keseluruhan (Opsional)</p>
                                <div className="payment-input" style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={globalDiskon}
                                        onChange={(e) => setGlobalDiskon(e.target.value)}
                                        style={{ flex: 1 }}
                                    />
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <button
                                            className={`btn btn-sm ${globalTipeDiskon === 0 ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => setGlobalTipeDiskon(0)}
                                        >
                                            %
                                        </button>
                                        <button
                                            className={`btn btn-sm ${globalTipeDiskon === 1 ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => setGlobalTipeDiskon(1)}
                                        >
                                            Rp
                                        </button>
                                    </div>
                                </div>

                                {bayar > 0 && (
                                    <div className="kembalian-row" style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-primary)', borderRadius: '8px' }}>
                                        <span>Kembalian</span>
                                        <span className="kembalian-value" style={{ color: kembalian >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '20px' }}>
                                            {formatRupiah(Math.max(0, kembalian))}
                                        </span>
                                    </div>
                                )}

                                <div className="cart-footer" style={{ bottom: `${keyboardHeight}px`, transition: 'bottom 0.2s ease' }}>
                                    <button
                                        className="btn btn-success btn-lg"
                                        style={{ width: '100%' }}
                                        onClick={() => {
                                            if (bayar < total) {
                                                handleCheckoutWithTotal(total);
                                            } else {
                                                handleCheckout();
                                            }
                                            setStep('receipt');
                                        }}
                                    >
                                        💵 Bayar & Simpan
                                    </button>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ width: '100%', marginTop: '12px' }}
                                        onClick={handleSaveDraft}
                                    >
                                        💾 Simpan Draft
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Saved Drafts List Modal */}
            {showDraftsList && (
                <div className="modal-overlay" onClick={() => {
                    setShowDraftsList(false);
                    setSelectedDraftForDetail(null);
                }}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '95%' }}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                {selectedDraftForDetail && (
                                    <button className="btn btn-sm btn-secondary" onClick={() => setSelectedDraftForDetail(null)} style={{ padding: '6px 12px' }}>
                                        ← Kembali
                                    </button>
                                )}
                                <h2 style={{ margin: 0 }}>{selectedDraftForDetail ? 'Detail Draft' : 'Draft Tersimpan'}</h2>
                            </div>
                            <button className="modal-close" onClick={() => {
                                setShowDraftsList(false);
                                setSelectedDraftForDetail(null);
                            }}>✕</button>
                        </div>
                        <div className="modal-body" style={{ padding: '0' }}>
                            {savedDrafts.length === 0 ? (
                                <div className="empty-state" style={{ padding: '40px' }}>
                                    <p>Tidak ada draft tersimpan</p>
                                </div>
                            ) : !selectedDraftForDetail ? (
                                <div className="draft-list" style={{ display: 'flex', flexDirection: 'column' }}>
                                    {savedDrafts.map((draft) => {
                                        return (
                                            <div key={draft.id} className="draft-item" 
                                                onClick={() => setSelectedDraftForDetail(draft)}
                                                style={{
                                                    padding: '16px 20px',
                                                    borderBottom: '1px solid var(--border-soft)',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    background: 'var(--bg-surface)',
                                                    transition: 'background 0.2s ease'
                                                }}>
                                                <div>
                                                    <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-900)' }}>{draft.nama_draft}</div>
                                                    <div style={{ color: 'var(--text-500)', fontSize: '12px', marginTop: '2px' }}>
                                                        {new Date(draft.created_at).toLocaleString('id-ID')}
                                                    </div>
                                                </div>
                                                <span style={{ color: 'var(--text-400)' }}>›</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="draft-detail-view" style={{ padding: '20px' }}>
                                    <div style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-soft)', paddingBottom: '16px' }}>
                                        <div style={{ fontSize: '14px', color: 'var(--text-500)', marginBottom: '4px' }}>Nama Pesanan:</div>
                                        <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--brand)' }}>{selectedDraftForDetail!.nama_draft}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-400)', marginTop: '4px' }}>
                                            Dibuat pada: {new Date(selectedDraftForDetail!.created_at).toLocaleString('id-ID')}
                                        </div>
                                    </div>

                                    <div className="preview-items" style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '24px' }}>
                                        <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Item Pesanan</span>
                                            <span>Total: {formatRupiah(JSON.parse(selectedDraftForDetail!.items).reduce((s: number, i: any) => s + i.subtotal, 0))}</span>
                                        </div>
                                        {JSON.parse(selectedDraftForDetail!.items).map((item: any, idx: number) => (
                                            <div key={idx} style={{ 
                                                display: 'flex', 
                                                justifyContent: 'space-between', 
                                                padding: '10px 0', 
                                                borderTop: '1px dashed var(--border-soft)',
                                                fontSize: '13px'
                                            }}>
                                                <span>{item.qty}x {item.nama_barang}</span>
                                                <span style={{ fontWeight: '600' }}>{formatRupiah(item.subtotal)}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <button className="btn btn-danger" onClick={() => {
                                            handleDeleteDraft(selectedDraftForDetail!.id);
                                            setSelectedDraftForDetail(null);
                                        }}>
                                            🗑️ Hapus
                                        </button>
                                        <button className="btn btn-primary" onClick={() => {
                                            loadDraft(selectedDraftForDetail!);
                                            setSelectedDraftForDetail(null);
                                        }}>
                                            ✏️ Edit Order
                                        </button>
                                        <button className="btn btn-accent" onClick={() => handlePrintDraft(false, { ...selectedDraftForDetail!, items: JSON.parse(selectedDraftForDetail!.items) })}>
                                            👤 Print Customer
                                        </button>
                                        <button className="btn btn-warning" onClick={() => handlePrintDraft(true, { ...selectedDraftForDetail!, items: JSON.parse(selectedDraftForDetail!.items) })}>
                                            🧑‍🍳 Print Kasir
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Input Nama Draft */}
            {showSaveDraftModal && (
                <div className="modal-overlay" onClick={() => setShowSaveDraftModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h2>Simpan Draft</h2>
                            <button className="modal-close" onClick={() => setShowSaveDraftModal(false)}>✕</button>
                        </div>
                        <div className="modal-body" style={{ padding: '20px' }}>
                            <div className="input-group" style={{ marginBottom: '20px' }}>
                                <label>Nama Draft / Keterangan</label>
                                <input
                                    type="text"
                                    placeholder="Contoh: Meja 5, Nama Pelanggan, dll"
                                    value={draftNameInput}
                                    onChange={(e) => setDraftNameInput(e.target.value)}
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') confirmSaveDraft();
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowSaveDraftModal(false)}>
                                    Batal
                                </button>
                                <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmSaveDraft}>
                                    Simpan
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 4: Receipt */}
            {step === 'receipt' && lastTransaction && (
                <div className="modal-overlay" style={{ background: 'var(--bg-primary)', overflowY: 'auto' }}>
                    <div className="modal" style={{
                        maxWidth: '500px',
                        width: '95%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '20px',
                        alignItems: 'center',
                        background: 'transparent',
                        border: 'none',
                        margin: '20px auto',
                        padding: '0'
                    }}>
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {(!isOnline && !lastTransaction.isDraft) ? (
                                <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '8px' }}>📶</div>
                                    <h2 style={{ color: 'var(--text-900)', marginBottom: '8px' }}>Mode Offline</h2>
                                    <p style={{ color: 'var(--text-500)', fontSize: '14px', marginBottom: '20px' }}>Transaksi tersimpan lokal</p>
                                    
                                    <div style={{ background: 'var(--bg-primary)', padding: '16px', borderRadius: '12px', marginBottom: '24px' }}>
                                        <div style={{ fontSize: '12px', color: 'var(--text-500)', marginBottom: '4px' }}>Total Pembayaran</div>
                                        <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--brand)' }}>{formatRupiah(lastTransaction.total)}</div>
                                    </div>

                                    <div style={{ textAlign: 'left', marginBottom: '24px', maxHeight: '200px', overflowY: 'auto' }}>
                                        <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-soft)' }}>Item Pesanan:</div>
                                        {lastTransaction.items.map((item, idx) => (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                                                <span>{item.qty}x {item.nama_barang}</span>
                                                <span style={{ fontWeight: '600' }}>{formatRupiah(item.subtotal)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="receipt-container client-receipt">
                                    <Receipt
                                        transactionId={lastTransaction.id}
                                        items={lastTransaction.items}
                                        subtotal={lastTransaction.subtotal}
                                        diskonTotal={lastTransaction.diskonTotal}
                                        total={lastTransaction.total}
                                        bayar={lastTransaction.bayar}
                                        kembalian={lastTransaction.kembalian}
                                        metodeBayar="Tunai"
                                        nama_pelanggan={lastTransaction.nama_pelanggan}
                                        namaToko={settings.nama_toko}
                                        alamatToko={settings.alamat_toko}
                                        teleponToko={settings.telepon_toko}
                                        headerNota={settings.header_nota}
                                        footerNota={settings.footer_nota}
                                        isDraft={lastTransaction.isDraft}
                                        isKitchen={lastTransaction.isKitchen}
                                    />
                                </div>
                            )}

                            <div className="sticky-actions" style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px',
                                width: '100%',
                                borderRadius: '12px',
                                boxSizing: 'border-box'
                            }}>
                                <button className="btn btn-success btn-lg" style={{ width: '100%' }} onClick={() => {
                                    setStep('selection');
                                    if (!lastTransaction.isDraft) {
                                        clearCart();
                                    }
                                    setLastTransaction(null);
                                    window.scrollTo(0, 0);
                                }}>
                                    {(!isOnline && !lastTransaction.isDraft) ? 'Selesai' : (lastTransaction.isDraft ? '← Kembali ke Transaksi' : '+ Pesanan Baru')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Fitur 3: Panel Laporan Kasir ── */}
            {showLaporanPanel && (
                <div className="laporan-overlay" onClick={() => setShowLaporanPanel(false)}>
                    <div className="laporan-drawer" onClick={e => e.stopPropagation()}>
                        <div className="laporan-drawer-header">
                            <div>
                                <h2>📊 Hasil Penjualan</h2>
                                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                                    {new Date(laporanDate).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                            </div>
                            <button className="modal-close" onClick={() => setShowLaporanPanel(false)}>✕</button>
                        </div>

                        {/* Tanggal picker */}
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                            <input
                                type="date"
                                value={laporanDate}
                                onChange={e => { setLaporanDate(e.target.value); setExpandedLaporanTrx(null); }}
                                style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                            />
                        </div>

                        {/* Stats */}
                        <div className="laporan-drawer-stats">
                            <div className="laporan-stat-box">
                                <div className="laporan-stat-label">Total Penjualan</div>
                                <div className="laporan-stat-value green">{formatRupiah(laporanTotal)}</div>
                            </div>
                            <div className="laporan-stat-box">
                                <div className="laporan-stat-label">Jumlah Transaksi</div>
                                <div className="laporan-stat-value blue">{laporanCount}</div>
                            </div>
                        </div>

                        {/* Transaksi list */}
                        <div className="laporan-drawer-body">
                            {laporanLoading ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Memuat...</div>
                            ) : laporanTransactions.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                                    <p>Belum ada transaksi</p>
                                </div>
                            ) : (
                                laporanTransactions.map((t) => {
                                    const items = parseItems(t.items);
                                    const isExpanded = expandedLaporanTrx === t.id;
                                    return (
                                        <div
                                            key={t.id}
                                            className="laporan-trx-row"
                                            onClick={() => setExpandedLaporanTrx(isExpanded ? null : t.id)}
                                        >
                                            <div className="laporan-trx-row-main">
                                                <div>
                                                    <div className="laporan-trx-row-id">{t.id}</div>
                                                    {t.nama_pelanggan && <div style={{ fontSize: '12px', color: 'var(--accent-primary)' }}>👤 {t.nama_pelanggan}</div>}
                                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t.waktu} · {items.length} item</div>
                                                </div>
                                                <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>
                                                    {formatRupiah(t.total)}
                                                    <div style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)' }}>
                                                        {isExpanded ? '▲' : '▼'}
                                                    </div>
                                                </div>
                                            </div>
                                            {isExpanded && (
                                                <div className="laporan-trx-row-detail">
                                                    {items.map((item: { nama_barang: string; qty: number; subtotal: number; catatan?: string }, idx: number) => (
                                                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '2px 0' }}>
                                                            <span>{item.qty}x {item.nama_barang}{item.catatan ? ` (${item.catatan})` : ''}</span>
                                                            <span>{formatRupiah(item.subtotal)}</span>
                                                        </div>
                                                    ))}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border-color)' }}>
                                                        <span>Total</span>
                                                        <span>{formatRupiah(t.total)}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="laporan-drawer-footer">
                            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setShowLaporanPanel(false)}>
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className="toast-container">
                    <div className={`toast ${toast.type}`}>
                        {toast.type === 'success' ? '✅' : '❌'} {toast.message}
                    </div>
                </div>
            )}
        </>
    );
}
