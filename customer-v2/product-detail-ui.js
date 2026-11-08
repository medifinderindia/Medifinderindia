(() => {
  "use strict";
  const root=document.querySelector('[data-view="product"]');
  if(!root)return;
  const $=s=>root.querySelector(s);
  const title=$("[data-product-title]"),image=$("[data-product-image]"),gallery=$("[data-product-thumbnails]");
  const price=$("[data-product-price]"),mrp=$("[data-product-mrp]"),description=$("[data-product-description]");
  const meta=$("[data-product-meta]"),rx=$("[data-product-rx]"),qtyText=$("[data-product-qty]");
  const status=$("[data-product-status]"),shopHost=$("[data-product-shop]"),reviewsHost=$("[data-product-reviews]");
  let current=null,qty=1,sequence=0;
  const money=n=>"₹"+(Number(n)||0).toFixed(2);
  const value=(...xs)=>{for(const x of xs)if(x!==undefined&&x!==null&&String(x).trim()!=="")return x;return "";};
  const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=String(text);return el;};
  function normalize(p){
    const images=[p.image_url||p.img,p.image_url_2||p.img2,p.image_url_3||p.img3,p.image_url_4||p.img4].filter((x,i,a)=>x&&a.indexOf(x)===i);
    return {
      id:String(p.id||""),name:value(p.name,p.product_name,"Healthcare product"),
      price:Number(value(p.selling_price,p.unit_price,p.price,0))||0,
      mrp:Number(value(p.mrp,p.selling_price,p.price,0))||0,
      images,description:value(p.description,p.product_description,p.desc),
      manufacturer:value(p.manufacturer,p.brand_name),category:value(p.category,p.categoryRaw,p.dosage_form,p.product_type),
      stock:Number(value(p.stock_qty,p.stock,0))||0,
      isRx:String(p.prescription_req||"").trim().toLowerCase()==="yes"||p.is_rx===true||String(p.is_rx).toLowerCase()==="true"||p.isRx===true||String(p.isRx).toLowerCase()==="true",
      merchantId:value(p.merchant_id,p.merchantId),weightKg:Number(value(p.weight_kg,p.weightKg,0.5))||0.5,
      composition:value(p.composition),strength:value(p.strength),dosageForm:value(p.dosage_form)
    };
  }
  function selectImage(src,activeButton){
    if(!src)return;
    image.src=src;image.hidden=false;
    gallery.querySelectorAll("button").forEach(button=>button.classList.toggle("active",button===activeButton));
  }
  function paint(p){
    current=normalize(p);qty=1;
    title.textContent=current.name;price.textContent=money(current.price);
    mrp.textContent=current.mrp>current.price?money(current.mrp):"";
    description.textContent=current.description||"Product details are provided by the verified catalogue partner.";
    meta.replaceChildren();
    [current.category,current.manufacturer,current.strength,current.dosageForm,current.composition].filter(Boolean).forEach(v=>meta.append(node("span","",v)));
    gallery.replaceChildren();
    image.hidden=!current.images.length;
    if(current.images.length){
      image.src=current.images[0];image.alt=current.name;
      current.images.forEach((src,index)=>{
        const button=node("button","v2-detail-thumbnail");button.type="button";button.setAttribute("aria-label","View product image "+(index+1));
        const thumb=node("img");thumb.src=src;thumb.alt="";thumb.loading="lazy";button.append(thumb);
        button.classList.toggle("active",index===0);
        button.addEventListener("click",()=>selectImage(src,button));gallery.append(button);
      });
    }else image.removeAttribute("src");
    gallery.hidden=current.images.length<2;
    rx.hidden=!current.isRx;qtyText.textContent="1";
    const add=$("[data-product-add]");add.disabled=current.stock<=0||current.price<=0;
    add.textContent=current.stock>0?"Add to cart":"Currently unavailable";
    status.textContent=current.isRx?"Prescription required. A valid prescription must be reviewed before the order can be confirmed.":"";
    shopHost.replaceChildren(node("h2","","Partner shop"),node("p","","Loading verified seller details…"));
    reviewsHost.replaceChildren(node("h2","","Customer reviews"),node("p","","Loading reviews…"));
  }
  function renderShop(result){
    shopHost.replaceChildren(node("h2","","Partner shop"));
    if(!result||result.error||!result.data){
      shopHost.append(node("p","","Seller details are temporarily unavailable. Product checkout will recheck seller approval."));
      return;
    }
    const row=result.data;
    shopHost.append(node("strong","",value(row.shop_name,row.merchant_name,"MediFinder verified partner")));
    const location=[row.city||row.district,row.state,row.pincode].filter(Boolean).join(", ");
    if(location)shopHost.append(node("p","",location));
    if(row.about_shop)shopHost.append(node("p","",row.about_shop));
    if(row.cod_available===true)shopHost.append(node("small","","Cash on Delivery supported by this partner"));
  }
  function renderReviews(result){
    reviewsHost.replaceChildren(node("h2","","Customer reviews"));
    if(!result||result.error){
      reviewsHost.append(node("p","","Reviews could not be loaded. Please retry later."));
      return;
    }
    const rows=result.data||[];
    if(!rows.length){reviewsHost.append(node("p","","No customer reviews yet."));return;}
    const average=rows.reduce((sum,row)=>sum+(Number(row.rating)||0),0)/rows.length;
    reviewsHost.append(node("p","v2-detail-review-summary",average.toFixed(1)+" / 5 · "+rows.length+" recent review"+(rows.length===1?"":"s")));
    rows.forEach(row=>{
      const card=node("article","v2-detail-review");
      card.append(node("strong","",(Number(row.rating)||0).toFixed(1)+" / 5 · "+(row.user_name||"Customer")));
      if(row.review_text)card.append(node("p","",row.review_text));
      if(row.created_at)card.append(node("small","",new Date(row.created_at).toLocaleDateString()));
      reviewsHost.append(card);
    });
  }
  async function open(data){
    const id=String(data&&data.id||"");if(!id){status.textContent="Product ID is missing.";return;}
    const seq=++sequence;status.textContent="Loading verified product details…";
    const fallback=normalize(data||{});paint(data||{});
    if(window.MFCustomerV2App)window.MFCustomerV2App.openView("product");
    const client=window.supabaseClient;
    if(!client){status.textContent="Showing catalogue details. Secure product refresh is unavailable.";renderShop(null);renderReviews(null);return;}
    try{
      const result=await client.from("medicines").select("*").eq("id",id).ilike("status","approved").eq("is_visible",true).maybeSingle();
      if(result.error)throw result.error;
      if(!result.data)throw new Error("This product is no longer available in the approved catalogue.");
      if(seq!==sequence)return;
      paint(result.data);
      const [shopResult,reviewsResult]=await Promise.all([
        current.merchantId
          ? client.from("merchants_public").select("id,shop_name,merchant_name,city,district,state,pincode,about_shop,cod_available,status").eq("id",current.merchantId).maybeSingle()
          : Promise.resolve({data:null,error:null}),
        client.from("product_reviews").select("id,user_name,rating,review_text,created_at").eq("medicine_id",id).eq("reported",false).order("created_at",{ascending:false}).limit(20)
      ]);
      if(seq!==sequence)return;
      renderShop(shopResult);renderReviews(reviewsResult);
      status.textContent=current.isRx?"Prescription review is required before order confirmation.":"Live catalogue product.";
    }catch(e){
      if(seq!==sequence)return;
      if(!fallback.id||!fallback.name)status.textContent=e.message||"Could not load this product.";
      else status.textContent="Showing the catalogue listing. Latest seller, review or product details could not be refreshed.";
      renderShop(null);renderReviews(null);
    }
  }
  $("[data-product-minus]").addEventListener("click",()=>{qty=Math.max(1,qty-1);qtyText.textContent=String(qty);});
  $("[data-product-plus]").addEventListener("click",()=>{if(!current)return;qty=Math.max(1,Math.min(20,current.stock||1,qty+1));qtyText.textContent=String(qty);});
  $("[data-product-add]").addEventListener("click",()=>{
    if(!current||current.stock<=0||current.price<=0)return;
    try{
      const store=window.MFCustomerV2Cart.createCartStore();
      const existing=store.snapshot().items.find(item=>String(item.id)===current.id);
      if(existing&&existing.qty+qty>current.stock)throw new Error("Only "+current.stock+" units are currently available.");
      for(let i=0;i<qty;i++)store.add(current);
      window.MFCustomerV2CartUI&&window.MFCustomerV2CartUI.refresh();
      status.textContent=current.isRx?"Added to cart. Upload a valid prescription before checkout.":"Added to cart.";
      const button=$("[data-product-add]");button.textContent="Added to cart";button.disabled=true;
      setTimeout(()=>{button.textContent="Add to cart";button.disabled=current.stock<=0||current.price<=0;},1000);
    }catch(e){status.textContent=e.message||"Could not add this product to cart.";}
  });
  $("[data-product-back]").addEventListener("click",()=>window.MFCustomerV2App&&window.MFCustomerV2App.openView("home"));
  window.MFCustomerV2ProductDetail=Object.freeze({open});
})();
