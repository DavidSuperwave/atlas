'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { signOut, getUserProfile } from '@/lib/supabase-client';
import CreditBalance from './CreditBalance';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

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
    if (path === '/' && pathname === '/') return true;
    if (path !== '/' && pathname.startsWith(path)) return true;
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
      path: '/',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.98l7.5-4.04a2.25 2.25 0 012.134 0l7.5 4.04a2.25 2.25 0 011.183 1.98V19.5z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      )
    },
    {
      name: 'Credits',
      path: '/credits',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v12" />
          <path d="M15 9.5a3.5 3.5 0 0 0-3-1.5c-2 0-3 1-3 2.5s1.5 2 3 2.5 3 1 3 2.5-1 2.5-3 2.5a3.5 3.5 0 0 1-3-1.5" />
        </svg>
      )
    }
  ];

  const adminItems = [
    {
      name: 'Admin Dashboard',
      path: '/admin',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      )
    },
    {
      name: 'Manage Credits',
      path: '/admin/credits',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      )
    }
  ];

  // Don't show sidebar on auth pages
  if (pathname === '/login' || pathname === '/signup') {
    return null;
  }

  return (
    <div 
      className={`flex flex-col bg-white border-r border-gray-200 transition-all duration-300 ease-in-out h-screen sticky top-0 z-50 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Header / Toggle */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between h-16">
        {!isCollapsed && (
          <span className="font-bold text-xl text-blue-600 truncate">Atlas</span>
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors ${isCollapsed ? 'mx-auto' : ''}`}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
               <polyline points="13 17 18 12 13 7" />
               <polyline points="6 17 11 12 6 7" />
             </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="6" />
              <line x1="18" y1="12" x2="6" y2="12" />
              <line x1="18" y1="18" x2="6" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* User Info & Credits (when expanded) */}
      {!isCollapsed && user && (
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-blue-600 font-medium text-sm">
                {getDisplayName(user.email).charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900 truncate">{getDisplayName(user.email)}</p>
                {isAdmin && (
                  <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded">
                    Admin
                  </span>
                )}
              </div>
            </div>
          </div>
          <CreditBalance compact />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-6 px-3 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group relative ${
                active 
                  ? 'bg-blue-50 text-blue-600 font-medium shadow-sm' 
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              } ${isCollapsed ? 'justify-center' : ''}`}
              title={isCollapsed ? item.name : ''}
            >
              <span className={`flex-shrink-0 ${active ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`}>
                {item.icon}
              </span>
              
              {!isCollapsed && (
                <span className="truncate">
                  {item.name}
                </span>
              )}

              {/* Tooltip for collapsed state */}
              {isCollapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                  {item.name}
                </div>
              )}
            </Link>
          );
        })}

        {/* Admin Section */}
        {isAdmin && (
          <>
            {!isCollapsed && (
              <div className="pt-4 pb-2">
                <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Admin</p>
              </div>
            )}
            {isCollapsed && <div className="h-px bg-gray-200 my-2" />}
            
            {adminItems.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group relative ${
                    active 
                      ? 'bg-amber-50 text-amber-700 font-medium shadow-sm' 
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  } ${isCollapsed ? 'justify-center' : ''}`}
                  title={isCollapsed ? item.name : ''}
                >
                  <span className={`flex-shrink-0 ${active ? 'text-amber-600' : 'text-gray-400 group-hover:text-gray-600'}`}>
                    {item.icon}
                  </span>
                  
                  {!isCollapsed && (
                    <span className="truncate">
                      {item.name}
                    </span>
                  )}

                  {/* Tooltip for collapsed state */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                      {item.name}
                    </div>
                  )}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Footer with Auth */}
      <div className="p-4 border-t border-gray-100">
        {loading ? (
          <div className="animate-pulse h-8 bg-gray-200 rounded"></div>
        ) : user ? (
          <button
            onClick={handleSignOut}
            disabled={loggingOut}
            className={`flex items-center gap-2 w-full px-3 py-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-colors ${isCollapsed ? 'justify-center' : ''}`}
            title={isCollapsed ? 'Sign Out' : ''}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {!isCollapsed && (
              <span>{loggingOut ? 'Signing out...' : 'Sign Out'}</span>
            )}
          </button>
        ) : (
          <Link
            href="/login"
            className={`flex items-center gap-2 w-full px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors ${isCollapsed ? 'justify-center' : ''}`}
            title={isCollapsed ? 'Sign In' : ''}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            {!isCollapsed && <span>Sign In</span>}
          </Link>
        )}
        
        {!isCollapsed && (
          <p className="text-xs text-gray-400 text-center mt-4">&copy; {new Date().getFullYear()} Atlas LLC</p>
        )}
      </div>
    </div>
  );
}
