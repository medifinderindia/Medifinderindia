(() => {
  "use strict";
  const root = document.querySelector('[data-view="home"]');
  if (!root) return;

  const status = root.querySelector("[data-home-status]");
  const retry = root.querySelector("[data-catalogue-retry]");
  let controller = null;
  let loadSequence = 0;
  let catalogueRows = [];
  let activeWishlist = null;

  function showDisconnected() {
    if (status) {
      status.hidden = false;
      status.dataset.state = "disconnected";
      status.textContent = "Live products are not connected in this preview. No sample products are shown.";
    }
  }

  async function load() {
    const sequence = ++loadSequence;
    if (controller) controller.abort();
    controller = typeof AbortController === "function" ? new AbortController() : null;
    const client = window.supabaseClient;
    if (!client || !window.MFCustomerV2Auth ||
        !window.MFCustomerV2Catalogue || !window.MFCustomerV2ProductCards) {
      showDisconnected();
      return;
    }

    if (retry) retry.disabled = true;
    try {
      const auth = await window.MFCustomerV2Auth.requireAuthenticatedUser(client);
      if (sequence !== loadSequence) return;
      if (!auth.authenticated) {
        window.MFCustomerV2ProductCards.cancel();
        const grid = root.querySelector("[data-home-products]");
        if (grid) grid.replaceChildren();
        delete window.MFCustomerV2Actions;
        catalogueRows = [];
        activeWishlist = null;
        showDisconnected();
        if (status) status.textContent = "Please sign in to view your MediFinder products.";
        return;
      }
      const provider = window.MFCustomerV2Catalogue.createHomeCatalogueProvider(client);
      const wishlist = window.MFCustomerV2Wishlist
        ? window.MFCustomerV2Wishlist.createWishlistAdapter({
            supabase: client,
            getUserId: async () => auth.user.id
          })
        : null;
      activeWishlist = wishlist;
      const addToCart = typeof window.addToCart === "function" ? window.addToCart : null;
      const navigateToProductDetail = typeof window.navigateToProductDetail === "function"
        ? window.navigateToProductDetail : null;
      if (window.MFCustomerV2LegacyActions && addToCart && navigateToProductDetail) {
        window.MFCustomerV2Actions = window.MFCustomerV2LegacyActions.createLegacyActions({
          addToCart,
          navigateToProductDetail,
          wishlist
        });
      } else {
        delete window.MFCustomerV2Actions;
      }
      const products = await provider({ signal: controller && controller.signal });
      if (sequence !== loadSequence) return;
      catalogueRows = Array.isArray(products) ? products : [];
      const searchInput = root.querySelector('[data-catalogue-search]');
      const visibleRows = window.MFCustomerV2Search ? window.MFCustomerV2Search.filter(catalogueRows, searchInput ? searchInput.value : '') : catalogueRows;
      await window.MFCustomerV2ProductCards.render(root, visibleRows, { wishlist });
      if (sequence !== loadSequence) return;
      if (status) {
        status.hidden = !products.length;
        status.textContent = products.length ? "" : "No approved products are available right now.";
      }
    } catch (error) {
      if (sequence !== loadSequence || (error && error.name === "AbortError")) return;
      if (status) {
        status.hidden = false;
        status.dataset.state = "error";
        status.textContent = "Products could not be loaded. Check the connection and try again.";
      }
    } finally {
      if (retry) retry.disabled = false;
    }
  }

  retry && retry.addEventListener('click', load);
  const searchInput = root.querySelector('[data-catalogue-search]');
  let searchTimer = null;
  if (searchInput) searchInput.addEventListener('input', () => {
    if (!window.MFCustomerV2Search || !window.MFCustomerV2ProductCards) return;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const visibleRows = window.MFCustomerV2Search.filter(catalogueRows, searchInput.value);
      window.MFCustomerV2ProductCards.render(root, visibleRows, { wishlist: activeWishlist });
      if (status) {
        status.hidden = visibleRows.length > 0;
        status.textContent = visibleRows.length ? '' : 'No matching products found.';
      }
    }, 120);
  });
  let authSubscription = null;
  if (window.supabaseClient && window.supabaseClient.auth &&
      typeof window.supabaseClient.auth.onAuthStateChange === "function") {
    const result = window.supabaseClient.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") load();
    });
    authSubscription = result && result.data && result.data.subscription;
  }
  window.MFCustomerV2Integration = Object.freeze({
    load,
    destroy() {
      loadSequence++;
      if (controller) controller.abort();
      if (searchTimer) clearTimeout(searchTimer);
      catalogueRows = [];
      activeWishlist = null;
      if (authSubscription && typeof authSubscription.unsubscribe === "function") authSubscription.unsubscribe();
      window.MFCustomerV2ProductCards && window.MFCustomerV2ProductCards.cancel();
    }
  });
  showDisconnected();
  if (window.supabaseClient) load();
})();