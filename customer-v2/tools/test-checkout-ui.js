const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Element {
  constructor(value="") { this.listeners={};this.children=[];this.value=value;this.textContent="";this.disabled=false;this.hidden=false;this.dataset={};this.checked=false; }
  addEventListener(type,fn){this.listeners[type]=fn;}
  replaceChildren(...nodes){this.children=nodes;}
  append(...nodes){this.children.push(...nodes);}
  click(){return this.listeners.click&&this.listeners.click({preventDefault(){}});}
}
const elements=new Map();
const root={
  querySelector(selector){if(!elements.has(selector))elements.set(selector,new Element(selector==="[data-checkout-pincode]"?"733140":""));return elements.get(selector);},
  querySelectorAll(selector){return selector==='input[name="checkout-speed"]'?[new Element(),new Element(),new Element()].map((x,i)=>Object.assign(x,{value:["manual","sameday","express"][i]})):[];}
};
let rows=[{id:7,qty:1,price:1,name:"Stale cart price",isRx:false}];
let rpcPayload=null,refreshes=0,opened="";
const store={
 snapshot(){return {items:rows.slice(),subtotal:rows.reduce((s,x)=>s+x.price*x.qty,0)};},
 remove(id){rows=rows.filter(x=>String(x.id)!==String(id));}
};
const address={id:10,tag:"Home",name:"Test Customer",phone:"9876543210",address1:"12 Test Road",address2:"Ward 2",landmark:"Near Park",city:"Test City",state:"West Bengal",pincode:"733140",is_default:true};
const client={
 from(table){assert.equal(table,"prescription_orders");return {select(){return this;},eq(){return this;},ilike(){return this;},order(){return this;},limit(){return Promise.resolve({data:[],error:null});}};},
 async rpc(name,payload){assert.equal(name,"create_customer_cod_order");rpcPayload=payload;return {data:{success:true,order_id:"MF-TEST-ORDER",total_amount:123.5},error:null};}
};
const window={
 supabaseClient:client,
 MFCustomerV2Cart:{createCartStore(){return store;}},
 MFCustomerV2CartUI:{refresh(){refreshes++;}},
 MFCustomerV2Auth:{async requireAuthenticatedUser(){return {authenticated:true,user:{id:"11111111-1111-4111-8111-111111111111"}};}},
 MFCustomerV2People:{create(){return {async listPatients(){return [{id:"p1",name:"Patient One",age:35}];},async listAddresses(){return [address];}};}},
 MFCustomerV2CheckoutRules:{create(){return {async checkPincode(pin){return {available:true,pincode:pin};}};}},
 crypto:{randomUUID(){return "22222222-2222-4222-8222-222222222222";}},
 MFCustomerV2App:{openView(view){opened=view;}}
};
const document={querySelector(s){return s==='[data-view="checkout"]'?root:null;},createElement(){return new Element();}};
// The mocked test checkout represents the production host; all Supabase writes remain mocked.
const context={window,document,location:{hostname:"medifinderindia.com"},console,setTimeout(){return 1;},Date,Math};
vm.runInNewContext(fs.readFileSync("customer-v2/checkout-ui.js","utf8"),context);
(async()=>{
  await new Promise(resolve=>setTimeout(resolve,0));
  await elements.get("[data-check-pincode]").click();
  assert.equal(elements.get("[data-place-cod]").disabled,false,"valid saved address and approved PIN should enable COD");
  await elements.get("[data-place-cod]").click();
  assert.equal(rpcPayload.p_items[0].medicine_id,7);
  assert.equal(rpcPayload.p_customer_phone,"9876543210");
  assert.equal(rpcPayload.p_request_id,"22222222-2222-4222-8222-222222222222");
  assert.equal(rows.length,0,"cart clears only after server confirms the order");
  assert.equal(refreshes,1);
  assert.match(elements.get("[data-checkout-status]").textContent,/₹123\.50/);
  assert.equal(elements.get("[data-place-cod]").textContent,"Order placed");
  console.log("COD checkout UI: PIN gate, RPC payload, server total and success-only cart clear passed.");
})().catch(error=>{console.error(error);process.exit(1);});
