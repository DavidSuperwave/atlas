import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser, isUserAdmin } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/resend';
import { generateInviteEmailHtml, generateInviteEmailText } from '@/lib/emails/invite-email';
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

        const body = await request.json();
        const { email, accessRequestId } = body;

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
        }

        const supabase = createServiceClient();

        // Check if there's already an unused invite for this email
        const { data: existingInvite } = await supabase
            .from('invites')
            .select('id, used_at, expires_at')
            .eq('email', email.toLowerCase())
            .is('used_at', null)
            .gt('expires_at', new Date().toISOString())
            .single();

        if (existingInvite) {
            return NextResponse.json(
                { error: 'An active invite already exists for this email' },
                { status: 400 }
            );
        }

        // Check if user already exists
        const { data: existingUser } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('email', email.toLowerCase())
            .single();

        if (existingUser) {
            return NextResponse.json(
                { error: 'A user with this email already exists' },
                { status: 400 }
            );
        }

        // Generate unique token
        const token = crypto.randomBytes(32).toString('hex');

        // Set expiration to 7 days from now
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        // Create invite record
        const { data: invite, error: inviteError } = await supabase
            .from('invites')
            .insert({
                email: email.toLowerCase(),
                token,
                invited_by: user.id,
                expires_at: expiresAt.toISOString(),
            })
            .select()
            .single();

        if (inviteError) {
            console.error('Error creating invite:', inviteError);
            return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
        }

        // Update access request if provided
        if (accessRequestId) {
            await supabase
                .from('access_requests')
                .update({
                    status: 'approved',
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString(),
                    invite_id: invite.id,
                })
                .eq('id', accessRequestId);
        } else {
            // Create an access request for direct invites (so it shows in admin dashboard)
            await supabase
                .from('access_requests')
                .insert({
                    name: 'Direct Invite',
                    email: email.toLowerCase(),
                    intent: 'Direct invite by admin',
                    status: 'approved',
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString(),
                    invite_id: invite.id,
                });
        }

        // Generate onboarding URL (not invite URL)
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const inviteUrl = `${baseUrl}/onboarding?token=${token}`;

        // Send invite email
        let emailSent = false;
        let emailError: Error | null = null;
        try {
            await sendEmail({
                to: email,
                subject: 'You\'re Invited - Private Market Intelligence',
                html: generateInviteEmailHtml({ inviteUrl, expiresAt }),
                text: generateInviteEmailText({ inviteUrl, expiresAt }),
            });
            emailSent = true;
        } catch (err) {
            console.error('Error sending invite email:', err);
            emailError = err instanceof Error ? err : new Error('Unknown email error');
        }

        return NextResponse.json({
            success: true,
            message: emailSent ? 'Invite sent successfully' : 'Invite created but email failed to send',
            emailSent,
            emailError: emailError ? emailError.message : null,
            invite: {
                id: invite.id,
                email: invite.email,
                expires_at: invite.expires_at,
            },
        });
    } catch (error) {
        console.error('Error sending invite:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

