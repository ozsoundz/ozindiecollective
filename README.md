# Oz Indie Collective

Australia's vetted independent creative community — connecting artists, musicians, engineers, managers, technicians and creative professionals nationwide.

## 🚀 Deploy to GitHub Pages

### Step 1 — Create a GitHub Repository
1. Go to [github.com](https://github.com) and sign in
2. Click **New Repository**
3. Name it `oz-indie-collective`
4. Set to **Public**
5. Click **Create Repository**

### Step 2 — Upload Files
**Option A — GitHub Web UI (easiest):**
1. Click **uploading an existing file** on the new repo page
2. Drag the entire unzipped folder contents into the upload area
3. Commit with message: `Initial site build`

**Option B — Git CLI:**
```bash
cd oz-indie-collective
git init
git add .
git commit -m "Initial site build"
git branch -M main
git remote add origin https://github.com/YOURUSERNAME/oz-indie-collective.git
git push -u origin main
```

### Step 3 — Enable GitHub Pages
1. Go to your repo → **Settings** → **Pages**
2. Under **Source**, select `Deploy from a branch`
3. Branch: `main` / Folder: `/ (root)`
4. Click **Save**
5. Your site will be live at: `https://YOURUSERNAME.github.io/oz-indie-collective/`

> ⚡ First deploy takes ~2 minutes. Subsequent updates are live in ~30 seconds.

---

## 📁 File Structure

```
oz-indie-collective/
├── index.html              # Homepage
├── 404.html                # Custom 404 page
├── _config.yml             # GitHub Pages config
├── assets/
│   ├── css/
│   │   └── style.css       # Global stylesheet
│   └── js/
│       ├── main.js         # Core JS (auth, modals, nav)
│       └── nav-inject.js   # Shared nav & footer injection
├── pages/
│   ├── about.html          # About the Collective
│   ├── community.html      # Community feed
│   ├── contact.html        # Contact form
│   ├── dashboard.html      # Member dashboard (auth-gated)
│   ├── directory.html      # Searchable member directory
│   ├── events.html         # Events calendar
│   ├── guidelines.html     # Community guidelines
│   ├── join.html           # Multi-step application form
│   ├── login.html          # Sign in (with demo accounts)
│   ├── opportunities.html  # Job listings board
│   ├── podcast.html        # Podcast episodes
│   ├── post-job.html       # Post a job/opportunity
│   ├── privacy.html        # Privacy policy
│   ├── profile.html        # Member profile (view/edit)
│   ├── projects.html       # Collaboration projects board
│   └── resources.html      # Industry hub & resources
└── admin/
    ├── index.html          # Admin dashboard
    ├── applications.html   # Application vetting queue
    ├── listings.html       # Job listing moderation
    ├── members.html        # Member management
    └── reports.html        # Analytics & growth reports
```

---

## 🎭 Demo Accounts

Visit `/pages/login.html` and use the demo buttons:

| Account | Access |
|---------|--------|
| **Approved Member** | Full member dashboard, profile editing, apply for jobs |
| **Pending Member** | Limited access, pending notice shown |
| **Admin** | Full admin panel — applications, members, listings, reports |

---

## 🔌 Connecting a Real Backend

The site uses `localStorage` to simulate authentication. To connect a real backend:

### Authentication
Replace the `Auth` object in `assets/js/main.js`:
```javascript
// Replace localStorage simulation with:
// - JWT tokens (recommended)
// - Firebase Authentication
// - Auth0
// - Supabase Auth
```

### Database
Recommended stack for an indie project:
- **Supabase** (PostgreSQL + Auth + Storage — free tier generous)
- **Firebase** (Firestore + Auth)
- **PlanetScale** + **Netlify Functions**

### Email (Application Notifications)
- **Resend** or **SendGrid** for transactional email
- Trigger on: new application, approval/denial, new message

### Payments
- **Stripe** for Professional ($12/mo) and Partner ($89/mo) plans
- Stripe Billing handles subscriptions, invoices and cancellations

---

## 🎨 Design System

| Token | Value | Use |
|-------|-------|-----|
| `--ink` | `#0D1117` | Primary background |
| `--cream` | `#F0EDE6` | Primary text |
| `--marigold` | `#F5A623` | Accent / CTAs |
| `--sage` | `#7A9E87` | Success / Available |
| `--rust` | `#C4623A` | Secondary accent |
| `--mid` | `#1E2530` | Section backgrounds |
| `--font-display` | Playfair Display | Headlines |
| `--font-body` | Inter | Body text |
| `--font-mono` | Space Mono | Labels / tags / UI |

---

## 📜 License

Built for Oz Indie Collective. All rights reserved.

---

*Built with HTML, CSS and vanilla JS. No frameworks. No dependencies. Just vibes and craft.*
