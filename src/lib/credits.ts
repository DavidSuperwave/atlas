import { createServerClient } from './supabase-server';

export interface CreditTransaction {
    id: string;
    user_id: string;
    amount: number;
    type: 'topup' | 'usage' | 'refund';
    description: string | null;
    lead_id: string | null;
    created_at: string;
}

export interface UserProfile {
    id: string;
    email: string;
    credits_balance: number;
    is_admin: boolean;
    created_at: string;
    updated_at: string;
}

/**
 * Get current credit balance for a user
 */
export async function getCreditBalance(userId: string): Promise<number> {
    const supabase = createServerClient();
    
    const { data, error } = await supabase
        .from('user_profiles')
        .select('credits_balance')
        .eq('id', userId)
        .single();
    
    if (error) {
        console.error('Error fetching credit balance:', error);
        throw new Error('Failed to fetch credit balance');
    }
    
    return data?.credits_balance ?? 0;
}

/**
 * Check if user has enough credits
 */
export async function checkCredits(userId: string, required: number): Promise<boolean> {
    const balance = await getCreditBalance(userId);
    return balance >= required;
}

/**
 * Deduct credits from user account (for successful enrichments)
 * Returns the new balance
 */
export async function deductCredits(
    userId: string,
    amount: number,
    leadId?: string,
    description?: string
): Promise<number> {
    if (amount <= 0) {
        throw new Error('Amount must be positive');
    }
    
    const supabase = createServerClient();
    
    // Use the database function to atomically update credits
    const { data, error } = await supabase.rpc('update_credits', {
        p_user_id: userId,
        p_amount: -amount, // Negative for deduction
        p_type: 'usage',
        p_description: description || `Email enrichment`,
        p_lead_id: leadId || null,
    });
    
    if (error) {
        console.error('Error deducting credits:', error);
        throw new Error('Failed to deduct credits');
    }
    
    return data as number;
}

/**
 * Add credits to user account (admin only)
 * Returns the new balance
 */
export async function addCredits(
    userId: string,
    amount: number,
    description?: string
): Promise<number> {
    if (amount <= 0) {
        throw new Error('Amount must be positive');
    }
    
    const supabase = createServerClient();
    
    // Use the database function to atomically update credits
    const { data, error } = await supabase.rpc('update_credits', {
        p_user_id: userId,
        p_amount: amount, // Positive for addition
        p_type: 'topup',
        p_description: description || `Credit top-up: ${amount} credits`,
        p_lead_id: null,
    });
    
    if (error) {
        console.error('Error adding credits:', error);
        throw new Error('Failed to add credits');
    }
    
    return data as number;
}

/**
 * Refund credits to user account
 * Returns the new balance
 */
export async function refundCredits(
    userId: string,
    amount: number,
    leadId?: string,
    description?: string
): Promise<number> {
    if (amount <= 0) {
        throw new Error('Amount must be positive');
    }
    
    const supabase = createServerClient();
    
    const { data, error } = await supabase.rpc('update_credits', {
        p_user_id: userId,
        p_amount: amount, // Positive for refund
        p_type: 'refund',
        p_description: description || 'Credit refund',
        p_lead_id: leadId || null,
    });
    
    if (error) {
        console.error('Error refunding credits:', error);
        throw new Error('Failed to refund credits');
    }
    
    return data as number;
}

/**
 * Get credit transaction history for a user
 */
export async function getTransactionHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
): Promise<CreditTransaction[]> {
    const supabase = createServerClient();
    
    const { data, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    
    if (error) {
        console.error('Error fetching transaction history:', error);
        throw new Error('Failed to fetch transaction history');
    }
    
    return data as CreditTransaction[];
}

/**
 * Get all users with their credit balances (admin only)
 */
export async function getAllUsersWithCredits(): Promise<UserProfile[]> {
    const supabase = createServerClient();
    
    const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('Error fetching users:', error);
        throw new Error('Failed to fetch users');
    }
    
    return data as UserProfile[];
}

/**
 * Calculate the cost of credits in dollars
 * $1 per 1000 credits
 */
export function calculateCreditCost(credits: number): number {
    return credits / 1000;
}

/**
 * Get total credits purchased (sum of all topups and refunds)
 */
export async function getTotalCreditsPurchased(userId: string): Promise<number> {
    const supabase = createServerClient();
    
    const { data, error } = await supabase
        .from('credit_transactions')
        .select('amount')
        .eq('user_id', userId)
        .in('type', ['topup', 'refund']);
    
    if (error) {
        console.error('Error fetching total credits purchased:', error);
        return 0;
    }
    
    return data?.reduce((sum, tx) => sum + (tx.amount || 0), 0) ?? 0;
}

/**
 * Calculate credits from dollar amount
 * $1 = 1000 credits
 */
export function calculateCreditsFromDollars(dollars: number): number {
    return Math.floor(dollars * 1000);
}


