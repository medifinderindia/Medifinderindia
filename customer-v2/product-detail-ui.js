(() => {
  "use strict";
  const root=document.querySelector('[data-view="product"]');
  if(!root)return;
  const $=s=>root.querySelector(s);
  const title=$("[data-product-title]"),image=$("[data-product-image]"),price=$("[data-product-price]"),mrp=$("[data-product-mrp]"),description=$("[data-product-description]"),meta=$("[data-product-meta]"),rx=$("[data-product-rx]"),qtyText=$("[data-product-qty]"),status=$("[data-product-status]");
  let current=null,qty=1,sequence=0;
  const money=n=>"₹"+(Number(n)||0).toFixed(2);
  const value=(...xs)=>{for(const x of xs)if(x!==undefined&&x!==null&&String(x).trim()!=="")return x;return "";};
  function normalize(p){
    return {id:p.id,name:value(p.name,p.product_name,"Healthcare product"),price:Number(value(p.selling_price,p.unit_price,p.price,0))||0,mrp:Number(value(p.mrp,p.selling_price,p.price,0))||0,img:value(p.image_url,p.img),description:value(p.description,p.product_description,p.desc),manufacturer:value(p.manufacturer,p.brand_name),category:value(p.category,p.categoryRaw,p.dosage_form,p.product_type),stock:Number(value(p.stock_qty,p.stock,0))||0,isRx:p.is_rx===true||p.is_rx==="true"||p.prescription_req==="Yes"||p.isRx===true||p.isRx==="true",merchantId:value(p.merchant_id,p.merchantId),weightKg:Number(value(p.weight_kg,p.weightKg,0.5))||0.5,composition:value(p.composition),strength:value(p.strength),dosageForm:value(p.dosage_form)};
  }
  function paint(p){
    current=normalize(p);qty=1;title.textContent=current.name;price.textContent=money(current.price);
    mrp.textContent=current.mrp>current.price?money(current.mrp):"";
    description.textContent=current.description||"Product details are provided by the verified catalogue partner.";
    meta.replaceChildren();
    [current.category,current.manufacturer,current.strength,current.dosageForm,current.composition].filter(Boolean).forEach(v=>{const chip=document.createElement("span");chip.textContent=String(v);meta.append(chip);});
    image.hidden=!current.img;if(current.img){image.src=current.img;image.alt=current.name;}else image.removeAttribute("src");
    rx.hidden=!current.isRx;qtyText.textContent="1";
    const add=$("[data-product-add]");add.disabled=current.stock<=0;add.textContent=current.stock>0?"Add to cart":"Currently unavailable";
    status.textContent=current.isRx?"Prescription required. A valid prescription must be reviewed before the order can be confirmed.":"";
  }
  async function open(data){
    const id=String(data&&data.id||"");if(!id){status.textContent="Product ID is missing.";return;}
    const seq=++sequence;status.textContent="Loading verified product details…";
    const fallback=normalize(data||{});
    paint(data||{});
    try{
      const client=window.supabaseClient;
      if(client){
        const result=await client.from("medicines").select("*").eq("id",id).eq("status","Approved").maybeSingle();
        if(result.error)throw result.error;
        if(!result.data)throw new Error("This product is no longer available in the approved catalogue.");
        if(seq!==sequence)return;paint(result.data);
      }
      status.textContent=current.isRx?"Prescription review is required before order confirmation.":"Live catalogue product.";
    }catch(e){
      if(seq!==sequence)return;
      if(!fallback.id||!fallback.name)status.textContent=e.message||"Could not load this product.";
      else status.textContent="Showing the approved catalogue listing. Latest product details could not be refreshed.";
    }
    if(window.MFCustomerV2App)window.MFCustomerV2App.openView("product");
  }
  $("[data-product-minus]").addEventListener("click",()=>{qty=Math.max(1,qty-1);qtyText.textContent=String(qty);});
  $("[data-product-plus]").addEventListener("click",()=>{qty=Math.min(20,qty+1);qtyText.textContent=String(qty);});
  $("[data-product-add]").addEventListener("click",()=>{
    if(!current||current.stock<=0)return;
    try{
      const store=window.MFCustomerV2Cart.createCartStore();
      for(let i=0;i<qty;i++)store.add(current);
      window.MFCustomerV2CartUI&&window.MFCustomerV2CartUI.refresh();
      status.textContent=current.isRx?"Added to cart. Upload a valid prescription before checkout.":"Added to cart.";
      const b=$("[data-product-add]");b.textContent="Added to cart";b.disabled=true;
      setTimeout(()=>{b.textContent="Add to cart";b.disabled=current.stock<=0;},1000);
    }catch(e){status.textContent=e.message||"Could not add this product to cart.";}
  });
  $("[data-product-back]").addEventListener("click",()=>window.MFCustomerV2App&&window.MFCustomerV2App.openView("home"));
  window.MFCustomerV2ProductDetail=Object.freeze({open});
})();