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

// Sends a password-reset email with a link back to reset-password.html.
// Supabase establishes a temporary recovery session on that page automatically
// when the user clicks the link (detectSessionInUrl, on by default).
export async function requestPasswordReset(email) {
  const redirectTo = `${window.location.origin}/pages/reset-password.html`
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) throw error
}

// Called on reset-password.html once a recovery session is active.
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
  // Note: redirect is handled by the caller (see main.js's logout handler)
}

// ── MFA (TOTP, mandatory for all accounts) ───────────

// Any verified TOTP factor the current user already has enrolled.
export async function listMfaFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return data
}

// Current Authenticator Assurance Level — 'aal2' means an MFA challenge has
// been completed this session; 'aal1' means password-only so far.
export async function getMfaLevel() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) throw error
  return data // { currentLevel, nextLevel }
}

export async function unenrollMfaFactor(factorId) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
}

export async function enrollMfa() {
  // Clean up any stale unverified factors first (e.g. from an interrupted
  // enrollment attempt) — Supabase can reject a new enroll() call otherwise.
  try {
    const existing = await listMfaFactors()
    const stale = (existing.totp || []).filter(f => f.status !== 'verified')
    for (const f of stale) {
      try { await unenrollMfaFactor(f.id) } catch (e) { /* best-effort cleanup */ }
    }
  } catch (e) { /* listFactors failing shouldn't block enrollment attempt */ }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (error) throw error
  return data // { id: factorId, totp: { qr_code, secret, uri } }
}

export async function verifyMfaEnrollment(factorId, code) {
  const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
  if (chErr) throw chErr
  const { data, error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
  if (error) throw error
  return data
}

export async function challengeAndVerifyMfa(factorId, code) {
  const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
  if (chErr) throw chErr
  const { data, error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
  if (error) throw error
  return data
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

// Public: a single member's full profile, for the profile page.
// Only returns approved profiles (or the caller's own profile, any status).
export async function getProfileById(id) {
  const session = await getSession()
  let query = supabase.from('profiles').select('*').eq('id', id)
  if (!session || session.user.id !== id) {
    query = query.eq('status', 'approved')
  }
  const { data, error } = await query.single()
  if (error) throw error
  return data
}

// Member: update their own core profile fields (not EPK — see updateOwnEpk).
export async function updateOwnProfile(profileData) {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('profiles')
    .update(profileData)
    .eq('id', session.user.id)
    .select()
  if (error) throw error
  return data
}

// ── DIRECTORY ────────────────────────────────────────

export async function getMembers({ role, state, availability, search } = {}) {
  let query = supabase
    .from('profiles')
    .select('id, full_name, role, city, state, availability, skills, plan, experience, created_at, avatar_url')
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

// Admin: every listing regardless of status, for the moderation queue.
export async function getAllListings() {
  const { data, error } = await supabase
    .from('listings')
    .select('*, profiles(full_name, plan)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// Admin: every job-listing application (not membership application), for reporting.
export async function getAllListingApplications() {
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function approveListing(listingId) {
  const { error } = await supabase.from('listings').update({ status: 'live' }).eq('id', listingId)
  if (error) throw error
}

export async function denyListing(listingId) {
  const { error } = await supabase.from('listings').update({ status: 'denied' }).eq('id', listingId)
  if (error) throw error
}

// Member: their own job applications, for the dashboard.
export async function getMyApplications() {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('applications')
    .select('*, listings(title)')
    .eq('applicant_id', session.user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// Member: listings they've posted, for the dashboard.
export async function getMyListings() {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('posted_by', session.user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// ── PROJECTS BOARD ────────────────────────────────────
// Separate from `listings`/`applications` — projects are collaboration-oriented
// (paid/unpaid/rev-share) posts targeting a discipline rather than a role.

export async function getProjects({ projectType, discipline, state } = {}) {
  let query = supabase
    .from('projects')
    .select('*, profiles(full_name, plan)')
    .eq('status', 'live')
    .order('created_at', { ascending: false })

  if (projectType) query = query.eq('project_type', projectType)
  if (discipline) query = query.eq('discipline_needed', discipline)
  if (state) query = query.eq('state', state)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createProject(projectData) {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('projects')
    .insert({ ...projectData, posted_by: session.user.id, status: 'pending' })
    .select()
  if (error) throw error
  return data
}

export async function applyToProject({ projectId, coverMessage, portfolioLink }) {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('project_applications')
    .insert({
      project_id: projectId,
      applicant_id: session.user.id,
      cover_message: coverMessage,
      portfolio_link: portfolioLink
    })
  if (error) throw error
  return data
}

// Admin: every project regardless of status, for the moderation queue.
export async function getAllProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*, profiles(full_name, plan)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function approveProject(projectId) {
  const { error } = await supabase.from('projects').update({ status: 'live' }).eq('id', projectId)
  if (error) throw error
}

export async function denyProject(projectId) {
  const { error } = await supabase.from('projects').update({ status: 'denied' }).eq('id', projectId)
  if (error) throw error
}

// Member: their own project applications, for the dashboard.
export async function getMyProjectApplications() {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('project_applications')
    .select('*, projects(title)')
    .eq('applicant_id', session.user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// Member: projects they've posted, for the dashboard.
export async function getMyProjects() {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('posted_by', session.user.id)
    .order('created_at', { ascending: false })
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
  // Best-effort: trigger a notification email via Edge Function. Failure here
  // must never block the approval itself — the function may not be deployed yet.
  try {
    await supabase.functions.invoke('send-membership-email', { body: { userId, type: 'approved' } })
  } catch (err) {
    console.warn('send-membership-email function not available yet:', err.message)
  }
}

export async function denyApplication(userId, emailType = 'denied') {
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'denied' })
    .eq('id', userId)
  if (error) throw error
  try {
    await supabase.functions.invoke('send-membership-email', { body: { userId, type: emailType } })
  } catch (err) {
    console.warn('send-membership-email function not available yet:', err.message)
  }
}

// ── ARTICLES ──────────────────────────────────────────

// Public: published articles only, for the Articles/resources page.
export async function getArticles({ category } = {}) {
  let query = supabase
    .from('articles')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (category) query = query.eq('category', category)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getArticleBySlug(slug) {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()
  if (error) throw error
  return data
}

// Admin: every article regardless of status.
export async function getAllArticles() {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createArticle(articleData) {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('articles')
    .insert({ ...articleData, created_by: session.user.id })
    .select()
  if (error) throw error
  return data
}

export async function updateArticle(id, articleData) {
  const { data, error } = await supabase
    .from('articles')
    .update(articleData)
    .eq('id', id)
    .select()
  if (error) throw error
  return data
}

export async function deleteArticle(id) {
  const { error } = await supabase.from('articles').delete().eq('id', id)
  if (error) throw error
}

// ── HIGHLIGHTS (Professional Highlights video showcase) ──

export async function getHighlights({ category } = {}) {
  let query = supabase
    .from('highlights')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (category) query = query.eq('category', category)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getAllHighlights() {
  const { data, error } = await supabase
    .from('highlights')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createHighlight(highlightData) {
  const { data, error } = await supabase
    .from('highlights')
    .insert(highlightData)
    .select()
  if (error) throw error
  return data
}

export async function updateHighlight(id, highlightData) {
  const { data, error } = await supabase
    .from('highlights')
    .update(highlightData)
    .eq('id', id)
    .select()
  if (error) throw error
  return data
}

export async function deleteHighlight(id) {
  const { error } = await supabase.from('highlights').delete().eq('id', id)
  if (error) throw error
}

// ── PARTNERS (Partner Organisations) ─────────────────

export async function getPartners() {
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getAllPartners() {
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createPartner(partnerData) {
  const { data, error } = await supabase
    .from('partners')
    .insert(partnerData)
    .select()
  if (error) throw error
  return data
}

export async function updatePartner(id, partnerData) {
  const { data, error } = await supabase
    .from('partners')
    .update(partnerData)
    .eq('id', id)
    .select()
  if (error) throw error
  return data
}

export async function deletePartner(id) {
  const { error } = await supabase.from('partners').delete().eq('id', id)
  if (error) throw error
}

// ── COMMUNITY FEED ────────────────────────────────────

// Public: visible posts with author info and like/comment counts.
export async function getCommunityPosts({ limit = 30 } = {}) {
  const { data, error } = await supabase
    .from('community_posts')
    .select('*, profiles(full_name, role, city, state, avatar_url), community_likes(count), community_comments(count)')
    .eq('status', 'visible')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

export async function createCommunityPost({ body, tag }) {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('community_posts')
    .insert({ author_id: session.user.id, body, tag })
    .select('*, profiles(full_name, role, city, state, avatar_url)')
  if (error) throw error
  return data[0]
}

export async function deleteCommunityPost(id) {
  const { error } = await supabase.from('community_posts').delete().eq('id', id)
  if (error) throw error
}

export async function getCommunityComments(postId) {
  const { data, error } = await supabase
    .from('community_comments')
    .select('*, profiles(full_name, avatar_url)')
    .eq('post_id', postId)
    .eq('status', 'visible')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createCommunityComment(postId, body) {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('community_comments')
    .insert({ post_id: postId, author_id: session.user.id, body })
    .select('*, profiles(full_name, avatar_url)')
  if (error) throw error
  return data[0]
}

// Returns { liked: boolean, count: number } after toggling the current user's like.
export async function toggleCommunityLike(postId) {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  const { data: existing } = await supabase
    .from('community_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from('community_likes').delete().eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('community_likes').insert({ post_id: postId, user_id: session.user.id })
    if (error) throw error
  }
  const { count } = await supabase
    .from('community_likes')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId)
  return { liked: !existing, count: count || 0 }
}

export async function getMyLikedPostIds(postIds) {
  const session = await getSession()
  if (!session || !postIds.length) return []
  const { data, error } = await supabase
    .from('community_likes')
    .select('post_id')
    .eq('user_id', session.user.id)
    .in('post_id', postIds)
  if (error) throw error
  return data.map(l => l.post_id)
}

export async function reportCommunityContent({ postId, commentId, reason }) {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  const { error } = await supabase
    .from('community_reports')
    .insert({ post_id: postId || null, comment_id: commentId || null, reporter_id: session.user.id, reason })
  if (error) throw error
}

// Admin: open reports with the reported content attached, for the moderation queue.
export async function getOpenCommunityReports() {
  const { data, error } = await supabase
    .from('community_reports')
    .select('*, community_posts(id, body, author_id, status), community_comments(id, body, author_id, status)')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function resolveCommunityReport(reportId, { removeContent, postId, commentId } = {}) {
  if (removeContent) {
    if (postId) {
      const { error } = await supabase.from('community_posts').update({ status: 'removed' }).eq('id', postId)
      if (error) throw error
    }
    if (commentId) {
      const { error } = await supabase.from('community_comments').update({ status: 'removed' }).eq('id', commentId)
      if (error) throw error
    }
  }
  const { error } = await supabase.from('community_reports').update({ status: 'resolved' }).eq('id', reportId)
  if (error) throw error
}

export async function dismissCommunityReport(reportId) {
  const { error } = await supabase.from('community_reports').update({ status: 'dismissed' }).eq('id', reportId)
  if (error) throw error
}

// ── STORAGE (real file uploads) ──────────────────────

function randomName(file){
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const rand = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return `${rand}.${ext}`;
}

// For buckets that require the object path to start with the uploader's own user id
// (avatars, epk-media) — enforced by storage RLS policies in supabase/schema.sql.
export async function uploadOwnMedia(bucket, file) {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  const path = `${session.user.id}/${randomName(file)}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

// For admin-only buckets (article-covers, highlight-thumbs, partner-logos).
export async function uploadAdminMedia(bucket, file) {
  const path = randomName(file)
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

// ── EPK (per-member Electronic Press Kit) ────────────

// Public: a member's EPK, only if they've enabled it and are approved.
export async function getMemberEpk(memberId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, city, state, bio, epk_enabled, epk_bio, epk_photos, epk_music_links, epk_video_links, epk_stage_plot_url, epk_tech_rider_url')
    .eq('id', memberId)
    .eq('status', 'approved')
    .eq('epk_enabled', true)
    .single()
  if (error) throw error
  return data
}

// Member: update their own EPK fields.
export async function updateOwnEpk(epkData) {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('profiles')
    .update(epkData)
    .eq('id', session.user.id)
    .select()
  if (error) throw error
  return data
}
