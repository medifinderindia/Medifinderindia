(() => {
  "use strict";
  const money=n=>"₹"+(Number(n)||0).toFixed(2);
  function create(client,user){
    if(!client||!user||!user.id)throw new Error("Sign in is required.");
    async function checkPincode(pin){
      const p=String(pin||"").replace(/\D/g,"");
      if(!/^[1-9]\d{5}$/.test(p))throw new Error("Enter a valid 6-digit PIN code.");
      const {data,error}=await client.from("service_zones").select("pin, dist, status, is_active").eq("pin",p).eq("is_active",true).eq("status","approved").maybeSingle();
      if(error)throw new Error("Could not verify delivery serviceability. Please retry.");
      if(!data||String(data.status||"").toLowerCase()!=="approved"||data.is_active!==true)return {available:false,pincode:p};
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

    // Fetch live courier rates from the authenticated Shiprocket Edge Function.
    // A quote is indicative only; server-side order creation must re-rate before charging.
    async function quoteShiprocketDelivery(items, deliveryPincode, cod = false) {
      const rows = Array.isArray(items) ? items : [];
      const destination = String(deliveryPincode || "").replace(/\D/g, "");
      if (!/^[1-9]\d{5}$/.test(destination)) throw new Error("Enter a valid delivery PIN code.");
      if (!rows.length) throw new Error("Your cart is empty.");
      const groups = new Map();
      for (const item of rows) {
        const merchantId = String(item.merchantId || item.merchant_id || "");
        if (!merchantId) throw new Error("A cart item is missing its verified shop. Delivery rate cannot be quoted.");
        const current = groups.get(merchantId) || { merchantId, weight: 0 };
        current.weight += Math.max(0.1, Number(item.weight) || 0.5) * Math.max(1, Number(item.qty) || 1);
        groups.set(merchantId, current);
      }
      const ids = [...groups.keys()];
      const { data: merchants, error } = await client.from("merchants").select("id,pincode").in("id", ids);
      if (error) throw new Error("Could not verify shop pickup PIN codes.");
      const byId = new Map((merchants || []).map(row => [String(row.id), row]));
      let total = 0;
      const quotes = [];
      for (const group of groups.values()) {
        const merchant = byId.get(group.merchantId);
        const pickup = String(merchant && merchant.pincode || "").replace(/\D/g, "");
        if (!/^[1-9]\d{5}$/.test(pickup)) throw new Error("A shop pickup PIN code is not verified. Delivery fee remains unconfirmed.");
        const response = await client.functions.invoke("shiprocket", {
          body: { action: "rate_verified", merchant_id: group.merchantId, delivery_postcode: destination, weight: group.weight, cod: !!cod }
        });
        if (response.error) throw new Error("Live courier rate could not be fetched. Please retry.");
        const data = response.data || {};
        if (data.success !== true || data.serviceable !== true || !(Number(data.rate) >= 0)) {
          throw new Error(data.error || "No courier rate is available for this shop and PIN code.");
        }
        total += Number(data.rate);
        quotes.push({ merchantId: group.merchantId, pickupPincode: pickup, deliveryPincode: destination, weightKg: group.weight, rate: Number(data.rate), courier: data.courier_name || "Courier", etd: data.etd || null });
      }
      return Object.freeze({ status: "quoted", confirmed: false, source: "Shiprocket live rate API", currency: "INR", delivery: total, total, quotes, message: "Indicative live courier quote only. Final fee must be rechecked at server-side order placement." });
    }
    async function estimateDeliveryFees(distanceKm, subtotal) {
      return Object.freeze({ status:"unconfirmed", confirmed:false, delivery:null, total:null, subtotal:Number(subtotal)||0, distanceKm:Number.isFinite(Number(distanceKm))?Number(distanceKm):null, message:"Use a live Shiprocket quote for a verified shop and destination before showing a delivery charge." });
    }
    return Object.freeze({checkPincode,validateCoupon,getCoinBalance,estimateDeliveryFees,quoteShiprocketDelivery});
  }
  window.MFCustomerV2CheckoutRules=Object.freeze({create});
})();
