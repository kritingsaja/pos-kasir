import { NextResponse } from 'next/server';
import { addTransactionIdempotent } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { transactions } = body;

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ success: true, syncedIds: [] });
    }

    const syncedIds: string[] = [];

    for (const pendingTx of transactions) {
      const idbId = pendingTx.id;
      const txData = pendingTx.data;

      try {
        await addTransactionIdempotent(txData);
        syncedIds.push(idbId);
      } catch (err: unknown) {
        console.error(`Failed to sync transaction ${idbId}:`, err);
      }
    }

    return NextResponse.json({ success: true, syncedIds });
  } catch (error) {
    console.error('Error in /api/sync:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
