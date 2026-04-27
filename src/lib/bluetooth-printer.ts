/// <reference types="web-bluetooth" />

const ESC = 0x1B;
const GS = 0x1D;

// ? TAMBAHKAN INI DI ATAS
async function sendLog(message: string, type: 'info' | 'error' = 'info') {
  try {
    await fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        type,
        time: new Date().toISOString(),
        userAgent: navigator.userAgent
      })
    });
  } catch (e) {
    console.log('[LOG FALLBACK]', message);
  }
}

export interface PrintReceiptData {
  namaToko?: string;
  alamatToko?: string;
  teleponToko?: string;
  transactionId: string;
  tanggal?: string;
  waktu?: string;
  kasir?: string;
  items: Array<{ nama_barang: string; qty: number; harga_jual: number; subtotal: number; catatan?: string }>;
  subtotal: number;
  diskonTotal: number;
  total: number;
  bayar: number;
  kembalian: number;
  metodeBayar: string;
  footerNota?: string;
  nama_pelanggan?: string;
  isDraft?: boolean;
}

export interface PrintKitchenData {
  transactionId: string;
  tanggal?: string;
  waktu?: string;
  items: Array<{ nama_barang: string; qty: number; catatan?: string }>;
  nama_pelanggan?: string;
}

export class BluetoothPrinter {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  async connect(): Promise<void> {
    sendLog('STEP 1: Mulai koneksi Bluetooth');
    
    try {
      sendLog('STEP 2: Request device...');
      this.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          '0000ff00-0000-1000-8000-00805f9b34fb',
          '0000ffe0-0000-1000-8000-00805f9b34fb',
        ]
      });
      sendLog(`STEP 3: Device ditemukan: ${this.device.name}`);

      sendLog('STEP 4: Connect GATT server...');
      const server = await this.device.gatt!.connect();
      sendLog('STEP 5: GATT connected');

      sendLog('STEP 6: Get primary services...');
      const services = await server.getPrimaryServices();
      sendLog(`STEP 7: Services found: ${services.length}`);

      for (const service of services) {
        sendLog(`STEP 8: Check service ${service.uuid}`);
        const characteristics = await service.getCharacteristics();
        sendLog(`STEP 9: Characteristics found: ${characteristics.length}`);

        for (const char of characteristics) {
          const props = [];
          if (char.properties.write) props.push('write');
          if (char.properties.writeWithoutResponse) props.push('writeWithoutResponse');
          
          sendLog(`STEP 10: Char ${char.uuid.substring(0,8)}... props: ${props.join(',')}`);

          if (char.properties.write || char.properties.writeWithoutResponse) {
            this.characteristic = char;
            sendLog('STEP 11: WRITE characteristic found!');
            return;
          }
        }
      }
      
      throw new Error('Tidak ada characteristic write yang ditemukan');
      
    } catch (error) {
      sendLog(`ERROR CONNECT: ${(error as Error).message}`, 'error');
      throw error;
    }
  }

  isConnected(): boolean {
    return this.device?.gatt?.connected ?? false;
  }

  disconnect(): void {
    this.device?.gatt?.disconnect();
    this.device = null;
    this.characteristic = null;
    sendLog('Printer disconnected');
  }

  private async sendBytes(data: Uint8Array): Promise<void> {
    sendLog(`STEP 12: Sending ${data.length} bytes...`);
    
    if (!this.characteristic) {
      throw new Error('Printer belum terkoneksi');
    }

    const chunkSize = 100;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      try {
        if (this.characteristic.properties.writeWithoutResponse) {
          await this.characteristic.writeValueWithoutResponse(chunk);
        } else {
          await this.characteristic.writeValue(chunk);
        }
      } catch (e) {
        sendLog(`ERROR SEND CHUNK: ${(e as Error).message}`, 'error');
        throw e;
      }
      await new Promise(r => setTimeout(r, 30));
    }
    
    sendLog('STEP 13: All bytes sent');
  }

  private textToBytes(text: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 128) {
        bytes.push(code);
      } else {
        if (code < 0x800) {
          bytes.push(0xC0 | (code >> 6));
          bytes.push(0x80 | (code & 0x3F));
        } else {
          bytes.push(0xE0 | (code >> 12));
          bytes.push(0x80 | ((code >> 6) & 0x3F));
          bytes.push(0x80 | (code & 0x3F));
        }
      }
    }
    return bytes;
  }

  async printReceipt(data: any): Promise<void> {
    sendLog('STEP 20: Mulai print receipt');
    
    try {
      const bytes: number[] = [];
      const init = [ESC, 0x40];
      const alignCenter = [ESC, 0x61, 0x01];
      const alignLeft = [ESC, 0x61, 0x00];
      const boldOn = [ESC, 0x45, 0x01];
      const boldOff = [ESC, 0x45, 0x00];
      const bigTextOn = [GS, 0x21, 0x11];
      const bigTextOff = [GS, 0x21, 0x00];
      const newLine = [0x0A];
      const cutPaper = [GS, 0x56, 0x42, 0x03]; // Partial cut (lebih pendek)

      const line = (text: string) => [...this.textToBytes(text), ...newLine];
      const separator = () => line('--------------------------------');

      bytes.push(...init, ...alignCenter, ...boldOn, ...bigTextOn);
      bytes.push(...line(data.namaToko));
      bytes.push(...bigTextOff, ...boldOff);
      bytes.push(...line(data.alamatToko));
      bytes.push(...line('Telp: ' + data.teleponToko));
      
      if (data.isDraft) {
        bytes.push(...newLine, ...boldOn, ...line('(BUKAN BUKTI PEMBAYARAN)'), ...boldOff);
      }
      
      bytes.push(...separator());

      bytes.push(...alignLeft);
      bytes.push(...line('No : ' + data.transactionId));
      if (data.nama_pelanggan) {
        bytes.push(...line('Plgn: ' + data.nama_pelanggan));
      }
      bytes.push(...line('Tgl: ' + data.tanggal + ' ' + data.waktu));
      bytes.push(...line('Kasir: ' + data.kasir));
      bytes.push(...separator());

      for (const item of data.items) {
        bytes.push(...line(item.nama_barang));
        if (item.catatan) {
          bytes.push(...line(`  * Note: ${item.catatan}`));
        }
        bytes.push(...line(`  ${item.qty} x ${item.harga_jual} = ${item.subtotal}`));
      }
      bytes.push(...separator());

      bytes.push(...line('Subtotal: ' + data.subtotal));
      if (data.diskonTotal > 0) {
        bytes.push(...line('Diskon: -' + data.diskonTotal));
      }
      bytes.push(...boldOn);
      bytes.push(...line('TOTAL: ' + data.total));
      bytes.push(...boldOff);
      bytes.push(...line('Bayar: ' + data.bayar));
      bytes.push(...line('Kembalian: ' + data.kembalian));
      bytes.push(...separator());

      bytes.push(...alignCenter);
      if (data.isDraft) {
        bytes.push(...boldOn, ...line('(BUKAN BUKTI PEMBAYARAN)'), ...boldOff, ...newLine);
      }
      bytes.push(...line(data.footerNota));
      bytes.push(...newLine); // Hanya 1 newLine sebelum cut
      bytes.push(...cutPaper);

      sendLog(`STEP 21: Receipt ${bytes.length} bytes ready`);
      await this.sendBytes(new Uint8Array(bytes));
      sendLog('STEP 22: Print SUCCESS!', 'info');
      
    } catch (error) {
      sendLog(`ERROR PRINT: ${(error as Error).message}`, 'error');
      throw error;
    }
  }

  async printKitchenReceipt(data: any): Promise<void> {
    sendLog('STEP 20: Mulai print kitchen receipt');
    
    try {
      const bytes: number[] = [];
      const init = [ESC, 0x40];
      const alignCenter = [ESC, 0x61, 0x01];
      const alignLeft = [ESC, 0x61, 0x00];
      const boldOn = [ESC, 0x45, 0x01];
      const boldOff = [ESC, 0x45, 0x00];
      const bigTextOn = [GS, 0x21, 0x11];
      const bigTextOff = [GS, 0x21, 0x00];
      const newLine = [0x0A];
      const cutPaper = [GS, 0x56, 0x42, 0x03]; // Partial cut (lebih pendek)

      const line = (text: string) => [...this.textToBytes(text), ...newLine];
      const separator = () => line('--------------------------------');

      bytes.push(...init, ...alignCenter, ...boldOn, ...bigTextOn);
      bytes.push(...line('RESI DAPUR'));
      bytes.push(...bigTextOff, ...boldOff);
      bytes.push(...line('No : ' + data.transactionId));
      if (data.tanggal || data.waktu) {
        bytes.push(...line(`Tgl: ${data.tanggal || ''} ${data.waktu || ''}`));
      }
      if (data.nama_pelanggan) {
        bytes.push(...line('Plgn: ' + data.nama_pelanggan));
      }
      bytes.push(...separator());

      bytes.push(...alignLeft, ...boldOn);
      for (const item of data.items) {
        bytes.push(...line(`x${item.qty} ${item.nama_barang}`));
        if (item.catatan) {
          bytes.push(...line(`  * Note: ${item.catatan}`));
        }
      }
      bytes.push(...boldOff, ...separator());

      bytes.push(...newLine); // Hanya 1 newLine sebelum cut
      bytes.push(...cutPaper);

      sendLog(`STEP 21: Kitchen Receipt ${bytes.length} bytes ready`);
      await this.sendBytes(new Uint8Array(bytes));
      sendLog('STEP 22: Print Kitchen SUCCESS!', 'info');
      
    } catch (error) {
      sendLog(`ERROR PRINT KITCHEN: ${(error as Error).message}`, 'error');
      throw error;
    }
  }
}

export const printer = new BluetoothPrinter();