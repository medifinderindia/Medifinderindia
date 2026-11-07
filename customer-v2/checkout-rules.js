(() => {
  "use strict";
  const money=n=>"₹"+(Number(n)||0).toFixed(2);
  function create(client,user){
    if(!client||!user||!user.id)throw new Error("Sign in is required.");
    async function checkPincode(pin){
      const p=String(pin||"").replace(/\D/g,"");
      if(!/^[1-9]\d{5}$/.test(p))throw new Error("Enter a valid 6-digit PIN code.");
      const {data,error}=await client.from("service_zones").select("pin, dist, status").eq("pin",p).maybeSingle();
      if(error)throw new Error("Could not verify delivery serviceability. Please retry.");
      if(!data||String(data.status||"").toLowerCase()!=="approved")return {available:false,pincode:p};
      return {available:true,pincode:p,distanceKm:data.dist==null?null:Number(data.dist)};
    }
    async function validateCoupon(code,subtotal){
      const couponCode=String(code||"").trim().toUpperCase();
      if(!couponCode)throw new Error("Enter a coupon code.");
      if(!(Number(subtotal)>0))throw new Error("Add products before applying a coupon.");
      let row=null,source=null;
      const personal=await client.from("user_coupons").select("*").eq("user_id",user.id).eq("code",couponCode).maybeSingle();
      if(personal.error)throw new Error("Could not validate your coupon. Please retry.");
      if(personal.data){row=personal.data;source="personal";}
      if(!row){
        const pub=await client.from("coupons").select("*").eq("code",couponCode).eq("is_active",true).maybeSingle();
        if(pub.error)throw new Error("Could not validate this coupon. Please retry.");
        if(pub.data){row=pub.data;source="public";}
      }
      if(!row||row.is_used)throw new Error("Invalid, expired or already-used coupon.");
      const now=Date.now();
      const start=row.start_date||row.valid_from,end=row.end_date||row.expiry_date||row.valid_until;
      if(start&&new Date(start).getTime()>now)throw new Error("This coupon is not active yet.");
      if(end&&new Date(end).getTime()<now)throw new Error("This coupon has expired.");
      const min=Number(row.min_order_amount||row.min_order||0);
      if(min&&subtotal<min)throw new Error("Minimum order "+money(min)+" required.");
      let discount;
      if(String(row.discount_type||"").toLowerCase()==="percentage"){
        discount=Math.min(subtotal*Number(row.discount_value||row.discount_percent||0)/100,Number(row.max_discount_amount||Infinity),subtotal);
      }else discount=Math.min(Number(row.discount_value||row.discount_amount||0),subtotal);
      if(!(discount>0))throw new Error("This coupon does not provide a valid discount.");
      return {code:couponCode,source,id:row.id,discount};
    }
    async function getCoinBalance(){
      const {data,error}=await client.from("profiles").select("coins").eq("id",user.id).maybeSingle();
      if(error)throw new Error("Could not load Tablet Coin balance.");
      return Math.max(0,Number(data&&data.coins)||0);
    }
    return Object.freeze({checkPincode,validateCoupon,getCoinBalance});
  }
  window.MFCustomerV2CheckoutRules=Object.freeze({create});
})();
