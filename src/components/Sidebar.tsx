'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const navItems = [
    { href: '/', icon: '📊', label: 'Dashboard', access: ['Admin'] },
    { href: '/kasir', icon: '🛒', label: 'Kasir', access: ['Kasir'] },
    { href: '/kasir/riwayat', icon: '🧾', label: 'Riwayat', access: ['Kasir'] },
    { href: '/produk', icon: '📦', label: 'Produk', access: ['Admin'] },
    { href: '/bahan-baku', icon: '🧪', label: 'Bahan Baku', access: ['Admin'] },
    { href: '/laporan', icon: '📋', label: 'Laporan', access: ['Admin'] },
    { href: '/pengaturan', icon: '⚙️', label: 'Pengaturan', access: ['Admin'] },
];

const kasirActionItems = [
    { eventName: 'kasir:open-sales', icon: '📊', label: 'Sales' },
    { eventName: 'kasir:open-drafts', icon: '📋', label: 'Draft' },
];

interface SidebarProps {
    isCollapsed: boolean;
    onToggle: () => void;
    userRole: string | null;
    username: string | null;
    onNavigate?: () => void;
}

export default function Sidebar({ isCollapsed, onToggle, userRole, username, onNavigate }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [draftCount, setDraftCount] = useState(0);

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.push('/login');
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    const normalizedRole = userRole?.toLowerCase() || '';
    const allowedItems = navItems.filter(item => {
        if (!userRole) return false;
        return item.access.some(role => role.toLowerCase() === normalizedRole);
    });
    const shouldShowKasirActions = pathname === '/kasir' && normalizedRole === 'kasir';

    useEffect(() => {
        const handleDraftCount = (event: Event) => {
            const customEvent = event as CustomEvent<{ count?: number }>;
            setDraftCount(customEvent.detail?.count || 0);
        };

        window.addEventListener('kasir:draft-count', handleDraftCount);
        return () => window.removeEventListener('kasir:draft-count', handleDraftCount);
    }, []);

    const handleKasirAction = (eventName: string) => {
        window.dispatchEvent(new CustomEvent(eventName));
        onNavigate?.();
    };

    return (
        <aside className="sidebar">
            <div className={`sidebar-header ${isCollapsed ? 'collapsed' : ''}`}>
                <div className="sidebar-logo">
                    <div className="logo-icon">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                            src="/icon.png" 
                            alt="Logo" 
                            style={{ 
                                width: isCollapsed ? '24px' : '32px', 
                                height: isCollapsed ? '24px' : '32px', 
                                borderRadius: '4px',
                                objectFit: 'cover' 
                            }} 
                            onError={(e) => {
                                // Fallback if image not found
                                e.currentTarget.style.display = 'none';
                                const parent = e.currentTarget.parentElement;
                                if (parent) parent.innerHTML = '💰';
                            }}
                        />
                    </div>
                    {!isCollapsed && <span className="logo-text">KasirPOS</span>}
                </div>
                <button
                    className="sidebar-toggle"
                    onClick={onToggle}
                    title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                    {isCollapsed ? '☰' : '✕'}
                </button>
            </div>

            <nav className="sidebar-nav" style={{ flex: 1 }}>
                {allowedItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`nav-link ${pathname === item.href ? 'active' : ''} ${isCollapsed ? 'collapsed' : ''}`}
                        title={isCollapsed ? item.label : undefined}
                        onClick={() => onNavigate?.()}
                    >
                        <span className="nav-icon">{item.icon}</span>
                        {!isCollapsed && <span className="nav-text">{item.label}</span>}
                    </Link>
                ))}
                {shouldShowKasirActions && (
                    <div className="sidebar-nav-actions" aria-label="Aksi kasir">
                        {!isCollapsed && <div className="sidebar-nav-section">Aksi</div>}
                        {kasirActionItems.map((item) => (
                            <button
                                key={item.eventName}
                                type="button"
                                className={`nav-link nav-action ${isCollapsed ? 'collapsed' : ''}`}
                                title={isCollapsed ? item.label : undefined}
                                onClick={() => handleKasirAction(item.eventName)}
                            >
                                <span className="nav-icon">{item.icon}</span>
                                {!isCollapsed && <span className="nav-text">{item.label}</span>}
                                {item.eventName === 'kasir:open-drafts' && draftCount > 0 && (
                                    <span className="nav-badge">{draftCount}</span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </nav>

            <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {!isCollapsed && username && (
                    <div style={{ fontSize: '14px', color: 'var(--text-primary)', textAlign: 'center', marginBottom: '8px' }}>
                        👤 <strong>{username}</strong> <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>({userRole})</span>
                    </div>
                )}
                {isCollapsed && username && (
                    <div style={{ fontSize: '18px', textAlign: 'center', marginBottom: '8px' }} title={`${username} (${userRole})`}>
                        👤
                    </div>
                )}
                <button
                    onClick={handleLogout}
                    className="btn btn-secondary"
                    style={{
                        width: '100%',
                        padding: isCollapsed ? '8px 0' : '8px 16px',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                    title={isCollapsed ? "Logout" : undefined}
                >
                    🚪 {!isCollapsed && <span>Logout</span>}
                </button>
            </div>
        </aside>
    );
}
