import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser, isUserAdmin } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/resend';
import { generateWorkspaceReadyEmailHtml, generateWorkspaceReadyEmailText } from '@/lib/emails/workspace-ready-email';

// POST - Approve a user account
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await isUserAdmin(currentUser.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id: userId } = await params;

        const supabase = createServiceClient();

        // Check if user exists
        const { data: targetUser, error: fetchError } = await supabase
            .from('user_profiles')
            .select('id, email, name, is_approved, is_disabled')
            .eq('id', userId)
            .single();

        if (fetchError || !targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Check if already approved
        if (targetUser.is_approved) {
            return NextResponse.json(
                { error: 'User is already approved' },
                { status: 400 }
            );
        }

        // Check if user is disabled
        if (targetUser.is_disabled) {
            return NextResponse.json(
                { error: 'Cannot approve a disabled user. Enable the account first.' },
                { status: 400 }
            );
        }

        // Approve the user
        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({
                is_approved: true,
                approved_at: new Date().toISOString(),
                approved_by: currentUser.id,
            })
            .eq('id', userId);

        if (updateError) {
            console.error('Error approving user:', updateError);
            return NextResponse.json({ error: 'Failed to approve user' }, { status: 500 });
        }

        // Send workspace ready email
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const loginUrl = `${baseUrl}/login`;

        let emailSent = false;
        let emailError: Error | null = null;

        try {
            await sendEmail({
                to: targetUser.email,
                subject: 'Your Atlas Workspace is Ready!',
                html: generateWorkspaceReadyEmailHtml({ userName: targetUser.name, loginUrl }),
                text: generateWorkspaceReadyEmailText({ userName: targetUser.name, loginUrl }),
            });
            emailSent = true;
        } catch (err) {
            console.error('Error sending workspace ready email:', err);
            emailError = err instanceof Error ? err : new Error('Unknown email error');
        }

        return NextResponse.json({
            success: true,
            message: 'User approved successfully',
            emailSent,
            emailError: emailError?.message,
            user: {
                id: userId,
                email: targetUser.email,
                name: targetUser.name,
                is_approved: true,
            },
        });
    } catch (error) {
        console.error('Error approving user:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

