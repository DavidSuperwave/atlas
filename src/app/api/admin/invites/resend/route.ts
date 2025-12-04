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
        const { inviteId } = body;

        if (!inviteId) {
            return NextResponse.json({ error: 'Invite ID is required' }, { status: 400 });
        }

        const supabase = createServiceClient();

        // Find the original invite
        const { data: originalInvite, error: fetchError } = await supabase
            .from('invites')
            .select('*')
            .eq('id', inviteId)
            .single();

        if (fetchError || !originalInvite) {
            return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
        }

        const email = originalInvite.email;

        // Check if user already exists (they might have signed up with a different invite or method)
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

        // Expire all existing unused invites for this email
        await supabase
            .from('invites')
            .update({ expires_at: new Date().toISOString() })
            .eq('email', email.toLowerCase())
            .is('used_at', null);

        // Generate new unique token
        const token = crypto.randomBytes(32).toString('hex');

        // Set expiration to 7 days from now
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        // Create new invite record
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

        // Generate invite URL
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const inviteUrl = `${baseUrl}/invite?token=${token}`;

        // Send invite email
        try {
            await sendEmail({
                to: email,
                subject: 'You\'re Invited - Private Market Intelligence',
                html: generateInviteEmailHtml({ inviteUrl, expiresAt }),
                text: generateInviteEmailText({ inviteUrl, expiresAt }),
            });
        } catch (emailError) {
            console.error('Error sending invite email:', emailError);
            // Don't fail the request if email fails - invite is still created
        }

        return NextResponse.json({
            success: true,
            message: 'Invite resent successfully',
            invite: {
                id: invite.id,
                email: invite.email,
                expires_at: invite.expires_at,
            },
        });
    } catch (error) {
        console.error('Error resending invite:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

