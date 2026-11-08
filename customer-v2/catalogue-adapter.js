(() => {
  "use strict";

  /**
   * Adapter for the existing MediFinder customer catalogue contract.
   * The caller must pass the already-authenticated shared Supabase client.
   * This module never creates a client or changes auth/session state.
   */
  function createHomeCatalogueProvider(supabase) {
    if (!supabase || typeof supabase.from !== "function") {
      throw new Error("The existing authenticated Supabase client is required.");
    }

    return async function loadApprovedProducts(options = {}) {
      const merchantId = options.merchantId || null;
      const instrumentMode = options.instrumentMode === true;
      const limit = merchantId ? 300 : 120;

      let query = supabase
        .from("medicines")
        .select("*")
        .eq("status", "Approved")
        .or("is_visible.eq.true,is_visible.is.null")
        .order("id", { ascending: false })
        .limit(limit);

      if (merchantId) query = query.eq("merchant_id", merchantId);
      if (instrumentMode) query = query.eq("product_type", "Instrument");
      if (options.signal && typeof query.abortSignal === "function") {
        query = query.abortSignal(options.signal);
      }

      const { data, error } = await query;
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    };
  }

  window.MFCustomerV2Catalogue = Object.freeze({ createHomeCatalogueProvider });
})();
