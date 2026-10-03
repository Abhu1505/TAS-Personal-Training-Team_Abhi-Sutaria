// Minimal DOM stub to simulate the popup flow of js/update-site.js
class El {
  constructor(id){ this.id=id; this._cls=new Set(); this.dataset={}; this.innerHTML=''; this.style={}; this.children=[]; this.handlers={}; }
  classList={ add:(c)=>this._cls.add(c), remove:(c)=>this._cls.delete(c), contains:(c)=>this._cls.has(c) };
  addEventListener(ev,fn){ (this.handlers[ev]=this.handlers[ev]||[]).push(fn); }
  appendChild(c){ if(c.innerHTML) this.innerHTML=c.innerHTML; this.children.push(c); }
  querySelector(sel){ return sel==='.us-popup-box'? new El('box') : null; }
  focus(){}
  get offsetWidth(){return 1;}
  set className(v){ this._cls=new Set(v.split(/\s+/).filter(Boolean)); }
  get className(){ return [...this._cls].join(' '); }
}
const els = {};
['adminUpdateSiteBtn','clientUpdateSiteBtn'].forEach(id=>els[id]=new El(id));
global.document = {
  readyState:'complete', hidden:false, body:new El('body'),
  createElement:()=>new El('dyn'),
  getElementById:(id)=>{ if(!els[id]) els[id]=new El(id); return els[id]; },
  addEventListener:()=>{},
};
global.window = global;
const store={'tas_site_fingerprint_v1_rel':'never-seen'};
global.localStorage={ getItem:k=>store[k]??null, setItem:(k,v)=>store[k]=String(v) };
global.location={ pathname:'/index.html', href:'http://x/index.html', assign:(u)=>{global.__navigated=u;} };
global.__fetchHtml='<html>v1</html>';
global.fetch=async()=>({ ok:true, text:async=>global.__fetchHtml });
global.crypto=require('crypto').webcrypto;
global.showToast=(m)=>{ global.__toast=m; };
global.setInterval=()=>{};

require('../js/update-site.js');

setTimeout(()=>{
  const p=document.getElementById('updateSitePopup');
  console.log('A. popup auto-opened on stale fingerprint:', !p.classList.contains('hidden'));
  console.log('A. notes contain HA 0.3:', document.getElementById('uspNotes').innerHTML.includes('HA 0.3'));
  console.log('A. toast fired:', /New site update available/.test(global.__toast||''));
  console.log('A. header button shown:', !els.clientUpdateSiteBtn.classList.contains('hidden'));

  global.__navigated=null;
  els.clientUpdateSiteBtn.handlers.click[0]();
  console.log('B. header click opens popup, no direct reload:', global.__navigated===null && !p.classList.contains('hidden'));

  document.getElementById('uspLaterBtn').handlers.click[0]();
  console.log('C. Later hides popup:', p.classList.contains('hidden'));

  els.clientUpdateSiteBtn.handlers.click[0]();
  document.getElementById('uspUpdateBtn').handlers.click[0]();
  console.log('D. Update Site Now -> cache-busted reload:', /_r=\d+/.test(global.__navigated||''));
},100);
