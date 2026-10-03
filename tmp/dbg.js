// Minimal DOM stub to simulate the popup flow of js/update-site.js
class El {
  constructor(id){ this.id=id; this._cls=new Set(); this.dataset={}; this.innerHTML=''; this.style={}; this.children=[]; this._kids=[]; this.handlers={}; }
  classList={ add:(c)=>this._cls.add(c), remove:(c)=>this._cls.delete(c), contains:(c)=>this._cls.has(c) };
  addEventListener(ev,fn){ (this.handlers[ev]=this.handlers[ev]||[]).push(fn); }
  appendChild(c){ if(c.innerHTML) this.innerHTML=c.innerHTML; this.children.push(c); this._kids.push(c);
    // very small innerHTML child-id registry so getElementById finds popup buttons
    const re=/id="([^"]+)"/g; let m; while((m=re.exec(c.innerHTML||''))){ (this._ids=this._ids||{})[m[1]]=true; }
    for(const id in (this._ids||{})){ if(!El._reg[id]) El._reg[id]=new El(id); }
  }
  static _reg={};
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
  getElementById:(id)=>{
    if(El._reg[id]) return El._reg[id];
    if(!els[id]) els[id]=new El(id);
    return els[id];
  },
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

global.__origGEBI=document.getElementById; document.getElementById=(id)=>{ const e=__origGEBI(id); if(id==='uspLaterBtn') console.log('GEBI uspLaterBtn handlers:', Object.keys(e.handlers)); return e; };
require('../js/update-site.js');

// A: stale fingerprint saved -> popup must auto-open on boot with notes + toast
store['tas_site_fingerprint_v1']='stale-fp-abc';
window.initUpdateSiteWatcher();
setTimeout(()=>{
  const p=document.getElementById('updateSitePopup');
  console.log('A. popup exists:', !!p);
  console.log('A. popup visible:', !p.classList.contains('hidden'));
  console.log('A. notes contain HA 0.3:', document.getElementById('uspNotes').innerHTML.includes('HA 0.3'));
  console.log('A. toast fired:', /New site update available/.test(global.__toast||''));
  console.log('A. update button shown:', !els.clientUpdateSiteBtn.classList.contains('hidden'));

  // B: click header button re-opens popup, never reloads directly
  global.__navigated=null;
  els.clientUpdateSiteBtn.handlers.click[0]();
  console.log('B. no direct reload:', global.__navigated===null);
  console.log('B. popup visible after click:', !p.classList.contains('hidden'));

  // C: "Later" hides popup
  document.getElementById('uspLaterBtn').handlers.click[0]();
  console.log('C. Later hides popup:', p.classList.contains('hidden'));

  // D: inside popup press Update Site Now -> cache-busted navigation
  els.clientUpdateSiteBtn.handlers.click[0]();
  console.log('D1. reopen works:', !p.classList.contains('hidden'));
  document.getElementById('uspUpdateBtn').handlers.click[0]();
  console.log('D. navigated with _r=', /_r=\d+/.test(global.__navigated||''));
  console.log('ALL DONE');
},100);
