(() => {
  "use strict";
  const root = document.querySelector('[data-view="prescriptions"]');
  if (!root) return;
  const camera = root.querySelector("[data-prescription-camera]");
  const file = root.querySelector("[data-prescription-file]");
  const name = root.querySelector("[data-prescription-file-name]");
  const note = root.querySelector(".v2-prescription-note");
  const archive = root.querySelector(".v2-prescription-archive");
  const client = () => window.supabaseClient;
  const accepted = selected => {
    if (!selected) return "Choose a prescription image or PDF.";
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/i.test(selected.type)) return "Unsupported file. Choose JPG, PNG, WEBP or PDF.";
    if (selected.size > 10 * 1024 * 1024) return "File is larger than 10 MB. Choose a smaller file.";
    return "";
  };
  function show(input) {
    const selected = input && input.files && input.files[0];
    if (!selected || !name) return;
    const error = accepted(selected);
    name.textContent = error || (selected.name + " · " + (selected.size / (1024 * 1024)).toFixed(2) + " MB · Ready to upload");
    name.dataset.valid = error ? "false" : "true";
  }
  camera && camera.addEventListener("change", () => show(camera));
  file && file.addEventListener("change", () => show(file));
  function status(text) { if (note) note.textContent = text; }
  async function loadArchive() {
    const supabase = client();
    if (!supabase || !window.MFCustomerV2Auth) return;
    const auth = await window.MFCustomerV2Auth.requireAuthenticatedUser(supabase);
    if (!auth.authenticated) throw new Error("Please sign in to view your saved prescriptions.");
    const result = await supabase.from("prescription_orders").select("id,prescription_url,status,created_at").eq("user_id",auth.user.id).order("created_at",{ascending:false}).limit(30);
    if (result.error) throw result.error;
    const host = archive.querySelector("[data-prescription-list]") || document.createElement("div");
    host.replaceChildren();
    host.dataset.prescriptionList = "true";
    for (const row of (result.data || [])) {
      const item = document.createElement("article"); item.className = "v2-prescription-saved";
      const title = document.createElement("strong"); title.textContent = "Prescription · " + (row.status || "Pending");
      const date = document.createElement("small"); date.textContent = row.created_at ? new Date(row.created_at).toLocaleString() : "";
      item.append(title,date);
      if (row.prescription_url) {
        const signed = await supabase.storage.from("customer-prescriptions").createSignedUrl(row.prescription_url,300);
        if (!signed.error && signed.data && signed.data.signedUrl) {
          const link = document.createElement("a"); link.href = signed.data.signedUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "View securely"; item.append(link);
        } else {
          const pending = document.createElement("small"); pending.textContent = "Secure document preview unavailable."; item.append(pending);
        }
      }
      host.append(item);
    }
    if (!result.data || !result.data.length) { const empty=document.createElement("p"); empty.textContent="No saved prescriptions yet."; host.append(empty); }
    if (!host.parentNode) archive.append(host);
  }
  const upload = document.createElement("button");
  upload.type = "button"; upload.className = "v2-prescription-picker"; upload.textContent = "Upload securely";
  const actionRow = root.querySelector(".v2-prescription-actions");
  if (actionRow) actionRow.append(upload);
  upload.addEventListener("click", async () => {
    const selected = (camera && camera.files && camera.files[0]) || (file && file.files && file.files[0]);
    const invalid = accepted(selected);
    if (invalid) { status(invalid); return; }
    const supabase = client();
    if (!supabase || !window.MFCustomerV2Auth) { status("Secure account connection is unavailable."); return; }
    upload.disabled = true; upload.textContent = "Uploading…";
    try {
      const auth = await window.MFCustomerV2Auth.requireAuthenticatedUser(supabase);
      if (!auth.authenticated || !auth.user || !auth.user.id) throw new Error("Please sign in before uploading.");
      const userId = auth.user.id;
      const ext = selected.type === "application/pdf" ? "pdf" : ({ "image/jpeg":"jpg","image/png":"png","image/webp":"webp" })[selected.type];
      if (!ext) throw new Error("Unsupported prescription format.");
      const randomId = (window.crypto && typeof window.crypto.randomUUID === "function") ? window.crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 14));
      const path = userId + "/" + Date.now() + "-" + randomId + "." + ext;
      const put = await supabase.storage.from("customer-prescriptions").upload(path,selected,{contentType:selected.type,cacheControl:"3600",upsert:false});
      if (put.error) throw put.error;
      const metadata = auth.user.user_metadata || {};
      const profile = await supabase.from("profiles").select("full_name,phone,address").eq("id",userId).maybeSingle();
      if (profile.error) throw profile.error;
      const row = {
        user_id:userId,
        user_name:(profile.data && profile.data.full_name) || metadata.full_name || metadata.name || "Customer",
        user_phone:(profile.data && profile.data.phone) || auth.user.phone || "",
        user_email:auth.user.email || "",
        user_address:(profile.data && profile.data.address) || "",
        prescription_url:path,
        medicines:[],
        status:"pending"
      };
      const saved = await supabase.from("prescription_orders").insert(row).select("id").single();
      if (saved.error) {
        await supabase.storage.from("customer-prescriptions").remove([path]);
        throw saved.error;
      }
      if (camera) camera.value = ""; if (file) file.value = "";
      if (name) name.textContent = "Prescription uploaded securely.";\n      try { localStorage.setItem("medi_customer_v2_latest_prescription", JSON.stringify({ id: saved.data.id, path, status: "pending", createdAt: new Date().toISOString() })); } catch (_) {}
      status("Prescription submitted. A MediFinder partner must review it before any medicine order is confirmed.");
      await loadArchive();
    } catch (error) { status(error.message || "Could not upload prescription."); }
    finally { upload.disabled = false; upload.textContent = "Upload securely"; }
  });
  loadArchive().catch(error => status(error.message || "Could not load saved prescriptions."));
})();
