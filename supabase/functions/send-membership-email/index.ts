// Supabase Edge Function: send-membership-email
//
// Sends a membership status email (approved / denied) via Resend.
// Invoked from assets/js/supabase.js's approveApplication()/denyApplication().
//
// Required secrets (set via `supabase secrets set`, see deploy instructions):
//   RESEND_API_KEY   — your Resend API key
//   RESEND_FROM      — the verified "from" address, e.g. "Oz Indie Collective <hello@mail.ozindiecollective.com.au>"
//
// Deploy with:
//   supabase functions deploy send-membership-email

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Oz Indie Collective <onboarding@resend.dev>'
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://ozindiecollective.com.au'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function templateFor(type: string, fullName: string) {
  const name = fullName || 'there'
  if (type === 'approved') {
    return {
      subject: "You're in! Welcome to the Oz Indie Collective",
      html: `<p>Hi ${name},</p>
        <p>Great news — your application to the Oz Indie Collective has been <strong>approved</strong>. Your profile is now live in the member directory and you have full access to opportunities, the community, and your dashboard.</p>
        <p><a href="${SITE_URL}/pages/dashboard.html">Go to your dashboard →</a></p>
        <p>Welcome aboard.<br>— The Oz Indie Collective team</p>`
    }
  }
  if (type === 'denied') {
    return {
      subject: 'An update on your Oz Indie Collective application',
      html: `<p>Hi ${name},</p>
        <p>Thanks for your interest in the Oz Indie Collective. After review, we're not able to approve your application at this time.</p>
        <p>If you think this was a mistake or you'd like more information, just reply to this email.</p>
        <p>— The Oz Indie Collective team</p>`
    }
  }
  if (type === 'suspended') {
    return {
      subject: 'Your Oz Indie Collective account has been suspended',
      html: `<p>Hi ${name},</p>
        <p>Your Oz Indie Collective account has been suspended by an admin, and access has been temporarily removed.</p>
        <p>If you think this was a mistake, just reply to this email and we'll take a look.</p>
        <p>— The Oz Indie Collective team</p>`
    }
  }
  return {
    subject: 'An update from Oz Indie Collective',
    html: `<p>Hi ${name},</p><p>There's an update on your Oz Indie Collective account.</p>`
  }
}

const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // SECURITY: verify the caller is an authenticated admin before sending anything.
    // Without this, any authenticated (or even anonymous, if JWT verification is
    // disabled on the function) caller could trigger emails to arbitrary users.
    const authHeader = req.headers.get('Authorization') ?? ''
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders })
    }
    const { data: callerProfile } = await callerClient
      .from('profiles')
      .select('is_admin')
      .eq('id', caller.id)
      .single()
    if (!callerProfile?.is_admin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: corsHeaders })
    }

    const { userId, type } = await req.json()
    if (!userId || !type) {
      return new Response(JSON.stringify({ error: 'userId and type are required' }), { status: 400, headers: corsHeaders })
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    if (profileError || !profile?.email) {
      return new Response(JSON.stringify({ error: 'Could not find a profile/email for that user' }), { status: 404, headers: corsHeaders })
    }

    const { subject, html } = templateFor(type, profile.full_name)

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: profile.email,
        subject,
        html,
      }),
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      return new Response(JSON.stringify({ error: `Resend error: ${errText}` }), { status: 502, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message ?? 'Unknown error' }), { status: 500, headers: corsHeaders })
  }
})
