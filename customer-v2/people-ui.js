(() => {
  "use strict";
  const root = document.querySelector('[data-view="people"]');
  if (!root) return;
  const patientList = root.querySelector("[data-patient-list]");
  const addressList = root.querySelector("[data-address-list]");
  const patientForm = root.querySelector("[data-patient-form]");
  const addressForm = root.querySelector("[data-address-form]");
  const status = root.querySelector("[data-people-status]");
  let adapter = null, user = null, patients = [], addresses = [], editingPatientId = null, editingAddressId = null;
  const $ = (selector, base) => base.querySelector(selector);
  const message = (text, error = false) => { status.textContent = text; status.dataset.error = String(error); };
  const node = (tag, cls, value) => { const el = document.createElement(tag); if (cls) el.className = cls; if (value != null) el.textContent = value; return el; };

  function renderPatients() {
    patientList.replaceChildren();
    if (!patients.length) patientList.append(node("p","v2-people-empty","No saved patients yet."));
    patients.forEach(p => {
      const card = node("article","v2-people-card");
      const info = node("div","v2-people-info");
      info.append(node("strong","",p.name),node("small","",String(p.age)+" years · "+p.gender));
      const actions=node("div","v2-people-actions");
      const edit=node("button","v2-people-secondary","Edit");edit.type="button";
      edit.addEventListener("click",()=>{editingPatientId=p.id;patientForm.elements.name.value=p.name||"";patientForm.elements.age.value=p.age??"";patientForm.elements.gender.value=p.gender||"";patientForm.querySelector('[type=submit]').textContent="Update patient";patientForm.scrollIntoView({behavior:"smooth",block:"center"});});
      const remove = node("button","v2-people-delete","Remove"); remove.type="button";
      remove.addEventListener("click",async()=>{try{await adapter.deletePatient(p.id);patients=patients.filter(x=>x.id!==p.id);renderPatients();message("Patient removed.");}catch(e){message(e.message||"Could not remove patient.",true);}});
      actions.append(edit,remove);card.append(info,actions);patientList.append(card);
    });
  }
  function renderAddresses() {
    addressList.replaceChildren();
    if (!addresses.length) addressList.append(node("p","v2-people-empty","No saved addresses yet."));
    addresses.forEach(a => {
      const card=node("article","v2-people-card");
      const info=node("div","v2-people-info");
      info.append(node("strong","",a.tag||"Address"),node("small","",a.name+" · "+a.phone),node("small","",[a.address1,a.address2,a.landmark,a.city,a.state,a.pincode].filter(Boolean).join(", ")));
      if(a.is_default) info.append(node("span","v2-people-default","DEFAULT"));
      const actions=node("div","v2-people-actions");
      const edit=node("button","v2-people-secondary","Edit");edit.type="button";
      edit.addEventListener("click",()=>{editingAddressId=a.id;["tag","name","phone","address1","address2","landmark","city","state","pincode"].forEach(k=>{if(addressForm.elements[k])addressForm.elements[k].value=a[k]||"";});addressForm.elements.is_default.checked=!!a.is_default;addressForm.querySelector('[type=submit]').textContent="Update address";addressForm.scrollIntoView({behavior:"smooth",block:"center"});});
      actions.append(edit);
      if(!a.is_default){const make=node("button","v2-people-secondary","Set default");make.type="button";make.addEventListener("click",async()=>{try{await adapter.setDefaultAddress(a.id);await refreshAddresses();message("Default address updated.");}catch(e){message(e.message||"Could not update default address.",true);}});actions.append(make);}
      const remove=node("button","v2-people-delete","Remove");remove.type="button";remove.addEventListener("click",async()=>{try{await adapter.deleteAddress(a.id);await refreshAddresses();message("Address removed.");}catch(e){message(e.message||"Could not remove address.",true);}});
      actions.append(remove);card.append(info,actions);addressList.append(card);
    });
  }
  async function refreshAddresses(){addresses=await adapter.listAddresses();renderAddresses();}
  async function load(){
    try{
      const client=window.supabaseClient;
      if(!client||!window.MFCustomerV2Auth||!window.MFCustomerV2People)throw new Error("Account services are not connected in this preview.");
      const auth=await window.MFCustomerV2Auth.requireAuthenticatedUser(client);
      if(!auth.authenticated)throw new Error("Please sign in to manage patients and addresses.");
      user=auth.user;adapter=window.MFCustomerV2People.create(client,user);
      const [p,a]=await Promise.all([adapter.listPatients(),adapter.listAddresses()]);
      patients=p;addresses=a;renderPatients();renderAddresses();message("Your saved patients and addresses are loaded.");
    }catch(e){message(e.message||"Could not load account details.",true);patientList.replaceChildren();addressList.replaceChildren();}
  }
  patientForm.addEventListener("submit",async e=>{
    e.preventDefault();if(!adapter){message("Sign in first to save patient details.",true);return;}
    const data=new FormData(patientForm);
    try{const saved=await adapter.savePatient({id:editingPatientId||undefined,name:data.get("name"),age:data.get("age"),gender:data.get("gender")});patients=[...patients.filter(p=>p.id!==saved.id),saved];renderPatients();patientForm.reset();editingPatientId=null;patientForm.querySelector('[type=submit]').textContent="Save patient";message("Patient saved securely to your account.");}
    catch(err){message(err.message||"Could not save patient.",true);}
  });
  addressForm.addEventListener("submit",async e=>{
    e.preventDefault();if(!adapter){message("Sign in first to save an address.",true);return;}
    const data=new FormData(addressForm);
    try{
      const saved=await adapter.saveAddress({id:editingAddressId||undefined,tag:data.get("tag"),name:data.get("name"),phone:data.get("phone"),address1:data.get("address1"),address2:data.get("address2"),landmark:data.get("landmark"),city:data.get("city"),state:data.get("state"),pincode:data.get("pincode"),is_default:data.get("is_default")==="on"});
      await refreshAddresses();addressForm.reset();editingAddressId=null;addressForm.querySelector('[type=submit]').textContent="Save address";message("Address saved to your account.");
    }catch(err){message(err.message||"Could not save address.",true);}
  });
  window.MFCustomerV2PeopleUI=Object.freeze({load});
  load();
})();
