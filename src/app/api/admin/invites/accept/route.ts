import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/resend';
import { generateWelcomeEmailHtml, generateWelcomeEmailText } from '@/lib/emails/welcome-email';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { token, userId } = body;

        if (!token) {
            return NextResponse.json({ error: 'Token is required' }, { status: 400 });
        }

        const supabase = createServiceClient();

        // Find and validate invite
        const { data: invite, error: inviteError } = await supabase
            .from('invites')
            .select('*')
            .eq('token', token)
            .single();

        if (inviteError || !invite) {
            return NextResponse.json({ error: 'Invalid invite' }, { status: 404 });
        }

        if (invite.used_at) {
            return NextResponse.json({ error: 'Invite already used' }, { status: 400 });
        }

        if (new Date(invite.expires_at) < new Date()) {
            return NextResponse.json({ error: 'Invite expired' }, { status: 400 });
        }

        // Mark invite as used
        const { error: updateError } = await supabase
            .from('invites')
            .update({ used_at: new Date().toISOString() })
            .eq('id', invite.id);

        if (updateError) {
            console.error('Error marking invite as used:', updateError);
            return NextResponse.json({ error: 'Failed to process invite' }, { status: 500 });
        }

        // Send welcome email
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const loginUrl = `${baseUrl}/login`;

        try {
            await sendEmail({
                to: invite.email,
                subject: 'Welcome to Private Market Intelligence',
                html: generateWelcomeEmailHtml({ loginUrl }),
                text: generateWelcomeEmailText({ loginUrl }),
            });
        } catch (emailError) {
            console.error('Error sending welcome email:', emailError);
            // Don't fail - account is created
        }

        return NextResponse.json({
            success: true,
            message: 'Invite accepted successfully',
        });
    } catch (error) {
        console.error('Error accepting invite:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

