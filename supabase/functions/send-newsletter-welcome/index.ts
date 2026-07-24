// Supabase Edge Function: send-newsletter-welcome
//
// Sends a one-time welcome email to a new newsletter subscriber via Resend.
// Invoked from assets/js/supabase.js's subscribeToNewsletter() right after the
// footer signup form successfully inserts a row into newsletter_subscribers.
//
// Unlike send-membership-email, this function has NO admin-auth requirement —
// it's triggered by anonymous site visitors submitting the public footer form.
// To prevent it being abused as a spam relay (repeatedly calling it for the same
// email to resend the welcome message over and over), it only ever sends once
// per subscriber: it looks the email up in newsletter_subscribers and bails out
// if `welcomed_at` is already set, then stamps `welcomed_at` after a successful send.
//
// Required secrets (same as send-membership-email):
//   RESEND_API_KEY   — your Resend API key
//   RESEND_FROM      — the verified "from" address
//
// Deploy with:
//   supabase functions deploy send-newsletter-welcome --no-verify-jwt

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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email } = await req.json()
    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'A valid email is required' }), { status: 400, headers: corsHeaders })
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Only send to emails that are actually in the subscriber list, and only once.
    const { data: subscriber, error: lookupError } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('id, email, welcomed_at')
      .eq('email', email)
      .maybeSingle()

    if (lookupError || !subscriber) {
      return new Response(JSON.stringify({ error: 'No subscriber found for that email' }), { status: 404, headers: corsHeaders })
    }

    if (subscriber.welcomed_at) {
      // Already welcomed — treat as a no-op success rather than an error so the
      // caller (the footer form) doesn't need to special-case this.
      return new Response(JSON.stringify({ ok: true, alreadyWelcomed: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const html = `<p>Hi there,</p>
      <p>Thanks for subscribing to the Oz Indie Collective newsletter — you'll be the first to hear about new opportunities, events, member highlights and industry news.</p>
      <p><a href="${SITE_URL}">Explore the site →</a></p>
      <p>— The Oz Indie Collective team</p>
      <p style="font-size:12px;color:#888">If you'd rather not receive these emails, just reply and let us know.</p>`

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: subscriber.email,
        subject: 'Welcome to the Oz Indie Collective newsletter',
        html,
      }),
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      return new Response(JSON.stringify({ error: `Resend error: ${errText}` }), { status: 502, headers: corsHeaders })
    }

    await supabaseAdmin
      .from('newsletter_subscribers')
      .update({ welcomed_at: new Date().toISOString() })
      .eq('id', subscriber.id)

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message ?? 'Unknown error' }), { status: 500, headers: corsHeaders })
  }
})
