import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
    // Handle CORS preflight requests (OPTIONS) immediately
    // These must bypass auth to allow cross-origin requests to work
    if (request.method === 'OPTIONS') {
        const origin = request.headers.get('origin');
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
        ];
        
        // Add production origins
        if (process.env.NEXT_PUBLIC_VERCEL_URL) {
            allowedOrigins.push(`https://${process.env.NEXT_PUBLIC_VERCEL_URL}`);
        }
        if (process.env.VERCEL_URL) {
            allowedOrigins.push(`https://${process.env.VERCEL_URL}`);
        }
        if (process.env.ALLOWED_ORIGINS) {
            allowedOrigins.push(...process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()));
        }
        
        const isAllowed = origin && allowedOrigins.includes(origin);
        const corsOrigin = isAllowed ? origin : (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');
        
        return new NextResponse(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': corsOrigin,
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Max-Age': '86400',
            },
        });
    }

    let supabaseResponse = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // Refresh session if expired - important for Server Components
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;

    // Public routes that don't require authentication
    // Note: /signup removed - now invite-only system
    const publicRoutes = ['/', '/login', '/invite', '/onboarding', '/auth/callback', '/account-disabled', '/pending-approval', '/signup-scrape', '/payment'];
    const isPublicRoute = publicRoutes.some(route => 
        pathname === route || pathname.startsWith(route + '/')
    );

    // API routes that don't require auth
    // NOTE: /api/health and /api/init are public for Railway health checks
    const publicApiRoutes = ['/api/auth', '/api/access-requests', '/api/onboarding', '/api/admin/invites/validate', '/api/health', '/api/init', '/api/signup-scrape', '/api/payment'];
    const isPublicApiRoute = publicApiRoutes.some(route => pathname.startsWith(route));

    // Redirect /signup to landing page (invite-only system)
    if (pathname === '/signup' || pathname.startsWith('/signup/')) {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
    }

    // If user is not logged in and trying to access protected route
    if (!user && !isPublicRoute && !isPublicApiRoute && !pathname.startsWith('/_next')) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('redirect', pathname);
        return NextResponse.redirect(url);
    }

    // Check user profile for protected routes (single query for performance)
    // This handles: disabled accounts, pending approval, admin access, and account type routing
    if (user && !isPublicRoute && !isPublicApiRoute && !pathname.startsWith('/_next')) {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('is_disabled, is_approved, is_admin, account_type')
            .eq('id', user.id)
            .single();

        const isScrapeOnlyUser = profile?.account_type === 'scrape_only';
        const isFullAppUser = profile?.account_type === 'full' || !profile?.account_type;

        // Routes only for scrape-only users
        const scrapeOnlyRoutes = ['/scrape-dashboard', '/scrape-pricing', '/onboarding/upgrade'];
        const isScrapeOnlyRoute = scrapeOnlyRoutes.some(route => 
            pathname === route || pathname.startsWith(route + '/')
        );

        // Routes only for full app users
        // Note: /scrapes/[id] detail pages are allowed for scrape-only users to view their leads
        const fullAppRoutes = ['/dashboard', '/leads'];
        const isFullAppRoute = fullAppRoutes.some(route => 
            pathname === route || pathname.startsWith(route + '/')
        );
        
        // Check if accessing scrapes listing page (not detail pages)
        // /scrapes exactly or /scrapes/ with nothing after = listing page (block for scrape-only)
        // /scrapes/[id] = detail page (allow for scrape-only users to view their leads)
        const isScrapeListingPage = pathname === '/scrapes' || pathname === '/scrapes/';
        const isFullAppRouteWithScrapes = isFullAppRoute || isScrapeListingPage;

        // Check if account is disabled
        if (profile?.is_disabled) {
            // Redirect disabled users to account-disabled page
            if (pathname !== '/account-disabled') {
                const url = request.nextUrl.clone();
                url.pathname = '/account-disabled';
                return NextResponse.redirect(url);
            }
        }
        
        // Check if account is not approved (pending approval)
        // BUT: Allow admins and scrape-only users to bypass this check
        if (profile && profile.is_approved === false && !profile.is_admin && !isScrapeOnlyUser) {
            // Redirect unapproved full-app users to pending-approval page
            if (pathname !== '/pending-approval') {
                const url = request.nextUrl.clone();
                url.pathname = '/pending-approval';
                return NextResponse.redirect(url);
            }
        }

        // Admin route protection - reuse profile data from above query
        if (pathname.startsWith('/admin') && !profile?.is_admin) {
            const url = request.nextUrl.clone();
            url.pathname = isScrapeOnlyUser ? '/scrape-dashboard' : '/dashboard';
            return NextResponse.redirect(url);
        }

        // Scrape-only user accessing full app routes - redirect to scrape dashboard
        // Note: scrape-only users CAN access /scrapes/[id] detail pages to view their leads
        if (isScrapeOnlyUser && isFullAppRouteWithScrapes) {
            const url = request.nextUrl.clone();
            url.pathname = '/scrape-dashboard';
            return NextResponse.redirect(url);
        }

        // Full app user accessing scrape-only routes - redirect to dashboard
        // Exception: /onboarding/upgrade should be accessible during upgrade flow
        if (isFullAppUser && isScrapeOnlyRoute && pathname !== '/onboarding/upgrade') {
            const url = request.nextUrl.clone();
            url.pathname = '/dashboard';
            return NextResponse.redirect(url);
        }
    }

    // If user is logged in and trying to access login or landing page
    if (user && (pathname === '/login' || pathname === '/')) {
        // Check account type to redirect appropriately
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('account_type')
            .eq('id', user.id)
            .single();

        const url = request.nextUrl.clone();
        url.pathname = profile?.account_type === 'scrape_only' ? '/scrape-dashboard' : '/dashboard';
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
