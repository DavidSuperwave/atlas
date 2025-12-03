import { NextResponse } from 'next/server';
import { getCurrentUser, isUserAdmin, createServiceClient } from '@/lib/supabase-server';
import { verificationQueue, VerificationQueue } from '@/lib/verification-queue';

interface DailyUserUsage {
    userId: string;
    email: string;
    creditsUsed: number;
}

export async function GET() {
    try {
        const user = await getCurrentUser();
        
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json(
                { error: 'Forbidden: Admin access required' },
                { status: 403 }
            );
        }

        const supabase = createServiceClient();

        // Get total leads count
        const { count: totalLeads, error: leadsError } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true });

        if (leadsError) {
            console.error('Error fetching leads count:', leadsError);
        }

        // Get today's date range (UTC)
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

        // Get daily credit usage (sum of negative amounts for 'usage' type)
        const { data: dailyUsageData, error: usageError } = await supabase
            .from('credit_transactions')
            .select('amount')
            .eq('type', 'usage')
            .gte('created_at', today.toISOString())
            .lt('created_at', tomorrow.toISOString());

        if (usageError) {
            console.error('Error fetching daily usage:', usageError);
        }

        // Calculate total daily usage (amounts are negative for usage, so we use abs)
        const dailyCreditsUsed = dailyUsageData?.reduce((sum, t) => sum + Math.abs(t.amount), 0) || 0;

        // Get per-user daily usage with email
        const { data: userUsageData, error: userUsageError } = await supabase
            .from('credit_transactions')
            .select('user_id, amount')
            .eq('type', 'usage')
            .gte('created_at', today.toISOString())
            .lt('created_at', tomorrow.toISOString());

        if (userUsageError) {
            console.error('Error fetching per-user usage:', userUsageError);
        }

        // Aggregate per-user usage
        const userUsageMap = new Map<string, number>();
        userUsageData?.forEach(t => {
            const current = userUsageMap.get(t.user_id) || 0;
            userUsageMap.set(t.user_id, current + Math.abs(t.amount));
        });

        // Get user emails for the users with usage
        const userIds = Array.from(userUsageMap.keys());
        let perUserUsage: DailyUserUsage[] = [];

        if (userIds.length > 0) {
            const { data: userProfiles, error: profilesError } = await supabase
                .from('user_profiles')
                .select('id, email')
                .in('id', userIds);

            if (profilesError) {
                console.error('Error fetching user profiles:', profilesError);
            }

            const emailMap = new Map<string, string>();
            userProfiles?.forEach(p => emailMap.set(p.id, p.email));

            perUserUsage = Array.from(userUsageMap.entries()).map(([userId, creditsUsed]) => ({
                userId,
                email: emailMap.get(userId) || 'Unknown',
                creditsUsed
            })).sort((a, b) => b.creditsUsed - a.creditsUsed);
        }

        // Get queue stats
        const queueStats = verificationQueue.getQueueStats();
        const rateLimitInfo = VerificationQueue.getRateLimitInfo();

        // Calculate daily limit info
        const dailyLimit = rateLimitInfo.dailyLimit;
        const dailyCreditsRemaining = Math.max(0, dailyLimit - dailyCreditsUsed);
        const dailyUsagePercentage = (dailyCreditsUsed / dailyLimit) * 100;

        // Determine if approaching limits
        const isApproachingDailyLimit = dailyUsagePercentage >= 80;
        const isAtDailyLimit = dailyUsagePercentage >= 100;

        return NextResponse.json({
            totalLeads: totalLeads || 0,
            dailyUsage: {
                creditsUsed: dailyCreditsUsed,
                creditsRemaining: dailyCreditsRemaining,
                dailyLimit,
                usagePercentage: Math.round(dailyUsagePercentage * 100) / 100,
                isApproachingLimit: isApproachingDailyLimit,
                isAtLimit: isAtDailyLimit,
                perUserUsage
            },
            queue: {
                ...queueStats,
                rateLimit: rateLimitInfo
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        return NextResponse.json(
            { error: 'Failed to fetch admin stats' },
            { status: 500 }
        );
    }
}


