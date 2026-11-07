(() => {
  "use strict";

  const modules = {
    home: ["Home", "Your healthcare services and account shortcuts."],
    shops: ["Nearby Pharmacies", "Existing pharmacy search, map, GPS and nearby shop results will be migrated here."],
    lab: ["Lab Test Booking", "Test search, serviceability check, booking history, patient details, date/time, prescription and payment confirmation."],
    nurse: ["Nurse Booking", "Nurse categories, service selection, duration, rates, patient details, schedule, address and booking history."],
    ambulance: ["Ambulance Booking", "Pickup and destination, nearby ambulance results, booking, OTP, driver contact, tracking and booking history."],
    prescriptions: ["My Prescriptions", "Prescription upload, camera/gallery/PDF, saved prescriptions and prescription-linked orders."],
    coins: ["Tablet Coin", "Coin balance, earning options, redemption and transaction history."],
    notifications: ["Notifications", "Account notifications and push notification preferences."],
    orders: ["My Orders", "Order list, order details, delivery timeline, live tracking and support."],
    cart: ["Cart & Checkout", "Cart items, patient, saved addresses, delivery options, coupon, Tablet Coin and payment verification."],
    profile: ["My Profile", "Personal information, photo, language, addresses, patients, reminders, wishlist, referrals, policies and support."],
    product: ["Product Details", "Product gallery, seller, reviews, variants, prescription requirements, delivery details and wishlist."],
    shop: ["Shop Details", "Verified shop profile, contact options, directions, location, offers and available products."],
    campaign: ["Offers & Campaigns", "Active campaigns, offers, coupons and campaign product discovery."]
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const views = [...document.querySelectorAll("[data-view]")];
  const navItems = [...document.querySelectorAll(".nav-item")];

  function openView(key) {
    const selected = modules[key] ? key : "home";
    const isHome = selected === "home";
    const targetView = isHome ? "home" : (selected === "cart" ? "cart" : "module");
    views.forEach(view => view.classList.toggle("active", view.dataset.view === targetView));
    navItems.forEach(item => item.classList.toggle("active", item.dataset.go === selected || (!isHome && item.dataset.go === ({
      shops: "shops", cart: "cart", orders: "orders", profile: "profile"
    }[selected] || ""))));
    if (!isHome) {
      $("#module-title").textContent = modules[selected][0];
      $("#module-description").textContent = modules[selected][1];
      $("#module-status").textContent = "Feature migration in progress";
      const related = Object.entries(modules).filter(([name]) => name !== selected && name !== "home").slice(0, 6);
      $("#module-links").replaceChildren(...related.map(([name, details]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.go = name;
        button.textContent = details[0];
        return button;
      }));
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    history.replaceState(null, "", selected === "home" ? "#home" : "#" + selected);
  }

  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-go]");
    if (!trigger) return;
    event.preventDefault();
    openView(trigger.dataset.go);
  });

  window.addEventListener("hashchange", () => {
    const key = location.hash.slice(1) || "home";
    openView(key);
  });

  window.MFCustomerV2App = Object.freeze({ openView });
  openView(modules[location.hash.slice(1)] ? location.hash.slice(1) : "home");
})();
