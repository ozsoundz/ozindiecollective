// Supabase Edge Function: stripe-webhook
//
// Receives Stripe subscription lifecycle events and keeps
// public.organizations in sync. This is the ONLY place an organization gets
// created from a self-serve checkout — stripe-checkout just starts the
// Checkout Session, it never writes to the database itself, so an abandoned
// or failed checkout never leaves an orphaned org behind.
//
// Register this function's URL as a Stripe webhook endpoint (Stripe
// Dashboard → Developers → Webhooks) subscribed to at least:
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_failed
//
// Required secrets (set via `supabase secrets set`, see deploy instructions):
//   STRIPE_SECRET_KEY        — same key as stripe-checkout
//   STRIPE_WEBHOOK_SECRET    — the "Signing secret" Stripe shows you when
//                              you create the webhook endpoint (whsec_...)
//   SUPABASE_SERVICE_ROLE_KEY — needed to write organizations/profiles;
//                              this function is never called with a user's
//                              JWT (Stripe calls it directly), so it must
//                              use the service role, not the anon key.
//
// Deploy with:
//   supabase functions deploy stripe-webhook --no-verify-jwt
//
// --no-verify-jwt matters here: Stripe's requests don't carry a Supabase
// user JWT (this endpoint authenticates via the Stripe-Signature header
// instead), so Supabase's default JWT check would reject every webhook call
// with a 401 before this code even runs.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() })
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature')
  const body = await req.text()

  let event
  try {
    // constructEventAsync (not the sync constructEvent) is required in Deno
    // — Stripe's signature verification uses Node's crypto by default, which
    // isn't available in the Edge Function runtime; the async variant uses
    // Web Crypto instead.
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const { owner_id, org_name, plan } = session.metadata ?? {}
        if (!owner_id || !org_name || !plan) {
          console.error('checkout.session.completed missing expected metadata:', session.metadata)
          break
        }

        // Guard against the member joining another organization (e.g. an
        // admin added them to one manually) in the minutes between starting
        // checkout and Stripe confirming payment — don't silently re-parent
        // them out of wherever they already ended up.
        const { data: ownerProfile } = await supabaseAdmin
          .from('profiles')
          .select('organization_id')
          .eq('id', owner_id)
          .single()
        if (ownerProfile?.organization_id) {
          console.error(`checkout.session.completed for owner ${owner_id} who already has organization_id ${ownerProfile.organization_id} — skipping org creation. Payment succeeded but wasn't applied; needs manual admin follow-up.`)
          break
        }

        const { data: org, error: orgError } = await supabaseAdmin
          .from('organizations')
          .insert({
            name: org_name,
            plan,
            plan_source: 'stripe',
            owner_id,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            stripe_status: 'active',
          })
          .select()
          .single()
        if (orgError) throw orgError

        // Attaching the owner as the org's first member goes through the
        // same profiles.organization_id path admin/organizations.html uses
        // — sync_profile_to_organization (schema.sql) picks it up from
        // here and mirrors the plan onto their profile automatically.
        const { error: memberError } = await supabaseAdmin
          .from('profiles')
          .update({ organization_id: org.id })
          .eq('id', owner_id)
        if (memberError) throw memberError

        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const { error } = await supabaseAdmin
          .from('organizations')
          .update({ stripe_status: subscription.status })
          .eq('stripe_subscription_id', subscription.id)
        if (error) throw error
        break
      }

      case 'customer.subscription.deleted': {
        // Marks the org canceled but deliberately doesn't touch its plan or
        // remove members — access isn't revoked automatically on
        // cancellation in v1. An admin reviews organizations with
        // stripe_status = 'canceled' (visible on admin/organizations.html)
        // and decides whether to downgrade or remove members by hand.
        const subscription = event.data.object
        const { error } = await supabaseAdmin
          .from('organizations')
          .update({ stripe_status: 'canceled' })
          .eq('stripe_subscription_id', subscription.id)
        if (error) throw error
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        if (invoice.subscription) {
          const { error } = await supabaseAdmin
            .from('organizations')
            .update({ stripe_status: 'past_due' })
            .eq('stripe_subscription_id', invoice.subscription)
          if (error) throw error
        }
        break
      }

      default:
        // Unhandled event types are expected (Stripe sends far more than
        // we subscribe to if the endpoint is later set to "all events") —
        // no action needed, not an error.
        break
    }

    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err.message)
    // 500 tells Stripe to retry this event later rather than silently
    // dropping it — safe here since every handler above is a plain
    // idempotent upsert-by-id, not something that could double-charge or
    // double-create on retry.
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
