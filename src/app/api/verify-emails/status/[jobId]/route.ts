import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ jobId: string }> }
) {
    try {
        // Check authentication
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { jobId } = await params;

        if (!jobId) {
            return NextResponse.json(
                { error: 'Job ID is required' },
                { status: 400 }
            );
        }

        const supabase = createServiceClient();

        // Get the job
        const { data: job, error: jobError } = await supabase
            .from('email_verification_jobs')
            .select('*')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (jobError || !job) {
            return NextResponse.json(
                { error: 'Job not found' },
                { status: 404 }
            );
        }

        // Get result counts
        const { data: results, error: resultsError } = await supabase
            .from('email_verification_results')
            .select('status')
            .eq('job_id', jobId);

        let stats = {
            pending: 0,
            valid: 0,
            catchall: 0,
            invalid: 0,
            error: 0,
        };

        if (results && !resultsError) {
            for (const result of results) {
                const status = result.status as keyof typeof stats;
                if (status in stats) {
                    stats[status]++;
                }
            }
        }

        return NextResponse.json({
            success: true,
            job: {
                id: job.id,
                filename: job.filename,
                status: job.status,
                totalEmails: job.total_emails,
                processedEmails: job.processed_emails,
                validCount: job.valid_count,
                catchallCount: job.catchall_count,
                invalidCount: job.invalid_count,
                creditsUsed: job.credits_used,
                createdAt: job.created_at,
                completedAt: job.completed_at,
                errorMessage: job.error_message,
            },
            stats,
            progress: job.total_emails > 0 
                ? Math.round((job.processed_emails / job.total_emails) * 100) 
                : 0,
        });
    } catch (error) {
        console.error('Error fetching job status:', error);
        return NextResponse.json(
            { error: 'Failed to fetch job status' },
            { status: 500 }
        );
    }
}


