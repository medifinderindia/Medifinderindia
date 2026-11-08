(() => {
  "use strict";
  const root = document.querySelector('[data-view="module"]');
  if (!root) return;
  const title = root.querySelector("#module-title");
  const description = root.querySelector("#module-description");
  const status = root.querySelector("#module-status");
  const panel = root.querySelector(".module-panel");
  const links = root.querySelector("#module-links");
  let request = 0;

  const labels = {
    orders: ["My Orders", "Your real MediFinder order history and current status."],
    notifications: ["Notifications", "Account alerts and service updates."],
    coins: ["Tablet Coin", "Your current coin balance and transaction history."],
    lab: ["Lab Test Bookings", "Your submitted diagnostic bookings."],
    nurse: ["Nurse Bookings", "Your submitted home-care requests."],
    ambulance: ["Ambulance Bookings", "Your ambulance requests and current booking status."],
    profile: ["My Profile", "Your saved MediFinder account information."]
  };
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = String(text);
    return node;
  };
  const money = value => "₹" + (Number(value) || 0).toFixed(2);
  function card(heading, detail, meta) {
    const item = el("article", "v2-account-card");
    item.append(el("strong", "", heading), el("p", "", detail));
    if (meta) item.append(el("small", "", meta));
    return item;
  }
  function renderRows(host, rows, kind) {
    host.replaceChildren();
    if (!rows.length) {
      host.append(el("p", "v2-account-empty", "No " + kind + " found."));
      return;
    }
    rows.forEach(row => {
      if (kind === "orders") {
        const id = row.order_id || row.id || "Order";
        const kind = row._order_kind === "prescription" ? "Prescription order" : "Order";
        const amount = row.total_amount ?? row.total ?? row.grand_total;
        const item = card(kind + " " + id, "Status: " + (row.status || "Pending"), (amount == null ? "" : "Total: " + money(amount) + " · ") + (row.created_at ? new Date(row.created_at).toLocaleString() : "Date unavailable"));
        if (row._order_kind !== "prescription") {
          const detailsButton=el("button","v2-account-action","View order details");detailsButton.type="button";
          const details=el("div","v2-order-details");details.hidden=true;
          let detailsLoaded=false;
          detailsButton.addEventListener("click",async()=>{
            details.hidden=!details.hidden;
            detailsButton.textContent=details.hidden?"View order details":"Hide order details";
            if(details.hidden||detailsLoaded)return;
            detailsLoaded=true;details.replaceChildren(el("p","","Loading order details…"));
            try{
              let lines=Array.isArray(row.items)?row.items:[];
              if(!lines.length&&row.order_id&&window.supabaseClient){
                const result=await window.supabaseClient.from("order_items")
                  .select("product_name,name,quantity,unit_price,total_price,price,total")
                  .eq("order_id",row.order_id).order("created_at",{ascending:true}).limit(30);
                if(result.error)throw result.error;
                lines=result.data||[];
              }
              details.replaceChildren();
              const payment=el("p","","Payment: "+(row.payment_method||row.payment_mode||"Not specified"));
              const address=el("p","","Delivery address: "+(row.delivery_address||row.customer_address||row.address||"Not available"));
              details.append(payment,address);
              if(lines.length){
                const heading=el("strong","","Items");details.append(heading);
                lines.forEach(line=>{
                  const qty=Number(line.quantity)||1;
                  const unit=Number(line.unit_price??line.price)||0;
                  const total=Number(line.total_price??line.total)||unit*qty;
                  details.append(el("p","v2-order-detail-line",(line.product_name||line.name||"Healthcare product")+" × "+qty+" · "+money(total)));
                });
              }else details.append(el("p","","Item details are not available for this order."));
              details.append(el("p","","Delivery fee: "+money(row.delivery_fee||0)));
              details.append(el("p","","Order total: "+money(row.total_amount??row.total??row.grand_total??0)));
            }catch(error){detailsLoaded=false;details.replaceChildren(el("p","","Could not load order details: "+(error.message||"Please retry.")));}
          });
          item.append(detailsButton,details);
          const track = el("button", "v2-account-action", "Track delivery"); track.type = "button";
          const timeline = el("div", "v2-order-timeline");
          track.addEventListener("click", async () => {
            track.disabled = true; track.textContent = "Checking tracking…"; timeline.replaceChildren();
            try {
              if (!row.order_id) throw new Error("Order reference is unavailable.");
              if (row.courier_tracking) {
                const response = await window.supabaseClient.functions.invoke("shiprocket", { body: { action: "track", order_id: row.order_id } });
                if (response.error) throw response.error;
                if (response.data && response.data.success === false) throw new Error(response.data.error || "Courier tracking is unavailable.");
              }
              const events = await window.supabaseClient.from("order_tracking_events").select("status,location,description,event_time,courier").eq("order_id", row.order_id).order("event_time", { ascending: false }).limit(20);
              if (events.error) throw events.error;
              timeline.replaceChildren();
              if (!events.data || !events.data.length) timeline.append(el("p", "", row.courier_tracking ? "Courier has not published tracking updates yet." : "Courier tracking will appear after a delivery partner is assigned."));
              else events.data.forEach(event => timeline.append(el("p", "", (event.status || "Update") + (event.location ? " · " + event.location : "") + (event.event_time ? " · " + new Date(event.event_time).toLocaleString() : ""))));
              track.textContent = "Refresh tracking";
            } catch (e) { timeline.replaceChildren(el("p", "", e.message || "Could not load tracking.")); track.textContent = "Retry tracking"; }
            finally { track.disabled = false; }
          });
          item.append(track, timeline);
        }
        host.append(item);
      } else if (kind === "notifications") {
        const item = el("article", "v2-account-card");
        item.append(el("strong", "", row.title || "MediFinder update"), el("p", "", row.message || "No message"));
        item.append(el("small", "", (row.is_read ? "Read" : "Unread") + " · " + (row.created_at ? new Date(row.created_at).toLocaleString() : "")));
        if (!row.is_read && row.user_id) {
          const mark = el("button", "v2-account-action", "Mark as read"); mark.type = "button";
          mark.addEventListener("click", async () => {
            mark.disabled = true;
            try {
              const auth = await window.MFCustomerV2Auth.requireAuthenticatedUser(window.supabaseClient);
              if (!auth.authenticated || auth.user.id !== row.user_id) throw new Error("Notification ownership could not be confirmed.");
              const result = await window.supabaseClient.from("notifications").update({ is_read: true }).eq("id", row.id).eq("user_id", auth.user.id).select("id").maybeSingle();
              if (result.error) throw result.error;
              if (!result.data) throw new Error("Notification was not updated.");
              row.is_read = true; mark.remove();
              item.querySelector("small").textContent = "Read · " + (row.created_at ? new Date(row.created_at).toLocaleString() : "");
            } catch (e) { mark.disabled = false; status.textContent = e.message || "Could not update notification."; }
          });
          item.append(mark);
        }
        host.append(item);
      } else if (kind === "coins") {
        host.append(card(row.reason || row.type || "Coin activity", (Number(row.amount) || 0) + " coins", row.created_at ? new Date(row.created_at).toLocaleString() : ""));
      } else {
        host.append(card(row.service_name || row.test_name || row.patient_name || row.pickup_address || row.patient || "Booking", "Status: " + (row.status || row.payment_status || "Submitted"), row.created_at ? new Date(row.created_at).toLocaleString() : ""));
      }
    });
  }
  async function queryRows(client, table, uid, extra) {
    let q = client.from(table).select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(30);
    if (extra) q = extra(q);
    const result = await q;
    if (result.error) throw result.error;
    return result.data || [];
  }
  async function load(key) {
    if (!labels[key]) return;
    const current = ++request;
    title.textContent = labels[key][0];
    description.textContent = labels[key][1];
    panel.replaceChildren(el("p", "v2-account-loading", "Loading your secure account data…"));
    links.replaceChildren();
    try {
      const client = window.supabaseClient;
      if (!client || !window.MFCustomerV2Auth) throw new Error("Secure account connection is unavailable.");
      const auth = await window.MFCustomerV2Auth.requireAuthenticatedUser(client);
      if (current !== request) return;
      if (!auth.authenticated) throw new Error("Please sign in to view your account information.");
      const uid = auth.user.id;
      const email = auth.user.email;
      panel.replaceChildren();
      if (key === "profile") {
        if (!window.MFCustomerV2Profile) throw new Error("Profile editor is not connected.");
        const profile = window.MFCustomerV2Profile.create(client, auth.user);
        const p = await profile.getProfile() || {};
        const avatar = p.avatar_url || (auth.user.user_metadata && (auth.user.user_metadata.avatar_url || auth.user.user_metadata.picture));
        const form = el("form", "v2-profile-form");
        if (avatar) { const img = el("img", "v2-account-avatar"); img.src = avatar; img.alt = "Profile photo"; img.loading = "lazy"; form.append(img); }
        const field = (label, name, type, value, required) => {
          const wrap = el("label", "v2-profile-field", label);
          const input = el("input"); input.name = name; input.type = type; input.value = value || ""; input.required = !!required;
          if (name === "phone") { input.inputMode = "numeric"; input.maxLength = 10; input.placeholder = "10-digit mobile number"; }
          if (name === "date_of_birth") input.max = new Date().toISOString().slice(0,10);
          wrap.append(input); return wrap;
        };
        form.append(field("Full name","full_name","text",p.full_name || "",true));
        form.append(field("Mobile number","phone","tel",p.phone || "",true));
        const dobParts = String(p.date_of_birth || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const dobGroup = el("div", "v2-profile-field");
        dobGroup.append(el("span", "", "Date of birth"));
        const dobControls = el("div", "v2-dob-controls");
        const makeDobSelect = (name, placeholder, options, selected) => {
          const select = el("select"); select.name = name; select.required = true;
          const first = el("option", "", placeholder); first.value = ""; first.disabled = true; first.selected = !selected; select.append(first);
          options.forEach(([value,label]) => { const option = el("option", "", label); option.value = value; option.selected = value === selected; select.append(option); });
          dobControls.append(select); return select;
        };
        const dayOptions = Array.from({length:31}, (_,i) => { const n=String(i+1).padStart(2,"0"); return [n,n]; });
        const monthOptions = ["January","February","March","April","May","June","July","August","September","October","November","December"].map((m,i)=>[String(i+1).padStart(2,"0"),m]);
        const currentYear = new Date().getFullYear();
        const yearOptions = Array.from({length:currentYear-1900+1},(_,i)=>{const y=String(currentYear-i);return [y,y];});
        const daySelect = makeDobSelect("dob_day","Date",dayOptions,dobParts ? dobParts[3] : "");
        const monthSelect = makeDobSelect("dob_month","Month",monthOptions,dobParts ? dobParts[2] : "");
        const yearSelect = makeDobSelect("dob_year","Year",yearOptions,dobParts ? dobParts[1] : "");
        const syncDobDays = () => {
          if (!monthSelect.value || !yearSelect.value) return;
          const maxDay = new Date(Number(yearSelect.value), Number(monthSelect.value), 0).getDate();
          const oldDay = daySelect.value;
          Array.from(daySelect.options).slice(1).forEach(option => { option.disabled = Number(option.value) > maxDay; });
          if (oldDay && Number(oldDay) > maxDay) daySelect.value = "";
        };
        monthSelect.addEventListener("change",syncDobDays); yearSelect.addEventListener("change",syncDobDays); syncDobDays();
        dobGroup.append(dobControls); form.append(dobGroup);
        const terms = el("label","v2-profile-terms");
        const tick = el("input"); tick.type = "checkbox"; tick.name = "terms_accepted"; tick.checked = p.terms_accepted === true;
        terms.append(tick, document.createTextNode(" I accept the Terms & Conditions and Privacy Policy."));
        form.append(terms);
        const save = el("button","v2-profile-save","Save profile"); save.type = "submit"; form.append(save);
        const photo = el("label","v2-profile-photo","Change profile photo");
        const photoInput = el("input"); photoInput.type = "file"; photoInput.accept = "image/jpeg,image/png,image/webp,image/gif"; photo.append(photoInput); form.append(photo);
        photoInput.addEventListener("change", async () => {
          const file = photoInput.files && photoInput.files[0]; if (!file) return;
          photoInput.disabled = true; status.textContent = "Uploading profile photo…";
          try { const updated = await profile.uploadAvatar(file); status.textContent = "Profile photo updated."; await load("profile"); }
          catch (e) { status.textContent = e.message || "Could not upload profile photo."; }
          finally { photoInput.disabled = false; }
        });
        form.addEventListener("submit", async event => {
          event.preventDefault(); save.disabled = true; save.textContent = "Saving…";
          try { await profile.saveProfile({ full_name: form.elements.full_name.value, phone: form.elements.phone.value, date_of_birth: [form.elements.dob_year.value,form.elements.dob_month.value,form.elements.dob_day.value].every(Boolean) ? form.elements.dob_year.value + "-" + form.elements.dob_month.value + "-" + form.elements.dob_day.value : "", terms_accepted: tick.checked }); status.textContent = "Profile saved successfully."; await load("profile"); }
          catch (e) { status.textContent = e.message || "Could not save profile."; }
          finally { save.disabled = false; save.textContent = "Save profile"; }
        });
        panel.append(form);
        const address = el("p","v2-profile-address","Address: " + (p.address || "Manage saved addresses and patients below."));
        panel.append(address);
        const manage = el("button","v2-profile-manage","Manage patients & addresses"); manage.type = "button"; manage.dataset.go = "people"; panel.append(manage);
      } else {
        const config = {
          orders: async () => {
            // Match production ownership rules and include prescription-linked orders.
            const filters = ["user_id.eq." + uid];
            const phone = String(auth.user.phone || (auth.user.user_metadata && auth.user.user_metadata.phone) || "").replace(/[(),]/g, "");
            const userEmail = String(email || "").replace(/[(),]/g, "");
            if (phone) filters.push("customer_phone.eq." + phone);
            if (userEmail) filters.push("user_email.eq." + userEmail);
            const [regular, prescriptions] = await Promise.all([
              client.from("orders").select("*").or(filters.join(","))
                .order("created_at", { ascending: false }).limit(30),
              client.from("prescription_orders").select("*").eq("user_id", uid)
                .order("created_at", { ascending: false }).limit(30)
            ]);
            if (regular.error) throw regular.error;
            if (prescriptions.error) throw prescriptions.error;
            return (regular.data || []).map(row => ({ ...row, _order_kind: "standard" }))
              .concat((prescriptions.data || []).map(row => ({ ...row, _order_kind: "prescription" })))
              .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
              .slice(0, 50);
          },
          notifications: () => client.from("notifications").select("*").or("user_id.eq." + uid + ",user_id.is.null").order("created_at", { ascending: false }).limit(50).then(r => { if (r.error) throw r.error; return r.data || []; }),
          coins: () => queryRows(client, "coin_transactions", uid),
          lab: () => queryRows(client, "lab_bookings", uid),
          nurse: () => queryRows(client, "nurse_bookings", uid),
          ambulance: () => queryRows(client, "ambulance_bookings", uid)
        };
        const rows = await config[key]();
        if (current !== request) return;
        let currentCoinBalance = null;
        if (key === "coins") {
          const result = await client.from("profiles").select("coins").eq("id", uid).maybeSingle();
          if (result.error) throw result.error;
          currentCoinBalance = Number(result.data && result.data.coins) || 0;
        }
        renderRows(panel, rows, key === "lab" || key === "nurse" || key === "ambulance" ? "bookings" : key);
        if (key === "lab") {
          const form = el("form", "v2-lab-booking-form");
          form.append(el("h3", "", "Book a home collection"));
          const field = (label,name,type,required,placeholder) => {
            const wrap=el("label","v2-profile-field",label), input=el("input");
            input.name=name;input.type=type;input.required=!!required;if(placeholder)input.placeholder=placeholder;
            if(type==="date")input.min=new Date().toISOString().slice(0,10);
            if(name==="patient_phone"){input.inputMode="numeric";input.maxLength=10;}
            if(name==="patient_age"){input.min="0";input.max="120";}
            wrap.append(input);return wrap;
          };
          const testWrap=el("label","v2-profile-field","Select an approved lab test");
          const testSelect=el("select");testSelect.name="test_id";testSelect.required=true;
          const choose=el("option","","Choose a test");choose.value="";choose.disabled=true;choose.selected=true;testSelect.append(choose);
          testWrap.append(testSelect);form.append(testWrap);
          form.append(field("Patient name","patient_name","text",true,"Full name"));
          form.append(field("Patient phone","patient_phone","tel",true,"10-digit mobile number"));
          form.append(field("Patient age","patient_age","number",true,"Age"));
          const gender=el("label","v2-profile-field","Patient gender"),genderSelect=el("select");
          genderSelect.name="patient_gender";genderSelect.required=true;
          ["Male","Female","Other"].forEach(value=>{const o=el("option","",value);o.value=value;genderSelect.append(o);});gender.append(genderSelect);form.append(gender);
          form.append(field("Collection date","booking_date","date",true));
          form.append(field("Preferred time","booking_time","time",true));
          form.append(field("House / street / locality","full_address","text",true,"Full collection address"));
          form.append(field("City / district","city","text",true,"City or district"));
          form.append(field("State","state","text",true,"State"));
          form.append(field("PIN code","addr_pincode","text",true,"6-digit PIN"));
          const submit=el("button","v2-profile-save","Submit lab booking request");submit.type="submit";form.append(submit);
          const hint=el("p","v2-profile-address","Only active tests with an approved, verified collection partner and matching PIN code can be booked. Test price is confirmed by the server.");
          form.append(hint);panel.append(form);
          try {
            const tests=await client.from("lab_tests").select("id,test_name,name,price,offer_price,home_collection,fasting_required,fasting_hours,pincodes,active,approval_status,collector_id").eq("active",true).eq("approval_status","approved").eq("home_collection",true).not("collector_id","is",null).order("test_name",{ascending:true}).limit(100);
            if(tests.error)throw tests.error;
            (tests.data||[]).forEach(test=>{
              const label=(test.test_name||test.name||"Lab test")+(test.price==null?"":" · "+money(test.price))+(test.fasting_required?" · Fasting required":"");
              const opt=el("option","",label);opt.value=test.id;opt.dataset.pincodes=JSON.stringify(test.pincodes||[]);testSelect.append(opt);
            });
            if(!tests.data||!tests.data.length)hint.textContent="No approved lab tests are currently available.";
          } catch(e){hint.textContent=e.message||"Could not load approved lab tests.";}
          form.addEventListener("submit",async event=>{
            event.preventDefault();submit.disabled=true;submit.textContent="Submitting…";
            try{
              const data=Object.fromEntries(new FormData(form).entries());
              if(!/^[6-9]\d{9}$/.test(String(data.patient_phone||"")))throw new Error("Enter a valid 10-digit Indian mobile number.");
              if(!/^[1-9]\d{5}$/.test(String(data.addr_pincode||"")))throw new Error("Enter a valid 6-digit PIN code.");
              if(!data.test_id)throw new Error("Choose an approved lab test.");
              const selected=testSelect.options[testSelect.selectedIndex], pins=JSON.parse(selected.dataset.pincodes||"[]");
              if(!pins.includes(data.addr_pincode))throw new Error("This lab test is not available at the entered PIN code.");
              const bookingId=await client.rpc("generate_lab_booking_id");
              if(bookingId.error||!bookingId.data)throw bookingId.error||new Error("Could not generate a booking reference.");
              const fullAddress=String(data.full_address).trim();
              const result=await client.from("lab_bookings").insert({
                booking_id:bookingId.data,patient_name:String(data.patient_name).trim(),patient_phone:String(data.patient_phone),
                patient_age:Number(data.patient_age),patient_gender:data.patient_gender,test_id:data.test_id,
                test_name:selected.textContent.split(" · ")[0],address:fullAddress,full_address:fullAddress,
                city:String(data.city).trim(),district:String(data.city).trim(),state:String(data.state).trim(),
                pincode:data.addr_pincode,addr_pincode:data.addr_pincode,addr_city:String(data.city).trim(),
                addr_state:String(data.state).trim(),booking_date:data.booking_date,book_date:data.booking_date,
                booking_time:data.booking_time,book_time:data.booking_time,user_id:uid,user_email:email,
                booking_source:"customer_v2",payment_mode:"Cash",payment_status:"Pending",booking_status:"Pending",status:"Pending"
              });
              if(result.error)throw result.error;
              status.textContent="Lab booking request submitted. Reference: "+bookingId.data;
              await load("lab");
            }catch(e){status.textContent=e.message||"Could not submit lab booking.";submit.disabled=false;submit.textContent="Submit lab booking request";}
          });
        }
        if (key === "nurse") {
          const form=el("form","v2-service-booking-form");
          form.append(el("h3","","Request home nursing service"));
          const field=(label,name,type,required,placeholder)=>{const w=el("label","v2-profile-field",label),i=el("input");i.name=name;i.type=type;i.required=!!required;if(placeholder)i.placeholder=placeholder;if(type==="date")i.min=new Date().toISOString().slice(0,10);w.append(i);return w;};
          const rateLabel=el("label","v2-profile-field","Available verified nurse and rate");
          const rateSelect=el("select");rateSelect.name="rate_id";rateSelect.required=true;
          const initial=el("option","","Select a verified nurse and service");initial.value="";initial.disabled=true;initial.selected=true;rateSelect.append(initial);rateLabel.append(rateSelect);form.append(rateLabel);
          form.append(field("Patient name","patient_name","text",true,"Full name"));
          form.append(field("Patient age","patient_age","number",true,"Age"));
          const gender=el("label","v2-profile-field","Patient gender"),g=el("select");g.name="gender";g.required=true;["Male","Female","Other"].forEach(v=>{const o=el("option","",v);o.value=v;g.append(o);});gender.append(g);form.append(gender);
          form.append(field("Duration (number of selected rate units)","duration","number",true,"1"));form.querySelector('[name="duration"]').min="1";form.querySelector('[name="duration"]').max="90";form.querySelector('[name="duration"]').value="1";
          form.append(field("Service date","book_date","date",true));form.append(field("Preferred time","book_time","time",true));
          form.append(field("Care requirements","scope_of_work","text",false,"Describe the required care"));
          form.append(field("House / flat","addr_house","text",true,"House / flat"));
          form.append(field("Street / locality","addr_street","text",true,"Street / locality"));
          form.append(field("Landmark","addr_landmark","text",false,"Landmark"));
          form.append(field("City","addr_city","text",true,"City"));
          form.append(field("PIN code","addr_pincode","text",true,"6-digit PIN"));
          form.append(field("Contact number","contact_no","tel",true,"10-digit mobile"));
          form.append(field("State","addr_state","text",true,"West Bengal"));
          const total=el("p","v2-profile-address","The final amount is calculated from the active, admin-verified nurse rate.");form.append(total);
          const submit=el("button","v2-profile-save","Request nurse booking");submit.type="submit";form.append(submit);panel.append(form);
          try{
            const rates=await client.from("nurse_service_rates").select("id,nurse_id,service_type,rate,rate_unit,service_charge,nurses!inner(name,qualification,is_online,service_types)").eq("is_active",true).eq("is_verified",true).eq("nurses.is_online",true).limit(100);
            if(rates.error)throw rates.error;
            (rates.data||[]).forEach(r=>{const nurseInfo=Array.isArray(r.nurses)?r.nurses[0]:r.nurses;const o=el("option","",(nurseInfo.name||"Nurse")+" · "+r.service_type+" · "+money(r.rate)+"/"+r.rate_unit+" + "+money(r.service_charge)+" service charge");o.value=r.id;o.dataset.nurse=r.nurse_id;o.dataset.service=r.service_type;o.dataset.unit=r.rate_unit;rateSelect.append(o);});
            if(!rates.data||!rates.data.length)total.textContent="No verified nurse profiles and rates are currently active. Booking is unavailable until an approved nurse and rate are added by the admin.";
          }catch(e){total.textContent=e.message||"Could not load verified nurse rates.";}
          rateSelect.addEventListener("change",()=>{const opt=rateSelect.options[rateSelect.selectedIndex];total.textContent="Rate: "+opt.textContent+". Final total is calculated securely when you submit."});
          form.addEventListener("submit",async event=>{event.preventDefault();submit.disabled=true;submit.textContent="Submitting…";try{
            const d=Object.fromEntries(new FormData(form).entries()),opt=rateSelect.options[rateSelect.selectedIndex];
            if(!opt||!opt.value)throw new Error("Select an active verified nurse rate.");
            if(!/^[6-9]\d{9}$/.test(d.contact_no)||!/^[1-9]\d{5}$/.test(d.addr_pincode))throw new Error("Enter a valid 10-digit mobile and 6-digit PIN.");
            const result=await client.rpc("create_customer_nurse_booking",{p_nurse_id:opt.dataset.nurse,p_service_type:opt.dataset.service,p_patient_name:d.patient_name,p_patient_age:Number(d.patient_age),p_gender:d.gender,p_scope_of_work:d.scope_of_work,p_duration:Number(d.duration),p_book_date:d.book_date,p_book_time:d.book_time,p_addr_house:d.addr_house,p_addr_street:d.addr_street,p_addr_landmark:d.addr_landmark,p_addr_city:d.addr_city,p_addr_pincode:d.addr_pincode,p_addr_state:d.addr_state,p_contact_no:d.contact_no});
            if(result.error)throw result.error;const data=result.data||{};if(!data.ok)throw new Error("Nurse booking was not confirmed by the server.");
            status.textContent="Nurse request submitted. Booking reference: "+data.booking_id+". Estimated total: "+money(data.total)+". Payment remains pending until provider confirmation.";
            form.reset();await load("nurse");
          }catch(e){status.textContent=e.message||"Could not submit nurse booking.";submit.disabled=false;submit.textContent="Request nurse booking";}
          });
        }
        if (key === "ambulance") {
          const form=el("form","v2-service-booking-form");
          form.append(el("h3","","Request an ambulance"));
          const field=(label,name,type,required,placeholder)=>{const w=el("label","v2-profile-field",label),i=el("input");i.name=name;i.type=type;i.required=!!required;if(placeholder)i.placeholder=placeholder;w.append(i);return w;};
          form.append(field("Patient name","patient_name","text",true,"Patient full name"));
          form.append(field("Contact number","contact_phone","tel",true,"10-digit mobile"));
          form.append(field("Pickup address","pickup_address","text",true,"Full pickup address"));
          form.append(field("Pickup latitude","pickup_lat","number",true,"Tap Use current location"));form.querySelector('[name="pickup_lat"]').step="any";
          form.append(field("Pickup longitude","pickup_lon","number",true,"Longitude"));form.querySelector('[name="pickup_lon"]').step="any";
          const locate=el("button","v2-account-action","Use current location");locate.type="button";form.append(locate);
          locate.addEventListener("click",()=>{if(!navigator.geolocation){status.textContent="Location is not supported on this device.";return;}locate.disabled=true;locate.textContent="Locating…";navigator.geolocation.getCurrentPosition(pos=>{form.querySelector('[name="pickup_lat"]').value=pos.coords.latitude;form.querySelector('[name="pickup_lon"]').value=pos.coords.longitude;locate.disabled=false;locate.textContent="Location captured";},err=>{status.textContent=err.message||"Could not get current location.";locate.disabled=false;locate.textContent="Try location again";},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});});
          form.append(field("Destination address","drop_address","text",true,"Full destination address"));
          form.append(field("Destination latitude","drop_lat","number",true,"Destination latitude"));form.querySelector('[name="drop_lat"]').step="any";
          form.append(field("Destination longitude","drop_lon","number",true,"Destination longitude"));form.querySelector('[name="drop_lon"]').step="any";
          const vehicle=el("label","v2-profile-field","Vehicle type"),select=el("select");select.name="vehicle_type";select.required=true;["non_ac","ac","icu"].forEach(v=>{const o=el("option","",v.replace("_"," ").toUpperCase());o.value=v;select.append(o);});vehicle.append(select);form.append(vehicle);
          const quote=el("p","v2-profile-address","Fare requires a verified rate card and a nearby driver with a fresh location update.");form.append(quote);
          const submit=el("button","v2-profile-save","Check fare and request ambulance");submit.type="submit";form.append(submit);panel.append(form);
          form.addEventListener("submit",async event=>{event.preventDefault();submit.disabled=true;submit.textContent="Checking availability…";try{
            const d=Object.fromEntries(new FormData(form).entries()),coords=["pickup_lat","pickup_lon","drop_lat","drop_lon"].map(k=>Number(d[k]));
            if(!/^[6-9]\d{9}$/.test(d.contact_phone)||coords.some(v=>!Number.isFinite(v)))throw new Error("Enter a valid phone number and all map coordinates.");
            const result=await client.rpc("create_customer_ambulance_booking",{p_patient_name:d.patient_name,p_contact_phone:d.contact_phone,p_pickup_address:d.pickup_address,p_pickup_lat:coords[0],p_pickup_lon:coords[1],p_drop_address:d.drop_address,p_drop_lat:coords[2],p_drop_lon:coords[3],p_vehicle_type:d.vehicle_type});
            if(result.error)throw result.error;const data=result.data||{};if(!data.ok)throw new Error("Ambulance request was not confirmed by the server.");
            quote.textContent="Request sent. Reference: "+data.booking_id+". Estimated fare: "+money(data.fare_estimate)+". Final fare is confirmed by the assigned driver.";
            status.textContent="Ambulance request submitted. Status: searching for a verified driver.";
            submit.textContent="Request submitted";submit.disabled=true;
            await load("ambulance");
          }catch(e){quote.textContent=e.message||"Could not request an ambulance.";submit.disabled=false;submit.textContent="Check fare and request ambulance";}
          });
        }
        if (key === "coins") {
          panel.prepend(card("Available balance", currentCoinBalance + " coins", "1 coin = ₹1 where eligible"));
          const checkin = el("button", "v2-account-action", "Daily check-in · Claim 1 coin"); checkin.type = "button";
          checkin.addEventListener("click", async () => {
            checkin.disabled = true; checkin.textContent = "Claiming…";
            try {
              const claim = await client.rpc("claim_daily_coin_bonus");
              if (claim.error) throw claim.error;
              if (!claim.data || claim.data.ok !== true) throw new Error("Daily check-in was not confirmed.");
              status.textContent = "Daily check-in successful: 1 coin added.";
              await load("coins");
            } catch (e) {
              status.textContent = /already claimed/i.test(e.message || "") ? "You have already claimed today's check-in coin." : (e.message || "Could not claim daily check-in.");
              checkin.disabled = false; checkin.textContent = "Daily check-in · Retry";
            }
          });
          panel.append(checkin);
        }
      }
      if (current === request) status.textContent = "Live account data loaded from MediFinder.";
    } catch (error) {
      if (current !== request) return;
      panel.replaceChildren(el("p", "v2-account-empty", error.message || "Could not load account data. Please retry."));
      status.textContent = "Account data unavailable.";
    }
  }
  window.MFCustomerV2AccountHub = Object.freeze({ load });
})();