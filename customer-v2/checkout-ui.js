(() => {
  "use strict";
  const root=document.querySelector('[data-view="checkout"]'); if(!root)return;
  const $=s=>root.querySelector(s);
  const patientsHost=$("[data-checkout-patients]"),addressesHost=$("[data-checkout-addresses]");
  const status=$("[data-checkout-status]"),summary=$("[data-checkout-summary]");
  const pin=$("[data-checkout-pincode]"),pinResult=$("[data-pincode-result]");
  const prescriptionSelect=$("[data-checkout-prescription]");
  const placeButton=$("[data-place-cod]");
  let rules=null,selectedPatient="self",selectedAddress="",addresses=[],patients=[],serviceability=null,loading=false,placing=false,requestId=null,authUser=null;
  const money=n=>"₹"+(Number(n)||0).toFixed(2);
  const cart=()=>window.MFCustomerV2Cart?window.MFCustomerV2Cart.createCartStore().snapshot():{items:[],subtotal:0};
  function msg(el,text,error=false){if(!el)return;el.textContent=text;el.dataset.error=String(error);}
  function option(host,name,value,label,checked,change){
    const row=document.createElement("label");row.className="v2-checkout-option";
    const input=document.createElement("input");input.type="radio";input.name=name;input.value=value;input.checked=checked;
    input.addEventListener("change",()=>change(value));
    const text=document.createElement("span");text.textContent=label;row.append(input,text);host.append(row);
  }
  function estimateFees(subtotal){
    if(subtotal>=499)return {delivery:0,shipping:0,platform:0,processing:0,cod:10};
    return subtotal<150?{delivery:30,shipping:7,platform:4,processing:2,cod:10}:{delivery:30,shipping:4,platform:3,processing:2.5,cod:10};
  }
  function renderSummary(){
    const state=cart(),subtotal=Number(state.subtotal)||0;summary.replaceChildren();
    if(!state.items.length){summary.textContent="Your cart is empty.";placeButton.disabled=true;return;}
    state.items.forEach(item=>{
      const line=document.createElement("div");line.className="v2-checkout-summary-line";
      const n=document.createElement("span");n.textContent=(item.name||"Product")+" × "+item.qty;
      const v=document.createElement("strong");v.textContent=money(item.price*item.qty);line.append(n,v);summary.append(line);
    });
    const fees=estimateFees(subtotal);
    const row=(label,value)=>{const line=document.createElement("div");line.className="v2-checkout-summary-line";const a=document.createElement("span"),b=document.createElement("strong");a.textContent=label;b.textContent=value;line.append(a,b);summary.append(line);};
    row("Items subtotal",money(subtotal));
    row("Delivery fee",money(fees.delivery));
    row("Shipping fee",money(fees.shipping));
    row("Platform fee",money(fees.platform));
    row("Processing fee",money(fees.processing));
    row("COD fee",money(fees.cod));
    row("Estimated payable",money(subtotal+fees.delivery+fees.shipping+fees.platform+fees.processing+fees.cod));
    const hint=document.createElement("p");hint.className="v2-checkout-hint";hint.textContent="Final prices and stock are rechecked securely by MediFinder before the order is saved.";summary.append(hint);
    placeButton.disabled=placing||!addresses.some(a=>String(a.id)===selectedAddress)||!serviceability||!serviceability.available;
  }
  async function loadPrescriptions(){
    prescriptionSelect.replaceChildren();
    const first=document.createElement("option");first.value="";first.textContent="Select an uploaded prescription";prescriptionSelect.append(first);
    const result=await window.supabaseClient.from("prescription_orders").select("id,prescription_url,status,created_at").eq("user_id",authUser.id).in("status",["pending","Pending","accepted","Accepted"]).order("created_at",{ascending:false}).limit(30);
    if(result.error)throw result.error;
    (result.data||[]).forEach(row=>{
      const opt=document.createElement("option");opt.value=row.prescription_url;
      opt.textContent="Prescription · "+(row.status||"Pending")+" · "+(row.created_at?new Date(row.created_at).toLocaleDateString():"");
      prescriptionSelect.append(opt);
    });
    if(!result.data||!result.data.length){const none=document.createElement("option");none.value="";none.textContent="No saved prescription — upload one first";prescriptionSelect.append(none);}
  }
  async function updateSpeedOptions(){
    const hint=$("[data-speed-result]");if(hint)hint.textContent="Standard delivery only. Same Day and 30-minute delivery are not enabled for this checkout yet.";
    root.querySelectorAll('input[name="checkout-speed"]').forEach(input=>{input.disabled=input.value!=="manual";input.checked=input.value==="manual";});
  }
  async function checkPin(){
    serviceability=null;pin.value=pin.value.replace(/\D/g,"").slice(0,6);
    if(!rules){msg(pinResult,"Account services are not connected.",true);return;}
    const selected=addresses.find(a=>String(a.id)===selectedAddress);
    if(!/^[1-9]\d{5}$/.test(pin.value)){msg(pinResult,"Enter a valid 6-digit PIN code.",true);renderSummary();return;}
    if(selected&&String(selected.pincode)!==pin.value){msg(pinResult,"PIN code must match the selected saved delivery address.",true);renderSummary();return;}
    const btn=$("[data-check-pincode]");btn.disabled=true;btn.textContent="Checking…";
    try{
      serviceability=await rules.checkPincode(pin.value);
      if(serviceability.available)msg(pinResult,"This PIN is in an approved MediFinder service zone. Standard COD checkout is available.");
      else msg(pinResult,"This PIN is not in an approved delivery zone. An order cannot be placed here.",true);
    }catch(e){msg(pinResult,e.message||"Could not verify delivery availability.",true);}
    finally{btn.disabled=false;btn.textContent="Check delivery availability";renderSummary();}
  }
  async function load(){
    if(loading)return;loading=true;patientsHost.replaceChildren();addressesHost.replaceChildren();
    try{
      const client=window.supabaseClient;
      if(!client||!window.MFCustomerV2Auth||!window.MFCustomerV2People||!window.MFCustomerV2CheckoutRules)throw new Error("Secure account services are unavailable.");
      const auth=await window.MFCustomerV2Auth.requireAuthenticatedUser(client);
      if(!auth.authenticated||!auth.user)throw new Error("Please sign in before checkout.");
      authUser=auth.user;
      const people=window.MFCustomerV2People.create(client,auth.user);rules=window.MFCustomerV2CheckoutRules.create(client,auth.user);
      const [p,a]=await Promise.all([people.listPatients(),people.listAddresses()]);
      patients=p;addresses=a;
      option(patientsHost,"checkout-patient","self","Myself",selectedPatient==="self",v=>{selectedPatient=v;});
      patients.forEach(person=>option(patientsHost,"checkout-patient",String(person.id),person.name+" · "+person.age+" years",selectedPatient===String(person.id),v=>{selectedPatient=v;}));
      if(!patients.length){const hint=document.createElement("p");hint.className="v2-checkout-hint";hint.textContent="No family patients saved. You can continue with Myself.";patientsHost.append(hint);}
      if(!selectedAddress){const preferred=a.find(x=>x.is_default)||a[0];if(preferred)selectedAddress=String(preferred.id);}
      a.forEach(address=>option(addressesHost,"checkout-address",String(address.id),(address.tag||"Address")+" — "+[address.address1,address.address2,address.city,address.pincode].filter(Boolean).join(", "),selectedAddress===String(address.id),v=>{
        selectedAddress=v;const chosen=addresses.find(x=>String(x.id)===v);serviceability=null;
        if(chosen){pin.value=String(chosen.pincode||"");msg(pinResult,"Verify this saved address PIN before placing your order.");}
        renderSummary();
      }));
      if(!a.length){const hint=document.createElement("p");hint.className="v2-checkout-hint";hint.textContent="Add a delivery address in Patients & Addresses before checkout.";addressesHost.append(hint);}
      const chosen=a.find(x=>String(x.id)===selectedAddress);if(chosen)pin.value=String(chosen.pincode||"");
      await loadPrescriptions();await updateSpeedOptions();
      msg(status,"Saved details loaded. Verify your PIN and review the COD total.");
    }catch(e){rules=null;msg(status,e.message||"Could not load checkout details.",true);}
    finally{loading=false;renderSummary();}
  }
  async function placeOrder(){
    if(placing)return;
    const state=cart();if(!state.items.length){msg(status,"Your cart is empty.",true);return;}
    if(!authUser||!rules||!window.supabaseClient){msg(status,"Please sign in again before checkout.",true);return;}
    const address=addresses.find(a=>String(a.id)===selectedAddress);
    if(!address){msg(status,"Choose a saved delivery address first.",true);return;}
    if(!serviceability||!serviceability.available||serviceability.pincode!==String(address.pincode)){msg(status,"Verify the selected address PIN before placing the order.",true);return;}
    const needsRx=state.items.some(item=>item.isRx===true||item.isRx==="true");
    const prescriptionPath=prescriptionSelect.value||null;
    if(needsRx&&!prescriptionPath){msg(status,"This cart includes a prescription medicine. Upload and select your prescription before checkout.",true);return;}
    const patient=selectedPatient==="self"?null:patients.find(x=>String(x.id)===selectedPatient);
    const request=window.crypto&&typeof window.crypto.randomUUID==="function"?window.crypto.randomUUID():("mf-"+Date.now()+"-"+Math.random().toString(36).slice(2));
    if(!requestId)requestId=request;
    placing=true;placeButton.disabled=true;placeButton.textContent="Checking stock & placing order…";
    msg(status,"Securely checking current product prices, seller approval and stock…");
    try{
      const payload={
        p_items:state.items.map(item=>({medicine_id:item.id,quantity:item.qty})),
        p_customer_name:address.name,
        p_customer_phone:String(address.phone||"").replace(/\D/g,""),
        p_address1:address.address1,
        p_address2:address.address2||null,
        p_landmark:address.landmark||null,
        p_city:address.city,
        p_state:address.state||"West Bengal",
        p_pincode:String(address.pincode||""),
        p_patient_name:patient?patient.name:null,
        p_prescription_path:prescriptionPath,
        p_request_id:requestId,
        p_user_lat:address.latitude||address.lat||null,
        p_user_lon:address.longitude||address.lng||null
      };
      const result=await window.supabaseClient.rpc("create_customer_cod_order",payload);
      if(result.error)throw result.error;
      const data=result.data||{};
      if(data.success!==true||!data.order_id)throw new Error("The server did not confirm this order. Please retry.");
      const store=window.MFCustomerV2Cart.createCartStore();state.items.forEach(item=>store.remove(item.id));
      requestId=null;
      if(window.MFCustomerV2CartUI)window.MFCustomerV2CartUI.refresh();
      msg(status,"Order "+data.order_id+" placed successfully. Pay "+money(data.total_amount)+" in cash on delivery.");
      const confirmation=$("[data-order-confirmation]");
      if(confirmation){confirmation.hidden=false;confirmation.textContent="Order confirmed · "+data.order_id+" · Cash on Delivery · "+money(data.total_amount);}
      placeButton.textContent="Order placed";
      setTimeout(()=>{if(window.MFCustomerV2App)window.MFCustomerV2App.openView("orders");},900);
    }catch(e){
      msg(status,e.message||"Could not place the order. Your cart has been kept unchanged.",true);
      requestId=requestId||null;
    }finally{
      placing=false;
      if(placeButton.textContent!=="Order placed")placeButton.textContent="Place order · Cash on Delivery";
      renderSummary();
    }
  }
  pin.addEventListener("input",()=>{pin.value=pin.value.replace(/\D/g,"").slice(0,6);serviceability=null;msg(pinResult,"PIN changed. Verify delivery availability again.");renderSummary();});
  $("[data-check-pincode]").addEventListener("click",checkPin);
  placeButton.addEventListener("click",placeOrder);
  window.MFCustomerV2Checkout=Object.freeze({load,getSelection:()=>({patient:selectedPatient,address:selectedAddress,pincode:pin.value,serviceability})});
  load();
})();