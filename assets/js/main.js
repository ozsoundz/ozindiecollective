/* =========================================================
   OZ INDIE COLLECTIVE — main.js
   ========================================================= */
(function(){
'use strict';

/* AUTH (localStorage simulation — replace with real backend) */
/* const Auth={
  key:'oic_user',
  get(){try{return JSON.parse(localStorage.getItem(this.key))}catch{return null}},
  set(u){localStorage.setItem(this.key,JSON.stringify(u))},
  clear(){localStorage.removeItem(this.key)},
  isLoggedIn(){return!!this.get()},
  isApproved(){const u=this.get();return u&&u.status==='approved'}
}; */

/* ====================================
SUPABASE AUTH 
=================== */
<script type="module">
  import { getCurrentProfile, signIn, signOut } from '../assets/js/supabase.js'

  const profile = await getCurrentProfile()
  if (!profile || profile.status !== 'approved') {
    window.location.href = 'login.html'
  }
</script>

window.Auth=Auth;

function initials(name=''){
  return name.split(' ').slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('')||'OI';
}
window.initials=initials;

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
  initToast();
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
  if(user){
    document.querySelectorAll('[data-user-name]').forEach(el=>el.textContent=user.name||'Member');
    document.querySelectorAll('[data-user-initials]').forEach(el=>el.textContent=initials(user.name));
    document.querySelectorAll('[data-user-role]').forEach(el=>el.textContent=user.role||'');
    document.querySelectorAll('[data-user-location]').forEach(el=>el.textContent=user.location||'');
  }
  document.querySelectorAll('[data-action="logout"]').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.preventDefault();
      Auth.clear();
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
