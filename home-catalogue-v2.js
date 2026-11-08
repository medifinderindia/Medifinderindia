/* MediFinder India — isolated home category controller.
   No Supabase calls. Renders after legacy scripts and survives legacy DOM redraws. */
(()=>{"use strict";
const T=[
 {label:"Tablet",icon:"fa-tablets",type:"medicine",cat:"Tablet",color:"cat-tablet"},
 {label:"Capsule",icon:"fa-capsules",type:"medicine",cat:"Capsule",color:"cat-capsule"},
 {label:"Syrup",icon:"fa-bottle-droplet",type:"medicine",cat:"Syrup",color:"cat-syrup"},
 {label:"Injection",icon:"fa-syringe",type:"medicine",cat:"Injection",color:"cat-medicine"},
 {label:"Insulin",icon:"fa-droplet",type:"medicine",cat:"Insulin",color:"cat-insulin"},
 {label:"Cream",icon:"fa-pump-soap",type:"medicine",cat:"Cream",color:"cat-personal"},
 {label:"Drops",icon:"fa-eye-dropper",type:"medicine",cat:"Drops",color:"cat-supplies"},
 {label:"Medical Devices",icon:"fa-stethoscope",type:"instrument",cat:"",color:"cat-general"}
];
const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
let selected=null, observer=null, rendering=false;
function css(){if(document.getElementById("mf-home-v2-css"))return;
const st=document.createElement("style");st.id="mf-home-v2-css";st.textContent=
".categories-section{display:block!important;visibility:visible!important;opacity:1!important;height:auto!important;min-height:100px!important;overflow:visible!important;position:relative!important;z-index:2!important}"+
"#home-cat-grid{display:flex!important;flex-flow:row nowrap!important;align-items:flex-start!important;gap:10px!important;min-height:90px!important;overflow-x:auto!important;overflow-y:hidden!important;visibility:visible!important;opacity:1!important;padding:8px 16px 10px!important;touch-action:pan-x!important;-webkit-overflow-scrolling:touch!important}"+
"#home-cat-grid .mf-v2-cat{appearance:none!important;-webkit-appearance:none!important;flex:0 0 72px!important;width:72px!important;min-height:82px!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:flex-start!important;gap:6px!important;padding:5px 3px!important;border:0!important;background:transparent!important;color:#596273!important;font:inherit!important;cursor:pointer!important;touch-action:manipulation!important}"+
"#home-cat-grid .mf-v2-icon{width:48px;height:48px;border-radius:15px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;box-shadow:0 5px 12px #17203320}"+
"#home-cat-grid .mf-v2-label{display:block!important;font-size:12px!important;font-weight:700!important;line-height:1.2!important;text-align:center!important;white-space:normal!important;min-height:28px}"+
"#home-cat-grid .mf-v2-cat[aria-pressed=true] .mf-v2-icon{outline:3px solid #f5c5cc;outline-offset:2px}"+
"#home-cat-grid .cat-tablet{background:linear-gradient(135deg,#4a8cc0,#2f6690)}#home-cat-grid .cat-capsule{background:linear-gradient(135deg,#8b7df0,#6c5ce7)}#home-cat-grid .cat-syrup{background:linear-gradient(135deg,#f0a25a,#d9822b)}#home-cat-grid .cat-medicine{background:linear-gradient(135deg,#5b8def,#2f5fd0)}#home-cat-grid .cat-insulin{background:linear-gradient(135deg,#3bbccb,#1897a6)}#home-cat-grid .cat-personal{background:linear-gradient(135deg,#f78fb3,#d6457a)}#home-cat-grid .cat-supplies{background:linear-gradient(135deg,#2ec4b6,#168f85)}#home-cat-grid .cat-general{background:linear-gradient(135deg,#f7b733,#e08a00)}";
document.head.appendChild(st);}
function render(){const grid=document.getElementById("home-cat-grid");if(!grid||rendering)return;
if(grid.dataset.mfV2Ready==="1"&&grid.querySelector(".mf-v2-cat"))return;
rendering=true;grid.innerHTML=T.map((t,i)=>'<button type="button" class="mf-v2-cat" data-mf-cat="'+i+'" aria-pressed="'+(selected===i)+'"><span class="mf-v2-icon '+t.color+'"><i class="fa-solid '+t.icon+'"></i></span><span class="mf-v2-label">'+t.label+'</span></button>').join("");
grid.dataset.mfV2Ready="1";rendering=false;}
function fallbackFilter(t){const cards=[...document.querySelectorAll("#main-products-grid .product-card")];let n=0;
cards.forEach(card=>{const typ=String(card.getAttribute("data-product-type")||"").toLowerCase(),cat=norm(card.getAttribute("data-category-raw")||card.getAttribute("data-category"));const ok=t===null||(t.type==="instrument"?/instrument|device/.test(typ):!/instrument|device/.test(typ))&&(!t.cat||cat===norm(t.cat)||cat.startsWith(norm(t.cat)));card.style.display=ok?"":"none";card.style.order="";if(ok)n++;});
const heading=document.getElementById("products-section-heading"),empty=document.getElementById("no-products-msg");if(heading)heading.textContent=t?(t.cat||"Medical Devices & Instruments"):"Available Products";if(empty)empty.style.display=n?"none":"block";}
function apply(i){selected=selected===i?null:i;const t=selected===null?null:T[selected];if(typeof window.mfApplyHomeCategory==="function")window.mfApplyHomeCategory(t?{type:t.type,cat:t.cat}:null);else fallbackFilter(t);
const grid=document.getElementById("home-cat-grid");if(grid)grid.querySelectorAll("[data-mf-cat]").forEach(b=>b.setAttribute("aria-pressed",String(Number(b.dataset.mfCat)===selected)));}
function init(){css();render();const grid=document.getElementById("home-cat-grid");if(grid&&!grid.dataset.mfV2ClickBound){grid.dataset.mfV2ClickBound="1";grid.addEventListener("click",e=>{const b=e.target.closest("[data-mf-cat]");if(b)apply(Number(b.dataset.mfCat));});}
const all=document.getElementById("cat-viewall-btn");if(all&&!all.dataset.mfV2Bound){all.dataset.mfV2Bound="1";all.addEventListener("click",()=>{if(typeof window.mfOpenCategorySheet==="function")window.mfOpenCategorySheet({onPick:s=>{selected=null;if(typeof window.mfApplyHomeCategory==="function")window.mfApplyHomeCategory(s);else fallbackFilter(null);}});else fallbackFilter(null);});}
if(!observer){observer=new MutationObserver(()=>{const g=document.getElementById("home-cat-grid");if(g&&(!g.querySelector(".mf-v2-cat")||g.dataset.mfV2Ready!=="1"))render();});const g=document.getElementById("home-cat-grid");if(g)observer.observe(g,{childList:true});}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
window.addEventListener("pageshow",init);
})();