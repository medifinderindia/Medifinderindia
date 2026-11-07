(() => {
  "use strict";
  const CHUNK_SIZE = 12;
  let renderGeneration = 0;

  function setStatus(root, state, message) {
    const status = root.querySelector("[data-home-status]");
    if (!status) return;
    status.dataset.state = state;
    status.textContent = message || "";
    status.hidden = !message;
  }

  function makeProductCard(product, onOpen) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "v2-product-card";
    card.addEventListener("click", () => onOpen?.(product));
    const name = document.createElement("b");
    name.textContent = product.name || product.title || "Healthcare product";
    const price = document.createElement("span");
    price.textContent = product.displayPrice || "";
    card.append(name, price);
    return card;
  }

  async function renderProductsInChunks(grid, products, generation, onOpen) {
    grid.replaceChildren();
    for (let start = 0; start < products.length; start += CHUNK_SIZE) {
      if (generation !== renderGeneration || !grid.isConnected) return;
      const fragment = document.createDocumentFragment();
      products.slice(start, start + CHUNK_SIZE)
        .forEach(product => fragment.append(makeProductCard(product, onOpen)));
      grid.append(fragment);
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  }

  async function load(root, options = {}) {
    const generation = ++renderGeneration;
    const grid = root.querySelector("[data-home-products]");
    if (!grid) throw new Error("Home product grid element is missing.");
    setStatus(root, "loading", "Loading available products…");
    grid.setAttribute("aria-busy", "true");

    try {
      if (typeof options.loadApprovedProducts !== "function") {
        throw new Error("A real approved-product data provider has not been connected.");
      }
      const products = await options.loadApprovedProducts({ signal: options.signal });
      if (generation !== renderGeneration || !root.isConnected) return;
      const safeProducts = Array.isArray(products) ? products : [];
      if (!safeProducts.length) {
        grid.replaceChildren();
        setStatus(root, "empty", "No products are available right now.");
        return;
      }
      await renderProductsInChunks(grid, safeProducts, generation, options.onProductOpen);
      if (generation === renderGeneration && root.isConnected) setStatus(root, "ready", "");
    } catch (error) {
      if (generation !== renderGeneration || !root.isConnected) return;
      setStatus(root, "error", "Products could not be loaded. Please try again.");
      options.onError?.(error);
    } finally {
      if (generation === renderGeneration) grid.setAttribute("aria-busy", "false");
    }
  }

  function cancel() { renderGeneration++; }
  window.MFCustomerV2Home = Object.freeze({ load, cancel });
})();
