import { getAllSettings } from './db';
import { getMaterialsWithStock } from './materials-logic';

export async function sendTelegramMessage(text: string) {
  const settings = await getAllSettings();
  const token = settings.telegram_bot_token;
  const chatId = settings.telegram_chat_id;

  if (!token || !chatId) {
    console.error('Telegram Bot Token or Chat ID not configured');
    return { success: false, error: 'Not configured' };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      }),
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to send Telegram message', error);
    return { success: false, error };
  }
}

export async function checkStockAndNotify() {
  const materials = await getMaterialsWithStock();
  const warnings = materials.filter((m: any) => m.status === 'warning');

  let message = `<b>📢 LAPORAN STOK HARIAN</b>\n`;
  message += `Tanggal: ${new Date().toLocaleDateString('id-ID')}\n\n`;

  if (warnings.length > 0) {
    message += `⚠️ <b>PERINGATAN STOK RENDAH:</b>\n`;
    warnings.forEach((m: any) => {
      message += `- ${m.nama}: <b>${m.estimated_stock.toFixed(2)} ${m.satuan}</b> (Min: ${m.min_stok})\n`;
    });
  } else {
    message += `✅ Semua stok bahan baku aman.\n`;
  }

  message += `\n<i>Silakan cek dashboard untuk detail lebih lanjut.</i>`;
  
  return await sendTelegramMessage(message);
}
