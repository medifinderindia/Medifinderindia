(() => {
  "use strict";
  const root=document.querySelector('[data-view="checkout"]');
  if(!root)return;
  const patientsHost=root.querySelector("[data-checkout-patients]");
  const addressesHost=root.querySelector("[data-checkout-addresses]");
  const status=root.querySelector("[data-checkout-status]");
  const summary=root.querySelector("[data-checkout-summary]");
  let adapter=null, selectedPatient="self", selectedAddress="";
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
      const [patients,addresses]=await Promise.all([adapter.listPatients(),adapter.listAddresses()]);
      option(patientsHost,"checkout-patient","self","Myself",selectedPatient==="self",v=>selectedPatient=v);
      patients.forEach(p=>option(patientsHost,"checkout-patient",String(p.id),p.name+" · "+p.age+" years",selectedPatient===String(p.id),v=>selectedPatient=v));
      if(!patients.length){const hint=document.createElement("p");hint.className="v2-checkout-hint";hint.textContent="No family patients saved. You can continue with Myself.";patientsHost.append(hint);}
      addresses.forEach(a=>option(addressesHost,"checkout-address",String(a.id),(a.tag||"Address")+" — "+[a.address1,a.address2,a.city,a.pincode].filter(Boolean).join(", "),selectedAddress===String(a.id)||(!selectedAddress&&!!a.is_default),v=>selectedAddress=v));
      if(!selectedAddress){const preferred=addresses.find(a=>a.is_default)||addresses[0];if(preferred)selectedAddress=String(preferred.id);}
      if(!addresses.length){const hint=document.createElement("p");hint.className="v2-checkout-hint";hint.textContent="Add a saved address from Patients & Addresses before proceeding.";addressesHost.append(hint);}
      // Re-render after resolving default address so radio selection is correct.
      if(addresses.length){addressesHost.replaceChildren();addresses.forEach(a=>option(addressesHost,"checkout-address",String(a.id),(a.tag||"Address")+" — "+[a.address1,a.address2,a.city,a.pincode].filter(Boolean).join(", "),selectedAddress===String(a.id),v=>selectedAddress=v));}
      setStatus("Saved details loaded. Confirm selections and PIN code; delivery serviceability is not yet connected.");
    }catch(e){setStatus(e.message||"Could not load delivery details.",true);}
    renderSummary();
  }
  const pin=root.querySelector("[data-checkout-pincode]");
  pin.addEventListener("input",()=>{pin.value=pin.value.replace(/\\D/g,"").slice(0,6);});
  window.MFCustomerV2Checkout=Object.freeze({load,getSelection:()=>({patient:selectedPatient,address:selectedAddress,pincode:pin.value})});
  load();
})();
