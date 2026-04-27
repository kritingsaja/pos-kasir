'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

function useMediaQuery(query: string) {
    return useSyncExternalStore(
        (onStoreChange) => {
            const mql = window.matchMedia(query);
            mql.addEventListener('change', onStoreChange);
            return () => mql.removeEventListener('change', onStoreChange);
        },
        () => window.matchMedia(query).matches,
        () => false
    );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [isSidebarCollapsedDesktop, setIsSidebarCollapsedDesktop] = useState(false);
    const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [username, setUsername] = useState<string | null>(null);
    const pathname = usePathname();

    const isLoginPage = pathname === '/login';

    const isSidebarCollapsed = isMobile ? !isSidebarOpenMobile : isSidebarCollapsedDesktop;

    useEffect(() => {
        if (isSidebarCollapsed) {
            document.documentElement.style.setProperty('--sidebar-width', '80px');
        } else {
            document.documentElement.style.setProperty('--sidebar-width', '260px');
        }
    }, [isSidebarCollapsed]);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch('/api/auth/me');
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.user) {
                        setUserRole(data.user.role);
                        setUsername(data.user.username);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch user', error);
            }
        };
        if (!isLoginPage) {
            fetchUser();
        }

        // PWA Service Worker Registration
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('/sw.js').then(
                    function (registration) {
                        console.log('ServiceWorker registration successful with scope: ', registration.scope);
                    },
                    function (err) {
                        console.log('ServiceWorker registration failed: ', err);
                    }
                );
            });
        }
    }, [isLoginPage]);

    const toggleSidebar = () => {
        if (isMobile) setIsSidebarOpenMobile((v) => !v);
        else setIsSidebarCollapsedDesktop((v) => !v);
    };

    if (isLoginPage) {
        return (
            <main className="main-content" style={{ margin: 0, padding: 0 }}>
                {children}
            </main>
        );
    }

    return (
        <div className={`app-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
            {/* Backdrop untuk menutup sidebar di mobile */}
            <div
                className={`sidebar-backdrop ${isMobile && isSidebarOpenMobile ? 'active' : ''}`}
                onClick={() => setIsSidebarOpenMobile(false)}
            />

            <Sidebar
                isCollapsed={isSidebarCollapsed}
                onToggle={toggleSidebar}
                userRole={userRole}
                username={username}
                onNavigate={() => setIsSidebarOpenMobile(false)}
            />

            {/*
                KUNCI FIX GAP:
                Tombol ini di-render di LUAR <main>, langsung di dalam app-layout.
                Di CSS ia pakai position: fixed — sehingga 100% tidak masuk
                ke dalam document flow dan tidak mendorong konten ke bawah.
                Hanya tampil di mobile (display: none di desktop).
            */}
            <button
                className="mobile-toggle-btn"
                onClick={() => setIsSidebarOpenMobile(true)}
                aria-label="Buka menu"
            >
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
            </button>

            <main className="main-content">
                {children}
            </main>
        </div>
    );
}