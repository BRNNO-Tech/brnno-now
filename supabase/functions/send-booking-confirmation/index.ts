import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const record = body.record ?? body;

    let recipientEmail = record.guest_email;
    let recipientName = record.guest_name;

    if (!record.is_guest && record.user_id) {
      const { data } = await supabase.auth.admin.getUserById(record.user_id);
      if (data?.user?.email) {
        recipientEmail = data.user.email;
        recipientName = data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? 'there';
      }
    }

    if (!recipientEmail) {
      throw new Error('No recipient email found');
    }

    let scheduledTimeText = "We'll notify you once a detailer is assigned.";
    if (record.scheduled_at) {
      const date = new Date(record.scheduled_at);
      scheduledTimeText = `Scheduled for ${date.toLocaleString('en-US', {
        dateStyle: 'long',
        timeStyle: 'short',
      })}`;
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your BRNNO Detail is Booked</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    
    <div style="text-align: center; margin-bottom: 40px;">
      <h1 style="font-size: 32px; font-weight: 900; margin: 0; color: #000;">BRNNO</h1>
    </div>
    
    <div style="background: white; border-radius: 24px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="width: 80px; height: 80px; background: #dcfce7; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 40px;">
          ✓
        </div>
      </div>
      
      <h2 style="font-size: 24px; font-weight: 900; text-align: center; margin: 0 0 8px 0; color: #000;">
        You're Booked!
      </h2>
      
      <p style="text-align: center; color: #6b7280; font-size: 14px; margin: 0 0 32px 0;">
        We're finding the perfect detailer for you.
      </p>
      
      <div style="background: #f9fafb; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
        <div style="margin-bottom: 12px;">
          <span style="color: #6b7280; font-size: 14px;">Service</span><br>
          <span style="color: #000; font-weight: 600; font-size: 16px;">${record.service_name}</span>
        </div>
        
        ${record.scheduled_at ? `
        <div style="margin-bottom: 12px;">
          <span style="color: #6b7280; font-size: 14px;">Scheduled</span><br>
          <span style="color: #000; font-weight: 600; font-size: 16px;">${scheduledTimeText}</span>
        </div>
        ` : ''}
        
        <div style="margin-bottom: 12px;">
          <span style="color: #6b7280; font-size: 14px;">Location</span><br>
          <span style="color: #000; font-weight: 600; font-size: 16px;">${record.location || 'At your location'}</span>
        </div>
        
        <div>
          <span style="color: #6b7280; font-size: 14px;">Total Paid</span><br>
          <span style="color: #000; font-weight: 600; font-size: 16px;">$${Number(record.cost).toFixed(2)}</span>
        </div>
      </div>
      
      <div style="background: #f0fdf4; border-radius: 16px; padding: 20px; margin-bottom: 24px;">
        <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 600;">
          📱 You'll hear from us within 10 minutes
        </p>
        <p style="margin: 8px 0 0 0; color: #166534; font-size: 13px;">
          We'll text and email you once your detailer is confirmed.
        </p>
      </div>
      
      ${record.is_guest ? `
      <div style="text-align: center; margin-top: 32px; padding-top: 32px; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 14px; font-weight: 600; color: #000; margin: 0 0 8px 0;">
          Save your booking
        </p>
        <p style="font-size: 13px; color: #6b7280; margin: 0 0 16px 0;">
          Create an account to track your detail, rebook easily, and manage your vehicle.
        </p>
        <a href="https://app.brnno.com" style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 14px;">
          Create Account
        </a>
      </div>
      ` : `
      <div style="text-align: center; margin-top: 32px;">
        <a href="https://app.brnno.com" style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 14px;">
          Manage Booking
        </a>
      </div>
      `}
      
    </div>
    
    <div style="text-align: center; margin-top: 40px; color: #9ca3af; font-size: 12px;">
      <p style="margin: 0 0 8px 0;">BRNNO - On-demand mobile detailing</p>
      <p style="margin: 0;">Need help? Reply to this email</p>
    </div>
    
  </div>
</body>
</html>
    `;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'BRNNO <bookings@brnno.com>',
        to: recipientEmail,
        subject: 'Your BRNNO detail is booked 🚗',
        html: emailHtml,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      throw new Error(`Resend API error: ${JSON.stringify(resendData)}`);
    }

    return new Response(
      JSON.stringify({ success: true, messageId: resendData.id }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
