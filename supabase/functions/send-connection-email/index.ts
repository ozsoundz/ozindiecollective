// Supabase Edge Function: send-connection-email
//
// Sends notification emails for the Collaborations (Connections) and
// Sponsored Programs flows, via Resend — mirrors send-membership-email's
// pattern (same secrets, same provider).
//
// Invoked from assets/js/supabase.js's sendConnectionEmail() right after the
// corresponding RLS-gated status change succeeds client-side:
//   - application_received     poster is told someone applied
//   - application_accepted     applicant is told the poster accepted them
//   - application_declined     applicant is told the poster declined them
//   - collaboration_confirmed  poster is told the applicant confirmed
//   - sponsorship_approved     partner is told their program went live
//   - sponsorship_denied       partner is told their program was denied
//
// Each type does its own lookup via the service-role client (so the client
// can't spoof a listing title or someone else's email into the message) and
// verifies the caller is actually a legitimate party to the thing they're
// triggering an email about — not just any authenticated user.
//
// Required secrets (same as send-membership-email):
//   RESEND_API_KEY, RESEND_FROM
//
// Deploy with:
//   supabase functions deploy send-connection-email

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Oz Indie Collective <onboarding@resend.dev>'
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://ozindiecollective.com.au'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  })
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders })
    }

    const { type, applicationId, kind, programId } = await req.json()
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const table = kind === 'project' ? 'project_applications' : 'applications'
    const postTable = kind === 'project' ? 'projects' : 'listings'
    const postIdCol = kind === 'project' ? 'project_id' : 'listing_id'
    const dashUrl = `${SITE_URL}/pages/connections.html`

    if (type === 'application_received' || type === 'application_accepted' || type === 'application_declined' || type === 'collaboration_confirmed') {
      if (!applicationId) {
        return new Response(JSON.stringify({ error: 'applicationId is required' }), { status: 400, headers: corsHeaders })
      }

      const { data: app, error: appErr } = await db
        .from(table)
        .select(`id, applicant_id, ${postIdCol}, status`)
        .eq('id', applicationId)
        .single()
      if (appErr || !app) {
        return new Response(JSON.stringify({ error: 'Application not found' }), { status: 404, headers: corsHeaders })
      }

      const { data: post, error: postErr } = await db
        .from(postTable)
        .select('title, posted_by')
        .eq('id', app[postIdCol])
        .single()
      if (postErr || !post) {
        return new Response(JSON.stringify({ error: 'Listing/project not found' }), { status: 404, headers: corsHeaders })
      }

      const { data: applicantProfile } = await db.from('profiles').select('email, full_name').eq('id', app.applicant_id).single()
      const { data: posterProfile } = await db.from('profiles').select('email, full_name').eq('id', post.posted_by).single()
      const postLabel = kind === 'project' ? 'project' : 'job listing'

      if (type === 'application_received') {
        // Only the applicant who just applied can trigger this (email goes to the poster).
        if (caller.id !== app.applicant_id) {
          return new Response(JSON.stringify({ error: 'Not authorized for this notification' }), { status: 403, headers: corsHeaders })
        }
        if (!posterProfile?.email) return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders })
        await sendEmail(
          posterProfile.email,
          `New applicant for "${post.title}"`,
          `<p>Hi ${posterProfile.full_name || 'there'},</p>
           <p><strong>${applicantProfile?.full_name || 'A member'}</strong> just applied to your ${postLabel} "<strong>${post.title}</strong>".</p>
           <p><a href="${dashUrl}">Review the application →</a></p>
           <p>— The Oz Indie Collective team</p>`
        )
      }

      if (type === 'application_accepted' || type === 'application_declined') {
        // Only the poster who just responded can trigger this (email goes to the applicant).
        if (caller.id !== post.posted_by) {
          return new Response(JSON.stringify({ error: 'Not authorized for this notification' }), { status: 403, headers: corsHeaders })
        }
        if (!applicantProfile?.email) return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders })
        if (type === 'application_accepted') {
          await sendEmail(
            applicantProfile.email,
            `You've been accepted for "${post.title}"`,
            `<p>Hi ${applicantProfile.full_name || 'there'},</p>
             <p>Good news — <strong>${posterProfile?.full_name || 'the poster'}</strong> has accepted your application for the ${postLabel} "<strong>${post.title}</strong>".</p>
             <p>Confirm the collaboration to make it official on your profile.</p>
             <p><a href="${dashUrl}">Confirm on Connections →</a></p>
             <p>— The Oz Indie Collective team</p>`
          )
        } else {
          await sendEmail(
            applicantProfile.email,
            `An update on your application for "${post.title}"`,
            `<p>Hi ${applicantProfile.full_name || 'there'},</p>
             <p>Thanks for applying to "<strong>${post.title}</strong>". The poster has decided not to move forward this time.</p>
             <p><a href="${SITE_URL}/pages/opportunities.html">Browse more opportunities →</a></p>
             <p>— The Oz Indie Collective team</p>`
          )
        }
      }

      if (type === 'collaboration_confirmed') {
        // Only the applicant who just confirmed can trigger this (email goes to the poster).
        if (caller.id !== app.applicant_id) {
          return new Response(JSON.stringify({ error: 'Not authorized for this notification' }), { status: 403, headers: corsHeaders })
        }
        if (!posterProfile?.email) return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders })
        await sendEmail(
          posterProfile.email,
          `Collaboration confirmed: "${post.title}"`,
          `<p>Hi ${posterProfile.full_name || 'there'},</p>
           <p><strong>${applicantProfile?.full_name || 'Your applicant'}</strong> has confirmed the collaboration for "<strong>${post.title}</strong>" 🎉</p>
           <p><a href="${dashUrl}">View on Connections →</a></p>
           <p>— The Oz Indie Collective team</p>`
        )
      }

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (type === 'sponsorship_approved' || type === 'sponsorship_denied') {
      if (!programId) {
        return new Response(JSON.stringify({ error: 'programId is required' }), { status: 400, headers: corsHeaders })
      }
      const { data: callerProfile } = await callerClient.from('profiles').select('is_admin').eq('id', caller.id).single()
      if (!callerProfile?.is_admin) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: corsHeaders })
      }

      const { data: program, error: programErr } = await db
        .from('sponsored_programs')
        .select('program_name, submitted_by')
        .eq('id', programId)
        .single()
      if (programErr || !program) {
        return new Response(JSON.stringify({ error: 'Sponsored program not found' }), { status: 404, headers: corsHeaders })
      }
      const { data: submitterProfile } = await db.from('profiles').select('email, full_name').eq('id', program.submitted_by).single()
      if (!submitterProfile?.email) return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders })

      if (type === 'sponsorship_approved') {
        await sendEmail(
          submitterProfile.email,
          `Your sponsored program is live: "${program.program_name}"`,
          `<p>Hi ${submitterProfile.full_name || 'there'},</p>
           <p>Your sponsored program "<strong>${program.program_name}</strong>" has been approved and is now live on the Resources page.</p>
           <p><a href="${SITE_URL}/pages/sponsored-programs.html">View it live →</a></p>
           <p>— The Oz Indie Collective team</p>`
        )
      } else {
        await sendEmail(
          submitterProfile.email,
          `An update on your sponsored program submission`,
          `<p>Hi ${submitterProfile.full_name || 'there'},</p>
           <p>Thanks for submitting "<strong>${program.program_name}</strong>". We're not able to publish it as submitted — reply to this email if you'd like more detail or want to revise and resubmit.</p>
           <p>— The Oz Indie Collective team</p>`
        )
      }

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Unknown notification type' }), { status: 400, headers: corsHeaders })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message ?? 'Unknown error' }), { status: 500, headers: corsHeaders })
  }
})
