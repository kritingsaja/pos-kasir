import { NextResponse } from 'next/server';
import { addTransaction } from '@/lib/db';

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
        // Attempt to insert
        await addTransaction(txData);
        syncedIds.push(idbId);
      } catch (err: any) {
        // If the error is a UNIQUE constraint violation (UNIQUE constraint failed: transactions.id)
        // it means we already successfully inserted it before, but the client didn't get the ack.
        // We should mark it as synced to prevent infinite retries.
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          syncedIds.push(idbId);
        } else {
          console.error(`Failed to sync transaction ${idbId}:`, err);
        }
      }
    }

    return NextResponse.json({ success: true, syncedIds });
  } catch (error) {
    console.error('Error in /api/sync:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
