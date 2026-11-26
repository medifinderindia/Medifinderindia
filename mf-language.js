/* MediFinder India shared app-language engine.
   Uses the same cached Google Translate public endpoint as the customer panel.
   Brand/product names and medical/patient-entered data should be marked translate="no". */
(function () {
  'use strict';
  if (window.MFAppLanguage) return;
  const LANGS = [
    ['en','English'],['bn','বাংলা'],['hi','हिन्दी'],['sat','ᱥᱟᱱᱛᱟᱲᱤ (Santali)'],
    ['rjb','Rajbanshi'],['or','ଓଡ଼ିଆ'],['te','తెలుగు'],['mr','मराठी'],
    ['ta','தமிழ்'],['gu','ગુજરાતી'],['kn','ಕನ್ನಡ'],['ml','മലയാളം'],
    ['pa','ਪੰਜਾਬੀ'],['ur','اردو'],['ne','नेपाली']
  ];
  const TARGET = {sat:'hi',rjb:'bn'};
  const KEY='mf_mt_cache_v2', PREF='mf_app_language';
  let cache={}; try{cache=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){}
  const original=new WeakMap(), translated=new WeakMap(), attrOriginal=new WeakMap();
  const pending=new Map(); let active=0, current='en', saveTimer=0;
  try { current=localStorage.getItem(PREF)||localStorage.getItem('app_language')||'en'; } catch(e){}
  if(!LANGS.some(x=>x[0]===current)) current='en';
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
  const safeText=s=>s.length>=2&&s.length<=450&&/[A-Za-z]{2}/.test(s)&&!/^https?:\/\//i.test(s);
  function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{const keys=Object.keys(cache);if(keys.length>5000)keys.slice(0,1000).forEach(k=>delete cache[k]);localStorage.setItem(KEY,JSON.stringify(cache));}catch(e){}},400);}
  function request(text,lang){
    const raw=norm(text), target=TARGET[lang]||lang, key=lang+'|'+raw;
    if(cache[key])return Promise.resolve(cache[key]);
    if(!safeText(raw))return Promise.resolve('');
    if(pending.has(key))return pending.get(key);
    const p=new Promise(resolve=>{
      const task=async()=>{
        active++;
        try{
          const url='https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl='+encodeURIComponent(target)+'&dt=t&q='+encodeURIComponent(raw);
          const response=await fetch(url,{credentials:'omit'});
          if(!response.ok)throw new Error('translation unavailable');
          const data=await response.json();
          const result=(data[0]||[]).map(x=>x[0]||'').join('');
          if(result&&result!==raw){cache[key]=result;persist();resolve(result);}else resolve('');
        }catch(e){resolve('');}
        finally{active--;pending.delete(key);pump();}
      };
      pending.set(key,{resolve,task});
      pump();
    });
    return p;
  }
  function pump(){for(const item of pending.values()){if(active>=5)break;if(item.started)continue;item.started=true;item.task();}}
  function translateTextNode(node,lang){
    const parent=node.parentElement;
    if(!parent||/^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT|CODE|PRE|SVG|OPTION)$/.test(parent.tagName)||parent.closest('[translate="no"],[data-no-translate],input,textarea,[contenteditable="true"]'))return;
    const value=node.nodeValue||'';
    if(!norm(value))return;
    let base=original.get(node);
    if(base===undefined){base=value;original.set(node,base);}
    else if(value!==translated.get(node)&&value!==base){base=value;original.set(node,base);}
    if(lang==='en'){if(translated.has(node))node.nodeValue=base;translated.delete(node);return;}
    request(base,lang).then(out=>{
      if(!out||!node.isConnected||current!==lang)return;
      if(node.nodeValue===base||node.nodeValue===translated.get(node)){node.nodeValue=out;translated.set(node,out);}
    });
  }
  function translateElement(el,lang){
    if(!(el instanceof Element)||/^(SCRIPT|STYLE|NOSCRIPT|SVG)$/.test(el.tagName)||el.closest('[translate="no"],[data-no-translate]'))return;
    const attrs=['placeholder','title','aria-label','alt'];
    if(el.matches('input[type="button"],input[type="submit"],input[type="reset"]'))attrs.push('value');
    let rec=attrOriginal.get(el);if(!rec){rec={};attrOriginal.set(el,rec);}
    attrs.forEach(name=>{
      if(!el.hasAttribute(name))return;
      const now=el.getAttribute(name);
      if(!rec[name])rec[name]={base:now,last:null};
      else if(now!==rec[name].last&&now!==rec[name].base)rec[name].base=now;
      const base=rec[name].base;
      if(lang==='en'){el.setAttribute(name,base);rec[name].last=null;return;}
      request(base,lang).then(out=>{if(out&&el.isConnected&&current===lang&&el.getAttribute(name)===base){el.setAttribute(name,out);rec[name].last=out;}});
    });
    el.childNodes.forEach(n=>{if(n.nodeType===3)translateTextNode(n,lang);else if(n.nodeType===1)translateElement(n,lang);});
  }
  function apply(lang){current=LANGS.some(x=>x[0]===lang)?lang:'en';try{localStorage.setItem(PREF,current);localStorage.setItem('app_language',current);}catch(e){};document.documentElement.lang=current==='rjb'?'bn':current==='sat'?'hi':current;translateElement(document.body,current);window.dispatchEvent(new CustomEvent('mf:languagechange',{detail:{language:current}}));}
  function nameFor(code){return (LANGS.find(x=>x[0]===code)||LANGS[0])[1];}
  function codeFor(value){const v=String(value||'').toLowerCase();const found=LANGS.find(x=>x[0]===v||x[1].toLowerCase()===v);return found?found[0]:'en';}
  function selectorHtml(id,selected){return '<select id="'+id+'" aria-label="App language" class="mf-language-select" style="max-width:150px;padding:8px 10px;border:1px solid #d7dee8;border-radius:10px;background:var(--surface,#fff);color:inherit;font:inherit">'+LANGS.map(x=>'<option value="'+x[0]+'"'+(x[0]===selected?' selected':'')+'>'+x[1]+'</option>').join('')+'</select>';}
  const observer=new MutationObserver(records=>{if(current==='en')return;records.forEach(r=>{r.addedNodes&&r.addedNodes.forEach(n=>{if(n.nodeType===3)translateTextNode(n,current);else if(n.nodeType===1)translateElement(n,current);});if(r.type==='characterData')translateTextNode(r.target,current);});});
  window.MFAppLanguage={languages:LANGS,get:()=>current,set:apply,nameFor,codeFor,selectorHtml,apply};
  function start(){if(document.body){observer.observe(document.body,{childList:true,subtree:true,characterData:true});if(current!=='en')apply(current);}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();