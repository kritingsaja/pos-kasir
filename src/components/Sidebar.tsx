'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const navItems = [
    { href: '/', icon: '📊', label: 'Dashboard', access: ['Admin'] },
    { href: '/kasir', icon: '🛒', label: 'Kasir', access: ['Kasir'] },
    { href: '/kasir/riwayat', icon: '🧾', label: 'Riwayat', access: ['Kasir'] },
    { href: '/produk', icon: '📦', label: 'Produk', access: ['Admin'] },
    { href: '/bahan-baku', icon: '🧪', label: 'Bahan Baku', access: ['Admin'] },
    { href: '/laporan', icon: '📋', label: 'Laporan', access: ['Admin'] },
    { href: '/pengaturan', icon: '⚙️', label: 'Pengaturan', access: ['Admin'] },
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
