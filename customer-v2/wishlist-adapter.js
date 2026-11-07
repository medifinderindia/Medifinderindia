(() => {
  "use strict";

  const STORAGE_KEY = "medi_wishlist";

  function readLocal(storage) {
    try {
      const value = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(value) ? value.map(String) : [];
    } catch (_) {
      return [];
    }
  }

  function createWishlistAdapter(options = {}) {
    const client = options.supabase;
    const getUserId = options.getUserId;
    const storage = options.storage || window.localStorage;

    async function getSavedIds() {
      let ids = readLocal(storage);
      if (!client || typeof getUserId !== "function") return ids;
      const uid = await getUserId();
      if (!uid) return ids;
      const { data, error } = await client.from("user_wishlist")
        .select("medicine_id").eq("user_id", uid);
      if (error) throw error;
      if (Array.isArray(data)) {
        ids = data.map(row => String(row.medicine_id));
        storage.setItem(STORAGE_KEY, JSON.stringify(ids));
      }
      return ids;
    }

    async function setSaved(productId, shouldSave) {
      const id = String(productId || "");
      if (!id) throw new Error("A product id is required.");
      const ids = readLocal(storage);
      const next = shouldSave
        ? (ids.includes(id) ? ids : ids.concat(id))
        : ids.filter(value => value !== id);
      storage.setItem(STORAGE_KEY, JSON.stringify(next));

      if (!client || typeof getUserId !== "function") return { localOnly: true, saved: shouldSave };
      const uid = await getUserId();
      if (!uid) return { localOnly: true, saved: shouldSave };

      if (shouldSave) {
        const { error } = await client.from("user_wishlist")
          .upsert({ user_id: uid, medicine_id: id }, { onConflict: "user_id,medicine_id" });
        if (error) throw error;
      } else {
        const { error } = await client.from("user_wishlist")
          .delete().eq("user_id", uid).eq("medicine_id", id);
        if (error) throw error;
      }
      return { localOnly: false, saved: shouldSave };
    }

    return Object.freeze({ getSavedIds, setSaved });
  }

  window.MFCustomerV2Wishlist = Object.freeze({ createWishlistAdapter });
})();