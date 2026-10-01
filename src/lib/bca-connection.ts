'use client';

import { useSyncExternalStore } from 'react';

type Connection = { state: 'unknown' | 'checking' | 'connected' | 'error' | 'offline'; checkedAt?: string };
const initial: Connection = { state: 'unknown' };
const FRESH_MS = 5 * 60_000;
let connection: Connection = initial;
const listeners = new Set<() => void>();
let warmup: Promise<void> | null = null;
let warmupNotBefore = 0;

function publish(next: Connection) {
    connection = next;
    listeners.forEach(listener => listener());
}

export function bcaChecking() { publish({ ...connection, state: 'checking' }); }
export function bcaFailed() { publish({ ...connection, state: navigator.onLine ? 'error' : 'offline' }); }
export function bcaConnected(checkedAt?: string) {
    // A configured account or an old payment claim is not proof of a live bank connection.
    const age = checkedAt ? Date.now() - Date.parse(checkedAt) : NaN;
    publish({ state: !navigator.onLine ? 'offline' : Number.isFinite(age) && age >= -60_000 && age < FRESH_MS ? 'connected' : 'unknown', checkedAt });
}

function refreshStatus() {
    if (!navigator.onLine) {
        if (connection.state !== 'offline') publish({ ...connection, state: 'offline' });
    } else if (connection.state === 'offline' || (connection.state === 'connected' && Date.now() - Date.parse(connection.checkedAt || '') >= FRESH_MS)) {
        publish({ ...connection, state: 'unknown' });
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    window.addEventListener('offline', refreshStatus);
    window.addEventListener('online', refreshStatus);
    const timer = window.setInterval(refreshStatus, 10_000);
    refreshStatus();
    return () => {
        listeners.delete(listener);
        window.clearInterval(timer);
        if (!listeners.size) {
            window.removeEventListener('offline', refreshStatus);
            window.removeEventListener('online', refreshStatus);
        }
    };
}

export function useBcaConnection() {
    return useSyncExternalStore(subscribe, () => connection, () => initial);
}

export function warmBcaConnection(): Promise<void> {
    if (warmup) return warmup;
    if (connection.state === 'connected' && Date.now() - Date.parse(connection.checkedAt || '') < FRESH_MS) return Promise.resolve();
    if (!navigator.onLine) { bcaFailed(); return Promise.resolve(); }
    bcaChecking();
    warmupNotBefore = Date.now() + 5_100;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 115_000);
    warmup = (async () => {
        try {
            const response = await fetch('/api/cek-mutasi-bca', {
                method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'warmup' }),
            });
            const result = await response.json();
            if (!response.ok || !result.success || !result.warmed) throw new Error('BCA connection failed');
            bcaConnected(result.connectionCheckedAt);
        } catch { bcaFailed(); }
        finally { window.clearTimeout(timer); warmup = null; }
    })();
    return warmup;
}

export async function waitForBcaWarmup() {
    await warmup;
    // Honor the server's five-second account throttle if warmup finished very quickly.
    const remaining = warmupNotBefore - Date.now();
    if (remaining > 0) await new Promise(resolve => window.setTimeout(resolve, remaining));
}
