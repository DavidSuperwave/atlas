'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { signOut, getUserProfile } from '@/lib/supabase-client';

// Routes where sidebar should be hidden
const PUBLIC_ROUTES = ['/login', '/onboarding', '/invite', '/account-disabled', '/pending-approval'];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [totalPurchased, setTotalPurchased] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);

  // Hide sidebar on public routes
  if (PUBLIC_ROUTES.some(route => pathname?.startsWith(route))) {
    return null;
  }

  // Check if user is admin
  useEffect(() => {
    async function checkAdmin() {
      if (user) {
        const profile = await getUserProfile(user.id);
        setIsAdmin(profile?.is_admin ?? false);
      } else {
        setIsAdmin(false);
      }
    }
    checkAdmin();
  }, [user]);

  // Fetch credits
  useEffect(() => {
    async function fetchCredits() {
      if (!user) {
        setCreditsLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/credits/balance');
        if (res.ok) {
          const data = await res.json();
          setCreditBalance(data.balance);
          setTotalPurchased(data.totalPurchased);
        }
      } catch (error) {
        console.error('Error fetching credits:', error);
      } finally {
        setCreditsLoading(false);
      }
    }
    fetchCredits();
  }, [user]);

  // Handle mobile responsive state
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setIsCollapsed(true);
    };

    // Initial check
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isActive = (path: string) => {
    if (path === '/dashboard' && pathname === '/dashboard') return true;
    if (path !== '/dashboard' && pathname.startsWith(path)) return true;
    return false;
  };

  // Extract display name from email
  const getDisplayName = (email: string | undefined): string => {
    if (!email) return 'User';
    const namePart = email.split('@')[0];
    // Capitalize first letter and handle numbers
    return namePart.charAt(0).toUpperCase() + namePart.slice(1);
  };

  async function handleSignOut() {
    setLoggingOut(true);
    try {
      await signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setLoggingOut(false);
    }
  }

  const navItems = [
    {
      name: 'Scrapes',
      path: '/dashboard',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" x2="22" y1="12" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      )
    },
    {
      name: 'Database',
      path: '/leads',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3H5C3.89543 3 3 3.89543 3 5Z" />
          <path d="M3 9H21" />
          <path d="M9 21V9" />
        </svg>
      )
    },
    {
      name: 'Email Verification',
      path: '/verify',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      )
    }
  ];

  const comingSoonItems = [
    {
      name: 'Google Scraper',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      )
    },
    {
      name: 'Aged Domains',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )
    }
  ];

  const adminItems = [
    {
      name: 'Admin Dashboard',
      path: '/admin',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      )
    },
    {
      name: 'Access Requests',
      path: '/admin/access-requests',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" x2="19" y1="8" y2="14" />
          <line x1="22" x2="16" y1="11" y2="11" />
        </svg>
      )
    },
    {
      name: 'Users',
      path: '/admin/users',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    },
    {
      name: 'GoLogin Profiles',
      path: '/admin/gologin-profiles',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="M15 8h2" />
          <path d="M15 12h2" />
          <path d="M5 18a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3" />
        </svg>
      )
    },
    {
      name: 'Manage Credits',
      path: '/admin/credits',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      )
    },
    {
      name: 'Credit Orders',
      path: '/admin/credit-orders',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8v4l3 3" />
          <circle cx="12" cy="12" r="10" />
        </svg>
      )
    }
  ];

  // Don't show sidebar on public pages
  const publicPages = ['/', '/login', '/signup', '/invite'];
  if (publicPages.some(page => pathname === page || pathname.startsWith('/invite'))) {
    return null;
  }

  return (
    <div 
      className={`flex flex-col bg-zinc-950 border-r border-zinc-800/50 transition-all duration-300 ease-in-out h-screen sticky top-0 z-50 ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Header / Toggle */}
      <div className="px-3 py-4 border-b border-zinc-800/50 flex items-center justify-between h-14">
        {!isCollapsed && (
          <Link href="/dashboard" className="font-semibold text-base text-white tracking-tight truncate">
            Atlas
          </Link>
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`p-1.5 rounded-md hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-300 transition-colors ${isCollapsed ? 'mx-auto' : ''}`}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
               <polyline points="13 17 18 12 13 7" />
               <polyline points="6 17 11 12 6 7" />
             </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="6" />
              <line x1="18" y1="12" x2="6" y2="12" />
              <line x1="18" y1="18" x2="6" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* User Info (when expanded) */}
      {!isCollapsed && user && (
        <div className="px-3 py-3 border-b border-zinc-800/50">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-zinc-800 flex items-center justify-center ring-1 ring-zinc-700/50">
              <span className="text-zinc-300 font-medium text-xs">
                {getDisplayName(user.email).charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-zinc-200 truncate">{getDisplayName(user.email)}</p>
                {isAdmin && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-400 rounded">
                    Admin
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-all duration-150 group relative ${
                active 
                  ? 'bg-zinc-800/80 text-white' 
                  : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200'
              } ${isCollapsed ? 'justify-center' : ''}`}
              title={isCollapsed ? item.name : ''}
            >
              <span className={`flex-shrink-0 ${active ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                {item.icon}
              </span>
              
              {!isCollapsed && (
                <span className="text-sm font-medium truncate">
                  {item.name}
                </span>
              )}

              {/* Tooltip for collapsed state */}
              {isCollapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-zinc-800 text-zinc-200 text-xs font-medium rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 border border-zinc-700/50">
                  {item.name}
                </div>
              )}
            </Link>
          );
        })}

        {/* Coming Soon Items */}
        {comingSoonItems.map((item) => (
          <div
            key={item.name}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-not-allowed opacity-50 ${isCollapsed ? 'justify-center' : ''}`}
            title={isCollapsed ? `${item.name} - Coming Soon` : ''}
          >
            <span className="flex-shrink-0 text-zinc-600">
              {item.icon}
            </span>
            
            {!isCollapsed && (
              <>
                <span className="text-sm font-medium text-zinc-600 truncate">
                  {item.name}
                </span>
                <span className="ml-auto px-1.5 py-0.5 text-[9px] font-medium bg-zinc-800 text-zinc-500 rounded">
                  Soon
                </span>
              </>
            )}

            {/* Tooltip for collapsed state */}
            {isCollapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-zinc-800 text-zinc-200 text-xs font-medium rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 border border-zinc-700/50">
                {item.name} - Soon
              </div>
            )}
          </div>
        ))}

        {/* Admin Section */}
        {isAdmin && (
          <>
            {!isCollapsed && (
              <div className="pt-4 pb-2">
                <p className="px-2.5 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Admin</p>
              </div>
            )}
            {isCollapsed && <div className="h-px bg-zinc-800/50 my-2" />}
            
            {adminItems.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-all duration-150 group relative ${
                    active 
                      ? 'bg-amber-500/10 text-amber-400' 
                      : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200'
                  } ${isCollapsed ? 'justify-center' : ''}`}
                  title={isCollapsed ? item.name : ''}
                >
                  <span className={`flex-shrink-0 ${active ? 'text-amber-400' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                    {item.icon}
                  </span>
                  
                  {!isCollapsed && (
                    <span className="text-sm font-medium truncate">
                      {item.name}
                    </span>
                  )}

                  {/* Tooltip for collapsed state */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-zinc-800 text-zinc-200 text-xs font-medium rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 border border-zinc-700/50">
                      {item.name}
                    </div>
                  )}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Tutorial Video Section */}
      {!isCollapsed && (
        <div className="px-3 py-3 border-t border-zinc-800/50">
          <p className="text-[10px] font-medium text-zinc-500 mb-2">Watch this video to learn how to use it</p>
          <div className="relative aspect-video rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800/50">
            <iframe 
              src="https://fast.wistia.net/embed/iframe/YOUR_VIDEO_ID?seo=true&videoFoam=false"
              title="Tutorial Video"
              allow="autoplay; fullscreen"
              frameBorder="0"
              className="absolute top-0 left-0 w-full h-full"
            />
          </div>
        </div>
      )}

      {/* Credits Section */}
      {!isCollapsed && user && (
        <div className="px-3 py-3 border-t border-zinc-800/50">
          {creditsLoading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-3 bg-zinc-800 rounded w-20"></div>
              <div className="h-2 bg-zinc-800 rounded w-full"></div>
              <div className="h-8 bg-zinc-800 rounded w-full"></div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Credits</span>
                <span className="text-xs text-zinc-400">
                  {creditBalance?.toLocaleString() ?? 0} / {totalPurchased?.toLocaleString() ?? 0}
                </span>
              </div>
              
              {/* Progress Bar */}
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-3">
                {(() => {
                  const percentage = totalPurchased && totalPurchased > 0 
                    ? Math.min(100, (creditBalance ?? 0) / totalPurchased * 100)
                    : 0;
                  const isLow = percentage < 30;
                  return (
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        isLow ? 'bg-red-500' : 'bg-gradient-to-r from-yellow-500 to-amber-400'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  );
                })()}
              </div>

              <Link
                href="/credits"
                className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 hover:from-amber-500/30 hover:to-yellow-500/30 border border-amber-500/30 text-amber-400 rounded-lg transition-all text-xs font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Buy More Credits
              </Link>
            </>
          )}
        </div>
      )}

      {/* Footer with Auth */}
      <div className="px-2 py-3 border-t border-zinc-800/50">
        {loading ? (
          <div className="animate-pulse h-8 bg-zinc-800 rounded"></div>
        ) : user ? (
          <button
            onClick={handleSignOut}
            disabled={loggingOut}
            className={`flex items-center gap-2 w-full px-2.5 py-2 text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-300 rounded-md transition-colors ${isCollapsed ? 'justify-center' : ''}`}
            title={isCollapsed ? 'Sign Out' : ''}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {!isCollapsed && (
              <span className="text-sm font-medium">{loggingOut ? 'Signing out...' : 'Sign Out'}</span>
            )}
          </button>
        ) : (
          <Link
            href="/login"
            className={`flex items-center gap-2 w-full px-2.5 py-2 text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200 rounded-md transition-colors ${isCollapsed ? 'justify-center' : ''}`}
            title={isCollapsed ? 'Sign In' : ''}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            {!isCollapsed && <span className="text-sm font-medium">Sign In</span>}
          </Link>
        )}
        
        {!isCollapsed && (
          <p className="text-[10px] text-zinc-700 text-center mt-3">&copy; {new Date().getFullYear()} Atlas</p>
        )}
      </div>
    </div>
  );
}
