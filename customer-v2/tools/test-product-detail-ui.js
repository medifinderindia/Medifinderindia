const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Element {
  constructor() {
    this.listeners={};this.dataset={};this.children=[];this.hidden=false;this.disabled=false;
    this.textContent="";this.value="";this.style={};this.className="";
    this.classList={toggle(){}};
  }
  addEventListener(name,fn){this.listeners[name]=fn;}
  replaceChildren(...nodes){this.children=nodes;}
  append(...nodes){this.children.push(...nodes);}
  removeAttribute(name){delete this[name];}
  setAttribute(name,value){this[name]=value;}
  querySelectorAll(){return this.children;}
  click(name="click"){if(this.listeners[name])return this.listeners[name]({preventDefault(){},stopPropagation(){}});}
}
const elements=new Map();
const root={querySelector(selector){if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector);}};
const added=[];let opened="",refreshed=0;
const product={id:41,product_name:"Test Health Product",selling_price:42,mrp:50,stock_qty:5,status:"Approved",
 image_url:"https://example.invalid/product.png",image_url_2:"https://example.invalid/product-2.png",
 description:"Verified catalogue description",merchant_id:7,prescription_req:"yes"};
const client={
 from(table){
  if(table==="medicines")return {select(){return this;},eq(){return this;},ilike(){return this;},async maybeSingle(){return {data:product,error:null};}};
  if(table==="merchants_public")return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{id:7,shop_name:"Verified Test Pharmacy",city:"Test City",state:"West Bengal",cod_available:true},error:null};}};
  if(table==="product_reviews")return {select(){return this;},eq(){return this;},order(){return this;},limit(){return Promise.resolve({data:[{id:"r1",user_name:"Customer",rating:5,review_text:"Helpful service",created_at:"2026-11-01T00:00:00Z"}],error:null});}};
  throw new Error("Unexpected table "+table);
 }
};
const window={
 supabaseClient:client,
 MFCustomerV2Cart:{createCartStore(){return {snapshot(){return {items:[]};},add(p){added.push(p);}};}},
 MFCustomerV2CartUI:{refresh(){refreshed++;}},
 MFCustomerV2App:{openView(v){opened=v;}}
};
const document={querySelector(s){return s==='[data-view="product"]'?root:null;},createElement(){return new Element();}};
const context={window,document,console,setTimeout(){return 1;},Date,Math};
vm.runInNewContext(fs.readFileSync("customer-v2/product-detail-ui.js","utf8"),context);
(async()=>{
 const opening=window.MFCustomerV2ProductDetail.open({id:"41",name:"Catalogue card",price:"42",stock:"5"});
 assert.equal(opened,"product","Product detail must open immediately while live data refreshes");
 await opening;
 assert.equal(elements.get("[data-product-title]").textContent,"Test Health Product");
 assert.equal(elements.get("[data-product-price]").textContent,"₹42.00");
 assert.equal(elements.get("[data-product-rx]").hidden,false,"lowercase prescription flag must be recognised");
 assert.equal(elements.get("[data-product-thumbnails]").children.length,2,"all available product images should be rendered");
 elements.get("[data-product-thumbnails]").children[1].click();
 assert.equal(elements.get("[data-product-image]").src,"https://example.invalid/product-2.png");
 assert.match(elements.get("[data-product-shop]").children[1].textContent,/Verified Test Pharmacy/);
 assert.match(elements.get("[data-product-reviews]").children[1].textContent,/5\.0 \/ 5/);
 elements.get("[data-product-plus]").click();
 elements.get("[data-product-add]").click();
 assert.equal(added.length,2,"quantity selector should add the selected quantity");
 assert.equal(added[0].id,41);
 assert.equal(refreshed,1);
 console.log("Product detail: immediate navigation, authoritative product, image gallery, seller, reviews, Rx flag and cart action passed.");
})().catch(error=>{console.error(error);process.exit(1);});
