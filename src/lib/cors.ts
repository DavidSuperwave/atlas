/**
 * CORS Configuration
 * 
 * This module provides CORS headers for API routes that need
 * to be called from a different origin (e.g., Vercel frontend
 * calling Railway backend).
 * 
 * ENVIRONMENT VARIABLES:
 * - NEXT_PUBLIC_VERCEL_URL: Vercel frontend URL (automatically set by Vercel)
 * - ALLOWED_ORIGINS: Comma-separated list of additional allowed origins
 * 
 * @see docs/VERCEL_RAILWAY_SETUP.md for deployment architecture
 */

import { NextResponse } from 'next/server';

/**
 * Get allowed origins from environment
 * 
 * Includes:
 * - Vercel URL (if set)
 * - Custom allowed origins from ALLOWED_ORIGINS env var
 * - localhost for development
 */
function getAllowedOrigins(): string[] {
    const origins: string[] = [
        'http://localhost:3000',
        'http://localhost:3001',
    ];

    // Add Vercel URL if set
    if (process.env.NEXT_PUBLIC_VERCEL_URL) {
        origins.push(`https://${process.env.NEXT_PUBLIC_VERCEL_URL}`);
    }

    // Add custom production URL
    if (process.env.VERCEL_URL) {
        origins.push(`https://${process.env.VERCEL_URL}`);
    }

    // Add custom allowed origins
    if (process.env.ALLOWED_ORIGINS) {
        const customOrigins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
        origins.push(...customOrigins);
    }

    // Add common Vercel preview URLs pattern
    if (process.env.VERCEL_PROJECT_NAME) {
        // Vercel preview deployments: project-name-*.vercel.app
        origins.push(`https://${process.env.VERCEL_PROJECT_NAME}.vercel.app`);
    }

    return origins;
}

/**
 * CORS headers for API responses
 * 
 * @param origin - Request origin header
 * @returns Headers object with CORS configuration
 */
export function getCorsHeaders(origin?: string | null): HeadersInit {
    const allowedOrigins = getAllowedOrigins();
    
    // Check if origin is allowed
    const isAllowed = origin && allowedOrigins.some(allowed => {
        // Exact match
        if (allowed === origin) return true;
        // Wildcard match for Vercel preview URLs
        if (allowed.includes('*') && origin.match(new RegExp(allowed.replace(/\*/g, '.*')))) return true;
        return false;
    });

    // SECURITY: Only return allowed origins, never fallback to localhost in production
    // If origin is not allowed, return the first non-localhost origin or reject
    let allowedOrigin: string;
    if (isAllowed && origin) {
        allowedOrigin = origin;
    } else if (process.env.NODE_ENV === 'production') {
        // In production, use Vercel URL or reject (return empty which browser will reject)
        const productionOrigin = process.env.NEXT_PUBLIC_VERCEL_URL 
            ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
            : process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : '';
        allowedOrigin = productionOrigin;
    } else {
        // In development, fallback to localhost is acceptable
        allowedOrigin = allowedOrigins[0];
    }

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400', // 24 hours
    };
}

/**
 * Handle CORS preflight requests
 * 
 * @param request - Incoming request
 * @returns Response for OPTIONS requests
 */
export function handleCors(request: Request): NextResponse | null {
    const origin = request.headers.get('origin');

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
        return new NextResponse(null, {
            status: 204,
            headers: getCorsHeaders(origin),
        });
    }

    return null;
}

/**
 * Add CORS headers to response
 * 
 * @param response - NextResponse object
 * @param request - Original request (for origin header)
 * @returns Response with CORS headers added
 */
export function withCors(response: NextResponse, request: Request): NextResponse {
    const origin = request.headers.get('origin');
    const headers = getCorsHeaders(origin);

    Object.entries(headers).forEach(([key, value]) => {
        response.headers.set(key, value);
    });

    return response;
}

/**
 * Create a JSON response with CORS headers
 * 
 * Convenience function for API routes
 * 
 * @param data - Response data
 * @param request - Original request
 * @param options - Response options (status, headers, etc.)
 * @returns NextResponse with CORS headers
 */
export function corsJsonResponse(
    data: unknown,
    request: Request,
    options?: { status?: number; headers?: Record<string, string> }
): NextResponse {
    const origin = request.headers.get('origin');
    const response = NextResponse.json(data, { status: options?.status });
    
    // Add CORS headers
    Object.entries(getCorsHeaders(origin)).forEach(([key, value]) => {
        response.headers.set(key, value);
    });

    // Add any additional custom headers
    if (options?.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
            response.headers.set(key, value);
        });
    }

    return response;
}

