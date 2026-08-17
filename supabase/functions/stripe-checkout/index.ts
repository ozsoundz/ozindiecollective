// Supabase Edge Function: stripe-checkout
//
// Starts a self-serve annual subscription for a business plan (SME, SME
// Large, Corporate or Partner — Enterprise is deliberately excluded, it's
// admin-provisioned by agreement and never touches Stripe, per schema.sql
// section 23). Invoked from assets/js/supabase.js's createCheckoutSession(),
// called from pages/upgrade.html.
//
// Doesn't create the organizations row itself — that only happens once
// payment actually succeeds, in stripe-webhook's checkout.session.completed
// handler. This function just starts a Stripe Checkout Session and stashes
// who's paying / for what in its metadata, so nothing is created in our
// database for an abandoned or failed checkout.
//
// Required secrets (set via `supabase secrets set`, see deploy instructions):
//   STRIPE_SECRET_KEY   — your Stripe secret key (sk_test_... while testing,
//                         sk_live_... only once you're ready to charge real
//                         cards — see the note in pages/upgrade.html and
//                         STRIPE_ENABLED in assets/js/supabase.js)
//   SITE_URL            — e.g. "https://ozindiecollective.com.au", used to
//                         build the Checkout success/cancel redirect URLs
//
// Deploy with:
//   supabase functions deploy stripe-checkout

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://ozindiecollective.com.au'

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() })

// SECURITY: restrict CORS to our own site instead of '*' — these endpoints
// still require a valid bearer token, but a wildcard origin let any website
// make the call. Only the production domain (and its www alias) is allowed.
const ALLOWED_ORIGINS = new Set([
  'https://ozindiecollective.com.au',
  'https://www.ozindiecollective.com.au',
])
function buildCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://ozindiecollective.com.au',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

// Kept in sync by hand with: schema.sql section 23's pricing table,
// assets/js/supabase.js's PLAN_SEAT_LIMITS, and the <option> labels in
// admin/organizations.html / pages/upgrade.html. There's no single source
// of truth for pricing in this codebase yet — if you change a price, all
// four places need updating together.
const PLAN_PRICING_AUD_CENTS = {
  sme: 5000,
  sme_large: 8500,
  corporate: 35000,
  partner: 100000,
}
const PLAN_LABELS = {
  sme: 'SME',
  sme_large: 'SME Large',
  corporate: 'Corporate',
  partner: 'Partner',
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders })
    }

    const { orgName, plan } = await req.json()
    if (!orgName || typeof orgName !== 'string' || !orgName.trim()) {
      return new Response(JSON.stringify({ error: 'Organization name is required.' }), { status: 400, headers: corsHeaders })
    }
    if (!PLAN_PRICING_AUD_CENTS[plan]) {
      // Deliberately covers 'enterprise' and 'free' too, not just typos —
      // neither is ever purchasable through Stripe.
      return new Response(JSON.stringify({ error: 'Not a self-serve plan.' }), { status: 400, headers: corsHeaders })
    }

    // Block starting a new checkout if this member is already in an
    // organization — prevents accidentally spinning up a second org (and a
    // second subscription) for someone who's already a seat somewhere.
    // (stripe-webhook also checks this again at completion time, since the
    // member's situation could change during the minutes they're on the
    // Stripe-hosted checkout page.)
    const { data: callerProfile } = await callerClient
      .from('profiles')
      .select('organization_id')
      .eq('id', caller.id)
      .single()
    if (callerProfile?.organization_id) {
      return new Response(JSON.stringify({ error: "You're already part of an organization. Contact an admin to change its plan." }), { status: 400, headers: corsHeaders })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: caller.email,
      line_items: [{
        price_data: {
          currency: 'aud',
          unit_amount: PLAN_PRICING_AUD_CENTS[plan],
          recurring: { interval: 'year' },
          product_data: {
            name: `Oz Indie Collective — ${PLAN_LABELS[plan]} (Annual)`,
            description: `${orgName.trim()} — annual Oz Indie Collective ${PLAN_LABELS[plan]} organization plan`,
          },
        },
        quantity: 1,
      }],
      success_url: `${SITE_URL}/pages/dashboard.html?checkout=success`,
      cancel_url: `${SITE_URL}/pages/upgrade.html?checkout=cancelled`,
      metadata: {
        owner_id: caller.id,
        org_name: orgName.trim(),
        plan,
      },
    })

    return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message ?? 'Unknown error' }), { status: 500, headers: corsHeaders })
  }
})
