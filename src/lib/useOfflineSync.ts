import { useState, useEffect, useCallback } from 'react';
import { openDB, IDBPDatabase } from 'idb';
import { v4 as uuidv4 } from 'uuid';

const DB_NAME = 'pos-kasir-offline';
const STORE_NAME = 'pending_transactions';

export interface OfflineTransaction {
  id: string;
  data: any;
  timestamp: number;
  status: 'pending' | 'synced' | 'failed';
  retryCount: number;
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  // Initialize DB
  const initDB = async () => {
    return openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      },
    });
  };

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    try {
      const db = await initDB();
      const all = await db.getAll(STORE_NAME);
      const pending = all.filter(t => t.status === 'pending');
      setPendingCount(pending.length);
    } catch (e) {
      console.error('Error fetching pending count', e);
    }
  }, []);

  // Check initial status and add listeners
  useEffect(() => {
    setIsOnline(navigator.onLine);
    
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    updatePendingCount();

    // Listen for Service Worker messages about sync completion
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SYNC_COMPLETE') {
        const count = event.data.syncedIds?.length || 0;
        if (count > 0) {
          window.dispatchEvent(new CustomEvent('offline-sync-complete', { detail: { count } }));
        }
        updatePendingCount();
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, [updatePendingCount]);

  // Save transaction locally when offline
  const saveOfflineTransaction = async (data: any) => {
    try {
      const db = await initDB();
      const transaction: OfflineTransaction = {
        id: uuidv4(),
        data,
        timestamp: Date.now(),
        status: 'pending',
        retryCount: 0,
      };
      await db.put(STORE_NAME, transaction);
      await updatePendingCount();
      
      // Try to sync immediately if we actually are online
      if (navigator.onLine) {
        triggerSync();
      }
      return transaction.id;
    } catch (error) {
      console.error('Failed to save offline transaction', error);
      throw error;
    }
  };

  // Trigger sync either via Service Worker or fetch directly
  const triggerSync = async () => {
    if (!navigator.onLine) return;

    try {
      // If service worker is ready, use Background Sync API
      const registration = await navigator.serviceWorker?.ready;
      if (registration && 'sync' in registration) {
        // Cast to any because TS doesn't fully support SyncManager yet
        await (registration as any).sync.register('sync-transactions');
        return;
      }
    } catch (e) {
      console.log('Background Sync not supported or failed, falling back to manual sync', e);
    }

    // Fallback: manual sync
    await manualSync();
  };

  const manualSync = async () => {
    try {
      const db = await initDB();
      const all = await db.getAll(STORE_NAME);
      const pending = all.filter(t => t.status === 'pending');

      if (pending.length === 0) return;

      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transactions: pending }),
      });

      if (response.ok) {
        const result = await response.json();
        const syncedIds = result.syncedIds || [];
        
        const tx = db.transaction(STORE_NAME, 'readwrite');
        for (const id of syncedIds) {
          const item = await tx.store.get(id);
          if (item) {
            item.status = 'synced';
            await tx.store.put(item);
          }
        }
        await tx.done;
        
        if (syncedIds.length > 0) {
          window.dispatchEvent(new CustomEvent('offline-sync-complete', { detail: { count: syncedIds.length } }));
        }
        
        updatePendingCount();
      }
    } catch (error) {
      console.error('Manual sync failed', error);
    }
  };

  return {
    isOnline,
    pendingCount,
    saveOfflineTransaction,
    triggerSync,
  };
}
