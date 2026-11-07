(() => {
  "use strict";
  const root = document.querySelector('[data-view="home"]');
  if (!root) return;

  const status = root.querySelector("[data-home-status]");
  const retry = root.querySelector("[data-catalogue-retry]");
  let controller = null;

  function showDisconnected() {
    if (status) {
      status.hidden = false;
      status.dataset.state = "disconnected";
      status.textContent = "Live products are not connected in this preview. No sample products are shown.";
    }
  }

  async function load() {
    if (controller) controller.abort();
    controller = typeof AbortController === "function" ? new AbortController() : null;
    const client = window.supabaseClient;
    if (!client || !window.MFCustomerV2Catalogue || !window.MFCustomerV2ProductCards) {
      showDisconnected();
      return;
    }

    if (retry) retry.disabled = true;
    try {
      const provider = window.MFCustomerV2Catalogue.createHomeCatalogueProvider(client);
      const wishlist = window.MFCustomerV2Wishlist
        ? window.MFCustomerV2Wishlist.createWishlistAdapter({
            supabase: client,
            getUserId: async () => {
              const result = await client.auth.getSession();
              return result && result.data && result.data.session
                ? result.data.session.user.id : "";
            }
          })
        : null;
      if (window.MFCustomerV2LegacyActions &&
          typeof window.addToCart === "function" &&
          typeof window.navigateToProductDetail === "function") {
        window.MFCustomerV2Actions = window.MFCustomerV2LegacyActions.createLegacyActions({
          addToCart: window.addToCart,
          navigateToProductDetail: window.navigateToProductDetail,
          wishlist
        });
      }
      const products = await provider({ signal: controller && controller.signal });
      await window.MFCustomerV2ProductCards.render(root, products, { wishlist });
      if (status) {
        status.hidden = !products.length;
        status.textContent = products.length ? "" : "No approved products are available right now.";
      }
    } catch (error) {
      if (error && error.name === "AbortError") return;
      if (status) {
        status.hidden = false;
        status.dataset.state = "error";
        status.textContent = "Products could not be loaded. Check the connection and try again.";
      }
    } finally {
      if (retry) retry.disabled = false;
    }
  }

  retry && retry.addEventListener("click", load);
  window.MFCustomerV2Integration = Object.freeze({ load });
  showDisconnected();
  if (window.supabaseClient) load();
})();