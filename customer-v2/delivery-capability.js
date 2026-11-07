(() => {
  "use strict";
  // PIN-zone approval is not proof of pharmacy stock, rider capacity or dispatch readiness.
  // No verified partner-capacity endpoint/table is present in this V2 branch yet.
  function resolve(pinServiceability) {
    if (!pinServiceability || pinServiceability.available !== true) {
      return Object.freeze({status:"unknown",available:false,reason:"An approved PIN zone alone cannot confirm a delivery partner."});
    }
    return Object.freeze({status:"unknown",available:false,reason:"No verified live partner-capacity service is configured for this PIN code."});
  }
  window.MFCustomerV2DeliveryCapability=Object.freeze({resolve});
})();
