/* Admin controls for verified nurse rates, ambulance fare cards and delivery capacity. */
(function(){
  "use strict";
  if(!Array.isArray(NAV)||!VIEWS||!Actions||!supabase) return;
  NAV.push({group:"Service Operations",items:[{id:"servicecontracts",icon:"✓",label:"Service Rates & Capacity"}]});
  const safe=(v)=>String(v??"");
  async function loadContracts(){
    const [n,a,c,z]=await Promise.all([
      supabase.from("nurse_service_rates").select("id,nurse_id,service_type,rate,rate_unit,service_charge,is_verified,is_active,nurses(name)").order("updated_at",{ascending:false}).limit(200),
      supabase.from("ambulance_rate_cards").select("*").order("vehicle_type"),
      supabase.from("delivery_partner_capacity").select("*,service_zones(name,pincode)").order("updated_at",{ascending:false}),
      supabase.from("service_zones").select("id,name,pincode,is_active").eq("is_active",true).order("name")
    ]);
    const errors=[n.error,a.error,c.error,z.error].filter(Boolean);
    if(errors.length) throw new Error(errors.map(x=>x.message).join(" · "));
    return {nurses:n.data||[],ambulances:a.data||[],capacity:c.data||[],zones:z.data||[]};
  }
  VIEWS.servicecontracts=()=>{
    const d=STATE.viewState.servicecontractsData||{nurses:[],ambulances:[],capacity:[],zones:[]};
    const nurseOptions=d.nurses.map(x=>'<option value="'+esc(x.nurse_id)+'">'+esc((x.nurses&&x.nurses.name)||x.nurse_id)+' · '+esc(x.service_type)+'</option>').join("");
    const zoneOptions=d.zones.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name||x.pincode||x.id)+' · '+esc(x.pincode||"")+'</option>').join("");
    const nurseRows=d.nurses.map(x=>({name:(x.nurses&&x.nurses.name)||x.nurse_id,type:x.service_type,rate:money(x.rate),unit:x.rate_unit,fee:money(x.service_charge),verified:x.is_verified?"Verified":"Unverified",active:x.is_active?"Active":"Inactive"}));
    const ambRows=d.ambulances.map(x=>({vehicle:x.vehicle_type,base:money(x.base_fare),km:money(x.per_km),minimum:money(x.minimum_fare),fee:money(x.service_charge),verified:x.is_verified?"Verified":"Unverified",active:x.is_active?"Active":"Inactive"}));
    const capRows=d.capacity.map(x=>({zone:(x.service_zones&&x.service_zones.name)||x.service_zone_id,level:x.service_level,partners:x.active_partners,capacity:x.max_concurrent_orders,orders:x.current_orders,verified:x.is_verified?"Verified":"Unverified",active:x.is_active?"Active":"Inactive"}));
    return '<div class="view-head"><h1>Service Rates & Capacity</h1><p>Publish only rates and partner capacity that have been checked by the MediFinder admin team.</p></div>'+
      '<div class="card"><div class="card-head"><h3>Nurse service rate</h3></div><div class="card-body"><div class="form-grid">'+
      '<div class="field"><label>Nurse + service (existing verified partner)</label><select id="scNurse">'+(nurseOptions||'<option value="">No nurse rates yet</option>')+'</select></div>'+
      '<div class="field"><label>Service type</label><input id="scNurseType" maxlength="80" placeholder="e.g. Home nursing"></div>'+
      '<div class="field"><label>Rate (₹)</label><input id="scNurseRate" type="number" min="1" step="0.01"></div>'+
      '<div class="field"><label>Rate unit</label><select id="scNurseUnit"><option value="hour">Per hour</option><option value="visit">Per visit</option><option value="day">Per day</option><option value="week">Per week</option><option value="month">Per month</option></select></div>'+
      '<div class="field"><label>Service charge (₹)</label><input id="scNurseFee" type="number" min="0" step="0.01" value="0"></div>'+
      '<div class="field"><label><input id="scNurseVerified" type="checkbox"> Rate verified</label><label><input id="scNurseActive" type="checkbox" checked> Active</label></div></div><button class="btn primary" data-act="sc-save-nurse">Save nurse rate</button></div></div>'+
      '<div class="card"><div class="card-head"><h3>Ambulance fare card</h3></div><div class="card-body"><div class="form-grid">'+
      '<div class="field"><label>Vehicle type</label><select id="scVehicle"><option>Basic</option><option>ALS</option><option>BLS</option><option>ICU</option><option>Patient Transport</option></select></div>'+
      '<div class="field"><label>Base fare (₹)</label><input id="scBase" type="number" min="0" step="0.01"></div>'+
      '<div class="field"><label>Per km (₹)</label><input id="scPerKm" type="number" min="0" step="0.01"></div>'+
      '<div class="field"><label>Minimum fare (₹)</label><input id="scMinimum" type="number" min="0" step="0.01"></div>'+
      '<div class="field"><label>Service charge (₹)</label><input id="scAmbFee" type="number" min="0" step="0.01" value="0"></div>'+
      '<div class="field"><label><input id="scAmbVerified" type="checkbox"> Fare verified</label><label><input id="scAmbActive" type="checkbox" checked> Active</label></div></div><button class="btn primary" data-act="sc-save-ambulance">Save ambulance fare</button></div></div>'+
      '<div class="card"><div class="card-head"><h3>Delivery partner capacity</h3></div><div class="card-body"><div class="form-grid">'+
      '<div class="field"><label>Service zone</label><select id="scZone">'+(zoneOptions||'<option value="">No active service zones</option>')+'</select></div>'+
      '<div class="field"><label>Service level</label><select id="scLevel"><option value="sameday">Same Day</option><option value="express_30m">30 Minutes</option></select></div>'+
      '<div class="field"><label>Active partners</label><input id="scPartners" type="number" min="0" step="1"></div>'+
      '<div class="field"><label>Maximum concurrent orders</label><input id="scMax" type="number" min="0" step="1"></div>'+
      '<div class="field"><label>Current orders</label><input id="scCurrent" type="number" min="0" step="1" value="0"></div>'+
      '<div class="field"><label><input id="scCapVerified" type="checkbox"> Capacity verified</label><label><input id="scCapActive" type="checkbox" checked> Active</label></div></div><button class="btn primary" data-act="sc-save-capacity">Save delivery capacity</button><p class="hint">Set values only after confirming active partners and dispatch capacity. Do not count unverified riders.</p></div></div>'+
      '<div class="card"><div class="card-head"><h3>Current nurse rates</h3></div><div class="card-body pad0">'+renderTable("sc-nurse",[{key:"name",label:"Nurse"},{key:"type",label:"Service"},{key:"rate",label:"Rate"},{key:"unit",label:"Unit"},{key:"fee",label:"Fee"},{key:"verified",label:"Verification"},{key:"active",label:"Status"}],nurseRows,{emptyText:"No nurse rates entered."})+'</div></div>'+
      '<div class="card"><div class="card-head"><h3>Ambulance fare cards</h3></div><div class="card-body pad0">'+renderTable("sc-ambulance",[{key:"vehicle",label:"Vehicle"},{key:"base",label:"Base"},{key:"km",label:"Per km"},{key:"minimum",label:"Minimum"},{key:"fee",label:"Fee"},{key:"verified",label:"Verification"},{key:"active",label:"Status"}],ambRows,{emptyText:"No fare cards entered."})+'</div></div>'+
      '<div class="card"><div class="card-head"><h3>Delivery capacity</h3></div><div class="card-body pad0">'+renderTable("sc-capacity",[{key:"zone",label:"Zone"},{key:"level",label:"Service"},{key:"partners",label:"Partners"},{key:"capacity",label:"Max orders"},{key:"orders",label:"Current"},{key:"verified",label:"Verification"},{key:"active",label:"Status"}],capRows,{emptyText:"No verified capacity records."})+'</div></div>';
  };
  async function refresh(){STATE.viewState.servicecontractsData=await loadContracts();render();}
  Actions["sc-save-nurse"]=async()=>{
    const id=document.getElementById("scNurse").value,type=document.getElementById("scNurseType").value.trim(),rate=Number(document.getElementById("scNurseRate").value),unit=document.getElementById("scNurseUnit").value,fee=Number(document.getElementById("scNurseFee").value||0);
    if(!id||!type||!(rate>0)||fee<0)throw new Error("Select a nurse and enter a valid service type, rate and fee.");
    const {data:base,error:readError}=await supabase.from("nurse_service_rates").select("id").eq("nurse_id",id).eq("service_type",type).maybeSingle();if(readError)throw readError;
    const payload={nurse_id:id,service_type:type,rate,rate_unit:unit,service_charge:fee,is_verified:document.getElementById("scNurseVerified").checked,is_active:document.getElementById("scNurseActive").checked,updated_at:new Date().toISOString()};
    const result=base?await supabase.from("nurse_service_rates").update(payload).eq("id",base.id):await supabase.from("nurse_service_rates").insert(payload);
    if(result.error)throw result.error;toast("Nurse rate saved.");await refresh();
  };
  Actions["sc-save-ambulance"]=async()=>{
    const vehicle=document.getElementById("scVehicle").value,base_fare=Number(document.getElementById("scBase").value),per_km=Number(document.getElementById("scPerKm").value),minimum_fare=Number(document.getElementById("scMinimum").value),service_charge=Number(document.getElementById("scAmbFee").value||0);
    if([base_fare,per_km,minimum_fare,service_charge].some(x=>!Number.isFinite(x)||x<0)||minimum_fare<=0)throw new Error("Enter valid non-negative fares and a minimum fare above zero.");
    const {data:old,error}=await supabase.from("ambulance_rate_cards").select("id").eq("vehicle_type",vehicle).maybeSingle();if(error)throw error;
    const payload={vehicle_type:vehicle,base_fare,per_km,minimum_fare,service_charge,is_verified:document.getElementById("scAmbVerified").checked,is_active:document.getElementById("scAmbActive").checked,updated_at:new Date().toISOString()};
    const result=old?await supabase.from("ambulance_rate_cards").update(payload).eq("id",old.id):await supabase.from("ambulance_rate_cards").insert(payload);
    if(result.error)throw result.error;toast("Ambulance fare card saved.");await refresh();
  };
  Actions["sc-save-capacity"]=async()=>{
    const service_zone_id=document.getElementById("scZone").value,service_level=document.getElementById("scLevel").value,active_partners=Number(document.getElementById("scPartners").value),max_concurrent_orders=Number(document.getElementById("scMax").value),current_orders=Number(document.getElementById("scCurrent").value||0);
    if(!service_zone_id||![active_partners,max_concurrent_orders,current_orders].every(x=>Number.isInteger(x)&&x>=0)||max_concurrent_orders<=0||active_partners<=0||current_orders>max_concurrent_orders)throw new Error("Select a zone and enter valid partner and order capacity values.");
    const {data:old,error}=await supabase.from("delivery_partner_capacity").select("id").eq("service_zone_id",service_zone_id).eq("service_level",service_level).maybeSingle();if(error)throw error;
    const is_verified=document.getElementById("scCapVerified").checked;
    const payload={service_zone_id,service_level,active_partners,max_concurrent_orders,current_orders,is_verified,is_active:document.getElementById("scCapActive").checked,verified_at:is_verified?new Date().toISOString():null,updated_at:new Date().toISOString()};
    const result=old?await supabase.from("delivery_partner_capacity").update(payload).eq("id",old.id):await supabase.from("delivery_partner_capacity").insert(payload);
    if(result.error)throw result.error;toast("Delivery capacity saved.");await refresh();
  };
  const priorRender=render;
  document.addEventListener("DOMContentLoaded",()=>{if(STATE.view==="servicecontracts")refresh().catch(e=>toast("Could not load service contracts: "+e.message,"danger"));});
  document.addEventListener("click",e=>{if(e.target.closest('[data-nav="servicecontracts"]'))setTimeout(()=>refresh().catch(x=>toast("Could not load service contracts: "+x.message,"danger")),0);});
})();