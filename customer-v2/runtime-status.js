(() => {
  "use strict";
  const update = () => {
    document.documentElement.dataset.network = navigator.onLine ? "online" : "offline";
    let banner = document.querySelector("[data-network-banner]");
    if (!navigator.onLine) {
      if (!banner) {
        banner = document.createElement("div");
        banner.dataset.networkBanner = "";
        banner.setAttribute("role","status");
        banner.textContent = "You are offline. Saved information may still be available; live services need an internet connection.";
        Object.assign(banner.style,{position:"fixed",left:"12px",right:"12px",top:"82px",zIndex:"30",padding:"12px 14px",borderRadius:"13px",background:"#fff4df",border:"1px solid #f2d39a",color:"#75501a",fontSize:"11px",fontWeight:"700",boxShadow:"0 8px 22px rgba(30,40,50,.1)"});
        document.body.appendChild(banner);
      }
    } else if (banner) banner.remove();
  };
  window.addEventListener("online",update,{passive:true});
  window.addEventListener("offline",update,{passive:true});
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",update,{once:true}); else update();
})();