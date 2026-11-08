/* Fast category boot: no dependency on Supabase/catalogue startup. */
(()=>{"use strict";
const tiles=[["Tablet","fa-tablets","medicine","Tablet"],["Capsule","fa-capsules","medicine","Capsule"],["Syrup","fa-bottle-droplet","medicine","Syrup"],["Injection","fa-syringe","medicine","Injection"],["Insulin","fa-droplet","medicine","Insulin"],["Cream","fa-pump-soap","medicine","Cream"],["Drops","fa-eye-dropper","medicine","Drops"],["Medical Devices","fa-stethoscope","instrument",""]];
const classes=["cat-tablet","cat-capsule","cat-syrup","cat-medicine","cat-insulin","cat-personal","cat-supplies","cat-general"];
const norm=v=>String(v||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function start(){const grid=document.getElementById("home-cat-grid");if(!grid||grid.dataset.fastReady==="1")return;grid.dataset.fastReady="1";
grid.innerHTML=tiles.map((t,i)=>'<button type="button" class="category-item" data-fast-category="'+i+'" aria-label="'+t[0]+'"><span class="cat-icon-wrapper '+classes[i]+'"><i class="fa-solid '+t[1]+'"></i></span><span>'+t[0]+'</span></button>').join("");
grid.addEventListener("click",e=>{const btn=e.target.closest("[data-fast-category]");if(!btn)return;const t=tiles[+btn.dataset.fastCategory];if(!t)return;
if(typeof window.mfApplyHomeCategory==="function"){window.mfApplyHomeCategory({type:t[2],cat:t[3]});return;}
let n=0;document.querySelectorAll("#main-products-grid .product-card").forEach(card=>{const type=String(card.dataset.productType||"").toLowerCase();const c=norm(card.dataset.categoryRaw||card.dataset.category);const ok=(t[2]==="instrument"?/instrument|device/.test(type):!/instrument|device/.test(type))&&(!t[3]||c===norm(t[3])||c.startsWith(norm(t[3])));card.style.display=ok?"":"none";card.style.order="";if(ok)n++;});
const h=document.getElementById("products-section-heading"),empty=document.getElementById("no-products-msg");if(h)h.textContent=t[0];if(empty)empty.style.display=n?"none":"block";grid.querySelectorAll(".category-item").forEach(x=>x.classList.toggle("active",x===btn));
});
const all=document.getElementById("cat-viewall-btn");if(all)all.addEventListener("click",()=>{if(typeof window.mfOpenCategorySheet==="function")window.mfOpenCategorySheet({onPick:s=>window.mfApplyHomeCategory&&window.mfApplyHomeCategory(s)});});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();