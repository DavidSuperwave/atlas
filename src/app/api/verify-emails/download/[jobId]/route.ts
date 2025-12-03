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

        // Verify job belongs to user
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

        // Get all results for this job
        const { data: results, error: resultsError } = await supabase
            .from('email_verification_results')
            .select('*')
            .eq('job_id', jobId)
            .order('created_at', { ascending: true });

        if (resultsError || !results) {
            return NextResponse.json(
                { error: 'Failed to fetch results' },
                { status: 500 }
            );
        }

        // Build CSV content
        const headers = ['email', 'status', 'mx_record', 'message', 'code', 'verified_at'];
        const csvRows = [headers.join(',')];

        for (const result of results) {
            const row = [
                escapeCSV(result.email),
                escapeCSV(result.status),
                escapeCSV(result.mx_record || ''),
                escapeCSV(result.message || ''),
                escapeCSV(result.code || ''),
                escapeCSV(result.verified_at || ''),
            ];
            csvRows.push(row.join(','));
        }

        const csvContent = csvRows.join('\n');

        // Generate filename from original filename
        const originalName = job.filename.replace(/\.csv$/i, '');
        const downloadFilename = `${originalName}-verified.csv`;

        return new NextResponse(csvContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${downloadFilename}"`,
            },
        });
    } catch (error) {
        console.error('Error generating CSV:', error);
        return NextResponse.json(
            { error: 'Failed to generate CSV' },
            { status: 500 }
        );
    }
}

function escapeCSV(value: string): string {
    if (!value) return '';
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}


