import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';
import { checkCredits } from '@/lib/credits';
import { verificationQueue } from '@/lib/verification-queue';

export async function POST(request: NextRequest) {
    try {
        // Check authentication
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { emails, filename, removeDuplicates = true } = body;

        if (!emails || !Array.isArray(emails) || emails.length === 0) {
            return NextResponse.json(
                { error: 'No emails provided' },
                { status: 400 }
            );
        }

        if (!filename) {
            return NextResponse.json(
                { error: 'Filename is required' },
                { status: 400 }
            );
        }

        // Check if user has enough credits (at least 1 for now, actual deduction happens per valid email)
        const hasCredits = await checkCredits(user.id, 1);
        if (!hasCredits) {
            return NextResponse.json(
                { error: 'Insufficient credits' },
                { status: 402 }
            );
        }

        const supabase = createServiceClient();

        // Create the verification job
        const { data: job, error: jobError } = await supabase
            .from('email_verification_jobs')
            .insert({
                user_id: user.id,
                filename: filename,
                status: 'processing',
                total_emails: emails.length,
                remove_duplicates: removeDuplicates,
            })
            .select()
            .single();

        if (jobError || !job) {
            console.error('Error creating job:', jobError);
            return NextResponse.json(
                { error: 'Failed to create verification job' },
                { status: 500 }
            );
        }

        // Insert all emails as pending results
        const emailResults = emails.map((email: string) => ({
            job_id: job.id,
            email: email,
            status: 'pending',
        }));

        const { error: resultsError } = await supabase
            .from('email_verification_results')
            .insert(emailResults);

        if (resultsError) {
            console.error('Error inserting email results:', resultsError);
            // Update job status to failed
            await supabase
                .from('email_verification_jobs')
                .update({ status: 'failed', error_message: 'Failed to create email records' })
                .eq('id', job.id);
            
            return NextResponse.json(
                { error: 'Failed to create email verification records' },
                { status: 500 }
            );
        }

        // Add to the shared verification queue (processes sequentially with lead enrichment)
        verificationQueue.add({
            type: 'bulk',
            jobId: job.id,
            emails: emails,
            userId: user.id,
        });

        return NextResponse.json({
            success: true,
            jobId: job.id,
            totalEmails: emails.length,
            message: 'Verification queued',
        });
    } catch (error) {
        console.error('Error starting verification:', error);
        return NextResponse.json(
            { error: 'Failed to start verification' },
            { status: 500 }
        );
    }
}
