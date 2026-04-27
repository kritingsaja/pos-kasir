'use client';

import { useState } from 'react';
import { CartItem } from '@/lib/utils';
import { printer } from '@/lib/bluetooth-printer';
import type { PrintKitchenData, PrintReceiptData } from '@/lib/bluetooth-printer';

interface ReceiptProps {
    transactionId: string;
    items: CartItem[];
    subtotal: number;
    diskonTotal: number;
    total: number;
    bayar: number;
    kembalian: number;
    metodeBayar: string;
    namaToko?: string;
    alamatToko?: string;
    teleponToko?: string;
    headerNota?: string;
    footerNota?: string;
    kasir?: string;
    nama_pelanggan?: string;
    tanggal?: string;
    waktu?: string;
    isDraft?: boolean;
    isKitchen?: boolean;
}

function formatRp(n: number) {
    return 'Rp ' + n.toLocaleString('id-ID');
}

export default function Receipt({
    transactionId,
    items,
    subtotal,
    diskonTotal,
    total,
    bayar,
    kembalian,
    metodeBayar,
    namaToko = 'TOKO SAYA',
    alamatToko = 'Jl. Contoh No. 123',
    teleponToko = '08123456789',
    headerNota = '',
    footerNota = 'Wifi pass : eskopisusu',
    kasir = 'Admin',
    nama_pelanggan = '',
    tanggal: propTanggal,
    waktu: propWaktu,
    isDraft = false,
    isKitchen = false,
}: ReceiptProps) {
    const [btStatus, setBtStatus] = useState<'idle' | 'connecting' | 'printing' | 'done' | 'error'>('idle');
    const [btMessage, setBtMessage] = useState('');

    const now = new Date();
    const currentTanggal = now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const currentWaktu = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const tanggal = propTanggal || currentTanggal;
    const waktu = propWaktu || currentWaktu;

    const handlePrint = () => window.print();

    const handleBluetoothPrint = async () => {
        if (!('bluetooth' in navigator)) {
            setBtMessage('Browser tidak support Bluetooth. Gunakan Chrome Android.');
            setBtStatus('error');
            return;
        }
        try {
            if (!printer.isConnected()) {
                setBtStatus('connecting');
                setBtMessage('Menghubungkan ke printer...');
                await printer.connect();
            }
            setBtStatus('printing');
            setBtMessage('Mencetak...');
            const payload: PrintReceiptData = {
                namaToko,
                alamatToko,
                teleponToko,
                transactionId,
                tanggal,
                waktu,
                kasir,
                items,
                subtotal,
                diskonTotal,
                total,
                bayar,
                kembalian,
                metodeBayar,
                footerNota,
                nama_pelanggan,
                isDraft,
            };
            await printer.printReceipt(payload);
            setBtStatus('done');
            setBtMessage('✅ Berhasil dicetak!');
            setTimeout(() => { setBtStatus('idle'); setBtMessage(''); }, 3000);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Gagal cetak';
            setBtStatus('error');
            setBtMessage('❌ ' + message);
            printer.disconnect();
            setTimeout(() => { setBtStatus('idle'); setBtMessage(''); }, 4000);
        }
    };

    const handleBluetoothKitchenPrint = async () => {
        if (!('bluetooth' in navigator)) {
            setBtMessage('Browser tidak support Bluetooth.');
            setBtStatus('error');
            return;
        }
        try {
            if (!printer.isConnected()) {
                setBtStatus('connecting');
                await printer.connect();
            }
            setBtStatus('printing');
            const payload: PrintKitchenData = {
                transactionId,
                tanggal,
                waktu,
                items,
                nama_pelanggan,
            };
            await printer.printKitchenReceipt(payload);
            setBtStatus('done');
            setBtMessage('✅ Berhasil dicetak ke Dapur!');
            setTimeout(() => { setBtStatus('idle'); setBtMessage(''); }, 3000);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Gagal cetak dapur';
            setBtStatus('error');
            setBtMessage('❌ ' + message);
            printer.disconnect();
            setTimeout(() => { setBtStatus('idle'); setBtMessage(''); }, 4000);
        }
    };

    const btLabel = {
        idle: '🖨️ Cetak Bluetooth',
        connecting: '🔵 Menghubungkan...',
        printing: '⏳ Mencetak...',
        done: '✅ Selesai!',
        error: '❌ Gagal',
    }[btStatus];

    return (
        <div>
            {/* Action buttons at the TOP of the receipt component */}
            <div style={{ textAlign: 'center', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                    className="btn btn-primary"
                    onClick={handleBluetoothPrint}
                    disabled={btStatus === 'connecting' || btStatus === 'printing'}
                    style={{ gap: '8px' }}
                >
                    {btLabel}
                </button>
                <button
                    className="btn btn-warning"
                    onClick={handleBluetoothKitchenPrint}
                    disabled={btStatus === 'connecting' || btStatus === 'printing'}
                    style={{ gap: '8px' }}
                >
                    🍳 Cetak Dapur (Bluetooth)
                </button>
                <button className="btn btn-secondary" onClick={handlePrint}>
                    🧾 Cetak Browser (PDF)
                </button>
                {btMessage && (
                    <div style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        background: btStatus === 'error' ? '#fee2e2' : btStatus === 'done' ? '#dcfce7' : '#dbeafe',
                        color: btStatus === 'error' ? '#dc2626' : btStatus === 'done' ? '#16a34a' : '#1d4ed8',
                    }}>
                        {btMessage}
                    </div>
                )}
            </div>

            <div className="print-area">
                <div className="receipt-preview">
                    <div className="receipt-header">
                        {isKitchen ? (
                            <h3 style={{ fontSize: '20px', textDecoration: 'underline' }}>RESI DAPUR</h3>
                        ) : (
                            <>
                                <h3>{namaToko}</h3>
                                <p>{alamatToko}</p>
                                <p>Telp: {teleponToko}</p>
                            </>
                        )}
                        {headerNota && headerNota.split('\n').map((line, i) => (
                            <p key={i} style={{ fontSize: '11px', fontStyle: 'italic', color: '#555', margin: '1px 0' }}>{line}</p>
                        ))}
                        {isDraft && (
                            <div style={{
                                marginTop: '10px',
                                padding: '4px',
                                border: '2px solid #000',
                                fontWeight: 'bold',
                                fontSize: '14px',
                                color: '#000',
                                textTransform: 'uppercase'
                            }}>
                                (Bukan Bukti Pembayaran)
                            </div>
                        )}
                        {isKitchen && (
                            <div style={{ marginTop: '10px', fontSize: '14px', fontWeight: 'bold' }}>
                                (Draft Internal)
                            </div>
                        )}
                    </div>
                    <div className="receipt-meta">
                        <div>No: {transactionId}</div>
                        {nama_pelanggan && <div>Plgn: {nama_pelanggan}</div>}
                        <div>Tgl: {tanggal} {waktu}</div>
                        <div>Kasir: {kasir}</div>
                    </div>
                    <div className="receipt-items">
                        {Array.isArray(items) && items.map((item, idx) => (
                            <div key={idx} className="receipt-item">
                                <div className="item-line">
                                    <span>{item.nama_barang}</span>
                                </div>
                                {item.catatan && (
                                    <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic', paddingLeft: '4px' }}>
                                        ↳ {item.catatan}
                                    </div>
                                )}
                                <div className="item-detail">
                                    <span>{item.qty} x {formatRp(item.harga_override ?? item.harga_jual)}</span>
                                    <span style={{ float: 'right' }}>{formatRp(item.subtotal)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="receipt-total">
                        <div className="total-line">
                            <span>Subtotal</span>
                            <span>{formatRp(subtotal)}</span>
                        </div>
                        {diskonTotal > 0 && (
                            <div className="total-line">
                                <span>Diskon</span>
                                <span>-{formatRp(diskonTotal)}</span>
                            </div>
                        )}
                        <div className="total-line grand-total">
                            <span>TOTAL</span>
                            <span>{formatRp(total)}</span>
                        </div>
                        <div className="total-line">
                            <span>Bayar ({metodeBayar})</span>
                            <span>{formatRp(bayar)}</span>
                        </div>
                        <div className="total-line">
                            <span>Kembalian</span>
                            <span>{formatRp(kembalian)}</span>
                        </div>
                    </div>
                    <div className="receipt-footer">
                        {footerNota && footerNota.split('\n').map((line, i) => (
                            <p key={i}>{line}</p>
                        ))}
                        {isDraft && (
                            <p style={{ fontWeight: 'bold', marginTop: '10px' }}>(BUKAN BUKTI PEMBAYARAN)</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

