import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser, isUserAdmin } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/resend';
import { generateInviteEmailHtml, generateInviteEmailText } from '@/lib/emails/invite-email';

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { inviteId } = body;

        if (!inviteId) {
            return NextResponse.json({ error: 'Invite ID is required' }, { status: 400 });
        }

        const supabase = createServiceClient();

        // Get the invite
        const { data: invite, error: fetchError } = await supabase
            .from('invites')
            .select('*')
            .eq('id', inviteId)
            .single();

        if (fetchError || !invite) {
            return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
        }

        // Check if invite was already used
        if (invite.used_at) {
            return NextResponse.json(
                { error: 'This invite has already been used' },
                { status: 400 }
            );
        }

        // Extend expiration to 7 days from now
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        // Update invite expiration
        const { error: updateError } = await supabase
            .from('invites')
            .update({
                expires_at: expiresAt.toISOString(),
            })
            .eq('id', inviteId);

        if (updateError) {
            console.error('Error updating invite:', updateError);
            return NextResponse.json({ error: 'Failed to update invite' }, { status: 500 });
        }

        // Generate invite URL
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const inviteUrl = `${baseUrl}/invite?token=${invite.token}`;

        // Resend invite email
        try {
            await sendEmail({
                to: invite.email,
                subject: 'Reminder: You\'re Invited - Private Market Intelligence',
                html: generateInviteEmailHtml({ inviteUrl, expiresAt }),
                text: generateInviteEmailText({ inviteUrl, expiresAt }),
            });
        } catch (emailError) {
            console.error('Error sending invite email:', emailError);
            return NextResponse.json(
                { error: 'Failed to send email. Invite was extended but email not sent.' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Invite resent successfully',
            invite: {
                id: invite.id,
                email: invite.email,
                expires_at: expiresAt.toISOString(),
            },
        });
    } catch (error) {
        console.error('Error resending invite:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
