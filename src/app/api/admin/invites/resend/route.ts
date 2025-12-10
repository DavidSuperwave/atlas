import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser, isUserAdmin } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/resend';
import { generateInviteEmailHtml, generateInviteEmailText } from '@/lib/emails/invite-email';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import crypto from 'crypto';

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

        // Rate limit by admin user ID (shares limit with send)
        const rateLimit = checkRateLimit(user.id, RATE_LIMITS.INVITE_SEND);
        if (rateLimit.limited) {
            return NextResponse.json(
                { 
                    error: `Rate limit exceeded. You can send ${rateLimit.max} invites per hour.`,
                    resetInSeconds: rateLimit.resetInSeconds,
                },
                { status: 429 }
            );
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

        // If invite was already used, create a new one for debugging/resending
        let inviteToUse = invite;
        let expiresAt = new Date(invite.expires_at);
        
        if (invite.used_at) {
            // Create a new invite with a new token for resending
            const newToken = crypto.randomBytes(32).toString('hex');
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);

            const { data: newInvite, error: createError } = await supabase
                .from('invites')
                .insert({
                    email: invite.email.toLowerCase(),
                    token: newToken,
                    invited_by: invite.invited_by,
                    expires_at: expiresAt.toISOString(),
                })
                .select()
                .single();

            if (createError || !newInvite) {
                console.error('Error creating new invite:', createError);
                return NextResponse.json(
                    { error: 'Failed to create new invite for resending' },
                    { status: 500 }
                );
            }

            inviteToUse = newInvite;
            
            // Update the access request to link to the new invite if it exists
            await supabase
                .from('access_requests')
                .update({ invite_id: newInvite.id })
                .eq('invite_id', inviteId);
        } else {
            // Extend expiration to 7 days from now
            expiresAt = new Date();
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
        }

        // Generate onboarding URL (not invite URL)
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const inviteUrl = `${baseUrl}/onboarding?token=${inviteToUse.token}`;

        // Resend invite email
        let emailSent = false;
        let emailError: Error | null = null;
        try {
            await sendEmail({
                to: inviteToUse.email,
                subject: invite.used_at 
                    ? 'New Onboarding Link - Private Market Intelligence' 
                    : 'Reminder: You\'re Invited - Private Market Intelligence',
                html: generateInviteEmailHtml({ inviteUrl, expiresAt }),
                text: generateInviteEmailText({ inviteUrl, expiresAt }),
            });
            emailSent = true;
        } catch (err) {
            console.error('Error sending invite email:', err);
            emailError = err instanceof Error ? err : new Error('Unknown email error');
        }

        if (!emailSent) {
            // NOTE: Do NOT include the token in error responses - it's a security risk
            // If manual sharing is needed, admin should use the invite list endpoint
            return NextResponse.json(
                { 
                    error: 'Failed to send email',
                    emailError: emailError?.message || 'Unknown error',
                    invite: {
                        id: inviteToUse.id,
                        email: inviteToUse.email,
                        expires_at: expiresAt.toISOString(),
                        // Token intentionally omitted for security
                    },
                },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: invite.used_at 
                ? 'New invite created and sent successfully' 
                : 'Invite resent successfully',
            emailSent: true,
            invite: {
                id: inviteToUse.id,
                email: inviteToUse.email,
                expires_at: expiresAt.toISOString(),
            },
        });
    } catch (error) {
        console.error('Error resending invite:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
