(() => {
  "use strict";
  const root = document.querySelector('[data-view="home"]');
  if (!root) return;

  const status = root.querySelector("[data-home-status]");
  const retry = root.querySelector("[data-catalogue-retry]");
  const suggestionsTitle = root.querySelector("[data-suggestions-title]");
  const authLink = document.querySelector("[data-auth-link]");
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
        if (authLink) authLink.hidden = false;
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
      if (authLink) authLink.hidden = true;
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
        const cartStore = window.MFCustomerV2Cart
          ? window.MFCustomerV2Cart.createCartStore() : null;
        window.MFCustomerV2Actions = cartStore ? Object.freeze({
          onAddToCart(product) {
            const result = cartStore.add(product);
            if (window.MFCustomerV2CartUI) window.MFCustomerV2CartUI.refresh();
            return result;
          },
          onProductOpen(product) {
            if (window.MFCustomerV2ProductDetail) return window.MFCustomerV2ProductDetail.open(product);
            if (status) status.textContent = "Product details are temporarily unavailable. Please retry.";
          },
          onWishlist: wishlist ? (product) => wishlist.toggle(product.id) : null
        }) : undefined;
      }
      const products = await provider({ signal: controller && controller.signal });
      if (sequence !== loadSequence) return;
      catalogueRows = Array.isArray(products) ? products : [];
      const searchInput = root.querySelector('[data-catalogue-search]');
      const matches = window.MFCustomerV2Search ? window.MFCustomerV2Search.filter(catalogueRows, searchInput ? searchInput.value : '') : catalogueRows;
      const query = searchInput ? searchInput.value.trim() : "";
      const suggestions = query && matches.length === 0 && window.MFCustomerV2Search
        ? window.MFCustomerV2Search.suggest(catalogueRows, query, 4) : [];
      const visibleRows = matches.length ? matches : suggestions;
      await window.MFCustomerV2ProductCards.render(root, visibleRows, { wishlist });
      if (sequence !== loadSequence) return;
      if (suggestionsTitle) suggestionsTitle.hidden = suggestions.length === 0;
      if (status) {
        status.hidden = matches.length > 0 || (catalogueRows.length > 0 && !query);
        status.textContent = suggestions.length
          ? "No matching products found. Here are some related products you may like."
          : matches.length ? "" : (query ? "No matching products found." : "No approved products are available right now.");
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
      const matches = window.MFCustomerV2Search.filter(catalogueRows, searchInput.value);
      const query = searchInput.value.trim();
      const suggestions = query && matches.length === 0
        ? window.MFCustomerV2Search.suggest(catalogueRows, query, 4) : [];
      const visibleRows = matches.length ? matches : suggestions;
      window.MFCustomerV2ProductCards.render(root, visibleRows, { wishlist: activeWishlist });
      if (suggestionsTitle) suggestionsTitle.hidden = suggestions.length === 0;
      if (status) {
        status.hidden = matches.length > 0 || (catalogueRows.length > 0 && !query);
        status.textContent = suggestions.length
          ? 'No matching products found. Here are some related products you may like.'
          : matches.length ? '' : 'No matching products found.';
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
      if (suggestionsTitle) suggestionsTitle.hidden = true;
      if (authSubscription && typeof authSubscription.unsubscribe === "function") authSubscription.unsubscribe();
      window.MFCustomerV2ProductCards && window.MFCustomerV2ProductCards.cancel();
    }
  });
  showDisconnected();
  if (window.supabaseClient) load();
})();