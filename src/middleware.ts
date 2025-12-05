import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
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
    const publicRoutes = ['/', '/login', '/invite', '/onboarding', '/auth/callback', '/account-disabled', '/pending-approval'];
    const isPublicRoute = publicRoutes.some(route => 
        pathname === route || pathname.startsWith(route + '/')
    );

    // API routes that don't require auth
    const publicApiRoutes = ['/api/auth', '/api/access-requests', '/api/onboarding', '/api/admin/invites/validate'];
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

    // If user is logged in and trying to access login or landing page, redirect to dashboard
    if (user && (pathname === '/login' || pathname === '/')) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
    }

    // Check if user account is disabled or not approved (for all protected routes)
    if (user && !isPublicRoute && !isPublicApiRoute && !pathname.startsWith('/_next')) {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('is_disabled, is_approved, is_admin')
            .eq('id', user.id)
            .single();

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
        // BUT: Allow admins to bypass this check
        if (profile && profile.is_approved === false && !profile.is_admin) {
            // Redirect unapproved users to pending-approval page
            if (pathname !== '/pending-approval') {
                const url = request.nextUrl.clone();
                url.pathname = '/pending-approval';
                return NextResponse.redirect(url);
            }
        }
    }

    // Admin route protection
    if (pathname.startsWith('/admin') && user) {
        // Check if user is admin
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('is_admin')
            .eq('id', user.id)
            .single();

        if (!profile?.is_admin) {
            const url = request.nextUrl.clone();
            url.pathname = '/dashboard';
            return NextResponse.redirect(url);
        }
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
