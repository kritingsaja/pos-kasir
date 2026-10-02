'use client';

import { useBcaConnection } from '@/lib/bca-connection';

export default function BcaConnectionIndicator({ compact = false }: { compact?: boolean }) {
    const { state, checkedAt } = useBcaConnection();
    const labels = { unknown: 'BCA belum dicek', checking: 'BCA menghubungkan', connected: 'BCA terhubung', error: 'BCA bermasalah', offline: 'BCA offline' };
    const lastChecked = checkedAt && Number.isFinite(Date.parse(checkedAt))
        ? 'Terakhir berhasil ' + new Date(checkedAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB' : labels[state];
    return <span className={'bca-connection bca-connection--' + state} role="status" aria-live="polite" aria-label={compact ? labels[state] : undefined} title={lastChecked}>
        <span className="bca-connection-led" aria-hidden="true" />{!compact && labels[state]}
    </span>;
}
