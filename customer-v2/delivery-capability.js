(() => {
  "use strict";
  async function resolve(client, pincode, items) {
    if (!client || !pincode) {
      return Object.freeze({
        status: "unknown",
        available: false,
        sameday: false,
        express_30m: false,
        reason: "Verify a delivery PIN code first."
      });
    }
    const ids = (Array.isArray(items) ? items : [])
      .map(item => Number(item && item.id))
      .filter(id => Number.isSafeInteger(id) && id > 0);
    const result = await client.rpc("get_customer_delivery_capability", {
      p_pincode: String(pincode),
      p_product_ids: ids
    });
    if (result.error) throw new Error("Live delivery partner capacity could not be checked.");
    const data = result.data || {};
    const serviceable = data.serviceable === true;
    const stockVerified = data.stock_verified === true;
    const ridersAvailable = Number(data.fresh_online_riders) > 0;
    const available = serviceable && stockVerified && ridersAvailable;
    const reason = !serviceable
      ? (data.reason || "PIN code is not in an approved service zone.")
      : !stockVerified
        ? (data.reason || "Current cart stock is not fully verified.")
        : !ridersAvailable
          ? (data.reason || "No fresh verified delivery rider is online.")
          : (data.reason || "Delivery capacity has been verified.");
    return Object.freeze({
      status: available ? "available" : (serviceable ? "unknown" : "unavailable"),
      available,
      sameday: available && data.sameday === true,
      express_30m: available && data.express_30m === true,
      reason
    });
  }
  window.MFCustomerV2DeliveryCapability = Object.freeze({ resolve });
})();
