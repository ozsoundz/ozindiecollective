/* Injects nav + footer into every page dynamically */
(function(){
  const isSubPage = window.location.pathname.includes('/pages/') || window.location.pathname.includes('/admin/');
  const root = isSubPage ? '../' : '';

  const navHTML = `
<nav id="nav">
  <a href="${root}index.html" class="nav-logo">
    <div class="logo-mark">OIC</div>
    Oz Indie Collective
  </a>
  <ul class="nav-links">
    <li><a href="${root}pages/community.html">Community</a></li>
    <li><a href="${root}pages/projects.html">Projects</a></li>
    <li><a href="${root}pages/opportunities.html">Opportunities</a></li>
    <li><a href="${root}pages/directory.html">Directory</a></li>
    <li><a href="${root}pages/events.html">Events</a></li>
    <li><a href="${root}pages/resources.html">Resources</a></li>
    <li><a href="${root}pages/podcast.html">Podcast</a></li>
  </ul>
  <div class="nav-actions">
    <div data-auth="logged-out">
      <a href="${root}pages/login.html" class="btn-ghost">Sign In</a>
      <a href="${root}pages/join.html" class="btn-primary" style="margin-left:.5rem">Join</a>
    </div>
    <div data-auth="logged-in" style="display:none;align-items:center;gap:.65rem">
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
  <a href="${root}pages/community.html">Community</a>
  <a href="${root}pages/projects.html">Projects</a>
  <a href="${root}pages/opportunities.html">Opportunities</a>
  <a href="${root}pages/directory.html">Directory</a>
  <a href="${root}pages/events.html">Events</a>
  <a href="${root}pages/resources.html">Resources</a>
  <a href="${root}pages/podcast.html">Podcast</a>
  <a href="${root}pages/login.html" data-auth="logged-out">Sign In</a>
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
        <input type="email" placeholder="Your email address" aria-label="Newsletter email">
        <button onclick="showToast('Thanks! You\\'re subscribed.','success')">Subscribe</button>
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
        <li><a href="${root}pages/podcast.html">Podcast</a></li>
        <li><a href="${root}pages/resources.html#grants">Grants Database</a></li>
        <li><a href="${root}pages/resources.html#guides">Career Guides</a></li>
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
  });
})();
