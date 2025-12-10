import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getUserProfile } from '@/lib/supabase-server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extractEmailsFromCSV(csvContent: string): string[] {
    const lines = csvContent.split(/\r?\n/);
    const emails: string[] = [];
    
    for (const line of lines) {
        // Skip empty lines
        if (!line.trim()) continue;
        
        // Split by comma (handle basic CSV)
        const cells = line.split(',').map(cell => cell.trim().replace(/^["']|["']$/g, ''));
        
        for (const cell of cells) {
            // Check if the cell looks like an email
            if (EMAIL_REGEX.test(cell)) {
                emails.push(cell.toLowerCase());
            }
        }
    }
    
    return emails;
}

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

        // Rate limit per user for verification uploads
        const rateLimit = checkRateLimit(user.id, RATE_LIMITS.VERIFY_EMAILS);
        if (rateLimit.limited) {
            return NextResponse.json(
                { error: 'Rate limit exceeded', retryAfter: rateLimit.resetInSeconds },
                {
                    status: 429,
                    headers: { 'Retry-After': rateLimit.resetInSeconds.toString() }
                }
            );
        }

        // Get user profile for credits
        const profile = await getUserProfile(user.id);
        if (!profile) {
            return NextResponse.json(
                { error: 'User profile not found' },
                { status: 404 }
            );
        }

        // Parse form data
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const removeDuplicates = formData.get('removeDuplicates') === 'true';

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        // Check file type
        if (!file.name.endsWith('.csv')) {
            return NextResponse.json(
                { error: 'File must be a CSV' },
                { status: 400 }
            );
        }

        // Read file content
        const content = await file.text();
        
        // Extract emails
        let emails = extractEmailsFromCSV(content);
        const totalEmails = emails.length;
        
        if (totalEmails === 0) {
            return NextResponse.json(
                { error: 'No valid email addresses found in the CSV' },
                { status: 400 }
            );
        }

        // Count duplicates and optionally remove them
        const uniqueEmails = [...new Set(emails)];
        const duplicatesCount = totalEmails - uniqueEmails.length;
        
        if (removeDuplicates) {
            emails = uniqueEmails;
        }

        const creditsRequired = emails.length; // 1 credit per email for verification attempts
        const availableCredits = profile.credits_balance;

        return NextResponse.json({
            success: true,
            filename: file.name,
            totalEmails: totalEmails,
            uniqueEmails: uniqueEmails.length,
            duplicatesCount: duplicatesCount,
            emailsToVerify: emails.length,
            creditsRequired: creditsRequired,
            availableCredits: availableCredits,
            hasEnoughCredits: availableCredits >= creditsRequired,
            emails: emails, // Send emails back for the start request
        });
    } catch (error) {
        console.error('Error processing CSV:', error);
        return NextResponse.json(
            { error: 'Failed to process CSV file' },
            { status: 500 }
        );
    }
}


