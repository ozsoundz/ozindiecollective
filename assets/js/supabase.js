// assets/js/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://ijkqayhbshftdofipmzg.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlqa3FheWhic2hmdGRvZmlwbXpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NTg1NzMsImV4cCI6MjA5NzIzNDU3M30.aXW4dWgNW9Ncmw3-SfaCzilUk_tZ36DQsQbffY_41Hg'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── AUTH HELPERS ──────────────────────────────────────

export async function signUp({ email, password, fullName, role, city, state, bio, portfolio, proudProject, goals, referralSource, plan, skills, experience }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  })
  if (error) throw error

  // The on_auth_user_created trigger (see supabase/schema.sql) already inserted a
  // bare profile row for this user — fill in the rest of what join.html collected.
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      role, city, state, bio,
      portfolio_url: portfolio,
      proud_project: proudProject,
      goals,
      referral_source: referralSource,
      plan,
      skills: skills || [],
      experience,
      status: 'pending'
    })
    .eq('id', data.user.id)

  if (profileError) throw profileError
  return data
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
  // Note: redirect is handled by the caller (see main.js's logout handler)
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getCurrentProfile() {
  const session = await getSession()
  if (!session) return null
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single()
  return data
}

// ── DIRECTORY ────────────────────────────────────────

export async function getMembers({ role, state, availability, search } = {}) {
  let query = supabase
    .from('profiles')
    .select('id, full_name, role, city, state, availability, skills, plan, experience, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })

  if (role) query = query.eq('role', role)
  if (state) query = query.eq('state', state)
  if (availability) query = query.eq('availability', availability)
  if (search) query = query.ilike('full_name', `%${search}%`)

  const { data, error } = await query
  if (error) throw error
  return data
}

// ── LISTINGS ─────────────────────────────────────────

export async function getListings({ category, type, state } = {}) {
  let query = supabase
    .from('listings')
    .select('*, profiles(full_name, plan)')
    .eq('status', 'live')
    .order('created_at', { ascending: false })

  if (category) query = query.eq('category', category)
  if (type) query = query.eq('employment_type', type)
  if (state) query = query.eq('state', state)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createListing(listingData) {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('listings')
    .insert({ ...listingData, posted_by: session.user.id, status: 'pending' })
    .select()
  if (error) throw error
  return data
}

export async function applyToListing({ listingId, coverMessage, portfolioLink }) {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('applications')
    .insert({
      listing_id: listingId,
      applicant_id: session.user.id,
      cover_message: coverMessage,
      portfolio_link: portfolioLink
    })
  if (error) throw error
  return data
}

// ── ADMIN ─────────────────────────────────────────────

export async function getPendingApplications() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

// All applicants (any status), for the admin Applications page's filter tabs.
export async function getAllApplications() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function approveApplication(userId) {
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'approved' })
    .eq('id', userId)
  if (error) throw error
  // Best-effort: trigger welcome email via Edge Function if one has been deployed.
  // Not deployed yet by default, so failure here must never block the approval itself.
  try {
    await supabase.functions.invoke('send-welcome-email', { body: { userId } })
  } catch (err) {
    console.warn('send-welcome-email function not available yet:', err.message)
  }
}

export async function denyApplication(userId) {
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'denied' })
    .eq('id', userId)
  if (error) throw error
}
