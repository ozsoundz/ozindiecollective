/* Injects nav + footer into every page dynamically */
(function(){
  const isSubPage = window.location.pathname.includes('/pages/') || window.location.pathname.includes('/admin/');
  const root = isSubPage ? '../' : '';

  const navHTML = `
<nav id="nav">
  <a href="${root}index.html" class="nav-logo">
    <img src="${root}assets/img/logo.jpg" alt="Oz Indie Collective" class="logo-mark">
    Oz Indie Collective
  </a>
  <ul class="nav-links">
    <li class="nav-dropdown">
      <button type="button" class="nav-dropdown-toggle">Platform <span class="nav-dropdown-caret">▾</span></button>
      <div class="nav-dropdown-menu">
        <a href="${root}pages/community.html">Community</a>
        <a href="${root}pages/projects.html">Projects</a>
        <a href="${root}pages/opportunities.html">Opportunities</a>
        <a href="${root}pages/directory.html">Directory</a>
        <a href="${root}pages/events.html">Events</a>
      </div>
    </li>
    <li class="nav-dropdown">
      <button type="button" class="nav-dropdown-toggle">Resources <span class="nav-dropdown-caret">▾</span></button>
      <div class="nav-dropdown-menu">
        <a href="${root}pages/resources.html">Resources</a>
        <a href="${root}pages/articles.html">Articles</a>
        <a href="${root}pages/highlights.html">Highlights</a>
        <a href="${root}pages/podcast.html">Podcast</a>
      </div>
    </li>
    <li class="nav-dropdown">
      <button type="button" class="nav-dropdown-toggle">Company <span class="nav-dropdown-caret">▾</span></button>
      <div class="nav-dropdown-menu">
        <a href="${root}pages/about.html">About Us</a>
        <a href="${root}pages/guidelines.html">Community Guidelines</a>
        <a href="${root}pages/join.html">Apply to Join</a>
      </div>
    </li>
  </ul>
  <div class="nav-actions">
    <div data-auth="logged-out">
      <a href="${root}pages/login.html" class="btn-ghost">Sign In</a>
      <a href="${root}pages/join.html" class="btn-primary" style="margin-left:.5rem">Join</a>
    </div>
    <div data-auth="logged-in" style="display:none;align-items:center;gap:.65rem">
      <a href="${root}admin/index.html" class="btn-ghost" data-auth="admin" style="display:none">Admin</a>
      <a href="${root}pages/dashboard.html" class="btn-ghost">Dashboard</a>
      <a href="${root}pages/dashboard.html" class="avatar avatar-sm av-gold" data-user-initials style="text-decoration:none"></a>
    </div>
  </div>
  <button class="hamburger" id="hamburger" aria-label="Menu" aria-expanded="false">
    <span></span><span></span><span></span>
  </button>
</nav>
<div class="mobile-menu" id="mobileMenu">
  <a href="${root}index.html">Home</a>
  <div class="mobile-menu-heading">Platform</div>
  <a href="${root}pages/community.html">Community</a>
  <a href="${root}pages/projects.html">Projects</a>
  <a href="${root}pages/opportunities.html">Opportunities</a>
  <a href="${root}pages/directory.html">Directory</a>
  <a href="${root}pages/events.html">Events</a>
  <div class="mobile-menu-heading">Resources</div>
  <a href="${root}pages/resources.html">Resources</a>
  <a href="${root}pages/articles.html">Articles</a>
  <a href="${root}pages/highlights.html">Highlights</a>
  <a href="${root}pages/podcast.html">Podcast</a>
  <div class="mobile-menu-heading">Company</div>
  <a href="${root}pages/about.html">About Us</a>
  <a href="${root}pages/guidelines.html">Community Guidelines</a>
  <a href="${root}pages/join.html">Apply to Join</a>
  <a href="${root}pages/login.html" data-auth="logged-out">Sign In</a>
  <a href="${root}admin/index.html" data-auth="admin" style="display:none">Admin Portal</a>
  <a href="${root}pages/dashboard.html" data-auth="logged-in" style="display:none">Dashboard</a>
  <a href="${root}pages/join.html" class="btn-primary">Join The Collective</a>
</div>`;

  const footerHTML = `
<footer id="footer">
  <div class="footer-grid">
    <div>
      <div class="footer-brand-name">Oz Indie Collective</div>
      <p class="footer-tagline">Australia's independent creative community — connecting artists, engineers, producers, managers and makers across the country.</p>
      <div class="footer-newsletter">
        <input type="email" id="newsletterEmail" placeholder="Your email address" aria-label="Newsletter email">
        <button id="newsletterSubscribeBtn">Subscribe</button>
      </div>
    </div>
    <div class="footer-col">
      <h4>Platform</h4>
      <ul>
        <li><a href="${root}pages/community.html">Community</a></li>
        <li><a href="${root}pages/directory.html">Member Directory</a></li>
        <li><a href="${root}pages/projects.html">Projects Board</a></li>
        <li><a href="${root}pages/opportunities.html">Job Opportunities</a></li>
        <li><a href="${root}pages/events.html">Events</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Resources</h4>
      <ul>
        <li><a href="${root}pages/resources.html">Industry Hub</a></li>
        <li><a href="${root}pages/articles.html">Articles</a></li>
        <li><a href="${root}pages/highlights.html">Professional Highlights</a></li>
        <li><a href="${root}pages/podcast.html">Podcast</a></li>
        <li><a href="${root}pages/resources.html#grants">Grants Database</a></li>
        <li><a href="${root}pages/sponsored-programs.html">Sponsored Programs</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Company</h4>
      <ul>
        <li><a href="${root}pages/about.html">About Us</a></li>
        <li><a href="${root}pages/guidelines.html">Community Guidelines</a></li>
        <li><a href="${root}pages/join.html">Apply to Join</a></li>
        <li><a href="${root}pages/contact.html">Contact</a></li>
        <li><a href="${root}pages/privacy.html">Privacy Policy</a></li>
      </ul>
    </div>
  </div>
  <div id="footer-partners" style="border-top:1px solid var(--border);padding-top:1.5rem;margin-top:1.5rem"></div>
  <div class="footer-bottom">
    <div class="footer-copy">© 2025 Oz Indie Collective. All rights reserved.</div>
    <div class="footer-nation"><div class="au-dot"></div>Australia-wide Creative Community</div>
    <div class="footer-socials">
      <a href="#" class="social-btn" aria-label="Instagram">IG</a>
      <a href="#" class="social-btn" aria-label="TikTok">TK</a>
      <a href="#" class="social-btn" aria-label="Facebook">FB</a>
      <a href="#" class="social-btn" aria-label="LinkedIn">LI</a>
      <a href="#" class="social-btn" aria-label="Spotify">SP</a>
    </div>
  </div>
</footer>`;

  document.addEventListener('DOMContentLoaded', () => {
    const navEl = document.getElementById('nav-placeholder');
    if (navEl) navEl.outerHTML = navHTML;
    const footEl = document.getElementById('footer-placeholder');
    if (footEl) footEl.outerHTML = footerHTML;

    // Wire up the newsletter signup form in the footer, site-wide.
    const newsletterBtn = document.getElementById('newsletterSubscribeBtn');
    const newsletterInput = document.getElementById('newsletterEmail');
    if (newsletterBtn && newsletterInput) {
      newsletterBtn.addEventListener('click', async () => {
        const email = newsletterInput.value.trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          if (window.showToast) showToast('Please enter a valid email address.', 'danger');
          return;
        }
        newsletterBtn.disabled = true;
        const originalText = newsletterBtn.textContent;
        newsletterBtn.textContent = 'Subscribing…';
        try {
          const { subscribeToNewsletter } = await import('/assets/js/supabase.js?v=16');
          const result = await subscribeToNewsletter(email);
          newsletterInput.value = '';
          if (window.showToast) {
            showToast(result.alreadySubscribed ? 'You\'re already subscribed!' : 'Thanks! You\'re subscribed.', 'success');
          }
        } catch (err) {
          if (window.showToast) showToast(err.message || 'Failed to subscribe. Please try again.', 'danger');
        } finally {
          newsletterBtn.disabled = false;
          newsletterBtn.textContent = originalText;
        }
      });
    }

    // Populate the Partner Organisations strip in the footer, site-wide.
    const partnersMount = document.getElementById('footer-partners');
    if (partnersMount) {
      import('/assets/js/supabase.js?v=16').then(async ({ getPartners }) => {
        try {
          const partners = await getPartners();
          if (!partners || !partners.length) { partnersMount.remove(); return; }
          const e = window.escapeHtml || (s=>s);
          const su = window.sanitizeUrl || (s=>s||'#');
          partnersMount.innerHTML = `
            <div class="text-xs mono text-muted" style="letter-spacing:.1em;text-transform:uppercase;margin-bottom:1rem">Partner Organisations</div>
            <div style="display:flex;flex-wrap:wrap;gap:1.5rem;align-items:center">
              ${partners.map(p => `<a href="${e(su(p.website_url||'#'))}" target="_blank" rel="noopener" title="${e(p.name||'')}" style="opacity:.75;transition:.2s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.75">${p.logo_url ? `<img src="${e(su(p.logo_url))}" alt="${e(p.name||'')}" style="height:32px;max-width:120px;object-fit:contain">` : `<span class="text-sm" style="color:var(--cream)">${e(p.name||'')}</span>`}</a>`).join('')}
            </div>`;
        } catch(err) { partnersMount.remove(); }
      }).catch(() => partnersMount.remove());
    }
  });
})();
