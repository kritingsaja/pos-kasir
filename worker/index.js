import { openDB } from 'idb';

const DB_NAME = 'pos-kasir-offline';
const STORE_NAME = 'pending_transactions';

// This handles the workbox-injected code for caching Next.js assets
self.__WB_DISABLE_DEV_LOGS = true;

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncPendingTransactions());
  }
});

async function syncPendingTransactions() {
  try {
    const db = await openDB(DB_NAME, 1);
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const pendingTransactions = await store.getAll();

    if (pendingTransactions.length === 0) return;

    // Filter to only those pending
    const toSync = pendingTransactions.filter((t) => t.status === 'pending');
    if (toSync.length === 0) return;

    // Send to server
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transactions: toSync }),
    });

    if (response.ok) {
      const result = await response.json();
      const syncedIds = result.syncedIds || [];

      // Update status in IndexedDB
      const writeTx = db.transaction(STORE_NAME, 'readwrite');
      const writeStore = writeTx.objectStore(STORE_NAME);
      for (const id of syncedIds) {
        const item = await writeStore.get(id);
        if (item) {
          item.status = 'synced';
          await writeStore.put(item);
        }
      }
      await writeTx.done;
      
      // Notify clients to refresh
      const clients = await self.clients.matchAll();
      for (const client of clients) {
        client.postMessage({ type: 'SYNC_COMPLETE', syncedIds });
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
