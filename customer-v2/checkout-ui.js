(() => {
  "use strict";
  const root=document.querySelector('[data-view="checkout"]');
  if(!root)return;
  const patientsHost=root.querySelector("[data-checkout-patients]");
  const addressesHost=root.querySelector("[data-checkout-addresses]");
  const status=root.querySelector("[data-checkout-status]");
  const summary=root.querySelector("[data-checkout-summary]");
  let adapter=null, rules=null, selectedPatient="self", selectedAddress="", selectedCoupon=null, coinBalance=0, useCoins=false, pincodeVerified=false;
  const money=n=>"₹"+(Number(n)||0).toFixed(2);
  function setStatus(message,error=false){status.textContent=message;status.dataset.error=String(error);}
  function option(host,name,value,label,checked,onChange){
    const row=document.createElement("label");row.className="v2-checkout-option";
    const input=document.createElement("input");input.type="radio";input.name=name;input.value=value;input.checked=checked;input.addEventListener("change",()=>onChange(value));
    const text=document.createElement("span");text.textContent=label;row.append(input,text);host.append(row);
  }
  function renderSummary(){
    const store=window.MFCustomerV2Cart&&window.MFCustomerV2Cart.createCartStore();
    const state=store&&store.snapshot();
    summary.replaceChildren();
    if(!state||!state.items.length){summary.textContent="Your cart is empty.";return;}
    state.items.forEach(item=>{
      const line=document.createElement("div");line.className="v2-checkout-summary-line";
      const name=document.createElement("span");name.textContent=(item.name||"Product")+" × "+item.qty;
      const price=document.createElement("strong");price.textContent=money(item.price*item.qty);line.append(name,price);summary.append(line);
    });
    const total=document.createElement("div");total.className="v2-checkout-summary-total";
    const label=document.createElement("span");label.textContent="Items subtotal";
    const value=document.createElement("strong");value.textContent=money(state.subtotal);total.append(label,value);summary.append(total);
  }
  async function load(){
    patientsHost.replaceChildren();addressesHost.replaceChildren();
    try{
      const client=window.supabaseClient;
      if(!client||!window.MFCustomerV2Auth||!window.MFCustomerV2People)throw new Error("Account services are not connected in this preview.");
      const auth=await window.MFCustomerV2Auth.requireAuthenticatedUser(client);
      if(!auth.authenticated)throw new Error("Please sign in to choose a patient and delivery address.");
      adapter=window.MFCustomerV2People.create(client,auth.user);
      rules=window.MFCustomerV2CheckoutRules.create(client,auth.user);
      const [patients,addresses,balance]=await Promise.all([adapter.listPatients(),adapter.listAddresses(),rules.getCoinBalance()]);
      coinBalance=balance;
      option(patientsHost,"checkout-patient","self","Myself",selectedPatient==="self",v=>selectedPatient=v);
      patients.forEach(p=>option(patientsHost,"checkout-patient",String(p.id),p.name+" · "+p.age+" years",selectedPatient===String(p.id),v=>selectedPatient=v));
      if(!patients.length){const hint=document.createElement("p");hint.className="v2-checkout-hint";hint.textContent="No family patients saved. You can continue with Myself.";patientsHost.append(hint);}
      addresses.forEach(a=>option(addressesHost,"checkout-address",String(a.id),(a.tag||"Address")+" — "+[a.address1,a.address2,a.city,a.pincode].filter(Boolean).join(", "),selectedAddress===String(a.id)||(!selectedAddress&&!!a.is_default),v=>selectedAddress=v));
      if(!selectedAddress){const preferred=addresses.find(a=>a.is_default)||addresses[0];if(preferred)selectedAddress=String(preferred.id);}
      if(!addresses.length){const hint=document.createElement("p");hint.className="v2-checkout-hint";hint.textContent="Add a saved address from Patients & Addresses before proceeding.";addressesHost.append(hint);}
      // Re-render after resolving default address so radio selection is correct.
      if(addresses.length){addressesHost.replaceChildren();addresses.forEach(a=>option(addressesHost,"checkout-address",String(a.id),(a.tag||"Address")+" — "+[a.address1,a.address2,a.city,a.pincode].filter(Boolean).join(", "),selectedAddress===String(a.id),v=>selectedAddress=v));}
      root.querySelector("[data-coin-balance]").textContent="Available balance: "+coinBalance+" coins";
      root.querySelector("[data-coin-result]").textContent="Coin use is preview-only; no redemption is submitted.";
      setStatus("Saved details loaded. Verify your PIN code and coupon before continuing.");
    }catch(e){setStatus(e.message||"Could not load delivery details.",true);}
    renderSummary();
  }
  const pin=root.querySelector("[data-checkout-pincode]");
  const pinResult=root.querySelector("[data-pincode-result]");
  pin.addEventListener("input",()=>{pin.value=pin.value.replace(/[^0-9]/g,"").slice(0,6);pincodeVerified=false;pinResult.textContent="PIN changed. Verify it again.";});
  root.querySelector("[data-check-pincode]").addEventListener("click",async()=>{
    if(!rules){pinResult.textContent="Sign in to verify delivery.";return;}
    try{pinResult.textContent="Checking…";const result=await rules.checkPincode(pin.value);pincodeVerified=result.available;
      pinResult.textContent=result.available?"Approved delivery zone. Distance: "+(result.distanceKm==null?"not provided":result.distanceKm+" km"):"Not serviceable yet for this PIN code.";
      pinResult.dataset.available=String(result.available);
    }catch(e){pincodeVerified=false;pinResult.textContent=e.message||"Could not verify PIN.";pinResult.dataset.available="false";}
  });
  root.querySelector("[data-apply-coupon]").addEventListener("click",async()=>{
    const out=root.querySelector("[data-coupon-result]");
    if(!rules){out.textContent="Sign in to validate a coupon.";return;}
    const cart=window.MFCustomerV2Cart.createCartStore().snapshot();
    try{out.textContent="Validating…";selectedCoupon=await rules.validateCoupon(root.querySelector("[data-checkout-coupon]").value,cart.subtotal);out.textContent="Coupon applied: "+selectedCoupon.code+" — saved "+money(selectedCoupon.discount);renderSummary();}
    catch(e){selectedCoupon=null;out.textContent=e.message||"Coupon could not be validated.";renderSummary();}
  });
  root.querySelector("[data-use-coins]").addEventListener("change",e=>{
    useCoins=e.target.checked;const subtotal=window.MFCustomerV2Cart.createCartStore().snapshot().subtotal;
    const discount=selectedCoupon?selectedCoupon.discount:0;
    const applied=useCoins?Math.min(coinBalance,Math.floor(Math.max(0,subtotal-discount))):0;
    root.querySelector("[data-coin-result]").textContent=applied?"Preview saving: "+money(applied):"No coins selected.";renderSummary();
  });
  window.MFCustomerV2Checkout=Object.freeze({load,getSelection:()=>({patient:selectedPatient,address:selectedAddress,pincode:pin.value,pincodeVerified,coupon:selectedCoupon,coins:useCoins?coinBalance:0})});
  load();
})();
