import { NextResponse } from 'next/server';
import { checkStockAndNotify } from '@/lib/telegram';

export async function GET(request: Request) {
  // Simple "secret" check if needed, but for now we'll allow trigger via GET
  // Recommended: curl http://localhost:3000/api/cron/check-stock
  try {
    const result = await checkStockAndNotify();
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
