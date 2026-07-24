// Supabase Edge Function: delete-user-account
//
// Permanently deletes a member's auth account (and, via the profiles.id
// "references auth.users(id) on delete cascade" foreign key, their profile row
// and everything else that cascades from it — applications, listings, articles
// authored by them, community posts, etc.)
//
// Invoked from assets/js/supabase.js's deleteUserAccount(), called from the
// admin/applications.html "Delete Account" button.
//
// Requires the service role key to call auth.admin.deleteUser — this cannot be
// done with the anon key, hence the edge function (mirrors send-membership-email's
// caller-verification pattern).
//
// Required secrets (already set for send-membership-email):
//   SUPABASE_SERVICE_ROLE_KEY
//
// Deploy with:
//   supabase functions deploy delete-user-account

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // SECURITY: verify the caller is an authenticated admin before deleting anything.
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

    const { userId } = await req.json()
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), { status: 400, headers: corsHeaders })
    }

    // Guard against an admin deleting their own account through this endpoint —
    // avoids accidentally locking yourself out mid-review.
    if (userId === caller.id) {
      return new Response(JSON.stringify({ error: "You can't delete your own account from here." }), { status: 400, headers: corsHeaders })
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message ?? 'Unknown error' }), { status: 500, headers: corsHeaders })
  }
})
