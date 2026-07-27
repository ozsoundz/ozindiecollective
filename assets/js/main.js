/* =========================================================
   OZ INDIE COLLECTIVE — main.js
   ========================================================= */
(function(){
'use strict';

/* AUTH (localStorage simulation — replace with real backend) */
/* TODO: assets/js/supabase.js was added on GitHub for real Supabase-backed auth,
   but the accompanying main.js edit was invalid (an HTML <script type="module">
   tag pasted into a .js file) and has been dropped here to avoid breaking the
   site. Wire up supabase.js properly in a follow-up pass. */
const Auth={
  key:'oic_user',
  get(){try{return JSON.parse(localStorage.getItem(this.key))}catch{return null}},
  set(u){localStorage.setItem(this.key,JSON.stringify(u))},
  clear(){localStorage.removeItem(this.key)},
  isLoggedIn(){return!!this.get()},
  isApproved(){const u=this.get();return u&&u.status==='approved'}
};
window.Auth=Auth;

/* RACE-CONDITION FIX: page module scripts (<script type="module">) do a static
   `import` of supabase.js, which itself statically imports ~7 sub-packages from
   a CDN before any of the page's own code runs. On a slow connection that CDN
   round-trip can take longer than the browser needs to finish parsing the rest
   of the page — meaning `DOMContentLoaded` fires and is gone before the module
   script gets around to calling addEventListener('DOMContentLoaded', ...). The
   listener is then never invoked, and the page silently gets stuck on its
   "Loading…" placeholders forever with no error. Use window.onReady(fn) instead
   of addEventListener('DOMContentLoaded', fn) in module scripts: it runs fn
   immediately if the DOM is already past the 'loading' state, and only falls
   back to the event listener if parsing is still in progress. */
function onReady(fn){
  if (document.readyState !== 'loading') fn();
  else document.addEventListener('DOMContentLoaded', fn);
}
window.onReady=onReady;

function initials(name=''){
  return name.split(' ').slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('')||'OI';
}
window.initials=initials;

/* SECURITY: escape any user-supplied text before it goes into innerHTML.
   Member names, bios, article bodies, listing descriptions, etc. all come
   from the database and are ultimately editable by members/admins — without
   this, a crafted value like "<img src=x onerror=...>" stored in a profile
   or listing would execute as script in every visitor's (including admins')
   browser. Wrap any interpolated user value in escapeHtml() before rendering. */
function escapeHtml(str){
  if(str===null||str===undefined) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
window.escapeHtml=escapeHtml;

/* SECURITY: only allow http(s) URLs through to href/src attributes that come
   from user-supplied data (portfolio links, EPK links, partner websites...).
   Without this, a value like "javascript:fetch(...)" stored in a profile
   field would run as script the moment someone clicked the link. */
function sanitizeUrl(url){
  if(!url) return '#';
  try {
    const u = new URL(url, window.location.origin);
    if(u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch(e) { /* not a valid absolute URL */ }
  return '#';
}
window.sanitizeUrl=sanitizeUrl;

/* TIER BADGES — small graphic medallions (assets/img/badges/*.svg) shown
   next to a member's name wherever their plan should be visually flagged
   (job/project listing cards, directory cards, profile header). Free plan
   members never get a badge — badges are a paid-tier perk. Both SME tiers
   share the same "Verified Business" badge; Corporate and Enterprise each
   get their own "Featured" medallion since that's a distinct paid perk. */
const TIER_BADGES={
  sme_small:{icon:'verified-business.svg',label:'Verified Business'},
  sme_medium:{icon:'verified-business.svg',label:'Verified Business'},
  corporate:{icon:'featured-corporate.svg',label:'Featured'},
  enterprise:{icon:'featured-enterprise.svg',label:'Enterprise Partner'}
};
function tierBadgeHtml(plan){
  const b=TIER_BADGES[plan];
  if(!b) return '';
  const isSubPage=window.location.pathname.includes('/pages/')||window.location.pathname.includes('/admin/');
  const root=isSubPage?'../':'';
  return `<span class="tier-badge"><img src="${root}assets/img/badges/${b.icon}" alt="" class="tier-badge-icon">${escapeHtml(b.label)}</span>`;
}
window.tierBadgeHtml=tierBadgeHtml;

document.addEventListener('DOMContentLoaded',()=>{
  initNav();
  initMobileMenu();
  initModals();
  initActiveLinks();
  initAuthUI();
  initFadeIn();
  initCheckboxPills();
  initCharCount();
  initTabs();
});

function initNav(){
  const nav=document.getElementById('nav');
  if(!nav)return;
  window.addEventListener('scroll',()=>{
    nav.style.background=window.scrollY>40?'rgba(13,17,23,.98)':'rgba(13,17,23,.92)';
  },{passive:true});
}

function initMobileMenu(){
  const btn=document.getElementById('hamburger');
  const menu=document.getElementById('mobileMenu');
  if(!btn||!menu)return;
  btn.addEventListener('click',()=>{
    const open=menu.classList.toggle('open');
    btn.setAttribute('aria-expanded',open);
    document.body.style.overflow=open?'hidden':'';
  });
  menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{
    menu.classList.remove('open');
    document.body.style.overflow='';
  }));
}

function initModals(){
  document.querySelectorAll('[data-modal]').forEach(el=>{
    el.addEventListener('click',e=>{e.preventDefault();openModal(el.dataset.modal);});
  });
  document.querySelectorAll('.modal-close,[data-modal-close]').forEach(el=>{
    el.addEventListener('click',()=>{
      const ov=el.closest('.modal-overlay');
      if(ov)closeModal(ov.id);
    });
  });
  document.querySelectorAll('.modal-overlay').forEach(ov=>{
    ov.addEventListener('click',e=>{if(e.target===ov)closeModal(ov.id);});
  });
}
function openModal(id){
  const el=document.getElementById(id);
  if(el){el.classList.add('open');document.body.style.overflow='hidden';}
}
function closeModal(id){
  const el=document.getElementById(id);
  if(el){el.classList.remove('open');document.body.style.overflow='';}
}
window.openModal=openModal;
window.closeModal=closeModal;

function initActiveLinks(){
  const path=window.location.pathname.split('/').pop()||'index.html';
  document.querySelectorAll('.nav-links a,.mobile-menu a').forEach(a=>{
    const href=(a.getAttribute('href')||'').split('/').pop();
    if(href===path)a.classList.add('active');
  });
}

function initAuthUI(){
  const user=Auth.get();
  document.querySelectorAll('[data-auth="logged-in"]').forEach(el=>el.style.display=user?'':'none');
  document.querySelectorAll('[data-auth="logged-out"]').forEach(el=>el.style.display=user?'none':'');
  document.querySelectorAll('[data-auth="approved"]').forEach(el=>el.style.display=Auth.isApproved()?'':'none');
  document.querySelectorAll('[data-auth="admin"]').forEach(el=>el.style.display=(user&&user.isAdmin)?'':'none');
  if(user){
    document.querySelectorAll('[data-user-name]').forEach(el=>el.textContent=user.name||'Member');
    document.querySelectorAll('[data-user-initials]').forEach(el=>el.textContent=initials(user.name));
    document.querySelectorAll('[data-user-role]').forEach(el=>el.textContent=user.role||'');
    document.querySelectorAll('[data-user-location]').forEach(el=>el.textContent=user.location||'');
  }
  document.querySelectorAll('[data-action="logout"]').forEach(btn=>{
    btn.addEventListener('click',async e=>{
      e.preventDefault();
      Auth.clear();
      try{
        const mod=await import('/assets/js/supabase.js?v=14');
        await mod.signOut().catch(()=>{});
      }catch(err){/* not on a page with supabase.js reachable, ignore */}
      showToast('Signed out. See you soon!','info');
      setTimeout(()=>{window.location.href=rootPath()+'index.html';},900);
    });
  });
}

function rootPath(){
  const p=window.location.pathname;
  if(p.includes('/pages/')||p.includes('/admin/'))return'../';
  return'';
}
window.rootPath=rootPath;

function initFadeIn(){
  const els=document.querySelectorAll('.fade-in');
  if(!els.length)return;
  const obs=new IntersectionObserver(entries=>{
    entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target);}});
  },{threshold:.08});
  els.forEach(el=>obs.observe(el));
}

function initCheckboxPills(){
  document.querySelectorAll('.checkbox-pill').forEach(pill=>{
    const input=pill.querySelector('input[type=checkbox]');
    if(!input)return;
    if(input.checked)pill.classList.add('checked');
    pill.addEventListener('click',()=>{
      input.checked=!input.checked;
      pill.classList.toggle('checked',input.checked);
    });
  });
}

function initCharCount(){
  document.querySelectorAll('[data-max-chars]').forEach(el=>{
    const max=parseInt(el.dataset.maxChars);
    const counter=document.createElement('span');
    counter.className='form-hint';counter.style.cssText='text-align:right;display:block;margin-top:.25rem';
    counter.textContent=`0 / ${max}`;
    el.parentNode.appendChild(counter);
    el.addEventListener('input',()=>{
      counter.textContent=`${el.value.length} / ${max}`;
      counter.style.color=el.value.length>max*.9?'var(--rust)':'';
    });
  });
}

function initTabs(){
  document.querySelectorAll('[data-tabs]').forEach(container=>{
    const tabs=container.querySelectorAll('[data-tab]');
    const panels=document.querySelectorAll('[data-panel]');
    tabs.forEach(tab=>{
      tab.addEventListener('click',()=>{
        tabs.forEach(t=>t.classList.remove('active'));
        tab.classList.add('active');
        const target=tab.dataset.tab;
        panels.forEach(p=>{
          p.style.display=p.dataset.panel===target?'':'none';
        });
      });
    });
  });
}

/* TOAST */
let toastTimeout;
function showToast(msg,type='info'){
  let toast=document.getElementById('oic-toast');
  if(!toast){
    toast=document.createElement('div');
    toast.id='oic-toast';
    toast.style.cssText='position:fixed;bottom:2rem;right:2rem;z-index:9999;padding:.85rem 1.4rem;border-radius:3px;font-family:var(--font-body);font-size:.88rem;max-width:340px;line-height:1.4;transform:translateY(80px);opacity:0;transition:.3s;pointer-events:none';
    document.body.appendChild(toast);
  }
  const colors={info:'background:rgba(245,166,35,.15);border:1px solid rgba(245,166,35,.3);color:#F0EDE6',success:'background:rgba(122,158,135,.15);border:1px solid rgba(122,158,135,.3);color:#F0EDE6',danger:'background:rgba(196,98,58,.15);border:1px solid rgba(196,98,58,.3);color:#F0EDE6'};
  toast.style.cssText+=';'+colors[type]||colors.info;
  toast.textContent=msg;
  toast.style.transform='translateY(0)';toast.style.opacity='1';toast.style.pointerEvents='all';
  clearTimeout(toastTimeout);
  toastTimeout=setTimeout(()=>{toast.style.transform='translateY(80px)';toast.style.opacity='0';},3500);
}
window.showToast=showToast;

/* FORM VALIDATION */
window.validateForm=function(formId,rules){
  const form=document.getElementById(formId);
  if(!form)return true;
  let valid=true;
  rules.forEach(({field,test,msg})=>{
    const el=form.querySelector(`[name="${field}"]`);
    const errEl=form.querySelector(`[data-error="${field}"]`);
    if(!el)return;
    const ok=test(el.value.trim());
    if(errEl){errEl.style.display=ok?'none':'block';errEl.textContent=ok?'':msg;}
    el.style.borderColor=ok?'':'rgba(196,98,58,.6)';
    if(!ok)valid=false;
  });
  return valid;
};

})();
