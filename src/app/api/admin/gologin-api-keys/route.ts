/**
 * Admin GoLogin API Keys Management
 * 
 * Endpoints for managing GoLogin API keys for multi-key horizontal scaling.
 * Only accessible by admin users.
 * 
 * GET /api/admin/gologin-api-keys - List all API keys (tokens masked)
 * POST /api/admin/gologin-api-keys - Create new API key
 * PUT /api/admin/gologin-api-keys - Update API key
 * DELETE /api/admin/gologin-api-keys - Deactivate API key
 */

import { NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';
import { 
    listApiKeys, 
    createApiKey, 
    updateApiKey, 
    deleteApiKey,
    updateApiToken
} from '@/lib/gologin-api-key-manager';

const supabase = createServiceClient();

/**
 * Check if user is admin
 */
async function checkAdmin(userId: string): Promise<boolean> {
    const { data } = await supabase
        .from('user_profiles')
        .select('is_admin')
        .eq('id', userId)
        .single();
    
    return data?.is_admin === true;
}

/**
 * GET - List all GoLogin API keys
 * Returns keys with masked tokens for security
 */
export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await checkAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        // Get all API keys (including inactive for management)
        const apiKeys = await listApiKeys(true);

        return NextResponse.json({
            success: true,
            apiKeys,
            total: apiKeys.length
        });

    } catch (error) {
        console.error('[ADMIN-API-KEYS] Error listing API keys:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

/**
 * POST - Create a new GoLogin API key
 */
export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await checkAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { name, api_token, is_default } = await request.json();

        if (!name || !api_token) {
            return NextResponse.json({ 
                error: 'name and api_token are required' 
            }, { status: 400 });
        }

        // Validate the token format (basic check)
        if (api_token.length < 20) {
            return NextResponse.json({ 
                error: 'API token appears to be invalid (too short)' 
            }, { status: 400 });
        }

        const result = await createApiKey(name, api_token, is_default || false);

        if (!result.success) {
            return NextResponse.json({ 
                error: result.error || 'Failed to create API key'
            }, { status: 400 });
        }

        // Return key without the full token
        const safeKey = result.apiKey ? {
            id: result.apiKey.id,
            name: result.apiKey.name,
            is_active: result.apiKey.is_active,
            is_default: result.apiKey.is_default,
            max_concurrent_scrapes: result.apiKey.max_concurrent_scrapes,
            created_at: result.apiKey.created_at
        } : null;

        return NextResponse.json({
            success: true,
            apiKey: safeKey
        });

    } catch (error) {
        console.error('[ADMIN-API-KEYS] Error creating API key:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

/**
 * PUT - Update an existing GoLogin API key
 */
export async function PUT(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await checkAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { id, name, is_active, is_default, max_concurrent_scrapes, api_token } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        // If updating the token, use separate function
        if (api_token !== undefined) {
            if (api_token.length < 20) {
                return NextResponse.json({ 
                    error: 'API token appears to be invalid (too short)' 
                }, { status: 400 });
            }
            const tokenResult = await updateApiToken(id, api_token);
            if (!tokenResult.success) {
                return NextResponse.json({ 
                    error: tokenResult.error || 'Failed to update API token'
                }, { status: 400 });
            }
        }

        // Update other fields
        const updates: { name?: string; is_active?: boolean; is_default?: boolean; max_concurrent_scrapes?: number } = {};
        if (name !== undefined) updates.name = name;
        if (is_active !== undefined) updates.is_active = is_active;
        if (is_default !== undefined) updates.is_default = is_default;
        if (max_concurrent_scrapes !== undefined) updates.max_concurrent_scrapes = max_concurrent_scrapes;

        if (Object.keys(updates).length > 0) {
            const result = await updateApiKey(id, updates);
            if (!result.success) {
                return NextResponse.json({ 
                    error: result.error || 'Failed to update API key'
                }, { status: 400 });
            }
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[ADMIN-API-KEYS] Error updating API key:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

/**
 * DELETE - Deactivate a GoLogin API key (soft delete)
 */
export async function DELETE(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await checkAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { id } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const result = await deleteApiKey(id);

        if (!result.success) {
            return NextResponse.json({ 
                error: result.error || 'Failed to deactivate API key'
            }, { status: 400 });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[ADMIN-API-KEYS] Error deleting API key:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
