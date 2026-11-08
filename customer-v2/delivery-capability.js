(() => {
  "use strict";
  async function resolve(client,pincode) {
    if(!client||!pincode)return Object.freeze({status:"unknown",sameday:false,express_30m:false,reason:"Verify a delivery PIN code first."});
    const result=await client.rpc("get_customer_delivery_capability",{p_pincode:String(pincode)});
    if(result.error)throw new Error("Live delivery partner capacity could not be checked.");
    const data=result.data||{};
    return Object.freeze({status:data.serviceable?"checked":"unavailable",available:data.serviceable===true,sameday:data.sameday===true,express_30m:data.express_30m===true,reason:data.reason||"Partner capacity is not available."});
  }
  window.MFCustomerV2DeliveryCapability=Object.freeze({resolve});
})();
