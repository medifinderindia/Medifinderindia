/* ==========================================================================
   1. GLOBAL SYSTEM CONFIGURATIONS & SUPABASE INIT
   URL & key loaded from supabase-constants.js
   ========================================================================== */
const supabase = (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_KEY !== 'undefined' && window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

let currentCart = JSON.parse(localStorage.getItem('medi_cart')) || [];
let patientsData = JSON.parse(localStorage.getItem('medi_patients')) || [];
let alarmsData = JSON.parse(localStorage.getItem('medi_alarms')) || [];
let systemNotifications = [];
let savedAddresses = []; // Flipkart-style multi-address book, loaded from user_addresses table
let adminOffers = [];

let currentUserEmail = '';
let currentAuthUserId = '';   // Supabase auth UUID, set once session resolves — used by the notification system
let selectedPaymentMethod = "COD";
let isPincodeVerified = false;
let verifiedAddress = localStorage.getItem('medi_verified_address') || "";
let discountAmount = 0;
let isPrescriptionUploaded = localStorage.getItem('medi_presc_uploaded_status') === 'true' || false;
let activePrescription = JSON.parse(localStorage.getItem('medi_active_prescription') || 'null'); // {fileName, url, date} of the currently active upload

// Shows exactly one of the three prescription-widget states (default / uploading / uploaded)
// and keeps it correct across page loads by reading the persisted activePrescription record.
function renderPrescriptionWidgetState() {
    const defaultState = document.getElementById('presc-default-state');
    const progressState = document.getElementById('presc-progress-state');
    const uploadedState = document.getElementById('presc-uploaded-state');
    if (!defaultState && !uploadedState) return; // widget not on this page

    if (activePrescription && activePrescription.url) {
        if (defaultState) defaultState.style.display = 'none';
        if (progressState) progressState.style.display = 'none';
        if (uploadedState) uploadedState.style.display = 'flex';
        const nameEl = document.getElementById('presc-uploaded-filename');
        if (nameEl) nameEl.innerText = activePrescription.fileName || 'Prescription';
    } else {
        if (defaultState) defaultState.style.display = 'flex';
        if (progressState) progressState.style.display = 'none';
        if (uploadedState) uploadedState.style.display = 'none';
    }
}

function showPrescriptionProgressState() {
    const defaultState = document.getElementById('presc-default-state');
    const progressState = document.getElementById('presc-progress-state');
    const uploadedState = document.getElementById('presc-uploaded-state');
    if (defaultState) defaultState.style.display = 'none';
    if (uploadedState) uploadedState.style.display = 'none';
    if (progressState) progressState.style.display = 'flex';
    const bar = document.getElementById('presc-progress-bar');
    if (bar) bar.style.width = '0%';
}

// The Supabase JS storage.upload() call doesn't expose byte-level progress,
// so this animates toward ~90% while the real upload is in flight and snaps
// to 100% only once it actually resolves — an honest "still working" cue
// rather than a fake instant bar.
function animatePrescriptionProgress() {
    const bar = document.getElementById('presc-progress-bar');
    if (!bar) return () => {};
    let pct = 0;
    const timer = setInterval(() => {
        pct = Math.min(90, pct + Math.random() * 12);
        bar.style.width = pct + '%';
    }, 250);
    return () => { clearInterval(timer); bar.style.width = '100%'; };
}

window.deleteActivePrescription = function() {
    showConfirmationModal("Delete this prescription? You'll need to re-upload it for Rx orders.", async () => {
        const toDelete = activePrescription;
        activePrescription = null;
        isPrescriptionUploaded = false;
        localStorage.removeItem('medi_active_prescription');
        localStorage.setItem('medi_presc_uploaded_status', 'false');
        renderPrescriptionWidgetState();

        if (supabase && toDelete && toDelete.storagePath) {
            try { await supabase.storage.from('media').remove([toDelete.storagePath]); } catch (e) {}
        }
        // Also drop the matching entry from the archived "My Prescription Box" list
        if (toDelete && toDelete.url) {
            let myBox = JSON.parse(localStorage.getItem('medi_prescription_box')) || [];
            myBox = myBox.filter(p => p.url !== toDelete.url);
            localStorage.setItem('medi_prescription_box', JSON.stringify(myBox));
        }
        showToast("Prescription deleted.", "info");
    });
};


// add/buy an Rx medicine without a verified prescription on file.
function blockForMissingPrescription() {
    const msg = "This medicine requires a doctor's prescription. Please upload it to continue.";
    if (typeof showConfirmationModal === 'function') {
        showConfirmationModal(msg, () => {
            window.location.href = (window.location.pathname.split('/').pop() === 'userhome.html')
                ? '#prescription-upload-section'
                : 'userhome.html#prescription-upload-section';
        });
    } else {
        showToast("Upload prescription for Rx medicines.", "error");
    }
}

let userLiveLat = 22.5726;  // fallback — real coords set by GPS
let userLiveLng = 88.3639; // fallback — real coords set by GPS
const shopCoordinates = { lat: 22.5780, lng: 88.3650 }; // fallback — real coords set by GPS

// ============================================================
// LANGUAGE MATRIX - West Bengal regional languages + major Indian languages
// ============================================================
const languageMatrix = {
    en: {
        title: "MEDI FINDER", editBtn: "Edit Name", addrTitle: "Manage Delivery Addresses",
        selectTitle: "App Display Language", patientTitle: "Manage Patients", patientDesc: "Add or select profiles for regular medical orders",
        pillTitle: "Pill Reminders", pillDesc: "Set active scheduling alerts to take daily doses",
        referTitle: "Refer & Earn", referDesc: "Invite friends to unlock unique ₹100 shopping coupons",
        careTitle: "Customer Care Desk", helpTitle: "Help Desk", helpDesc: "Find diagnostic assistance or file complaints",
        termsTitle: "Terms & Conditions", termsDesc: "Review licensing and operational usage guidelines",
        logoutTitle: "Logout Account", navHome: "HOME", navMap: "MAP", navOrder: "ORDER", navCart: "CART", navProfile: "PROFILE",
        myBox: "My Prescription Box", searchPlaceholder: "Search medicines, syrups, baby care..."
    },
    bn: {
        title: "মেডি ফাইন্ডার", editBtn: "নাম পরিবর্তন করুন", addrTitle: "ডেলিভারি অ্যাড্রেস ম্যানেজ",
        selectTitle: "অ্যাপ ডিসপ্লে ভাষা", patientTitle: "পেশেন্ট প্রোফাইল পরিচালনা", patientDesc: "নিয়মিত মেডিকেল অর্ডারের জন্য প্রোফাইল যোগ করুন",
        pillTitle: "ওষুধের রিমাইন্ডার", pillDesc: "প্রতিদিনের ডোজ নেওয়ার জন্য অ্যালার্ম শিডিউল করুন",
        referTitle: "রেফার এবং আর্ন", referDesc: "১০০ টাকার শপিং কুপন পেতে বন্ধুদের আমন্ত্রণ জানান",
        careTitle: "কাস্টমার কেয়ার ডেস্ক", helpTitle: "হেল্প ডেস্ক", helpDesc: "সহায়তা খুঁজুন অথবা অভিযোগ দায়ের করুন",
        termsTitle: "শর্তাবলী", termsDesc: "লাইসেন্সিং এবং ব্যবহারবিধি পর্যালোচনা করুন",
        logoutTitle: "অ্যাকাউন্ট লগআউট", navHome: "হোম", navMap: "ম্যাপ", navOrder: "অর্ডার", navCart: "কার্ট", navProfile: "প্রোফাইল",
        myBox: "আমার প্রেসক্রিপশন বক্স", searchPlaceholder: "ওষুধ, সিরাপ, বেবি কেয়ার খুঁজুন..."
    },
    hi: {
        title: "मेडी फाइंडर", editBtn: "नाम बदलें", addrTitle: "डिलिवरी पता प्रबंधित करें",
        selectTitle: "APP की प्रदर्शन भाषा", patientTitle: "मरीजों का प्रबंधन", patientDesc: "नियमित चिकित्सा आदेशों के लिए प्रोफाइल जोड़ें",
        pillTitle: "दवा अनुस्मारक", pillDesc: "दैनिक खुराक लेने के लिए सक्रिय अलार्म सेट करें",
        referTitle: "Refer & Earn", referDesc: "₹100 के shopping कूपन अनलॉक करने के लिए आमंत्रित करें",
        careTitle: "ग्राहक सेवा डेस्क", helpTitle: "सहायता डेस्क", helpDesc: "नैदानिक सहायता प्राप्त करें या शिकायत दर्ज करें",
        termsTitle: "नियम एवं शर्तें", termsDesc: "लाइसेंसिंग और परिचालन उपयोग दिशानिर्देश देखें",
        logoutTitle: "खाता लॉगआउट", navHome: "होम", navMap: "मानचित्र", navOrder: "ऑर्डर", navCart: "कार्ट", navProfile: "प्रोफाइल",
        myBox: "मेरा प्रिस्क्रिप्शन बॉक्स", searchPlaceholder: "दवाइयाँ, सिरप, बेबी केयर खोजें..."
    },
    // Santali (West Bengal tribal language)
    sat: {
        title: "MEDI FINDER", editBtn: "नाम बदलें", addrTitle: "डेलिभारी ठिकाना",
        selectTitle: "भाषा चुनुं", patientTitle: "मरीज मैनेज", patientDesc: "नियमित ऑर्डर के लिए प्रोफाइल जोड़ें",
        pillTitle: "दवाई याद दिलाना", pillDesc: "हर दिन दवाई लेने के लिए अलार्म लगाएं",
        referTitle: "Refer & Earn", referDesc: "दोस्तों को बुलाएं, ₹100 कूपन पाएं",
        careTitle: "कस्टमर केयर", helpTitle: "हेल्प", helpDesc: "मदद लें या शिकायत करें",
        termsTitle: "शर्तें", termsDesc: "नियम और शर्तें",
        logoutTitle: "लॉगआउट", navHome: "होम", navMap: "नक्शा", navOrder: "ऑर्डर", navCart: "कार्ट", navProfile: "प्रोफाइल",
        myBox: "मेरा प्रेस्क्रिप्शन", searchPlaceholder: "दवाई खोजें..."
    },
    // Rajbangsi (North Bengal dialect)
    rjb: {
        title: "মেডি ফাইন্ডার", editBtn: "নাম বদলান", addrTitle: "ঠিকানা ম্যানেজ",
        selectTitle: "ভাষা বাছুন", patientTitle: "রুগী প্রোফাইল", patientDesc: "নিয়মিত অর্ডারের জন্য প্রোফাইল যোগ করুন",
        pillTitle: "ওষুধের সময়", pillDesc: "প্রতিদিন ওষুধ খাওয়ার অ্যালার্ম দিন",
        referTitle: "রেফার করুন", referDesc: "বন্ধুদের ডাকুন, ১০০ টাকা কুপন পান",
        careTitle: "কাস্টমার কেয়ার", helpTitle: "হেল্প", helpDesc: "সাহায্য নিন বা অভিযোগ জানান",
        termsTitle: "শর্তাবলী", termsDesc: "নিয়মকানুন দেখুন",
        logoutTitle: "লগআউট", navHome: "হোম", navMap: "ম্যাপ", navOrder: "অর্ডার", navCart: "কার্ট", navProfile: "প্রোফাইল",
        myBox: "আমার প্রেসক্রিপশন", searchPlaceholder: "ওষুধ খুঁজুন..."
    },
    // Odia
    or: {
        title: "ମେଡି ଫାଇଣ୍ଡର", editBtn: "ନାମ ବଦଳାନ୍ତୁ", addrTitle: "ଡେଲିଭରି ଠିକଣା",
        selectTitle: "ଭାଷା ବାଛନ୍ତୁ", patientTitle: "ରୋଗୀ ପ୍ରୋଫାଇଲ", patientDesc: "ନିୟମିତ ଅର୍ଡର ପାଇଁ ପ୍ରୋଫାଇଲ ଯୋଡ଼ନ୍ତୁ",
        pillTitle: "ଔଷଧ ସ୍ମରଣ", pillDesc: "ପ୍ରତିଦିନ ଔଷଧ ଖାଇବା ପାଇଁ ଆଲାର୍ମ ଦିଅନ୍ତୁ",
        referTitle: "ରେଫର & ଇଆର୍ନ", referDesc: "ବନ୍ଧୁଙ୍କୁ ଡାକନ୍ତୁ ₹100 କୁପନ ପାଆନ୍ତୁ",
        careTitle: "ଗ୍ରାହକ ସେବା", helpTitle: "ହେଲ୍ପ ଡେସ୍କ", helpDesc: "ସାହାଯ୍ୟ ନିଅନ୍ତୁ ବା ଅଭିଯୋଗ ଜଣାନ୍ତୁ",
        termsTitle: "ସର୍ତ୍ତ ଓ ନିୟମ", termsDesc: "ଲାଇସେନ୍ସ ଓ ବ୍ୟବହାର ନୀତି ଦେଖନ୍ତୁ",
        logoutTitle: "ଲଗ୍ ଆଉଟ", navHome: "ହୋମ", navMap: "ମ୍ୟାପ", navOrder: "ଅର୍ଡର", navCart: "କାର୍ଟ", navProfile: "ପ୍ରୋଫାଇଲ",
        myBox: "ମୋ ପ୍ରେସ୍କ୍ରିପ୍ସନ ବକ୍ସ", searchPlaceholder: "ଔଷଧ ଖୋଜନ୍ତୁ..."
    },
    te: {
        title: "మెడి ఫైండర్", editBtn: "పేరు మార్చు", addrTitle: "డెలివరీ అడ్రస్ నిర్వహణ",
        selectTitle: "యాప్ భాష", patientTitle: "పేషెంట్ నిర్వహణ", patientDesc: "సాధారణ ఆర్డర్‌ల కోసం ప్రొఫైల్‌లు జోడించండి",
        pillTitle: "పిల్ రిమైండర్లు", pillDesc: "రోజువారీ మోతాదు కోసం అలారాలు సెట్ చేయండి",
        referTitle: "రెఫర్ & ఆర్న్", referDesc: "₹100 కూపన్లు పొందండి",
        careTitle: "కస్టమర్ కేర్", helpTitle: "హెల్ప్ డెస్క్", helpDesc: "సహాయం పొందండి లేదా ఫిర్యాదు చేయండి",
        termsTitle: "నిబంధనలు", termsDesc: "లైసెన్సింగ్ నిబంధనలు చదవండి",
        logoutTitle: "లాగ్‌అవుట్", navHome: "హోమ్", navMap: "మ్యాప్", navOrder: "ఆర్డర్", navCart: "కార్ట్", navProfile: "ప్రొఫైల్",
        myBox: "నా ప్రిస్క్రిప్షన్ బాక్స్", searchPlaceholder: "మందులు వెతకండి..."
    },
    mr: {
        title: "मेडी फाइंडर", editBtn: "नाव बदला", addrTitle: "डिलिव्हरी पत्ता व्यवस्थापन",
        selectTitle: "अ‍ॅप प्रदर्शन भाषा", patientTitle: "रुग्ण व्यवस्थापन", patientDesc: "नियमित वैद्यकीय ऑर्डरसाठी प्रोफाइल जोडा",
        pillTitle: "औषध स्मरणपत्र", pillDesc: "दैनंदिन डोससाठी अलार्म सेट करा",
        referTitle: "रेफर करा & कमवा", referDesc: "मित्रांना आमंत्रित करा, ₹100 कूपन मिळवा",
        careTitle: "ग्राहक सेवा", helpTitle: "मदत केंद्र", helpDesc: "मदत मिळवा किंवा तक्रार नोंदवा",
        termsTitle: "अटी व शर्ती", termsDesc: "परवाना आणि वापर मार्गदर्शक तत्त्वे",
        logoutTitle: "खाते लॉगआउट", navHome: "होम", navMap: "नकाशा", navOrder: "ऑर्डर", navCart: "कार्ट", navProfile: "प्रोफाइल",
        myBox: "माझा प्रिस्क्रिप्शन बॉक्स", searchPlaceholder: "औषधे शोधा..."
    },
    ta: {
        title: "மெடி ஃபைண்டர்", editBtn: "பெயர் திருத்து", addrTitle: "டெலிவரி முகவரி",
        selectTitle: "மொழி தேர்வு", patientTitle: "நோயாளர் நிர்வாகம்", patientDesc: "வழக்கமான ஆர்டர்களுக்கு சுயவிவரங்கள் சேர்க்கவும்",
        pillTitle: "மாத்திரை நினைவூட்டல்", pillDesc: "தினசரி மருந்துக்கு அலாரம் வைக்கவும்",
        referTitle: "பரிந்துரை & சம்பாதி", referDesc: "நண்பர்களை அழைக்கவும், ₹100 கூப்பன் பெறவும்",
        careTitle: "வாடிக்கையாளர் சேவை", helpTitle: "உதவி மேசை", helpDesc: "உதவி பெறுங்கள் அல்லது புகார் தெரிவிக்கவும்",
        termsTitle: "விதிமுறைகள்", termsDesc: "உரிம மற்றும் பயன்பாட்டு வழிகாட்டுதல்கள்",
        logoutTitle: "வெளியேறு", navHome: "முகப்பு", navMap: "வரைபடம்", navOrder: "ஆர்டர்", navCart: "கார்ட்", navProfile: "சுயவிவரம்",
        myBox: "என் மருந்துச் சீட்டு பெட்டி", searchPlaceholder: "மருந்துகளை தேடுங்கள்..."
    },
    gu: {
        title: "મેડી ફાઇન્ડર", editBtn: "નામ બદલો", addrTitle: "ડિલિવરી સરનામું",
        selectTitle: "ભાષા પસંદ કરો", patientTitle: "દર્દી પ્રોફાઇલ", patientDesc: "નિયમિત ઓર્ડર માટે પ્રોફાઇલ ઉમેરો",
        pillTitle: "ગોળી રિમાઇન્ડર", pillDesc: "રોજ દવા લેવા અલાર્મ સેટ કરો",
        referTitle: "રેફર & કમાઓ", referDesc: "મિત્રોને આમંત્રિત કરો, ₹100 કૂપન મેળવો",
        careTitle: "ગ્રાહક સેવા", helpTitle: "મદદ ડેસ્ક", helpDesc: "સહાય મેળવો અથવા ફરિયાદ કરો",
        termsTitle: "નિયમો અને શરતો", termsDesc: "લાઇસન્સ માર્ગદર્શિકા",
        logoutTitle: "લૉગ આઉટ", navHome: "હોમ", navMap: "નકશો", navOrder: "ઓર્ડર", navCart: "કાર્ટ", navProfile: "પ્રોફાઇલ",
        myBox: "મારો પ્રિસ્ક્રિપ્શન બૉક્સ", searchPlaceholder: "દવા શોધો..."
    },
    kn: {
        title: "ಮೆಡಿ ಫೈಂಡರ್", editBtn: "ಹೆಸರು ಬದಲಿಸಿ", addrTitle: "ವಿತರಣಾ ವಿಳಾಸ",
        selectTitle: "ಭಾಷೆ ಆಯ್ಕೆ", patientTitle: "ರೋಗಿ ನಿರ್ವಹಣೆ", patientDesc: "ನಿಯಮಿತ ಆದೇಶಗಳಿಗೆ ಪ್ರೊಫೈಲ್ ಸೇರಿಸಿ",
        pillTitle: "ಮಾತ್ರೆ ಜ್ಞಾಪನ", pillDesc: "ದೈನಂದಿನ ಡೋಸ್‌ಗೆ ಅಲಾರ್ಮ್ ಹೊಂದಿಸಿ",
        referTitle: "ರೆಫರ್ & ಗಳಿಸಿ", referDesc: "ಸ್ನೇಹಿತರನ್ನು ಆಹ್ವಾನಿಸಿ ₹100 ಕೂಪನ್ ಪಡೆಯಿರಿ",
        careTitle: "ಗ್ರಾಹಕ ಸೇವೆ", helpTitle: "ಸಹಾಯ ಮೇಜು", helpDesc: "ಸಹಾಯ ಪಡೆಯಿರಿ ಅಥವಾ ದೂರು ಸಲ್ಲಿಸಿ",
        termsTitle: "ನಿಯಮಗಳು & ಷರತ್ತುಗಳು", termsDesc: "ಪರವಾನಗಿ ಮಾರ್ಗಸೂಚಿ",
        logoutTitle: "ಲಾಗ್‌ಔಟ್", navHome: "ಹೋಮ್", navMap: "ನಕ್ಷೆ", navOrder: "ಆರ್ಡರ್", navCart: "ಕಾರ್ಟ್", navProfile: "ಪ್ರೊಫೈಲ್",
        myBox: "ನನ್ನ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಬಾಕ್ಸ್", searchPlaceholder: "ಔಷಧ ಹುಡುಕಿ..."
    },
    ml: {
        title: "മെഡി ഫൈൻഡർ", editBtn: "പേര് മാറ്റുക", addrTitle: "ഡെലിവറി അഡ്രസ്",
        selectTitle: "ഭാഷ തിരഞ്ഞെടുക്കുക", patientTitle: "രോഗി മാനേജ്‌മെന്റ്", patientDesc: "പ്രൊഫൈലുകൾ ചേർക്കുക",
        pillTitle: "ഗുളിക ഓർമ്മ", pillDesc: "ദൈനംദിന ഡോസ് അലാറം സജ്ജമാക്കുക",
        referTitle: "റഫർ & നേടൂ", referDesc: "സുഹൃത്തുക്കളെ ക്ഷണിക്കൂ ₹100 കൂപ്പൺ നേടൂ",
        careTitle: "ഉപഭോക്തൃ സേവനം", helpTitle: "ഹെൽപ് ഡെസ്ക്", helpDesc: "സഹായം നേടുക അല്ലെങ്കിൽ പരാതി നൽകുക",
        termsTitle: "നിബന്ധനകൾ", termsDesc: "ലൈസൻസ് മാർഗ്ഗനിർദ്ദേശം",
        logoutTitle: "ലോഗ്ഔട്ട്", navHome: "ഹോം", navMap: "മാപ്പ്", navOrder: "ഓർഡർ", navCart: "കാർട്ട്", navProfile: "പ്രൊഫൈൽ",
        myBox: "എന്റെ പ്രിസ്ക്രിപ്ഷൻ ബോക്സ്", searchPlaceholder: "മരുന്ന് തിരയുക..."
    },
    pa: {
        title: "ਮੇਡੀ ਫਾਈਂਡਰ", editBtn: "ਨਾਮ ਬਦਲੋ", addrTitle: "ਡਿਲੀਵਰੀ ਪਤਾ",
        selectTitle: "ਭਾਸ਼ਾ ਚੁਣੋ", patientTitle: "ਮਰੀਜ਼ ਪ੍ਰਬੰਧਨ", patientDesc: "ਨਿਯਮਿਤ ਆਰਡਰਾਂ ਲਈ ਪ੍ਰੋਫਾਈਲ ਜੋੜੋ",
        pillTitle: "ਦਵਾਈ ਯਾਦ", pillDesc: "ਰੋਜ਼ਾਨਾ ਦਵਾਈ ਲਈ ਅਲਾਰਮ ਲਗਾਓ",
        referTitle: "ਰੈਫਰ & ਕਮਾਓ", referDesc: "ਦੋਸਤਾਂ ਨੂੰ ਸੱਦੋ ₹100 ਕੂਪਨ ਪਾਓ",
        careTitle: "ਗਾਹਕ ਸੇਵਾ", helpTitle: "ਮਦਦ ਕੇਂਦਰ", helpDesc: "ਮਦਦ ਲਓ ਜਾਂ ਸ਼ਿਕਾਇਤ ਕਰੋ",
        termsTitle: "ਨਿਯਮ ਅਤੇ ਸ਼ਰਤਾਂ", termsDesc: "ਲਾਇਸੈਂਸ ਦਿਸ਼ਾ-ਨਿਰਦੇਸ਼",
        logoutTitle: "ਲੌਗ ਆਉਟ", navHome: "ਹੋਮ", navMap: "ਨਕਸ਼ਾ", navOrder: "ਆਰਡਰ", navCart: "ਕਾਰਟ", navProfile: "ਪ੍ਰੋਫਾਈਲ",
        myBox: "ਮੇਰਾ ਪ੍ਰਿਸਕ੍ਰਿਪਸ਼ਨ ਬਾਕਸ", searchPlaceholder: "ਦਵਾਈਆਂ ਖੋਜੋ..."
    },
    ur: {
        title: "میڈی فائنڈر", editBtn: "نام تبدیل کریں", addrTitle: "ڈیلیوری پتہ",
        selectTitle: "زبان منتخب کریں", patientTitle: "مریض انتظام", patientDesc: "باقاعدہ آرڈر کے لیے پروفائل شامل کریں",
        pillTitle: "دوائی یاد دہانی", pillDesc: "روزانہ خوراک کے لیے الارم لگائیں",
        referTitle: "ریفر اور کمائیں", referDesc: "دوستوں کو مدعو کریں ₹100 کوپن پائیں",
        careTitle: "کسٹمر کیئر", helpTitle: "مدد ڈیسک", helpDesc: "مدد حاصل کریں یا شکایت کریں",
        termsTitle: "شرائط و ضوابط", termsDesc: "لائسنس رہنما خطوط",
        logoutTitle: "لاگ آؤٹ", navHome: "ہوم", navMap: "نقشہ", navOrder: "آرڈر", navCart: "کارٹ", navProfile: "پروفائل",
        myBox: "میرا نسخہ باکس", searchPlaceholder: "دوائیں تلاش کریں..."
    }
};

document.addEventListener("DOMContentLoaded", () => {

    renderPrescriptionWidgetState();

    detectLiveUserGPSCoordinates();
    autoFillSavedUserDataOnAuth();
    retryPendingOrderSync();
    setupGlobalNotificationHub();
    setupHomePageModules();
    setupCartPageModules();
    setupOrdersPageModules();
    setupProfilePageModules();
    if (document.getElementById('map')) setupMapPageModules();
    
    setupGlobalCloseButtonListeners();
    setInterval(runBackgroundPillAlarmEngine, 10000);
    setupServiceWorkerNotifications();
    
    if (supabase && document.getElementById('user-app-banner')) {
        initLiveOfferAndBroadcastStream();
    }

    const savedLang = localStorage.getItem('medi_active_language_env') || 'en';
    triggerGlobalAppLanguageTranslation(savedLang);
    updateSearchPlaceholder(savedLang);

    initAutoSlider();
    loadSponsoredProducts().then(() => {
        const newSlides = document.querySelectorAll('#home-slider .slide');
        if (newSlides.length > 0) initAutoSlider();
    }).catch(() => {});
    initModalRatingStars();
    initScrollToTop();
    initWishlistButtons();
    initVoiceSearch();
    initServicesMenu();
    initHamburgerMenu();
    updateProductCount();

    // Prefetch adjacent pages for instant tab switching
    setupPagePrefetch();
});

// Fixes orders (and cart/notifications) appearing to "disappear" when the user
// hits the browser Back button. The browser often restores the page from its
// back/forward cache (bfcache) instead of reloading it — DOMContentLoaded does
// NOT fire again in that case, so the page just shows whatever was rendered
// before the order existed. event.persisted === true is how we detect that
// restore and force everything to re-sync against localStorage + Supabase.
window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return; // normal load/navigation — DOMContentLoaded already handled it
    if (document.getElementById('order-list')) refreshOrdersFromServer();
});

// Global BUY NOW / ADD TO CART handler (outside async to guarantee early registration)
document.addEventListener('click', (e) => {
    const card = e.target.closest('.product-card');
    if (!card) return;
    if (e.target.closest('.add-to-cart-btn')) {
        e.stopPropagation();
        addToCart(card.dataset);
    } else if (e.target.closest('.immediate-order')) {
        e.stopPropagation();
        const isRx = card.getAttribute('data-is-rx') === 'true' || card.dataset.isRx === 'true';
        if (isRx && !isPrescriptionUploaded) {
            blockForMissingPrescription();
            return;
        }
        navigateToProductDetail(card.dataset);
    }
});

// Inline fallback handlers — called directly from onclick attributes
window.handleQuickAddToCart = function(btn) {
    const card = btn.closest('.product-card');
    if (!card) return;
    addToCart(card.dataset);
};
window.handleQuickBuyNow = function(btn) {
    const card = btn.closest('.product-card');
    if (!card) return;
    const isRx = card.getAttribute('data-is-rx') === 'true' || card.dataset.isRx === 'true';
    if (isRx && !isPrescriptionUploaded) {
        blockForMissingPrescription();
        return;
    }
    navigateToProductDetail(card.dataset);
};

// ============================================================
// PAGE PREFETCH SYSTEM - Instant Tab Switching
// ============================================================
function setupPagePrefetch(){
    const pages = ['usermap.html','userorder.html','usercart.html','userprofile.html'];
    const prefetched = new Set();
    
    // Prefetch on hover over nav items
    document.querySelectorAll('.nav-item, .hamburger-menu-item').forEach(function(item){
        item.addEventListener('mouseenter', function(){
            const onclick = item.getAttribute('onclick');
            if(!onclick) return;
            const match = onclick.match(/window\.location\.href\s*=\s*'([^']+)'/);
            if(!match) return;
            const page = match[1].split('?')[0];
            if(!prefetched.has(page) && page !== window.location.pathname.split('/').pop()){
                prefetchPage(page);
                prefetched.add(page);
            }
        });
        item.addEventListener('touchstart', function(){
            item.dispatchEvent(new Event('mouseenter'));
        }, {passive:true});
    });
    
    // Prefetch all nav pages after 2s idle
    setTimeout(function(){
        pages.forEach(function(p){
            if(!prefetched.has(p) && p !== window.location.pathname.split('/').pop()){
                prefetchPage(p);
                prefetched.add(p);
            }
        });
    }, 2000);
}

function prefetchPage(page){
    if(prefetchCache[page]) return;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = page;
    link.as = 'document';
    document.head.appendChild(link);
    prefetchCache[page] = true;
}

const prefetchCache = {};

// ============================================================
// SERVICE WORKER + BACKGROUND NOTIFICATION SYSTEM
// ============================================================
function setupServiceWorkerNotifications() {
    if ('serviceWorker' in navigator && 'Notification' in window) {
        // 'default' means the user hasn't been asked yet; once they grant or
        // deny it, Notification.permission stops being 'default' and this
        // skips the prompt on every subsequent page load.
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }

        // Register service worker for background notifications
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(e => {
                // SW not found, fallback to in-page alarm only

            });
        }
    }
}

function fireSystemNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: '1779304435608.png',
            badge: '1779304435608.png',
            vibrate: [200, 100, 200]
        });
    }
    // Also play alarm tone using Web Audio API
    playAlarmTone();
}

function playAlarmTone() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const notes = [523, 659, 784, 659, 523];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.5, ctx.currentTime + i * 0.3);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.3 + 0.25);
            osc.start(ctx.currentTime + i * 0.3);
            osc.stop(ctx.currentTime + i * 0.3 + 0.3);
        });
    } catch(e) {

    }
}

function detectLiveUserGPSCoordinates() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            userLiveLat = pos.coords.latitude;
            userLiveLng = pos.coords.longitude;

            if (document.getElementById('order-list')) {
                setupOrdersPageModules();
            }
        }, (err) => {

        }, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        });
    }
}

// Keeps every "who's logged in" display (hamburger menu + profile fields) in
// sync with the real account. Previously the hamburger only got a value once,
// synchronously, from initHamburgerMenu() — so it was stuck on 'Guest User'
// with a random fake ID until the next full page load, even for an already
// logged-in user, because the async session/profile fetch never wrote back
// to the hamburger elements. This is called both immediately (from cache)
// and again once the real session resolves.
function applyUserIdentityToUI(name, uid, email) {
    const nameTargets = ['user-name', 'new-name-input', 'hamburger-user-name'];
    nameTargets.forEach(id => {
        const el = document.getElementById(id);
        if (!el || !name) return;
        if (el.tagName === 'INPUT') el.value = name; else el.innerText = name;
    });
    if (uid) {
        const uidDisplay = document.getElementById('user-uid-display');
        if (uidDisplay) uidDisplay.innerText = "User ID: " + uid;
        const hamburgerUid = document.getElementById('hamburger-user-id');
        if (hamburgerUid) hamburgerUid.innerText = uid;
    }
    if (email) {
        const usernameEl = document.getElementById('user-username');
        if (usernameEl) usernameEl.innerText = email;
    }
}

async function autoFillSavedUserDataOnAuth() {
    const cachedName = localStorage.getItem('medi_profile_name');
    const cachedUid = localStorage.getItem('medi_user_uid');
    applyUserIdentityToUI(cachedName, cachedUid, null);
    if (verifiedAddress && document.getElementById('current-address')) {
        document.getElementById('current-address').innerText = verifiedAddress;
    }
    if (patientsData && patientsData.length > 0 && document.getElementById('patients-record-list')) {
        renderPatientsListUI();
    }
    if (alarmsData && alarmsData.length > 0 && document.getElementById('active-alarms-list')) {
        renderAlarmsListUI();
    }

    if (supabase) {
        let session = null;
        try {
            const sessionResult = await supabase.auth.getSession();
            session = sessionResult.data.session;
            if (session && session.user) {
                currentUserEmail = session.user.email || '';
                currentAuthUserId = session.user.id || '';
                const userEmail = session.user.email;

                // The real, stable Supabase auth UID is the single source of truth for
                // "User ID" everywhere (profile page + hamburger) — persisted so it's
                // consistent across sessions/devices instead of a randomly-generated one.
                const stableUid = session.user.id.substring(0, 12).toUpperCase();
                localStorage.setItem('medi_user_uid', stableUid);
                applyUserIdentityToUI(null, stableUid, userEmail);

                const { data: profileArray, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('email', userEmail)
                    .limit(1);

                if (!profileError && profileArray && profileArray.length > 0) {
                    const profile = profileArray[0];
                    if (profile.full_name) {
                        localStorage.setItem('medi_profile_name', profile.full_name);
                        applyUserIdentityToUI(profile.full_name, null, userEmail);
                    }
                    if (profile.address && document.getElementById('current-address')) {
                        document.getElementById('current-address').innerText = profile.address;
                        localStorage.setItem('medi_verified_address', profile.address);
                    }
                } else if (userEmail) {
                    // No profile row found yet, still show the email as username
                    applyUserIdentityToUI(null, null, userEmail);
                }

                const { data: dbPatients } = await supabase.from('patients').select('*').eq('user_email', userEmail);
                if (dbPatients && dbPatients.length > 0) {
                    patientsData = dbPatients;
                    localStorage.setItem('medi_patients', JSON.stringify(patientsData));
                    if (document.getElementById('patients-record-list')) renderPatientsListUI();
                }

                const { data: dbAlarms } = await supabase.from('reminders').select('*').eq('user_email', userEmail);
                if (dbAlarms && dbAlarms.length > 0) {
                    alarmsData = dbAlarms;
                    localStorage.setItem('medi_alarms', JSON.stringify(alarmsData));
                    if (document.getElementById('active-alarms-list')) renderAlarmsListUI();
                }
            }
        } catch(e) {

        } finally {
            if (!session || !session.user) showGuestHamburgerState();
        }
    }
}

// Item 11: a genuinely logged-out visitor should never see the placeholder
// "Guest User" text sitting in the hamburger menu as if it were a real
// identity — swap that whole block for an actual Login prompt instead.
function showGuestHamburgerState() {
    document.querySelectorAll('.hamburger-profile').forEach(block => {
        block.innerHTML = `
            <div class="hamburger-profile-pic"><i class="fa-solid fa-user" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f1f2f6;color:#747d8c;font-size:1.3rem;"></i></div>
            <div class="hamburger-profile-info">
                <h3>Welcome to MediFinder</h3>
                <p style="cursor:pointer;color:#e02020;font-weight:700;" onclick="window.location.href='index.html'"><i class="fa-solid fa-right-to-bracket"></i> Login / Sign Up</p>
            </div>
        `;
    });
}

function setupGlobalCloseButtonListeners() {
    document.addEventListener('click', (e) => {
        if (e.target.closest('.modal-close-cross') || e.target.closest('.close-btn') || e.target.closest('.close-modal-btn') || e.target.id === 'map-modal-close' || e.target.id === 'cancel-name' || e.target.id === 'close-help-modal' || e.target.id === 'close-otp-modal') {
            const openModal = e.target.closest('.modal') || e.target.closest('.modal-overlay-view') || document.querySelector('.modal.active');
            if (openModal) {
                openModal.style.display = "none";
                openModal.classList.remove('active');
            }
        }
        if (e.target.classList.contains('modal') || e.target.classList.contains('modal-overlay-view')) {
            e.target.style.display = "none";
            e.target.classList.remove('active');
        }
    });
}

// Resolves the logged-in user's Supabase auth UUID, waiting on the session
// if autoFillSavedUserDataOnAuth hasn't populated currentAuthUserId yet.
async function getCurrentAuthUserId() {
    if (currentAuthUserId) return currentAuthUserId;
    if (!supabase) return '';
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
            currentAuthUserId = session.user.id;
            return currentAuthUserId;
        }
    } catch (e) {}
    return '';
}

// Call this from anywhere (order placed, cancelled, prescription approved,
// coin/coupon added, etc.) to create a real, persistent notification row.
// Pass userId = null for an admin broadcast that every user sees.
async function pushUserNotification(userId, type, title, message, orderId) {
    if (!supabase) return;
    try {
        await supabase.from('notifications').insert([{
            user_id: userId || null,
            type: type || 'general',
            title: title || 'MediFinder',
            message: message || '',
            order_id: orderId || null
        }]);
    } catch (e) {}
}

function timeAgoLabel(dateStr) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + ' min' + (mins > 1 ? 's' : '') + ' ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + ' hour' + (hrs > 1 ? 's' : '') + ' ago';
    const days = Math.floor(hrs / 24);
    return days + ' day' + (days > 1 ? 's' : '') + ' ago';
}

function updateNotiBadge() {
    const badge = document.getElementById('noti-badge');
    if (!badge) return;
    const unreadCount = systemNotifications.filter(n => !n.is_read).length;
    if (unreadCount === 0) { badge.style.display = 'none'; badge.innerText = '0'; }
    else { badge.innerText = unreadCount > 10 ? '10+' : unreadCount; badge.style.display = 'flex'; }
}

function renderNotificationDropdown(notiDropdown) {
    const body = notiDropdown.querySelector('.dropdown-body');
    if (!body) return;

    if (systemNotifications.length === 0) {
        body.innerHTML = `<div class="noti-empty"><i class="fa-solid fa-bell-slash"></i><p>No Notifications Yet</p></div>`;
        return;
    }

    body.innerHTML = systemNotifications.map(n => `
        <div class="noti-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" onclick="markNotificationRead('${n.id}')">
            ${n.is_read ? '' : '<span class="noti-unread-dot">●</span>'}
            <button class="noti-delete-btn" onclick="deleteUserNotification('${n.id}', event)"><i class="fa-solid fa-xmark"></i></button>
            <p><strong>${n.title || ''}</strong><br>${n.message || ''}</p>
            <span>${timeAgoLabel(n.created_at)}</span>
        </div>
    `).join('');
}

// Clicking a single notification card marks only that one read — the red dot
// on it disappears and the badge count drops by exactly one, immediately.
window.markNotificationRead = async function(id) {
    const target = systemNotifications.find(n => n.id === id);
    if (!target || target.is_read) return;
    target.is_read = true;
    const notiDropdown = document.getElementById('notiDropdown');
    if (notiDropdown) renderNotificationDropdown(notiDropdown);
    updateNotiBadge();
    if (supabase) {
        try { await supabase.from('notifications').update({ is_read: true }).eq('id', id); } catch (e) {}
    }
};

window.deleteUserNotification = async function(id, event) {
    if (event) event.stopPropagation();
    systemNotifications = systemNotifications.filter(n => n.id !== id);
    const notiDropdown = document.getElementById('notiDropdown');
    if (notiDropdown) renderNotificationDropdown(notiDropdown);
    updateNotiBadge();
    if (supabase) {
        try { await supabase.from('notifications').delete().eq('id', id); } catch (e) {}
    }
};

async function setupGlobalNotificationHub() {
    const notiBtn = document.getElementById('notiBtn');
    const notiDropdown = document.getElementById('notiDropdown');

    async function refreshNotifications() {
        if (!supabase) return;
        const uid = await getCurrentAuthUserId();
        try {
            let query = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
            query = uid ? query.or(`user_id.eq.${uid},user_id.is.null`) : query.is('user_id', null);
            const { data, error } = await query;
            if (!error && data) systemNotifications = data;
        } catch (e) {}
        updateNotiBadge();
        if (notiDropdown && notiDropdown.classList.contains('active')) renderNotificationDropdown(notiDropdown);
    }

    // Unread count loads the moment the session resolves, not just on a later click
    await refreshNotifications();

    if (notiBtn && notiDropdown) {
        notiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notiDropdown.classList.toggle('active');
            renderNotificationDropdown(notiDropdown);
        });
        document.addEventListener('click', () => notiDropdown.classList.remove('active'));
    }

    // Realtime: new rows, reads, and deletes reflect instantly with no page refresh
    if (supabase) {
        supabase.channel('user-notifications-feed')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
                refreshNotifications();
            })
            .subscribe();
    }
}

// ============================================================
// HOME PAGE: Search with Suggestions
// ============================================================
async function setupHomePageModules() {
    if (!document.getElementById('family-health-banner') && !document.getElementById('main-products-grid')) return;

    // Normalizes whatever text the merchant picked for "dosage form / category"
    // (e.g. "Tablets", "SYRUP", "Baby Care Kit") down to the exact lowercase
    // keys used by the category filter chips: tablet, capsule, syrup, insulin,
    // baby, food, others. This is what makes clicking a category chip actually
    // filter the live database products (previously it silently matched
    // nothing because casing/labels never lined up).
    function normalizeCategoryKey(raw) {
        const c = String(raw || '').toLowerCase().trim();
        if (!c) return 'others';
        if (c.includes('insulin')) return 'insulin';
        if (c.includes('capsule')) return 'capsule';
        if (c.includes('syrup')) return 'syrup';
        if (c.includes('tablet') || c.includes('pill')) return 'tablet';
        if (c.includes('baby') || c.includes('infant') || c.includes('diaper')) return 'baby';
        if (c.includes('food') || c.includes('drink') || c.includes('supplement') || c.includes('nutrition') || c.includes('horlicks')) return 'food';
        return 'others';
    }
    window.normalizeCategoryKey = normalizeCategoryKey;


    const productsGrid = document.getElementById('main-products-grid');
    if (!productsGrid) return;
    const noProductsMsg = document.getElementById('no-products-msg');

    const embeddedCards = productsGrid.querySelectorAll('.product-card');
    embeddedCards.forEach(card => card.style.display = 'none');
    if (noProductsMsg) noProductsMsg.style.display = 'block';

    let allProductNames = [];

    // Show skeleton loading
    productsGrid.innerHTML = Array(6).fill('').map(() => `
        <div class="product-card skeleton-card" style="pointer-events:none;">
            <div style="background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; height:140px; border-radius:8px;"></div>
            <div style="padding:12px;">
                <div style="background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; height:14px; width:40%; border-radius:4px; margin-bottom:8px;"></div>
                <div style="background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; height:16px; width:80%; border-radius:4px; margin-bottom:8px;"></div>
                <div style="background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; height:14px; width:30%; border-radius:4px; margin-bottom:12px;"></div>
                <div style="display:flex; gap:8px;">
                    <div style="background:#f0f0f0; height:32px; flex:1; border-radius:6px;"></div>
                    <div style="background:#f0f0f0; height:32px; width:40px; border-radius:6px;"></div>
                </div>
            </div>
        </div>
    `).join('');
    if (!document.getElementById('shimmer-css')) {
        const shimmerCSS = document.createElement('style');
        shimmerCSS.id = 'shimmer-css';
        shimmerCSS.textContent = '@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }';
        document.head.appendChild(shimmerCSS);
    }

    if (supabase) {
        try {
            // NOTE: this used to read from `partner_medicines` (a separate,
            // disconnected table), which is why the storefront showed demo
            // composition/ratings/etc. that never matched what a merchant
            // actually uploaded. `medicines` is the real table merchants add
            // to and admin approves — that is the single source of truth now.
            const { data: dbProducts, error: dbError } = await supabase.from('medicines').select('*').eq('status', 'Approved');
            
            if (!dbError && dbProducts && dbProducts.length > 0) {
                allProductNames = dbProducts.map(p => p.name || p.product_name);
                productsGrid.innerHTML = dbProducts.map(prod => {
                    const sellingPrice = parseFloat(prod.selling_price || prod.unit_price || prod.price || 0);
                    const mrp = parseFloat(prod.mrp || 0);
                    const discount = mrp > sellingPrice && sellingPrice > 0 ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;
                    const rating = parseFloat(prod.rating || 0);
                    const stock = parseInt(prod.stock_qty || prod.stock || 0);
                    const isOutOfStock = stock <= 0;
                    // prescription_req (merchant's actual choice) is the source of
                    // truth; is_rx is kept in sync at write-time but we fall back
                    // to it for any older row that predates that fix.
                    const isRx = prod.prescription_req ? prod.prescription_req === 'Yes' : (prod.is_rx === true || prod.is_rx === 'true');
                    const freeDelivery = sellingPrice >= 499;
                    const img = prod.image_url || prod.img || 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400';
                    const categoryLabel = prod.category || prod.dosage_form || 'Medicine';
                    const categoryKey = normalizeCategoryKey(categoryLabel);
                    const manufacturer = prod.manufacturer || '';
                    const productName = prod.name || prod.product_name || 'Unnamed';
                    
                    let badges = '';
                    if (isOutOfStock) {
                        badges += '<div class="badge-express" style="background:#999;"><i class="fa-solid fa-ban"></i> Out of Stock</div>';
                    } else {
                        badges += '<div class="badge-express"><i class="fa-solid fa-bolt"></i> 20 Min</div>';
                    }
                    if (discount > 0) {
                        badges += `<div class="badge-express" style="background:#28a745; left:auto; right:8px; top:8px; font-size:0.7rem;"><i class="fa-solid fa-tag"></i> ${discount}% OFF</div>`;
                    }
                    if (freeDelivery) {
                        badges += '<div class="badge-express" style="background:#0d6efd; left:8px; top:auto; bottom:8px; font-size:0.65rem;"><i class="fa-solid fa-truck"></i> FREE DELIVERY</div>';
                    }

                    const stars = [1,2,3,4,5].map(i => 
                        i <= Math.floor(rating) ? '<i class="fa-solid fa-star" style="color:#ffa500; font-size:0.7rem;"></i>' : 
                        (i - 0.5 <= rating ? '<i class="fa-solid fa-star-half-stroke" style="color:#ffa500; font-size:0.7rem;"></i>' : 
                        '<i class="fa-regular fa-star" style="color:#ccc; font-size:0.7rem;"></i>')
                    ).join('');

                    const rxTag = isRx ? '<span style="color:#ff4d4d; font-size:0.7rem; font-weight:bold; margin-left:4px;">[Rx]</span>' : '';
                    const disabledBtn = isOutOfStock ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '';
                    
                    return `
                    <div class="product-card" data-id="${prod.id}" data-category="${categoryKey}" data-name="${productName}" data-price="${sellingPrice}" data-mrp-orig="${prod.mrp || ''}" data-img="${img}" data-img2="${prod.image_url_2 || ''}" data-img3="${prod.image_url_3 || ''}" data-expiry="${prod.expiry_date || prod.expiry || ''}" data-rating="${rating}" data-manufacturer="${manufacturer}" data-desc="${prod.description || ''}" data-is-rx="${isRx}" data-prescription-req="${prod.prescription_req || (isRx ? 'Yes' : 'No')}" data-merchant-id="${prod.merchant_id || ''}" data-mrp="${mrp}" data-stock="${stock}" data-likes="${prod.likes_count || 0}" data-composition="${(prod.composition || '').replace(/"/g,'&quot;')}" data-dosage-form="${prod.dosage_form || ''}" data-strength="${prod.strength || ''}" data-category-raw="${categoryLabel}">
                        ${badges}
                        <div class="img-container">
                            <img src="${img}" alt="${productName}" loading="lazy">
                        </div>
                        <div class="prod-info">
                            <span class="prod-cat-label">${categoryLabel}</span>
                            <h4>${productName}${rxTag}</h4>
                            ${manufacturer ? `<p style="font-size:0.7rem; color:#888; margin:2px 0 4px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${manufacturer}</p>` : ''}
                            <div style="display:flex; align-items:center; gap:4px; margin-bottom:4px;">
                                <span style="background:#388e3c; color:#fff; padding:1px 5px; border-radius:3px; font-size:0.65rem; font-weight:600;">${rating} <i class="fa-solid fa-star" style="font-size:0.55rem;"></i></span>
                                <span style="color:#888; font-size:0.65rem;">${stars}</span>
                            </div>
                            <div class="price" style="display:flex; align-items:baseline; gap:6px; flex-wrap:wrap;">
                                <span style="font-size:1.05rem; font-weight:700; color:#2f3542;">₹${sellingPrice.toFixed(2)}</span>
                                ${mrp > sellingPrice ? `<span style="font-size:0.75rem; color:#999; text-decoration:line-through;">₹${mrp.toFixed(2)}</span>` : ''}
                                ${discount > 0 ? `<span style="font-size:0.7rem; color:#28a745; font-weight:600;">${discount}% off</span>` : ''}
                            </div>
                            <div class="btn-group">
                                <button class="order-btn immediate-order" onclick="handleQuickBuyNow(this)" ${disabledBtn}>${isOutOfStock ? 'OUT OF STOCK' : 'BUY NOW'}</button>
                                <button class="add-to-cart-btn" onclick="handleQuickAddToCart(this)" ${disabledBtn}><i class="fas fa-shopping-cart"></i> CART</button>
                            </div>
                        </div>
                    </div>
                    `;
                }).join('');

                // Update product count badge
                const countBadge = document.getElementById('product-count-badge');
                if (countBadge) countBadge.textContent = `${dbProducts.length} items`;

                // Update section heading dynamically
                const heading = document.getElementById('products-section-heading');
                if (heading) heading.textContent = `Essential Medicines (${dbProducts.length})`;

                if (noProductsMsg) noProductsMsg.style.display = 'none';
            } else if (dbProducts && dbProducts.length === 0) {
                // No medicines available
                if (noProductsMsg) {
                    noProductsMsg.innerHTML = '<i class="fa-solid fa-box-open" style="font-size:2rem; color:#ccc; margin-bottom:8px; display:block;"></i>No medicines available yet. Check back soon!';
                    noProductsMsg.style.display = 'block';
                }
            } else {
                // Show embedded products when no DB products
                embeddedCards.forEach(card => card.style.display = 'block');
                if (noProductsMsg) noProductsMsg.style.display = 'none';
            }
        } catch (e) {

            // Show embedded products on error
            embeddedCards.forEach(card => card.style.display = 'block');
            if (noProductsMsg) noProductsMsg.style.display = 'none';
        }
    } else {
        // No supabase - show embedded products
        embeddedCards.forEach(card => card.style.display = 'block');
        if (noProductsMsg) noProductsMsg.style.display = 'none';
    }

    if (supabase) {
        try {
            const { data } = await supabase.from('offers').select('*').eq('active', true).limit(1);
            const bannerSection = document.getElementById('family-health-banner');
            if (data && data.length > 0) {
                const banner = document.querySelector('#family-health-banner h2');
                const bannerDesc = document.querySelector('#family-health-banner p');
                if (banner) banner.innerText = data[0].title;
                if (bannerDesc) bannerDesc.innerText = data[0].description;
                if (bannerSection) bannerSection.style.display = 'block';
            } else {
                if (bannerSection) bannerSection.style.display = 'none';
            }
        } catch (e) { }
    }

    const bookNowBtn = document.querySelector('.know-more-btn');
    if (bookNowBtn) {
        bookNowBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openHealthCheckupPopup();
        });
    }

    // ============================================================
    // SEARCH WITH SUGGESTIONS (2-3 letter trigger)
    // ============================================================
    const homeSearchInput = document.getElementById('home-medicine-search');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    let suggestionsBox = document.getElementById('search-suggestions-box');

    if (!suggestionsBox && homeSearchInput) {
        suggestionsBox = document.createElement('div');
        suggestionsBox.id = 'search-suggestions-box';
        suggestionsBox.style.cssText = `
            position: absolute; top: 100%; left: 0; right: 0; background: #fff;
            border-radius: 0 0 12px 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.12);
            z-index: 9999; max-height: 200px; overflow-y: auto; display: none;
            border: 1px solid #f1f2f6; border-top: none;
        `;
        const wrapper = homeSearchInput.closest('.search-bar-wrapper') || homeSearchInput.parentElement;
        wrapper.style.position = 'relative';
        wrapper.appendChild(suggestionsBox);
    }

    // Static medicine names for suggestions fallback
    const staticMedicineList = [
        "Paracetamol", "Amoxicillin", "Azithromycin", "Omeprazole", "Metformin",
        "Atorvastatin", "Cetirizine", "Ibuprofen", "Pantoprazole", "Cough Syrup",
        "Vitamin C", "Vitamin D3", "Calcium Tablets", "Iron Supplement", "Baby Diapers",
        "Insulin Glargine", "Betadine", "Antiseptic Lotion", "Crocin", "Dolo 650",
        "Thermometer", "Oximeter", "Blood Pressure Monitor", "Glucometer",
        "Ranitidine", "Albendazole", "Metronidazole", "Ciprofloxacin"
    ];

    if (homeSearchInput) {
        homeSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            if (clearSearchBtn) clearSearchBtn.style.display = query.length > 0 ? "block" : "none";

            // Show suggestions from 2 characters onwards
            if (query.length >= 2 && suggestionsBox) {
                const names = allProductNames.length > 0 ? allProductNames : staticMedicineList;
                const matches = names.filter(n => n.toLowerCase().includes(query)).slice(0, 5);
                
                if (matches.length > 0) {
                    suggestionsBox.innerHTML = matches.map(m => `
                        <div class="suggestion-item" style="padding:10px 16px; cursor:pointer; font-size:0.88rem; color:#2f3542; border-bottom:1px solid #f8f9fa; display:flex; align-items:center; gap:8px;">
                            <i class="fa-solid fa-magnifying-glass" style="color:#ff4d4d; font-size:0.75rem;"></i> ${m}
                        </div>
                    `).join('');
                    suggestionsBox.style.display = 'block';

                    suggestionsBox.querySelectorAll('.suggestion-item').forEach(item => {
                        item.addEventListener('mousedown', (ev) => {
                            ev.preventDefault();
                            homeSearchInput.value = item.innerText.trim();
                            suggestionsBox.style.display = 'none';
                            homeSearchInput.dispatchEvent(new Event('input'));
                        });
                    });
                } else {
                    suggestionsBox.style.display = 'none';
                }
            } else if (suggestionsBox) {
                suggestionsBox.style.display = 'none';
            }

            // Filter product grid
            if (query.length === 0) {
                const totalGridCards = productsGrid.querySelectorAll('.product-card');
                totalGridCards.forEach(card => {
                    card.style.display = "block";
                });
                if (noProductsMsg) noProductsMsg.style.display = 'none';
                const countBadge = document.getElementById('product-count-badge');
                if (countBadge) countBadge.textContent = `${totalGridCards.length} items`;
                return;
            }

            const productCards = productsGrid.querySelectorAll('.product-card');
            let matchedCount = 0;
            const categoryItems = document.querySelectorAll('.category-item');
            if (categoryItems.length > 0) {
                categoryItems.forEach(i => i.classList.remove('active'));
                categoryItems[0].classList.add('active');
            }

            productCards.forEach(card => {
                const name = (card.dataset.name || "").toLowerCase();
                const desc = (card.dataset.desc || "").toLowerCase();
                const mfg = (card.dataset.manufacturer || "").toLowerCase();
                const cat = (card.dataset.category || "").toLowerCase();
                if (name.includes(query) || desc.includes(query) || mfg.includes(query) || cat.includes(query)) {
                    card.style.display = "block"; matchedCount++;
                } else {
                    card.style.display = "none";
                }
            });
            if (noProductsMsg) noProductsMsg.style.display = matchedCount === 0 ? "block" : "none";
            const countBadge = document.getElementById('product-count-badge');
            if (countBadge) countBadge.textContent = `${matchedCount} items`;
        });

        homeSearchInput.addEventListener('blur', () => {
            setTimeout(() => { if (suggestionsBox) suggestionsBox.style.display = 'none'; }, 200);
        });
    }

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if (homeSearchInput) homeSearchInput.value = "";
            clearSearchBtn.style.display = "none";
            if (suggestionsBox) suggestionsBox.style.display = 'none';
            if (noProductsMsg) noProductsMsg.style.display = "none";
            const totalGridCards = productsGrid.querySelectorAll('.product-card');
            totalGridCards.forEach(card => {
                card.style.display = "block";
            });
            const countBadge = document.getElementById('product-count-badge');
            if (countBadge) countBadge.textContent = `${totalGridCards.length} items`;
        });
    }

    const categoryItems = document.querySelectorAll('.category-item');
    if (categoryItems.length > 0) {
        categoryItems.forEach(item => {
            item.addEventListener('click', () => {
                categoryItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                const searchInput = document.getElementById('home-medicine-search');
                if (searchInput) { searchInput.value = ""; if (clearSearchBtn) clearSearchBtn.style.display = "none"; }
                const targetCategory = item.getAttribute('data-category');
                const productCards = productsGrid.querySelectorAll('.product-card');
                let visibleCount = 0;
                productCards.forEach(card => {
                    if (targetCategory === 'all' || card.getAttribute('data-category') === targetCategory) {
                        card.style.display = 'block'; visibleCount++;
                    } else {
                        card.style.display = 'none';
                    }
                });
                if (noProductsMsg) noProductsMsg.style.display = visibleCount === 0 ? "block" : "none";
                const countBadge = document.getElementById('product-count-badge');
                if (countBadge) countBadge.textContent = `${visibleCount} items`;
            });
        });
    }

    // ============================================================
    // PRESCRIPTION UPLOAD
    // ============================================================
    async function handlePrescriptionFile(file) {
        if (!file) return;
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        const isImage = file.type.startsWith('image/');
        if (!isPdf && !isImage) {
            showToast("Please upload an image (JPG/PNG) or a PDF file.", "error");
            return;
        }

        const fileExt = file.name.split('.').pop();
        const uniqueFileName = `${Date.now()}_prescription.${fileExt}`;
        const storagePath = `live_slips/${uniqueFileName}`;
        let uploadedPrescriptionUrl = '';

        showPrescriptionProgressState();
        const finishProgress = animatePrescriptionProgress();

        if (supabase) {
            const { data, error } = await supabase.storage.from('media').upload(storagePath, file);
            finishProgress();
            if (error) {
                showToast("Upload failed: " + error.message, "error");
                renderPrescriptionWidgetState();
                return;
            }
            const { data: urlData } = supabase.storage.from('media').getPublicUrl(storagePath);
            uploadedPrescriptionUrl = urlData.publicUrl;

            activePrescription = { fileName: file.name, url: uploadedPrescriptionUrl, storagePath, date: new Date().toLocaleDateString('en-GB') };
            localStorage.setItem('medi_active_prescription', JSON.stringify(activePrescription));

            // Save prescription record for My Box (archive of every upload, kept even after delete/replace)
            let myBox = JSON.parse(localStorage.getItem('medi_prescription_box')) || [];
            myBox.push({
                id: 'PRESC-' + Date.now(),
                fileName: file.name,
                url: uploadedPrescriptionUrl,
                date: new Date().toLocaleDateString('en-GB'),
                thumb: isImage ? URL.createObjectURL(file) : ''
            });
            localStorage.setItem('medi_prescription_box', JSON.stringify(myBox));
        } else {
            finishProgress();
        }

        showToast("Verifying prescription with AI...", "info");
        const aiResult = isImage ? await analyzePrescriptionWithGemini(file) : { status: "SUCCESS", medicines: [] };

        if (aiResult.status === "FAILED") {
            showToast(`Prescription failed: ${aiResult.reason}`, "error");
            isPrescriptionUploaded = false;
            localStorage.setItem('medi_presc_uploaded_status', 'false');
            activePrescription = null;
            localStorage.removeItem('medi_active_prescription');
            renderPrescriptionWidgetState();
            return;
        }

        isPrescriptionUploaded = true;
        localStorage.setItem('medi_presc_uploaded_status', 'true');
        renderPrescriptionWidgetState();

        showToast("Prescription uploaded successfully!", "success");
        if (aiResult.medicines && aiResult.medicines.length > 0) {
            openPrescriptionSelectionPopup(aiResult.medicines, uploadedPrescriptionUrl);
        }
    }

    const prescInput = document.getElementById('presc-file-input');
    if (prescInput) {
        prescInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handlePrescriptionFile(e.target.files[0]);
            e.target.value = "";
        });
    }
    const prescCameraInput = document.getElementById('presc-camera-input');
    if (prescCameraInput) {
        prescCameraInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handlePrescriptionFile(e.target.files[0]);
            e.target.value = "";
        });
    }
    const prescViewBtn = document.getElementById('presc-view-btn');
    if (prescViewBtn) {
        prescViewBtn.addEventListener('click', () => {
            if (activePrescription && activePrescription.url) window.open(activePrescription.url, '_blank');
        });
    }
    const prescDeleteBtn = document.getElementById('presc-delete-btn');
    if (prescDeleteBtn) {
        prescDeleteBtn.addEventListener('click', () => window.deleteActivePrescription());
    }

    if (productsGrid) {
        productsGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (!card) return;
            if (e.target.closest('.btn-group') || e.target.classList.contains('immediate-order') || e.target.classList.contains('add-to-cart-btn')) {
                return;
            }
            navigateToProductDetail(card.dataset);
        });
    }

    const bigCartBtn = document.getElementById('modal-add-to-cart-action');
    if (bigCartBtn) {
        bigCartBtn.onclick = () => {
            const modalName = document.getElementById('modal-prod-name')?.innerText;
            const modalPrice = document.getElementById('modal-price')?.innerText?.replace('₹', '');
            const modalImg = document.getElementById('modal-main-img')?.src;
            const isRxAttr = document.getElementById('product-detail-modal').getAttribute('data-modal-rx') === 'true';
            
            if (isRxAttr && !isPrescriptionUploaded) {
                blockForMissingPrescription();
                return;
            }
            addToCart({
                id: "p_modal_" + Math.floor(Math.random() * 100),
                name: modalName,
                price: modalPrice,
                img: modalImg,
                isRx: isRxAttr
            });
            document.getElementById('product-detail-modal').style.display = "none";
            document.getElementById('product-detail-modal').classList.remove('active');
        };
    }
}

function openHealthCheckupPopup() {
    let popup = document.createElement('div');
    popup.className = "modal active";
    popup.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;justify-content:center;align-items:center;z-index:10000;padding:16px;box-sizing:border-box;`;
    popup.innerHTML = `
        <div class="modal-content" style="background:#ffffff;width:100%;max-width:420px;border-radius:16px;padding:24px;box-shadow:0 12px 30px rgba(0,0,0,0.25);box-sizing:border-box;max-height:90vh;overflow-y:auto;text-align:left;border-top:5px solid #ff4d4d;">
            <h3 style="color:#ff4d4d;margin-top:0;margin-bottom:16px;font-size:1.3rem;display:flex;align-items:center;gap:8px;">
                <i class="fa-solid fa-square-plus"></i> Book Health Checkup
            </h3>
            <form id="checkupForm" style="display:flex;flex-direction:column;gap:14px;">
                <input type="text" id="chk-name" placeholder="Patient Full Name" required style="padding:12px;border-radius:8px;border:1px solid #ced4da;font-size:0.95rem;width:100%;box-sizing:border-box;">
                <input type="tel" id="chk-phone" placeholder="10-Digit Mobile Number" required style="padding:12px;border-radius:8px;border:1px solid #ced4da;font-size:0.95rem;width:100%;box-sizing:border-box;">
                <select id="chk-topic" required style="padding:12px;border-radius:8px;border:1px solid #ced4da;font-size:0.95rem;width:100%;box-sizing:border-box;background:#fff;">
                    <option value="" disabled selected>-- Select Checkup Profile --</option>
                    <option value="Full Body Checkup">Complete Full Body Package (Free)</option>
                    <option value="Diabetes Care">Diabetes & Blood Sugar Monitoring</option>
                    <option value="Cardiac Profile">Cardiovascular Heart Health Screening</option>
                    <option value="Kidney Health">Liver & Kidney Function Profile</option>
                </select>
                <input type="date" id="chk-date" required style="padding:12px;border-radius:8px;border:1px solid #ced4da;font-size:0.95rem;width:100%;box-sizing:border-box;">
                <div style="display:flex;gap:12px;margin-top:8px;">
                    <button type="button" id="close-checkup" style="flex:1;padding:12px;border-radius:8px;border:1px solid #ced4da;background:#f8f9fa;cursor:pointer;font-weight:600;">Cancel</button>
                    <button type="submit" style="flex:1;padding:12px;border-radius:8px;border:none;background:#ff4d4d;color:#fff;cursor:pointer;font-weight:600;">Confirm Booking</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(popup);
    document.getElementById('close-checkup').onclick = () => popup.remove();
    document.getElementById('checkupForm').onsubmit = async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById('chk-name').value,
            phone: document.getElementById('chk-phone').value,
            topic: document.getElementById('chk-topic').value,
            date: document.getElementById('chk-date').value,
            created_at: new Date().toISOString()
        };
        if (supabase) {
            const { error } = await supabase.from('checkups').insert([payload]);
            if (error) { showToast("Database error: " + error.message, "error"); return; }
        }
        showToast(`Your ${payload.topic} request submitted successfully!`, "success");
        popup.remove();
    };
}

// Accurate great-circle distance in km (replaces the old rough sqrt() estimate
// used around the map code, and reused to find pharmacies near a prescription).
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Finds nearby verified pharmacies (within radiusKm) and pushes a notification
// row into the EXISTING `merchant_notifications` table (already wired up with
// realtime + the notification bell in marchentscript.js), so a new prescription
// order shows up for them immediately — no new tables/columns required.
async function broadcastPrescriptionToNearbyPharmacies(prescriptionUrl, selectedMedicines) {
    if (!supabase) return;
    try {
        const userLat = await new Promise((resolve) => {
            if (!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => resolve(null),
                { timeout: 6000 }
            );
        });

        const { data: merchants, error } = await supabase
            .from('merchants')
            .select('id, latitude, longitude, shop_name, merchant_name, status')
            .in('status', ['active', 'approved']);
        if (error || !merchants) return;

        let targets = merchants;
        if (userLat) {
            const RADIUS_KM = 15;
            targets = merchants
                .filter(m => m.latitude && m.longitude)
                .map(m => ({ ...m, _dist: haversineKm(userLat.lat, userLat.lng, parseFloat(m.latitude), parseFloat(m.longitude)) }))
                .filter(m => m._dist <= RADIUS_KM)
                .sort((a, b) => a._dist - b._dist);
        }
        if (targets.length === 0) targets = merchants; // fallback: notify everyone if we couldn't get location

        const medNames = selectedMedicines.map(m => m.name).join(', ');
        const notifRows = targets.map(m => ({
            merchant_id: m.id,
            title: '🩺 New Prescription Order Nearby',
            message: `Customer needs: ${medNames}. Prescription: ${prescriptionUrl}`,
            type: 'order'
        }));
        await supabase.from('merchant_notifications').insert(notifRows);
    } catch (e) {
        // Non-fatal — the medicines are already in the user's cart either way.
    }
}

function openPrescriptionSelectionPopup(medicines, prescriptionUrl) {
    let popup = document.createElement('div');
    popup.className = "modal active";
    popup.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100vh;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;z-index:10000;padding:16px;box-sizing:border-box;`;
    popup.innerHTML = `
        <div class="modal-content" style="background:#fff;width:100%;max-width:450px;border-radius:16px;padding:20px;box-sizing:border-box;border-top:5px solid #ff4d4d;">
            <h3><i class="fa-solid fa-file-prescription" style="color:#ff4d4d"></i> Pharmacist Verification Gate</h3>
            <p style="font-size:0.8rem;color:#6c757d;margin-bottom:12px;background:#fff5f5;padding:8px;border-radius:6px;border-left:3px solid #ff4d4d;">
                <strong>🛡️ সেফটি ইন্টিগ্রেশন:</strong> কোনো ভুল ওষুধ ডেলিভারি এড়াতে রেজিস্টার্ড ফার্মাসিস্ট ম্যানুয়ালি এআই এক্সট্র্যাক্টেড ডাটা ভেরিফাই করছেন।
            </p>
            <div id="presc-list" style="display:flex;flex-direction:column;gap:8px;max-height:250px;overflow-y:auto;text-align:left;">
                ${medicines.map(m => `
                    <label style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:#f8f9fa;border-radius:8px;border:1px solid #e1e2e6;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <img src="${m.img}" style="width:40px;height:40px;object-fit:contain;">
                            <div>
                                <strong style="font-size:0.85rem;">${m.name}</strong>
                                <p style="margin:0;font-size:0.8rem;color:#ff4d4d;">₹${m.price}</p>
                            </div>
                        </div>
                        <input type="checkbox" class="presc-select-box" data-id="${m.id}" data-name="${m.name}" data-price="${m.price}" data-img="${m.img}" checked style="width:18px;height:18px;">
                    </label>
                `).join('')}
            </div>
            <div style="display:flex;gap:10px;margin-top:15px;">
                <button id="cancel-presc" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;">Dismiss</button>
                <button id="add-presc-cart" style="flex:1;padding:10px;border-radius:8px;border:none;background:#2ed573;color:#fff;cursor:pointer;font-weight:600;">Verify & Add Selected</button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);
    document.getElementById('cancel-presc').onclick = () => popup.remove();
    document.getElementById('add-presc-cart').onclick = () => {
        const selectedCheckboxes = popup.querySelectorAll('.presc-select-box:checked');
        if (selectedCheckboxes.length === 0) { showToast("Please select at least one medicine!", "error"); return; }
        const selectedMeds = [];
        selectedCheckboxes.forEach(box => {
            const med = { id: box.dataset.id, name: box.dataset.name, price: box.dataset.price, img: box.dataset.img };
            selectedMeds.push(med);
            addToCart({ id: med.id, name: med.name, price: med.price, img: med.img, isRx: false });
        });
        if (prescriptionUrl) {
            broadcastPrescriptionToNearbyPharmacies(prescriptionUrl, selectedMeds);
            showToast("Sent to nearby pharmacies for confirmation!", "success");
        }
        popup.remove();
        window.location.href = 'usercart.html';
    };
}

// ============================================================
// PRODUCT DETAIL - Navigate to full page (Flipkart-style)
// ============================================================
function navigateToProductDetail(data) {
    try {
        const params = new URLSearchParams();
        if (data.id) params.set('id', data.id);
        if (data.name) params.set('name', data.name);
        if (data.price) params.set('price', data.price);
        if (data.mrp) params.set('mrp', data.mrp);
        if (data.img) params.set('img', data.img);
        if (data.img2) params.set('img2', data.img2);
        if (data.img3) params.set('img3', data.img3);
        if (data.likes) params.set('likes', data.likes);
        if (data.manufacturer) params.set('manufacturer', data.manufacturer);
        if (data.expiry) params.set('expiry', data.expiry);
        if (data.rating) params.set('rating', data.rating);
        if (data.desc) params.set('desc', data.desc);
        if (data.isRx || data['data-is-rx']) params.set('isRx', data.isRx || data['data-is-rx']);
        if (data.prescriptionReq) params.set('prescriptionReq', data.prescriptionReq);
        if (data.category) params.set('category', data.category);
        if (data.stock) params.set('stock', data.stock);
        if (data.composition) params.set('composition', data.composition);
        if (data.dosageForm) params.set('dosageForm', data.dosageForm);
        if (data.strength) params.set('strength', data.strength);
        
        localStorage.setItem('currentProduct', JSON.stringify(data));
        window.location.href = `product-detail.html?${params.toString()}`;
    } catch (e) {

        showToast('Something went wrong. Please try again.', 'error');
    }
}

function updateProductCount() {
    const badge = document.getElementById('product-count-badge');
    const grid = document.getElementById('main-products-grid');
    if (!badge || !grid) return;
    const allCards = grid.querySelectorAll('.product-card');
    let count = 0;
    allCards.forEach(card => {
        if (card.style.display !== 'none') count++;
    });
    badge.textContent = `${count} items`;
}

function addToCart(product) {
    const isControlledRx = product.isRx === true || product.isRx === 'true';
    if (isControlledRx && !isPrescriptionUploaded) {
        blockForMissingPrescription();
        return;
    }
    const existing = currentCart.find(item => item.id === product.id);
    if (existing) {
        existing.qty += 1;
    } else {
        currentCart.push({
            id: product.id,
            name: product.name,
            price: parseFloat(product.price),
            img: product.img,
            qty: 1,
            isRx: isControlledRx,
            merchantId: product.merchantId || product.merchant_id || '',
            exempt_platform_fee: product.id === "p2",
            exempt_processing_charge: product.id === "p4"
        });
    }
    localStorage.setItem('medi_cart', JSON.stringify(currentCart));
    showToast(`${product.name} added to cart!`, "success");
    if (document.getElementById('cart-items-container')) renderCartPage();
}

// ============================================================
// CART PAGE
// ============================================================
function setupCartPageModules() {
    if (!document.getElementById('cart-items-container')) return;
    renderCartPage();

    loadSavedAddress();

    const saveAddrBtn = document.getElementById('save-address-btn');
    if (saveAddrBtn) saveAddrBtn.addEventListener('click', saveDeliveryAddress);

    const changeAddrBtn = document.getElementById('change-address-btn');
    if (changeAddrBtn) changeAddrBtn.addEventListener('click', () => {
        const addrForm = document.getElementById('address-form');
        const savedBox = document.getElementById('saved-address-box');
        if (addrForm) addrForm.style.display = 'flex';
        if (savedBox) savedBox.style.display = 'none';
    });

    const applyCouponBtn = document.getElementById('apply-coupon-btn');
    if (applyCouponBtn) applyCouponBtn.addEventListener('click', handleCouponApplication);

    const methodRadios = document.querySelectorAll('input[name="payment_method"]');
    methodRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.querySelectorAll('.pay-option').forEach(el => el.classList.remove('active-option'));
            e.target.closest('.pay-option').classList.add('active-option');
            selectedPaymentMethod = e.target.value;

            const upiRail = document.getElementById('upi-apps-rail');
            const netRail = document.getElementById('netbanking-rail');
            const codRow = document.getElementById('cod-fee-row');
            if (upiRail) upiRail.style.display = (e.target.value === 'UPI') ? 'grid' : 'none';
            if (netRail) netRail.style.display = (e.target.value === 'NETBANKING') ? 'block' : 'none';
            if (codRow) codRow.style.display = (e.target.value === 'COD') ? 'flex' : 'none';

            recalculateBill();
        });
    });

    const placeOrderBtn = document.getElementById('place-order-final-btn');
    if (placeOrderBtn) placeOrderBtn.addEventListener('click', processFinalOrderPayload);

    const stickyPlaceBtn = document.getElementById('place-order-sticky-btn');
    if (stickyPlaceBtn) stickyPlaceBtn.addEventListener('click', processFinalOrderPayload);

    const goOrdersBtn = document.getElementById('go-to-orders-after-success');
    if (goOrdersBtn) goOrdersBtn.onclick = () => window.location.href = 'userorder.html';

    const successModal = document.getElementById('success-animation-modal');
    if (successModal) {
        successModal.addEventListener('click', (e) => {
            if (e.target === successModal) {
                successModal.classList.remove('modal-revealed');
                setTimeout(() => { successModal.style.display = 'none'; }, 300);
            }
        });
    }
}

function loadSavedAddress() {
    const saved = JSON.parse(localStorage.getItem('medi_delivery_address') || 'null');
    if (saved && saved.house && saved.name) {
        showSavedAddress(saved);
    }
}

function showSavedAddress(addr) {
    const form = document.getElementById('address-form');
    const box = document.getElementById('saved-address-box');
    const display = document.getElementById('saved-address-display');
    if (form) form.style.display = 'none';
    if (box) box.style.display = 'block';
    if (display) {
        display.innerHTML = `<strong><i class="fa-solid fa-user"></i> ${addr.name}</strong>
            <i class="fa-solid fa-phone" style="color:#e02020"></i> ${addr.phone}<br>
            <i class="fa-solid fa-location-dot" style="color:#e02020"></i> ${addr.house}, ${addr.area}, ${addr.city} - ${addr.pincode}${addr.landmark ? ', Near ' + addr.landmark : ''}`;
    }
}

// Checks the pincode against the admin's service_zones registry (same table
// the admin "Network Area Control" panel manages via Launch Zone Live /
// Suspend Zone). A pincode with no row at all means that area hasn't been
// launched yet; a row with status 'suspended' means it was launched but is
// temporarily paused — both are treated as unavailable.
async function checkPincodeServiceability(pincode) {
    if (!supabase || !pincode) return { available: true }; // fail-open on setup issues, never brick checkout over a network hiccup
    try {
        const { data, error } = await supabase.from('service_zones').select('pin, dist, status').eq('pin', pincode).maybeSingle();
        if (error) return { available: true };
        if (!data || data.status !== 'approved') return { available: false };
        return { available: true, dist: data.dist };
    } catch (e) {
        return { available: true };
    }
}

async function saveDeliveryAddress() {
    const name = document.getElementById('addr-name')?.value.trim();
    const phone = document.getElementById('addr-phone')?.value.trim();
    const house = document.getElementById('addr-house')?.value.trim();
    const area = document.getElementById('addr-area')?.value.trim();
    const city = document.getElementById('addr-city')?.value.trim();
    const pincode = document.getElementById('addr-pincode')?.value.trim();
    const landmark = document.getElementById('addr-landmark')?.value.trim() || '';
    const statusMsg = document.getElementById('addr-status-msg');

    if (!name || !phone || !house || !area || !city || !pincode) {
        if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = '❌ Please fill all required fields.'; }
        return;
    }
    if (pincode.length !== 6) {
        if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = '❌ Pincode must be 6 digits.'; }
        return;
    }
    if (phone.length < 10) {
        if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = '❌ Enter valid phone number.'; }
        return;
    }

    if (statusMsg) { statusMsg.style.color = '#747d8c'; statusMsg.innerText = 'Checking service availability...'; }
    const zoneCheck = await checkPincodeServiceability(pincode);
    if (!zoneCheck.available) {
        isPincodeVerified = false;
        if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = '❌ Unavailable! Service is not launched in your pincode yet. Please try again after 5 days.'; }
        return;
    }

    const addr = { name, phone, house, area, city, pincode, landmark };
    localStorage.setItem('medi_delivery_address', JSON.stringify(addr));
    localStorage.setItem('medi_verified_address', `${house}, ${area}, ${city} - ${pincode}${landmark ? ', Near ' + landmark : ''}`);
    isPincodeVerified = true;
    if (statusMsg) { statusMsg.style.color = '#2ed573'; statusMsg.innerText = '✓ Address saved!'; }
    showSavedAddress(addr);
    recalculateBill();
}

async function handleCouponApplication() {
    const couponInput = document.getElementById('coupon-input');
    if (!couponInput) return;
    const couponCode = couponInput.value.trim().toUpperCase();
    const statusMsg = document.getElementById('coupon-status-msg');
    if (!couponCode) { if(statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = 'Enter a coupon code.'; } return; }
    
    if (supabase) {
        try {
            const { data, error } = await supabase.from('coupons').select('*').eq('code', couponCode).eq('is_active', true).single();
            if (error || !data) {
                if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = 'Invalid or expired coupon code.'; }
                discountAmount = 0;
                recalculateBill();
                return;
            }
            const now = new Date();
            if (data.end_date && new Date(data.end_date) < now) {
                if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = 'This coupon has expired.'; }
                discountAmount = 0;
                recalculateBill();
                return;
            }
            const subtotal = currentCart.reduce((s, i) => s + (i.price * i.qty), 0);
            if (data.min_order_amount && subtotal < data.min_order_amount) {
                if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = `Minimum order ₹${data.min_order_amount} required.`; }
                discountAmount = 0;
                recalculateBill();
                return;
            }
            if (data.discount_type === 'percentage') {
                discountAmount = Math.min((subtotal * (data.discount_value || 0)) / 100, data.max_discount_amount || Infinity);
            } else {
                discountAmount = Math.min(data.discount_value || 0, subtotal);
            }
            if (statusMsg) { statusMsg.style.color = '#2ed573'; statusMsg.innerText = `Coupon applied! ₹${discountAmount.toFixed(2)} saved.`; }
            recalculateBill();
            return;
        } catch(e) {
            showToast("Coupon lookup error. Using offline fallback.", "info");
        }
    }
    if (couponCode === "MEDI20") {
        discountAmount = 50.00;
        if (statusMsg) { statusMsg.style.color = '#2ed573'; statusMsg.innerText = 'Coupon Applied! ₹50.00 saved.'; }
        recalculateBill();
    } else {
        if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = 'Invalid or expired coupon code.'; }
    }
}

function renderCartPage() {
    const container = document.getElementById('cart-items-container');
    if (!container) return;
    const headerBar = document.getElementById('cart-header-bar');
    const itemCountEl = document.getElementById('cart-item-count');
    const stickyBar = document.getElementById('sticky-checkout-bar');
    const freeWrap = document.getElementById('free-delivery-progress');
    if (currentCart.length === 0) {
        container.innerHTML = `<div class="cart-empty-state"><div class="cart-empty-icon"><i class="fa-solid fa-basket-shopping"></i></div><h3>Your cart is empty</h3><p>Browse medicines and add them to your cart</p><button class="cart-empty-btn" onclick="window.location.href='userhome.html'"><i class="fa-solid fa-house"></i> Browse Medicines</button></div>`;
        if (headerBar) headerBar.style.display = 'none';
        if (stickyBar) stickyBar.style.display = 'none';
        if (freeWrap) freeWrap.style.display = 'none';
        recalculateBill();
        return;
    }
    const totalQty = currentCart.reduce((s, i) => s + i.qty, 0);
    if (headerBar) {
        headerBar.style.display = 'flex';
        if (itemCountEl) itemCountEl.innerHTML = `<strong>${totalQty}</strong> item${totalQty !== 1 ? 's' : ''}`;
    }
    container.innerHTML = currentCart.map(item => `
        <div class="cart-item">
            <div class="cart-item-left">
                <img class="cart-item-img" src="${item.img}" onerror="this.src='https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=200'">
                <div class="cart-item-info">
                    <h4 class="cart-item-name">${item.name}${item.isRx ? '<span class="cart-item-rx"><i class="fa-solid fa-prescription"></i> Rx</span>' : ''}</h4>
                    <p class="cart-item-price">₹${item.price}</p>
                    <div class="cart-item-qty">
                        <button class="cart-item-qty-btn" onclick="changeCartQty('${item.id}',-1)">-</button>
                        <span class="cart-item-qty-num">${item.qty}</span>
                        <button class="cart-item-qty-btn" onclick="changeCartQty('${item.id}',1)">+</button>
                    </div>
                </div>
            </div>
            <button class="cart-item-remove" onclick="removeFromCart('${item.id}')"><i class="fa-solid fa-trash-can"></i></button>
        </div>
    `).join('');
    recalculateBill();
}

window.clearAllCart = function() {
    if (currentCart.length === 0) return;
    showConfirmationModal('Remove all items from cart?', () => {
        currentCart = [];
        localStorage.setItem('medi_cart', JSON.stringify(currentCart));
        showToast('Cart cleared', 'info');
        renderCartPage();
    });
};

window.changeCartQty = function(id, delta) {
    const item = currentCart.find(i => i.id === id);
    if (item) {
        item.qty = Math.max(1, item.qty + delta);
        localStorage.setItem('medi_cart', JSON.stringify(currentCart));
        renderCartPage();
    }
};

window.removeFromCart = function(id) {
    currentCart = currentCart.filter(item => item.id !== id);
    localStorage.setItem('medi_cart', JSON.stringify(currentCart));
    renderCartPage();
};

function recalculateBill() {
    let subtotal = currentCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    // Dynamic bill rule: orders under ₹100 pay a flat ₹5 shipping charge; ₹100 and
    // above ship free. Platform fee and order-processing charge are always free.
    // COD adds a flat ₹10 handling charge on top, regardless of order value.
    const SHIPPING_THRESHOLD = 100;
    let dynamicPlatformFee = 0;
    let dynamicProcessingCharge = 0;
    let shipping = (subtotal > 0 && subtotal < SHIPPING_THRESHOLD) ? 5 : 0;
    let delivery = 0;
    let cod = (selectedPaymentMethod === "COD" && subtotal > 0) ? 10 : 0;
    const freeDelivery = subtotal >= SHIPPING_THRESHOLD;
    discountAmount = Math.min(discountAmount, subtotal);
    let grandTotal = Math.max(0, (subtotal - discountAmount) + shipping + delivery + dynamicPlatformFee + dynamicProcessingCharge + cod);

    const freeWrap = document.getElementById('free-delivery-progress');
    const freeMsg = document.getElementById('free-delivery-msg');
    const freeText = document.getElementById('free-delivery-text');
    const freeFill = document.getElementById('free-delivery-fill');
    if (freeWrap && subtotal > 0) {
        freeWrap.style.display = 'block';
        if (freeDelivery) {
            if (freeMsg) freeMsg.className = 'free-delivery-msg';
            if (freeText) freeText.textContent = 'You get FREE delivery!';
            if (freeFill) { freeFill.style.width = '100%'; freeFill.className = 'free-delivery-bar-fill done'; }
        } else {
            const remaining = Math.max(0, SHIPPING_THRESHOLD - subtotal);
            const pct = Math.min(100, (subtotal / SHIPPING_THRESHOLD) * 100);
            if (freeMsg) freeMsg.className = 'free-delivery-msg red';
            if (freeText) freeText.textContent = `Add ₹${remaining.toFixed(0)} more for FREE delivery`;
            if (freeFill) { freeFill.style.width = pct + '%'; freeFill.className = pct >= 80 ? 'free-delivery-bar-fill close' : 'free-delivery-bar-fill'; }
        }
    } else if (freeWrap) {
        freeWrap.style.display = 'none';
    }

    if (document.getElementById('bill-subtotal')) {
        document.getElementById('bill-subtotal').innerText = `₹${subtotal.toFixed(2)}`;
        const discEl = document.getElementById('bill-discount');
        if (discEl) discEl.innerText = `-₹${discountAmount.toFixed(2)}`;
        const shippingEl = document.getElementById('bill-shipping');
        if (shippingEl) shippingEl.innerText = freeDelivery ? 'FREE' : `₹${shipping.toFixed(2)}`;
        const deliveryEl = document.getElementById('bill-delivery');
        if (deliveryEl) deliveryEl.innerText = freeDelivery ? 'FREE' : `₹${delivery.toFixed(2)}`;
        const platEl = document.getElementById('bill-platform');
        if (platEl) platEl.innerText = `₹${dynamicPlatformFee.toFixed(2)}`;
        const chargeEl = document.getElementById('bill-order-charge');
        if (chargeEl) chargeEl.innerText = `₹${dynamicProcessingCharge.toFixed(2)}`;
        const totalEl = document.getElementById('bill-grand-total');
        if (totalEl) totalEl.innerText = `₹${grandTotal.toFixed(2)}`;
        const freeTag = document.getElementById('free-delivery-tag');
        if (freeTag) freeTag.style.display = freeDelivery ? 'inline-block' : 'none';
    }

    const stickyTotal = document.getElementById('sticky-total-price');
    const stickyBar = document.getElementById('sticky-checkout-bar');
    if (stickyTotal) stickyTotal.textContent = `₹${grandTotal.toFixed(2)}`;
    if (stickyBar) stickyBar.style.display = subtotal > 0 ? 'flex' : 'none';
}

function generateSecureSixDigitOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Opens the real Razorpay Checkout modal and resolves with the payment id on
// success, or null if the payment failed / was dismissed. Previously nothing
// in the app actually called this — selecting Razorpay just marked the order
// "Paid" without collecting any real payment.
function openRazorpayCheckout(amountRupees, customerName, customerPhone) {
    return new Promise((resolve) => {
        if (typeof Razorpay === 'undefined') {
            showToast("Payment gateway failed to load. Please try Cash on Delivery.", "error");
            resolve(null);
            return;
        }
        const options = {
            key: "rzp_test_TDK3YbLhmu0A30", // TEST KEY — replace with the live key before going to production
            amount: Math.round(amountRupees * 100), // Razorpay expects paise
            currency: "INR",
            name: "MediFinder",
            description: "Medicine Order Payment",
            prefill: { name: customerName || '', contact: customerPhone || '' },
            theme: { color: "#e02020" },
            handler: function (response) { resolve(response.razorpay_payment_id); },
            modal: { ondismiss: function () { resolve(null); } }
        };
        const rzp = new Razorpay(options);
        rzp.on('payment.failed', function () {
            showToast("Payment failed. Please try again.", "error");
            resolve(null);
        });
        rzp.open();
    });
}

async function processFinalOrderPayload() {
    if (currentCart.length === 0) { showToast("Your cart is empty!", "error"); return; }
    const addr = JSON.parse(localStorage.getItem('medi_delivery_address') || 'null');
    if (!addr || !addr.house) {
        showToast("Please enter your delivery address first!", "error");
        return;
    }
    const cartHasRxItem = currentCart.some(item => item.isRx === true || item.isRx === 'true');
    if (cartHasRxItem && !isPrescriptionUploaded) {
        showToast("Order blocked! Upload prescription for Rx medicines.", "error");
        return;
    }

    const zoneCheckAtOrder = await checkPincodeServiceability(addr.pincode);
    if (!zoneCheckAtOrder.available) {
        showToast("Unavailable! Service is not launched in your pincode yet. Please try again after 5 days.", "error");
        return;
    }

    if (supabase) {
        try {
            for (const item of currentCart) {
                if (!item.id) continue;
                const { data: med, error: medErr } = await supabase.from('medicines').select('stock_qty, product_name, status, is_rx, prescription_req').eq('id', item.id).single();
                if (medErr || !med) {
                    showToast(`Product "${item.name}" not found in inventory.`, "error");
                    return;
                }
                if (med.status === 'Draft' || med.status === 'Rejected') {
                    showToast(`"${med.product_name}" is not available for purchase (${med.status}).`, "error");
                    return;
                }
                if (med.stock_qty < item.qty) {
                    showToast(`Insufficient stock for "${med.product_name}". Available: ${med.stock_qty}, requested: ${item.qty}.`, "error");
                    return;
                }
                // Re-check the Rx requirement straight from the DB row — the
                // client-side cart flag alone isn't trustworthy since it could
                // be bypassed by editing localStorage.
                const dbIsRx = med.prescription_req ? med.prescription_req === 'Yes' : (med.is_rx === true);
                if (dbIsRx && !isPrescriptionUploaded) {
                    showToast(`Order blocked! "${med.product_name}" requires a prescription upload.`, "error");
                    return;
                }
            }
        } catch(e) {
            showToast("Stock verification failed: " + (e.message || e), "error");
            return;
        }
    }

    const placeOrderBtn = document.getElementById('place-order-final-btn');
    const stickyPlaceBtn = document.getElementById('place-order-sticky-btn');
    const origPlaceBtnHTML = placeOrderBtn ? placeOrderBtn.innerHTML : '';
    const origStickyBtnHTML = stickyPlaceBtn ? stickyPlaceBtn.innerHTML : '';
    if (placeOrderBtn) { placeOrderBtn.disabled = true; placeOrderBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...'; }
    if (stickyPlaceBtn) { stickyPlaceBtn.disabled = true; stickyPlaceBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...'; }

    let razorpayPaymentId = null;
    if (selectedPaymentMethod === 'RAZORPAY') {
        const amountText = document.getElementById('bill-grand-total')?.innerText || "₹0.00";
        const amountRupees = parseFloat(amountText.replace(/[^0-9.]/g, '')) || 0;
        razorpayPaymentId = await openRazorpayCheckout(amountRupees, addr.name, addr.phone);
        if (!razorpayPaymentId) {
            showToast("Payment was not completed — order not placed.", "error");
            if (placeOrderBtn) { placeOrderBtn.disabled = false; placeOrderBtn.innerHTML = origPlaceBtnHTML; }
            if (stickyPlaceBtn) { stickyPlaceBtn.disabled = false; stickyPlaceBtn.innerHTML = origStickyBtnHTML; }
            return;
        }
    }

    try {
    const primaryMerchantId = currentCart.find(item => item.merchantId)?.merchantId || null;
    let physicalDistanceKm = Math.sqrt(Math.pow(userLiveLat - shopCoordinates.lat, 2) + Math.pow(userLiveLng - shopCoordinates.lng, 2)) * 111;
    let calculatedTransitMode = physicalDistanceKm > 15 ? "Truck" : physicalDistanceKm > 5 ? "Van" : "Bike";
    let calculatedETA = Math.round(physicalDistanceKm * 6 + 15);
    const secureDeliveryOTP = generateSecureSixDigitOTP();
    const itemsDescription = currentCart.map(i => `${i.name} × ${i.qty}`).join(', ');
    const firstProductImg = currentCart[0]?.img || "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400";
    const fullAddress = `${addr.house}, ${addr.area}, ${addr.city} - ${addr.pincode}${addr.landmark ? ', Near ' + addr.landmark : ''}`;
    const orderId = "ORD-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();

    const subtotal = currentCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const grandTotal = document.getElementById('bill-grand-total')?.innerText || "₹0.00";

    let currentUserId = '';
    if (supabase) {
        try {
            const { data: userData } = await supabase.auth.getUser();
            currentUserId = userData?.user?.id || '';
            if (!currentUserId) {
                const { data: { session } } = await supabase.auth.getSession();
                currentUserId = session?.user?.id || '';
            }
        } catch(e) {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                currentUserId = session?.user?.id || '';
            } catch(e2) {}
            if (!currentUserId) showToast("User session fetch failed. Order will be placed anonymously.", "info");
        }
    }

    const orderPayload = {
        order_id: orderId,
        user_id: currentUserId || null,
        customer_name: addr.name,
        customer_phone: addr.phone,
        customer_address: fullAddress,
        user_email: supabase ? (await supabase.auth.getUser()).data?.user?.email || '' : '',
        items_text: itemsDescription,
        items_img: firstProductImg,
        address: fullAddress,
        delivery_address: fullAddress,
        payment_mode: selectedPaymentMethod,
        total_bill: grandTotal,
        total_amount: parseFloat(grandTotal.replace('₹', '')) || subtotal,
        total: subtotal,
        payment_status: selectedPaymentMethod === "COD" ? "Pending" : "Paid",
        status: "pending",
        transit_mode: calculatedTransitMode,
        eta_minutes: calculatedETA,
        shop_lat: shopCoordinates.lat,
        shop_lng: shopCoordinates.lng,
        delivery_secure_code: secureDeliveryOTP,
        razorpay_payment_id: razorpayPaymentId || null,
        date_string: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
        merchant_id: primaryMerchantId
    };

    let activeOrdersSystem = JSON.parse(localStorage.getItem('medi_active_orders')) || [];
    activeOrdersSystem.push(orderPayload);
    localStorage.setItem('medi_active_orders', JSON.stringify(activeOrdersSystem));

    if (supabase) {
        try {
            const { data: insertedOrder, error } = await supabase.from('orders').insert([orderPayload]).select().single();
            if (!error && insertedOrder) {
                pushUserNotification(currentUserId, 'order_placed', 'Order Placed', `Your order ${orderId} has been placed successfully.`, orderId);
                const orderItemsPayload = currentCart.map(item => ({
                    order_id: orderId,
                    product_name: item.name,
                    product_image: item.img || '',
                    quantity: item.qty,
                    unit_price: item.price,
                    total_price: item.price * item.qty,
                    status: 'active',
                    merchant_id: item.merchantId || primaryMerchantId || null
                }));
                try { await supabase.from('order_items').insert(orderItemsPayload); } catch (e) {
                    showToast("Order items save error: " + (e.message || e), "error");
                }
                for (const item of currentCart) {
                    if (item.id && item.qty) {
                        try {
                            await supabase.rpc('decrement_stock', { med_id: item.id, qty: item.qty });
                        } catch (e) {
                            try {
                                const { data: currMed } = await supabase.from('medicines').select('stock_qty').eq('id', item.id).single();
                                if (currMed) {
                                    const newQty = Math.max(0, currMed.stock_qty - item.qty);
                                    await supabase.from('medicines').update({ stock_qty: newQty }).eq('id', item.id);
                                }
                            } catch (e2) {}
                        }
                    }
                }
                const notifiedMerchants = new Set();
                for (const item of currentCart) {
                    const mid = item.merchantId || primaryMerchantId;
                    if (mid && !notifiedMerchants.has(mid)) {
                        notifiedMerchants.add(mid);
                        try {
                            await supabase.from('merchant_notifications').insert([{
                                merchant_id: mid,
                                title: 'New Order Received',
                                message: `Order ${orderId} from ${addr.name}. Items: ${itemsDescription}. Total: ₹${grandTotal}. Address: ${fullAddress}`,
                                type: 'info',
                                category: 'order',
                                is_read: false
                            }]);
                        } catch(e) {}
                    }
                }
            } else if (error) {
                // Order insert into the 'orders' table failed - surface the real reason
                // instead of silently pretending it worked, and queue it for auto-retry.
                showToast('Order DB save failed: ' + (error.message || 'Unknown database error') + '. Will auto-retry shortly.', 'error');
                let pendingSync = JSON.parse(localStorage.getItem('medi_pending_order_sync')) || [];
                pendingSync.push(orderPayload);
                localStorage.setItem('medi_pending_order_sync', JSON.stringify(pendingSync));
            }
        } catch (e) {
            showToast('Order DB save failed: ' + (e.message || e) + '. Will auto-retry shortly.', 'error');
            let pendingSync = JSON.parse(localStorage.getItem('medi_pending_order_sync')) || [];
            pendingSync.push(orderPayload);
            localStorage.setItem('medi_pending_order_sync', JSON.stringify(pendingSync));
        }
    }

    const successModal = document.getElementById('success-animation-modal');
    if (successModal) {
        const el1 = document.getElementById('success-order-id');
        const el2 = document.getElementById('success-payment');
        const el3 = document.getElementById('success-eta');
        const el4 = document.getElementById('success-otp-code');
        if (el1) el1.textContent = orderId;
        if (el2) el2.textContent = selectedPaymentMethod === 'COD' ? 'Cash on Delivery' : 'Paid Online';
        if (el3) el3.textContent = calculatedETA + ' mins';
        if (el4) el4.textContent = secureDeliveryOTP;
        successModal.style.display = 'flex';
        setTimeout(function(){ successModal.classList.add('modal-revealed'); }, 50);
        createConfetti();
    } else {
        showToast(`Order placed! Delivery Code: ${secureDeliveryOTP}`, "success");
    }

    // Cart is intentionally left as-is here. The order is already saved to the
    // orders table (i.e. archived) — auto-wiping the cart on top of that was
    // the reported bug. Items now only leave the cart when the user removes
    // them via the existing per-item delete button.
    } finally {
        if (placeOrderBtn) { placeOrderBtn.disabled = false; placeOrderBtn.innerHTML = ''; }
        if (stickyPlaceBtn) { stickyPlaceBtn.disabled = false; stickyPlaceBtn.innerHTML = '<i class="fa-solid fa-bag-shopping"></i> Place Order'; }
    }
}

// Retries any orders that failed to save to the 'orders' table earlier (e.g. due to a
// temporary network/DB error) so they eventually reach the merchant/rider/admin panels.
async function retryPendingOrderSync() {
    if (!supabase) return;
    let pending = JSON.parse(localStorage.getItem('medi_pending_order_sync')) || [];
    if (pending.length === 0) return;

    const stillPending = [];
    let syncedCount = 0;
    for (const payload of pending) {
        try {
            // Skip if it already exists (in case a previous retry partially succeeded)
            const { data: existing } = await supabase.from('orders').select('order_id').eq('order_id', payload.order_id).maybeSingle();
            if (existing) { syncedCount++; continue; }

            const { error } = await supabase.from('orders').insert([payload]);
            if (error) stillPending.push(payload);
            else syncedCount++;
        } catch (e) {
            stillPending.push(payload);
        }
    }
    localStorage.setItem('medi_pending_order_sync', JSON.stringify(stillPending));
    if (syncedCount > 0) {
        showToast(`${syncedCount} pending order(s) synced successfully.`, 'success');
    }
}

function createConfetti() {
    const container = document.getElementById('confettiCanvas');
    if (!container) return;
    container.innerHTML = '';
    const colors = ['#e02020', '#2ed573', '#ffa502', '#3742fa', '#ff6b81', '#1e90ff', '#ffd32a'];
    for (let i = 0; i < 60; i++) {
        const p = document.createElement('div');
        p.className = 'confetti-particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        p.style.animationDuration = (Math.random() * 2 + 1.5) + 's';
        p.style.animationDelay = (Math.random() * 0.8) + 's';
        p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        p.style.width = (Math.random() * 8 + 6) + 'px';
        p.style.height = (Math.random() * 8 + 6) + 'px';
        container.appendChild(p);
    }
    setTimeout(function(){ container.innerHTML = ''; }, 4000);
}

// ============================================================
// ORDERS PAGE
// ============================================================
async function refreshOrdersFromServer() {
    const listContainer = document.getElementById('order-list');
    if (!listContainer) return;
    if (supabase) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { data: dbOrders } = await supabase.from('orders')
                    .select('*')
                    .or(`user_id.eq.${session.user.id},customer_phone.eq.${session.user.phone || ''},user_email.eq.${session.user.email || ''}`)
                    .order('created_at', { ascending: false })
                    .limit(20);
                if (dbOrders && dbOrders.length > 0) {
                    const active = dbOrders.filter(o => !['delivered', 'cancelled'].includes((o.status || '').toLowerCase()));
                    const completed = dbOrders.filter(o => ['delivered', 'cancelled'].includes((o.status || '').toLowerCase()));
                    localStorage.setItem('medi_active_orders', JSON.stringify(active));
                    localStorage.setItem('medi_completed_orders', JSON.stringify(completed));
                }
            }
        } catch (e) {}
    }
    const currentTab = document.querySelector('.tab-btn.active')?.dataset?.filter || 'active';
    renderOrdersUI(currentTab);
}

async function setupOrdersPageModules() {
    const listContainer = document.getElementById('order-list');
    if (!listContainer) return;

    await refreshOrdersFromServer();

    const tabBtns = document.querySelectorAll('.tab-btn');
    let lastFilter = 'active';
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.dataset.filter;
            if (filter === lastFilter) return;
            lastFilter = filter;
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            listContainer.style.animation = 'none';
            listContainer.offsetHeight;
            listContainer.style.animation = 'orderFadeIn 0.15s ease-out';
            renderOrdersUI(filter);
        });
    });
    renderOrdersUI('active');
    listenToUserOrders();
}

let userOrdersChannel = null;
function listenToUserOrders() {
    if (!supabase || userOrdersChannel) return;
    userOrdersChannel = supabase
        .channel('user-orders-realtime')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
            const updated = payload.new;
            if (updated.user_email !== currentUserEmail) return;
            let active = JSON.parse(localStorage.getItem('medi_active_orders')) || [];
            let completed = JSON.parse(localStorage.getItem('medi_completed_orders')) || [];
            const id = updated.order_id || updated.id;
            const idxActive = active.findIndex(o => (o.order_id || o.id) === id);
            const idxCompleted = completed.findIndex(o => (o.order_id || o.id) === id);
            if (['delivered', 'cancelled'].includes((updated.status || '').toLowerCase())) {
                if (idxActive !== -1) { completed.push(active.splice(idxActive, 1)[0]); }
                else if (idxCompleted !== -1) { completed[idxCompleted] = updated; }
                else { completed.unshift(updated); }
            } else {
                if (idxActive !== -1) { active[idxActive] = { ...active[idxActive], ...updated }; }
                else { active.unshift(updated); }
            }
            localStorage.setItem('medi_active_orders', JSON.stringify(active));
            localStorage.setItem('medi_completed_orders', JSON.stringify(completed));
            const currentTab = document.querySelector('.tab-btn.active')?.dataset?.filter || 'active';
            renderOrdersUI(currentTab);
            const statusText = (updated.status || '').toLowerCase();
            const statusMap = { pending: 'Order Placed', accepted: 'Accepted by pharmacy', arrived_at_store: 'Rider at pharmacy', picked_up: 'Picked up by rider', shipped: 'Out for delivery', delivered: 'Delivered!', broadcasted: 'Rider search active', cancelled: 'Order cancelled' };
            showToast(statusMap[statusText] || `Order status: ${updated.status}`, statusText === 'delivered' ? 'success' : statusText === 'cancelled' ? 'error' : 'info');
        })
        .subscribe();
}

function renderOrdersUI(filterMode) {
    const listContainer = document.getElementById('order-list');
    if (!listContainer) return;
    let activeOrders = JSON.parse(localStorage.getItem('medi_active_orders')) || [];
    let completedOrders = JSON.parse(localStorage.getItem('medi_completed_orders')) || [];

    if (filterMode === 'active') {
        if (activeOrders.length === 0) {
            listContainer.innerHTML = `<div class="cart-item-placeholder" style="text-align:center;padding:40px;color:#747d8c;"><p><i class="fa-solid fa-box-open" style="font-size:2rem;color:#ccc;margin-bottom:10px;"></i><br>No active orders executing right now.</p></div>`;
            return;
        }
        listContainer.innerHTML = activeOrders.map(order => {
        let statusLabel = "Ordered";
                const s = (order.status || '').toLowerCase();
                if (s === "pending") statusLabel = "Order Placed";
                else if (s === "accepted") statusLabel = "Accepted";
                else if (s === "arrived_at_store") statusLabel = "At Pharmacy";
                else if (s === "picked_up" || s === "shipped" || s === "broadcasted") statusLabel = "Out for Delivery";
                else if (s === "delivered") statusLabel = "Delivered";
                else if (s === "cancelled") statusLabel = "Cancelled";
            return `
                <div class="single-order-card" id="order-card-${order.order_id || order.id}" data-status="active" style="margin-bottom:12px;display:flex;flex-direction:row;justify-content:space-between;align-items:center;padding:14px;background:#ffffff;border-radius:16px;border:1px solid #eef2f5;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
                    <div class="order-info-wrapper" style="display:flex;align-items:center;gap:12px;flex:1;">
                        <div class="order-img-box" style="width:60px;height:60px;background:#f8f9fa;border-radius:10px;padding:4px;display:flex;justify-content:center;align-items:center;flex-shrink:0;border:1px solid #f1f2f6;">
                            <img src="${order.items_img}" alt="Medicine Box" style="max-width:100%;max-height:100%;object-fit:contain;">
                        </div>
                        <div class="order-meta">
                            <h4 style="font-size:0.85rem;color:#2f3542;font-weight:700;margin-bottom:2px;">ID: ${order.order_id || order.id}</h4>
                            <p style="margin:0;font-size:0.75rem;color:#747d8c;">Date: ${order.date_string}</p>
                            <p style="margin:0;font-size:0.75rem;color:#747d8c;">${order.items_text}</p>
                            <p style="font-weight:700;color:#1c82aa;margin-top:2px;">Total: ${order.total_bill}</p>
                            <p style="margin:0;font-size:0.75rem;color:#2ed573;font-weight:600;">Pipeline: Tracking Active</p>
                        </div>
                    </div>
                    <div class="order-action-area" style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;margin-left:8px;">
                        <span style="font-size:0.65rem;font-weight:700;padding:3px 8px;border-radius:20px;background:#fff9db;color:#f59f00;">${statusLabel}</span>
                        <div style="display:flex;flex-direction:column;gap:6px;width:100%;">
                            <button style="background:#1c82aa;color:white;border:none;padding:6px 14px;border-radius:8px;font-size:0.75rem;font-weight:600;cursor:pointer;" onclick="openLiveTrackingModal('${order.order_id || order.id}','${order.transit_mode||'Bike'}',${order.shop_lat||22.578},${order.shop_lng||88.365},${order.eta_minutes||20},'${order.status}')">Track</button>
                            <button style="background:#2ed573;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:0.75rem;font-weight:600;cursor:pointer;" onclick="openDeliveryBoyVerificationModal('${order.order_id || order.id}')">View OTP</button>
                            <button style="background:#ff4d4d;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:0.75rem;font-weight:600;cursor:pointer;" onclick="handleCancelOrderFlow('${order.order_id || order.id}','${order.status}')">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } else if (filterMode === 'completed') {
        if (completedOrders.length === 0) {
            listContainer.innerHTML = `<div class="cart-item-placeholder" style="text-align:center;padding:40px;color:#747d8c;"><p><i class="fa-solid fa-history" style="font-size:2rem;color:#ccc;margin-bottom:10px;"></i><br>Order history is empty.</p></div>`;
            return;
        }
        listContainer.innerHTML = completedOrders.map(order => {
            // Check if order is within 7 days and above ₹1000
            let showReturn = false;
            const billStr = (order.total_bill || '').replace('₹', '').replace(',', '');
            const billAmount = parseFloat(billStr) || 0;
            
            // Parse order date
            let orderDate = null;
            if (order.date_string) {
                orderDate = new Date(order.date_string);
            } else if (order.delivered_at) {
                orderDate = new Date(order.delivered_at);
            }
            
            const now = new Date();
            const daysDiff = orderDate ? Math.floor((now - orderDate) / (1000 * 60 * 60 * 24)) : 999;
            
            if (billAmount >= 1000 && daysDiff <= 7) {
                showReturn = true;
            }

            return `
            <div class="single-order-card" style="margin-bottom:12px;display:flex;flex-direction:row;justify-content:space-between;align-items:center;padding:14px;background:#ffffff;border-radius:16px;border:1px solid #eef2f5;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
                <div style="display:flex;align-items:center;gap:12px;flex:1;">
                    <div style="width:60px;height:60px;background:#f8f9fa;border-radius:10px;padding:4px;display:flex;justify-content:center;align-items:center;border:1px solid #f1f2f6;">
                        <img src="${order.items_img}" style="max-width:100%;max-height:100%;object-fit:contain;">
                    </div>
                    <div>
                        <h4 style="font-size:0.85rem;color:#2f3542;font-weight:700;margin-bottom:2px;">ID: ${order.order_id || order.id}</h4>
                        <p style="margin:0;font-size:0.75rem;color:#747d8c;">Date: ${order.date_string}</p>
                        <p style="margin:0;font-size:0.75rem;color:#747d8c;">${order.items_text}</p>
                        <p style="font-weight:700;color:#e02020;margin-top:2px;">Total: ${order.total_bill}</p>
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                    <span style="font-size:0.65rem;font-weight:700;padding:3px 8px;border-radius:20px;background:#e3faf2;color:#2ed573;"><i class="fa-solid fa-circle-check"></i> Delivered</span>
                    ${showReturn ? `<button onclick="handleReturnOrder('${order.order_id || order.id}')" style="background:#e02020;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:0.7rem;font-weight:700;cursor:pointer;box-shadow:0 3px 8px rgba(224,32,32,0.3);"><i class="fa-solid fa-rotate-left"></i> Return</button>` : ''}
                </div>
            </div>
        `}).join('');
    }
}

window.handleCancelOrderFlow = function(orderId, pipelineStatus) {
    const ps = (pipelineStatus || '').toLowerCase();
    if (ps === "shipped" || ps === "broadcasted" || ps === "picked_up" || ps === "delivered") {
        showToast("This order is out for delivery and cannot be canceled.", "error");
        return;
    }
    showConfirmationModal("Are you sure you want to cancel this order?", async () => {
        let activeOrdersList = JSON.parse(localStorage.getItem('medi_active_orders')) || [];
        const targetOrder = activeOrdersList.find(o => (o.order_id || o.id) === orderId);
        activeOrdersList = activeOrdersList.filter(o => (o.order_id || o.id) !== orderId);
        localStorage.setItem('medi_active_orders', JSON.stringify(activeOrdersList));

        if (supabase) {
            try {
                const { error: updateErr } = await supabase.from('orders')
                    .update({ status: 'cancelled', cancellation_reason: 'Cancelled by user' })
                    .eq('order_id', orderId);
                if (updateErr) showToast('Order status update error: ' + (updateErr.message || updateErr), 'error');

                // This row is what actually makes the cancellation show up on the admin
                // refund panel (adminuser.js reads from the 'cancelled_orders' table).
                const { error: cancelInsertErr } = await supabase.from('cancelled_orders').insert([{
                    order_id: orderId,
                    customer: targetOrder?.customer_name || '',
                    total_amount: targetOrder?.total_amount || targetOrder?.total_bill || 0,
                    reason: 'Cancelled by user',
                    payment: targetOrder?.payment_mode || 'Online',
                    status: 'Pending'
                }]);
                if (cancelInsertErr) showToast('Cancelled-order record save error: ' + (cancelInsertErr.message || cancelInsertErr), 'error');
                const cancelUid = await getCurrentAuthUserId();
                pushUserNotification(cancelUid, 'cancelled', 'Order Cancelled', `Your order ${orderId} has been cancelled.`, orderId);
            } catch (e) {
                showToast('Cancellation sync error: ' + (e.message || e), 'error');
            }
        }
        showToast("Order canceled successfully.", "success");
        setupOrdersPageModules();
    });
};

window.handleReturnOrder = async function(orderId) {
    const reason = await new Promise(resolve => {
        const m = document.createElement('div');
        m.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
        m.innerHTML = `<div style="background:#fff;border-radius:16px;padding:24px;width:90%;max-width:360px;text-align:center;">
            <h3 style="margin:0 0 12px;font-size:1rem;color:#2f3542;">Return Reason</h3>
            <select id="_pi" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.9rem;margin-bottom:14px;outline:none;">
                <option value="">Select reason...</option>
                <option value="defective">Defective Product</option>
                <option value="wrong_item">Wrong Item Delivered</option>
                <option value="damaged">Damaged in Transit</option>
                <option value="expired">Expired Product</option>
                <option value="not_as_described">Not as Described</option>
                <option value="quality_issue">Quality Issue</option>
                <option value="changed_mind">Changed Mind</option>
            </select>
            <textarea id="_pd" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.9rem;margin-bottom:14px;outline:none;min-height:60px;resize:vertical;" placeholder="Additional details (optional)"></textarea>
            <div style="display:flex;gap:10px;">
                <button onclick="this.closest('[style*=\"position: fixed\"]')?.remove()" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-weight:600;">Cancel</button>
                <button id="_po" style="flex:1;padding:10px;border:none;border-radius:8px;background:#e02020;color:#fff;cursor:pointer;font-weight:600;">Submit Return</button>
            </div>
        </div>`;
        document.body.appendChild(m);
        m.querySelector('#_pi').focus();
        m.querySelector('#_po').onclick = () => { const v = m.querySelector('#_pi').value; const d = m.querySelector('#_pd').value; m.remove(); resolve(v ? {reason:v, description:d} : null); };
        m.onclick = (e) => { if (e.target === m) { m.remove(); resolve(null); } };
    });
    if (!reason) return;
    const reasonLabels = {defective:'Defective Product',wrong_item:'Wrong Item Delivered',damaged:'Damaged in Transit',expired:'Expired Product',not_as_described:'Not as Described',quality_issue:'Quality Issue',changed_mind:'Changed Mind'};
    if (supabase) {
        try {
            const { error } = await supabase.from('returns').insert([{
                order_id: orderId,
                reason: reason.reason,
                description: reason.description || '',
                status: 'pending',
                date_requested: new Date().toISOString(),
                timeline: [{time: new Date().toISOString(), event: 'Return request submitted', completed: true}]
            }]);
            if (error) throw error;
            showToast("Return request submitted successfully!", "success");
        } catch(e) {

            showToast("Return request submitted. We'll process it shortly.", "info");
        }
    } else {
        showToast("Return request submitted. We'll process it shortly.", "info");
    }
};

window.openLiveTrackingModal = function(orderId, forceVehicle = "Bike", shopLat = 22.578, shopLng = 88.365, baseEta = 20, currentStatus = "Active") {
    const modal = document.getElementById('tracking-modal');
    if (!modal) return;
    modal.style.display = "flex";
    modal.classList.add('active');
    const modalOrderId = document.getElementById('modal-order-id');
    if (modalOrderId) modalOrderId.innerText = `Order Tracking: ${orderId}`;
    const stepPlaced = document.getElementById('step-placed');
    const stepShipping = document.getElementById('step-shipping');
    const stepDelivery = document.getElementById('step-delivery');
    if (stepPlaced) stepPlaced.className = "timeline-step finished";
    if (stepShipping) stepShipping.className = "timeline-step";
    if (stepDelivery) stepDelivery.className = "timeline-step";
    if (currentStatus === "accepted") {
        if (stepPlaced) stepPlaced.className = "timeline-step finished";
        const t = stepPlaced?.querySelector('.text');
        if (t) t.innerText = "Accepted & Packed";
    } else if (currentStatus === "shipped" || currentStatus === "arrived_at_store" || currentStatus === "picked_up") {
        if (stepPlaced) stepPlaced.className = "timeline-step finished";
        if (stepShipping) stepShipping.className = "timeline-step active";
    }
    const mapContainer = modal.querySelector('.map-container');
    if (mapContainer) {
        mapContainer.innerHTML = `
            <div style="background:#fff3f3;padding:16px;border-radius:12px;text-align:center;border:1px solid #ffe4e4;">
                <i class="fa-solid fa-clock" style="font-size:2rem;color:#e02020;margin-bottom:8px;display:block;"></i>
                <p style="font-size:0.85rem;font-weight:700;color:#e02020;margin:0 0 4px 0;">Estimated Delivery</p>
                <p style="font-size:1.5rem;font-weight:800;color:#2f3542;margin:0;"><span id="live-countdown-val">${baseEta}</span> mins</p>
                <p style="font-size:0.75rem;color:#747d8c;margin:6px 0 0 0;">Live tracking will be available once rider is assigned</p>
            </div>
        `;
        document.getElementById('close-tracking-modal').onclick = () => {
            modal.classList.remove('active');
            modal.style.display = "none";
        };
    }
};

window.openDeliveryBoyVerificationModal = async function(orderId) {
    let currentSecureOTP = "123456";
    let activeOrders = JSON.parse(localStorage.getItem('medi_active_orders')) || [];
    let targetOrder = activeOrders.find(o => (o.order_id || o.id) === orderId);
    if (targetOrder) currentSecureOTP = targetOrder.delivery_secure_code || "123456";
    if (supabase) {
        try {
            const { data, error } = await supabase.from('orders').select('delivery_secure_code').eq('order_id', orderId).single();
            if (!error && data && data.delivery_secure_code) currentSecureOTP = data.delivery_secure_code;
        } catch(e) {}
    }
    let popup = document.createElement('div');
    popup.className = "modal active";
    popup.id = "otp-verification-modal";
    popup.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100vh;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;z-index:10000;padding:16px;box-sizing:border-box;`;
    popup.innerHTML = `
        <div class="modal-content" style="background:#fff;width:100%;max-width:400px;border-radius:16px;padding:20px;text-align:center;box-sizing:border-box;border-top:5px solid #ff4d4d;">
            <h3 style="color:#ff4d4d;margin-bottom:10px;"><i class="fa-solid fa-shield-halved"></i> Secure Delivery Gateway</h3>
            <p style="font-size:0.85rem;color:#6c757d;margin-bottom:15px;">Share this 6-digit secure code with the delivery agent to confirm parcel handover.</p>
            <div id="view-delivery-otp" style="width:80%;margin:0 auto;padding:12px;font-size:1.8rem;font-weight:bold;color:#ff4d4d;letter-spacing:4px;border:2px dashed #ff4d4d;background:#f8f9fa;border-radius:8px;">${currentSecureOTP}</div>
            <div style="display:flex;gap:10px;margin-top:16px;">
                <button type="button" id="close-otp-modal" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;">Cancel</button>
                <button type="button" id="submit-otp-verification" style="flex:1;padding:10px;border-radius:8px;border:none;background:#2ed573;color:#fff;cursor:pointer;font-weight:600;">Confirm & Complete</button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);
    document.getElementById('close-otp-modal').onclick = () => {
        popup.remove();
    };
    document.getElementById('submit-otp-verification').onclick = async () => {
        let activeOrdersList = JSON.parse(localStorage.getItem('medi_active_orders')) || [];
        let completedOrdersList = JSON.parse(localStorage.getItem('medi_completed_orders')) || [];
        let idx = activeOrdersList.findIndex(o => (o.order_id || o.id) === orderId);
        let paymentStatus = 'Paid';
        if (idx !== -1) {
            let doneOrder = activeOrdersList[idx];
            doneOrder.status = "delivered";
            paymentStatus = (doneOrder.payment_mode === 'COD') ? 'Pending' : 'Paid';
            doneOrder.payment_status = paymentStatus;
            activeOrdersList.splice(idx, 1);
            completedOrdersList.push(doneOrder);
            localStorage.setItem('medi_active_orders', JSON.stringify(activeOrdersList));
            localStorage.setItem('medi_completed_orders', JSON.stringify(completedOrdersList));
        }
        if (supabase) { try { await supabase.from('orders').update({ status:'delivered', payment_status: paymentStatus }).eq('order_id', orderId); } catch(e) { showToast("Order status DB update error: " + (e.message || e), "error"); } }
        showToast("Delivery verified successfully!", "success");
        popup.remove();
        setupOrdersPageModules();
    };
};

// ============================================================
// MAP PAGE - Real-time GPS, Search + Suggestions, Distance, GO direction
// ============================================================
// Fetches an actual road route (turn-by-turn road geometry) from the free/open
// OSRM demo server instead of drawing a straight line that ignores rivers,
// ponds, buildings, etc. Falls back to a straight line only if OSRM is
// unreachable, so the map never breaks even if the free service is briefly down.
async function fetchRoadRoute(fromLat, fromLng, toLat, toLng) {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data && data.code === 'Ok' && data.routes && data.routes[0]) {
            return {
                coords: data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]),
                distanceKm: data.routes[0].distance / 1000,
                durationMin: Math.round(data.routes[0].duration / 60)
            };
        }
    } catch (e) { /* fall through to straight-line fallback below */ }
    return null;
}

async function setupMapPageModules() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    const cityLabel = document.getElementById('current-city');
    if (cityLabel) {
        cityLabel.innerText = "Detecting location...";
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                userLiveLat = pos.coords.latitude;
                userLiveLng = pos.coords.longitude;
                try {
                    const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${userLiveLat}&lon=${userLiveLng}&format=json`);
                    const geo = await resp.json();
                    const city = geo.address?.city || geo.address?.town || geo.address?.village || "Your Location";
                    cityLabel.innerText = city;
                } catch(e) { cityLabel.innerText = "Your Location"; }
            });
        }
    }

    let map = L.map('map', { zoomControl: false }).setView([userLiveLat, userLiveLng], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);

    const userIcon = L.divIcon({ html: '<i class="fa-solid fa-street-view" style="color:#ff4d4d;font-size:30px;"></i>', className: 'custom-div-icon', iconSize: [30,30] });
    const shopIcon = L.divIcon({ html: '<i class="fa-solid fa-shop" style="color:#e02020;font-size:24px;"></i>', className: 'custom-div-icon', iconSize: [24,24] });
    const shopIconActive = L.divIcon({ html: '<div style="background:#e02020;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(224,32,32,0.4);"><i class="fa-solid fa-shop" style="color:#fff;font-size:14px;"></i></div>', className: 'custom-div-icon', iconSize: [28,28] });

    let humanMarker = L.marker([userLiveLat, userLiveLng], { icon: userIcon }).addTo(map).bindPopup("<b>You Are Here</b>").openPopup();
    let operationalRoutingControl = null;
    let activeShopMarker = null;

    let pharmacyDatabaseHub = [];
    let allShopMarkers = [];
    const NEARBY_RADIUS_KM = 20;

    try {
        if (supabase) {
            const { data, error } = await supabase
                .from('merchants')
                .select('id, merchant_name, shop_name, latitude, longitude, status, license_status, city, address')
                .in('status', ['active', 'approved']);
            if (!error && data && data.length > 0) {
                let allPharmacies = data.map(m => ({
                    id: m.id,
                    name: m.shop_name || m.merchant_name || 'Pharmacy',
                    lat: parseFloat(m.latitude) || 22.5726,
                    lng: parseFloat(m.longitude) || 88.3639,
                    city: m.city || '',
                    address: m.address || '',
                    license: m.license_status || 'Unverified'
                }));

                // Only show pharmacies actually near the user, closest first —
                // previously every registered pharmacy in the whole database
                // showed up regardless of distance.
                allPharmacies.forEach(shop => { shop._dist = haversineKm(userLiveLat, userLiveLng, shop.lat, shop.lng); });
                allPharmacies.sort((a, b) => a._dist - b._dist);
                let nearby = allPharmacies.filter(s => s._dist <= NEARBY_RADIUS_KM);
                if (nearby.length === 0) nearby = allPharmacies.slice(0, 5); // fallback if none within radius

                pharmacyDatabaseHub = nearby;

                pharmacyDatabaseHub.forEach(shop => {
                    const marker = L.marker([shop.lat, shop.lng], { icon: shopIconActive }).addTo(map)
                        .bindPopup(`<b style="color:#e02020;">${shop.name}</b><br><span style="font-size:12px;">${shop.address || shop.city || ''}</span>`);
                    allShopMarkers.push(marker);
                });

                if (pharmacyDatabaseHub.length > 1) {
                    const bounds = L.latLngBounds(pharmacyDatabaseHub.map(s => [s.lat, s.lng]));
                    bounds.extend([userLiveLat, userLiveLng]);
                    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
                } else if (pharmacyDatabaseHub.length === 1) {
                    map.setView([pharmacyDatabaseHub[0].lat, pharmacyDatabaseHub[0].lng], 14);
                }
            }
        }
    } catch(e) {

    }

    renderAllShops(pharmacyDatabaseHub);

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(async (pos) => {
            userLiveLat = pos.coords.latitude;
            userLiveLng = pos.coords.longitude;
            humanMarker.setLatLng([userLiveLat, userLiveLng]);
            if (operationalRoutingControl && activeShopMarker) {
                const dest = activeShopMarker.getLatLng();
                map.removeLayer(operationalRoutingControl);
                const route = await fetchRoadRoute(userLiveLat, userLiveLng, dest.lat, dest.lng);
                operationalRoutingControl = L.polyline(route ? route.coords : [[userLiveLat, userLiveLng], [dest.lat, dest.lng]], {
                    color: "#ff4757", weight: 5, opacity: 0.85, dashArray: route ? null : '5,10'
                }).addTo(map);
            }
        }, (err) => {}, { enableHighAccuracy: true, maximumAge: 1000 });
    }

    const liveLocBtn = document.getElementById('live-location-btn');
    if (liveLocBtn) {
        liveLocBtn.addEventListener('click', () => {
            map.setView([userLiveLat, userLiveLng], 16);
            humanMarker.setLatLng([userLiveLat, userLiveLng]);
            humanMarker.openPopup();
        });
    }

    const triggerLiveMapDirections = async (shop) => {
        if (operationalRoutingControl) map.removeLayer(operationalRoutingControl);
        if (activeShopMarker) map.removeLayer(activeShopMarker);
        activeShopMarker = L.marker([shop.lat, shop.lng], { icon: shopIcon }).addTo(map)
            .bindPopup(`<b>${shop.name}</b><br>${shop.address || ''}`).openPopup();

        const route = await fetchRoadRoute(userLiveLat, userLiveLng, shop.lat, shop.lng);
        operationalRoutingControl = L.polyline(route ? route.coords : [[userLiveLat, userLiveLng], [shop.lat, shop.lng]], {
            color: "#ff4757", weight: 5, opacity: 0.85, dashArray: route ? null : '5,10'
        }).addTo(map);
        map.fitBounds(operationalRoutingControl.getBounds(), { padding: [50,50] });
        if (route) {
            const etaLabel = route.durationMin < 60 ? `${route.durationMin} min` : `${Math.floor(route.durationMin/60)}h ${route.durationMin%60}m`;
            showToast(`Road route: ${route.distanceKm.toFixed(1)} km • ~${etaLabel}`, "info");
        }
    };

    function renderAllShops(shops) {
        const displayGrid = document.getElementById('search-results');
        const countEl = document.getElementById('pharmacy-count');
        if (!displayGrid) return;
        if (countEl) countEl.innerText = `${shops.length} Nearby`;
        if (shops.length === 0) {
            displayGrid.innerHTML = `<div style="text-align:center;padding:30px;color:#747d8c;"><i class="fa-solid fa-store-slash" style="font-size:2rem;color:#ddd;margin-bottom:8px;display:block;"></i><p style="font-size:0.82rem;">No pharmacies registered yet.</p></div>`;
            return;
        }
        displayGrid.innerHTML = shops.map(shop => {
            const distKm = haversineKm(userLiveLat, userLiveLng, shop.lat, shop.lng);
            const etaMins = Math.round(distKm * 6 + 5);
            const etaLabel = etaMins < 60 ? `${etaMins} min` : `${Math.floor(etaMins/60)}h ${etaMins%60}m`;
            const distLabel = distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`;
            return `
                <div class="shop-card" data-shop-id="${shop.id}">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                                <i class="fa-solid fa-shop" style="color:#e02020;font-size:0.85rem;"></i>
                                <h4 style="color:#e02020;margin:0;font-size:0.9rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${shop.name}</h4>
                            </div>
                            <p style="margin:2px 0;font-size:0.75rem;color:#747d8c;"><i class="fa-solid fa-location-dot"></i> ${shop.address || shop.city || 'Location set'}</p>
                            <div style="display:flex;gap:12px;margin-top:6px;">
                                <span style="font-size:0.73rem;color:#1c82aa;font-weight:600;"><i class="fa-solid fa-route"></i> ${distLabel}</span>
                                <span style="font-size:0.73rem;color:#2ed573;font-weight:600;"><i class="fa-solid fa-clock"></i> ${etaLabel}</span>
                                ${shop.license === 'Verified' ? '<span style="font-size:0.7rem;color:#28a745;font-weight:600;"><i class="fa-solid fa-circle-check"></i> Verified</span>' : ''}
                            </div>
                        </div>
                        <button class="run-routing-trigger" data-shop='${JSON.stringify(shop).replace(/'/g, "&#39;")}' style="background:#e02020;color:#fff;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-size:0.75rem;font-weight:600;white-space:nowrap;flex-shrink:0;"><i class="fa-solid fa-diamond-turn-right"></i> GO</button>
                    </div>
                </div>`;
        }).join('');

        displayGrid.querySelectorAll('.run-routing-trigger').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const shop = JSON.parse(btn.dataset.shop);
                triggerLiveMapDirections(shop);
                map.setView([shop.lat, shop.lng], 15);
                const matchedMarker = allShopMarkers.find(m => {
                    const ll = m.getLatLng();
                    return Math.abs(ll.lat - shop.lat) < 0.0001 && Math.abs(ll.lng - shop.lng) < 0.0001;
                });
                if (matchedMarker) matchedMarker.openPopup();
            });
        });
    }

    const searchBtn = document.getElementById('map-search-btn');
    const inputField = document.getElementById('medicine-search');

    if (inputField) {
        let mapSuggestBox = document.createElement('div');
        mapSuggestBox.style.cssText = `position:absolute;top:100%;left:0;right:0;background:#fff;border-radius:0 0 10px 10px;box-shadow:0 8px 20px rgba(0,0,0,0.12);z-index:9999;display:none;max-height:150px;overflow-y:auto;border:1px solid #f1f2f6;`;
        const sbWrapper = inputField.closest('.search-bar') || inputField.parentElement;
        sbWrapper.style.position = 'relative';
        sbWrapper.appendChild(mapSuggestBox);

        const medicineSuggestions = ["Paracetamol","Amoxicillin","Vitamin C","Ibuprofen","Cetirizine","Azithromycin","Metformin","Insulin","Omeprazole","Cough Syrup","Betadine","Dolo 650","Crocin","Ranitidine","Ciprofloxacin"];

        inputField.addEventListener('input', () => {
            const q = inputField.value.trim().toLowerCase();
            if (q.length >= 2) {
                const matches = medicineSuggestions.filter(m => m.toLowerCase().includes(q)).slice(0, 4);
                if (matches.length > 0) {
                    mapSuggestBox.innerHTML = matches.map(m => `<div style="padding:8px 14px;cursor:pointer;font-size:0.85rem;color:#2f3542;border-bottom:1px solid #f8f9fa;" class="map-sug-item">${m}</div>`).join('');
                    mapSuggestBox.style.display = 'block';
                    mapSuggestBox.querySelectorAll('.map-sug-item').forEach(item => {
                        item.addEventListener('mousedown', (ev) => {
                            ev.preventDefault();
                            inputField.value = item.innerText;
                            mapSuggestBox.style.display = 'none';
                            if (searchBtn) searchBtn.click();
                        });
                    });
                } else {
                    mapSuggestBox.style.display = 'none';
                }
            } else {
                mapSuggestBox.style.display = 'none';
            }
        });
        inputField.addEventListener('blur', () => setTimeout(() => { mapSuggestBox.style.display = 'none'; }, 200));
        inputField.addEventListener('keypress', (e) => { if (e.key === 'Enter' && searchBtn) searchBtn.click(); });
    }

    if (searchBtn && inputField) {
        searchBtn.addEventListener('click', async () => {
            const token = inputField.value.trim().toLowerCase();
            if (!token) {
                renderAllShops(pharmacyDatabaseHub);
                allShopMarkers.forEach(m => m.addTo(map));
                return;
            }

            // Find which NEARBY pharmacies actually have this medicine in stock
            // (previously this just matched the pharmacy's own name, so it
            // showed every registered pharmacy regardless of what they stock).
            let matchedStores = [];
            if (supabase) {
                try {
                    const nearbyIds = pharmacyDatabaseHub.map(s => s.id);
                    const { data: stockRows, error } = await supabase
                        .from('medicines')
                        .select('merchant_id, name, product_name, stock_qty, status')
                        .eq('status', 'Approved')
                        .or(`name.ilike.%${token}%,product_name.ilike.%${token}%`);
                    if (!error && stockRows) {
                        const inStockMerchantIds = new Set(
                            stockRows.filter(r => (r.stock_qty || 0) > 0).map(r => String(r.merchant_id))
                        );
                        matchedStores = pharmacyDatabaseHub.filter(s => inStockMerchantIds.has(String(s.id)));
                    }
                } catch (e) { /* fall back below */ }
            }
            if (matchedStores.length === 0) {
                // fallback: at least match by pharmacy name so the search never goes empty on a lookup error
                matchedStores = pharmacyDatabaseHub.filter(s => s.name.toLowerCase().includes(token));
            }

            allShopMarkers.forEach(m => map.removeLayer(m));
            matchedStores.forEach(shop => {
                const marker = L.marker([shop.lat, shop.lng], { icon: shopIcon }).addTo(map)
                    .bindPopup(`<b>${shop.name}</b><br>${shop.address || ''}`);
                allShopMarkers.push(marker);
            });
            renderAllShops(matchedStores);
        });
    }
}

function openMapMedicineProductDetailsPopup(shop, queriedToken) {
    let popup = document.createElement('div');
    popup.className = "modal active";
    popup.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100vh;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;z-index:10000;padding:16px;box-sizing:border-box;`;
    const distKm = Math.sqrt(Math.pow(userLiveLat - shop.lat, 2) + Math.pow(userLiveLng - shop.lng, 2)) * 111;
    const etaMins = Math.round(distKm * 6 + 5);
    const etaLabel = etaMins < 60 ? `${etaMins} mins` : `${Math.floor(etaMins/60)}h ${etaMins%60}m`;
    popup.innerHTML = `
        <div class="modal-content" style="background:#fff;width:100%;max-width:400px;border-radius:16px;padding:20px;text-align:center;box-sizing:border-box;border-top:5px solid #ff4d4d;">
            <h2 style="color:#ff4d4d;font-size:1.3rem;">${queriedToken.toUpperCase()}</h2>
            <p style="font-size:0.85rem;margin:6px 0;">Available at: <strong>${shop.name}</strong></p>
            <div style="background:#f8f9fa;padding:10px;border-radius:8px;font-size:0.8rem;margin:10px 0;text-align:left;">
                <p><i class="fa-solid fa-location-dot" style="color:#ff4d4d;"></i> Distance: <strong>${distKm.toFixed(1)} km</strong></p>
                <p><i class="fa-solid fa-truck-fast" style="color:#1c82aa;"></i> Est. Delivery: <strong>${etaLabel}</strong></p>
                <p><strong>Composition:</strong> Active Pharma Molecule Salts</p>
                <p><strong>Safety Warning:</strong> Prescription required for Rx items.</p>
            </div>
            <div style="display:flex;gap:10px;margin-top:15px;">
                <button id="map-modal-close" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;">Back to Map</button>
                <button id="map-modal-buy" style="flex:1;padding:10px;border-radius:8px;border:none;background:#2ed573;color:#fff;cursor:pointer;font-weight:600;">Buy / Add to Cart</button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);
    document.getElementById('map-modal-close').onclick = () => popup.remove();
    document.getElementById('map-modal-buy').onclick = () => {
        addToCart({ id: "m1", name: queriedToken.toUpperCase() + " Core Dose", price: 45.00, img: "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400", isRx: false });
        popup.remove();
        window.location.href = 'usercart.html';
    };
}

// ============================================================
// PROFILE PAGE
// ============================================================
function setupProfilePageModules() {
    const cachedName = localStorage.getItem('medi_profile_name') || "Guest User";
    const userNameElement = document.getElementById('user-name');
    const nameInputElement = document.getElementById('new-name-input');
    if (userNameElement) userNameElement.innerText = cachedName;
    if (nameInputElement) nameInputElement.value = cachedName;
    const currentAddressText = document.getElementById('current-address');
    if (currentAddressText && verifiedAddress) currentAddressText.innerText = verifiedAddress;
    const profileImgElement = document.getElementById('profile-pic');
    const systemCachedPhoto = localStorage.getItem('medi_saved_profile_image');
    if (systemCachedPhoto && profileImgElement) profileImgElement.src = systemCachedPhoto;

    const photoUploadInput = document.getElementById('upload-photo');
    if (photoUploadInput) {
        photoUploadInput.addEventListener('change', async (e) => {
            const chosenFile = e.target.files[0];
            if (!chosenFile) return;
            const imgReader = new FileReader();
            imgReader.onloadend = () => {
                localStorage.setItem('medi_saved_profile_image', imgReader.result);
                if (profileImgElement) profileImgElement.src = imgReader.result;
            };
            imgReader.readAsDataURL(chosenFile);
            if (supabase) {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session?.user) {
                        const ext = chosenFile.name.split('.').pop();
                        const path = `profiles/${session.user.id}_avatar.${ext}`;
                        await supabase.storage.from('media').upload(path, chosenFile, { upsert: true });
                        const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
                        if (urlData?.publicUrl) {
                            await supabase.from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', session.user.id);
                        }
                    }
                } catch (err) {}
            }
            showToast("Profile picture updated!", "success");
        });
    }

    const commitNameBtn = document.getElementById('save-name');
    if (commitNameBtn) {
        commitNameBtn.onclick = async () => {
            const rawEnteredName = nameInputElement?.value?.trim();
            if (rawEnteredName) {
                localStorage.setItem('medi_profile_name', rawEnteredName);
                if (userNameElement) userNameElement.innerText = rawEnteredName;
                if (supabase) {
                    try {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (session && session.user) {
                            await supabase.from('profiles').upsert({ email: session.user.email, full_name: rawEnteredName });
                        }
                    } catch(err) { }
                }
                toggleModalDisplay('edit-modal', false);
                showToast("Profile updated!", "success");
            }
        };
    }

    let userUniquePermanentReferral = localStorage.getItem('medi_user_permanent_referral');
    if (!userUniquePermanentReferral) {
        userUniquePermanentReferral = "MEDIFND" + Math.floor(10000 + Math.random() * 90000);
        localStorage.setItem('medi_user_permanent_referral', userUniquePermanentReferral);
    }
    const refCodeDisplayField = document.getElementById('referral-code-display');
    if (refCodeDisplayField) refCodeDisplayField.innerText = userUniquePermanentReferral;
    const triggerCopyBtn = document.getElementById('copy-referral-btn');
    if (triggerCopyBtn) {
        triggerCopyBtn.onclick = () => {
            navigator.clipboard.writeText(userUniquePermanentReferral);
            const copyNoticeText = document.getElementById('referral-status-notice');
            if (copyNoticeText) { copyNoticeText.innerText = "✓ Referral code copied!"; setTimeout(() => { copyNoticeText.innerText = ""; }, 3000); }
        };
    }

    const languageSelectNode = document.getElementById('language-select');
    const activeAppLanguageEnv = localStorage.getItem('medi_active_language_env') || 'en';
    if (languageSelectNode) {
        languageSelectNode.value = activeAppLanguageEnv;
        triggerGlobalAppLanguageTranslation(activeAppLanguageEnv);
        languageSelectNode.addEventListener('change', (event) => {
            const targetLocale = event.target.value;
            localStorage.setItem('medi_active_language_env', targetLocale);
            triggerGlobalAppLanguageTranslation(targetLocale);
            updateSearchPlaceholder(targetLocale);
        });
    }

    const targetPatientTrigger = document.getElementById('manage-patients-trigger');
    if (targetPatientTrigger) {
        targetPatientTrigger.onclick = () => { toggleModalDisplay('patient-modal', true); renderPatientsListUI(); };
    }

    const savePatientProfileBtn = document.getElementById('action-add-patient-btn');
    if (savePatientProfileBtn) {
        savePatientProfileBtn.onclick = async () => {
            const firstNameCell = document.getElementById('pat-first-name')?.value?.trim();
            const lastNameCell = document.getElementById('pat-last-name')?.value?.trim();
            const ageCell = document.getElementById('pat-age')?.value?.trim();
            const checkedGenderRadio = document.querySelector('input[name="pat_gender"]:checked');
            if (!firstNameCell || !lastNameCell || !ageCell) { showToast("Please fill all patient fields.", "error"); return; }
            const freshPatientPayload = { id: "PAT-" + Date.now(), name: `${firstNameCell} ${lastNameCell}`, age: ageCell, gender: checkedGenderRadio ? checkedGenderRadio.value : "Male" };
            patientsData.push(freshPatientPayload);
            localStorage.setItem('medi_patients', JSON.stringify(patientsData));
            if (supabase) {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session && session.user) {
                        await supabase.from('patients').insert([{ id: freshPatientPayload.id, user_email: session.user.email, name: freshPatientPayload.name, age: freshPatientPayload.age, gender: freshPatientPayload.gender }]);
                    }
                } catch(e) { }
            }
            if (document.getElementById('pat-first-name')) document.getElementById('pat-first-name').value = "";
            if (document.getElementById('pat-last-name')) document.getElementById('pat-last-name').value = "";
            if (document.getElementById('pat-age')) document.getElementById('pat-age').value = "";
            renderPatientsListUI();
            showToast("Patient registered!", "success");
        };
    }

    const triggerReminderModalBtn = document.getElementById('pill-reminders-trigger');
    if (triggerReminderModalBtn) {
        triggerReminderModalBtn.onclick = () => { toggleModalDisplay('reminder-modal', true); renderAlarmsListUI(); };
    }

    const saveActiveAlarmBtn = document.getElementById('action-save-alarm-btn');
    if (saveActiveAlarmBtn) {
        saveActiveAlarmBtn.onclick = async () => {
            const inputMed = document.getElementById('alarm-med-name')?.value?.trim();
            const inputTime = document.getElementById('alarm-time')?.value;
            if (!inputMed || !inputTime) { showToast("Enter medicine name and time.", "error"); return; }
            const freshAlarm = { id: "ALM-" + Date.now(), medicine: inputMed, time: inputTime, active: true };
            alarmsData.push(freshAlarm);
            localStorage.setItem('medi_alarms', JSON.stringify(alarmsData));
            if (supabase) {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session && session.user) {
                        await supabase.from('reminders').insert([{ id: freshAlarm.id, user_email: session.user.email, medicine: freshAlarm.medicine, time: freshAlarm.time, active: true }]);
                    }
                } catch(e) { }
            }
            if (document.getElementById('alarm-med-name')) document.getElementById('alarm-med-name').value = "";
            if (document.getElementById('alarm-time')) document.getElementById('alarm-time').value = "";
            renderAlarmsListUI();
            showToast("Pill reminder set!", "success");
        };
    }

    const editBtn = document.getElementById('edit-profile-btn');
    const addressBtn = document.getElementById('add-address-btn');
    const termsTrigger = document.getElementById('terms-trigger');
    const helpTrigger = document.getElementById('help-desk-trigger');
    const referEarnBtn = document.getElementById('refer-earn-btn');
    if (editBtn) editBtn.onclick = () => toggleModalDisplay('edit-modal', true);
    if (addressBtn) addressBtn.onclick = () => { toggleModalDisplay('address-modal', true); loadSavedAddresses(); };
    // Item 15: T&C now opens the real standalone page directly — no popup.
    if (termsTrigger) termsTrigger.onclick = () => { window.location.href = 'usert&c.html'; };
    if (helpTrigger) helpTrigger.onclick = () => toggleModalDisplay('help-modal', true);
    if (referEarnBtn) referEarnBtn.onclick = () => toggleModalDisplay('referral-modal', true);

    // ============================================================
    // ADDRESS BOOK — Flipkart-style multi-address (tags, default, edit/delete/select)
    // ============================================================
    function resetAddressForm() {
        ['addr-name', 'addr-phone', 'addr-house', 'addr-line2', 'addr-landmark', 'addr-city', 'addr-state', 'addr-pincode'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const defaultCheck = document.getElementById('addr-set-default');
        if (defaultCheck) defaultCheck.checked = false;
        const homeRadio = document.querySelector('input[name="addr_tag"][value="Home"]');
        if (homeRadio) homeRadio.checked = true;
        const editingIdField = document.getElementById('editing-address-id');
        if (editingIdField) editingIdField.value = '';
        const heading = document.getElementById('address-form-heading');
        if (heading) heading.innerText = 'Add New Address';
        const statusMsg = document.getElementById('addr-status-msg');
        if (statusMsg) statusMsg.innerText = '';
    }

    window.editSavedAddress = function(id) {
        const a = savedAddresses.find(x => x.id === id);
        if (!a) return;
        document.getElementById('editing-address-id').value = a.id;
        document.getElementById('addr-name').value = a.name || '';
        document.getElementById('addr-phone').value = a.phone || '';
        document.getElementById('addr-house').value = a.address1 || '';
        document.getElementById('addr-line2').value = a.address2 || '';
        document.getElementById('addr-landmark').value = a.landmark || '';
        document.getElementById('addr-city').value = a.city || '';
        document.getElementById('addr-state').value = a.state || '';
        document.getElementById('addr-pincode').value = a.pincode || '';
        const tagRadio = document.querySelector(`input[name="addr_tag"][value="${a.tag || 'Home'}"]`);
        if (tagRadio) tagRadio.checked = true;
        document.getElementById('addr-set-default').checked = !!a.is_default;
        document.getElementById('address-form-heading').innerText = 'Edit Address';
        document.getElementById('address-form-heading').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    window.deleteSavedAddress = function(id) {
        showConfirmationModal("Delete this address?", async () => {
            savedAddresses = savedAddresses.filter(a => a.id !== id);
            renderSavedAddressList();
            if (supabase) {
                try { await supabase.from('user_addresses').delete().eq('id', id); } catch (e) {}
            }
            showToast("Address deleted.", "info");
        });
    };

    // Selecting a saved address makes it the active delivery address used at checkout
    window.selectSavedAddressAsActive = async function(id) {
        const a = savedAddresses.find(x => x.id === id);
        if (!a) return;
        const addr = { name: a.name, phone: a.phone, house: a.address1, area: a.address2 || '', city: a.city, pincode: a.pincode, landmark: a.landmark || '' };
        localStorage.setItem('medi_delivery_address', JSON.stringify(addr));
        verifiedAddress = `${a.address1}, ${a.city} - ${a.pincode}`;
        localStorage.setItem('medi_verified_address', verifiedAddress);
        if (currentAddressText) currentAddressText.innerText = verifiedAddress;

        const zoneCheck = await checkPincodeServiceability(a.pincode);
        if (!zoneCheck.available) {
            showToast("Selected, but service isn't launched in this pincode yet — please try again after 5 days.", "error");
        } else {
            showToast(`Using ${a.tag} address for delivery.`, "success");
        }
    };

    async function loadSavedAddresses() {
        if (!supabase) { renderSavedAddressList(); return; }
        const uid = await getCurrentAuthUserId();
        if (!uid) { renderSavedAddressList(); return; }
        try {
            const { data, error } = await supabase.from('user_addresses').select('*').eq('user_id', uid).order('is_default', { ascending: false }).order('created_at', { ascending: false });
            if (!error && data) savedAddresses = data;
        } catch (e) {}
        renderSavedAddressList();

        const defaultAddr = savedAddresses.find(a => a.is_default) || savedAddresses[0];
        if (defaultAddr && currentAddressText) {
            verifiedAddress = `${defaultAddr.address1}, ${defaultAddr.city} - ${defaultAddr.pincode}`;
            currentAddressText.innerText = `${verifiedAddress} (${defaultAddr.tag})`;
        }
    }

    function renderSavedAddressList() {
        const list = document.getElementById('saved-address-list');
        if (!list) return;
        if (savedAddresses.length === 0) {
            list.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:0.8rem;">No saved addresses yet. Add one below.</div>`;
            return;
        }
        list.innerHTML = savedAddresses.map(a => `
            <div class="record-subcard-pill" onclick="selectSavedAddressAsActive('${a.id}')">
                <div>
                    <span class="addr-tag-badge">${a.tag || 'Home'}</span>${a.is_default ? '<span class="addr-default-badge">DEFAULT</span>' : ''}
                    <div style="margin-top:4px;"><strong>${a.name || ''}</strong></div>
                    <div class="sub-label">${a.address1}${a.address2 ? ', ' + a.address2 : ''}${a.landmark ? ', Near ' + a.landmark : ''}, ${a.city}, ${a.state} - ${a.pincode}</div>
                    <div class="sub-label">${a.phone || ''}</div>
                </div>
                <div class="addr-actions-col">
                    <button onclick="event.stopPropagation(); editSavedAddress('${a.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button class="delete-record-action-btn" onclick="event.stopPropagation(); deleteSavedAddress('${a.id}')" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
        `).join('');
    }

    const saveAddressBtn = document.getElementById('save-address-btn');
    if (saveAddressBtn) {
        saveAddressBtn.onclick = async () => {
            const name = document.getElementById('addr-name')?.value?.trim();
            const phone = document.getElementById('addr-phone')?.value?.trim();
            const house = document.getElementById('addr-house')?.value?.trim();
            const line2 = document.getElementById('addr-line2')?.value?.trim();
            const landmark = document.getElementById('addr-landmark')?.value?.trim();
            const city = document.getElementById('addr-city')?.value?.trim();
            const state = document.getElementById('addr-state')?.value?.trim();
            const pincode = document.getElementById('addr-pincode')?.value?.trim();
            const tag = document.querySelector('input[name="addr_tag"]:checked')?.value || 'Home';
            const isDefault = document.getElementById('addr-set-default')?.checked || false;
            const editingId = document.getElementById('editing-address-id')?.value;
            const statusMsg = document.getElementById('addr-status-msg');

            if (!name || !phone || !house || !city || !state || !pincode) {
                if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = '❌ Please fill all required fields.'; }
                return;
            }
            if (pincode.length !== 6) {
                if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = '❌ Pincode must be 6 digits.'; }
                return;
            }
            if (phone.length < 10) {
                if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = '❌ Enter a valid phone number.'; }
                return;
            }

            if (statusMsg) { statusMsg.style.color = '#747d8c'; statusMsg.innerText = 'Checking service availability...'; }
            const zoneCheck = await checkPincodeServiceability(pincode);
            if (!zoneCheck.available) {
                if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = '❌ Unavailable! Service is not launched in this pincode yet. Please try again after 5 days.'; }
                return;
            }

            if (!supabase) { showToast("Address book requires an active connection.", "error"); return; }
            const uid = await getCurrentAuthUserId();
            if (!uid) { showToast("Please log in to save an address.", "error"); return; }

            const payload = { user_id: uid, tag, name, phone, address1: house, address2: line2 || null, landmark: landmark || null, city, state, pincode, is_default: isDefault };

            try {
                // Only one address can be default — clear the flag on the others first
                if (isDefault) {
                    await supabase.from('user_addresses').update({ is_default: false }).eq('user_id', uid);
                }
                if (editingId) {
                    await supabase.from('user_addresses').update(payload).eq('id', editingId);
                } else {
                    await supabase.from('user_addresses').insert([payload]);
                }
            } catch (e) {
                showToast("Failed to save address: " + (e.message || e), "error");
                return;
            }

            if (statusMsg) { statusMsg.style.color = '#2ed573'; statusMsg.innerText = '✓ Address saved!'; }
            resetAddressForm();
            await loadSavedAddresses();
            showToast(editingId ? "Address updated!" : "Address saved!", "success");
        };
    }

    loadSavedAddresses();

    const logoutAction = document.getElementById('logout-btn');
    if (logoutAction) {
        logoutAction.onclick = (e) => {
            e.preventDefault();
            showConfirmationModal("Confirm logout?", () => {
                localStorage.clear();
                showToast("Logged out successfully.", "info");
                window.location.href = 'index.html';
            });
        };
    }

    // MY BOX BUTTON - prescription history
    const myBoxBtn = document.getElementById('my-box-btn');
    if (myBoxBtn) {
        myBoxBtn.onclick = () => openMyPrescriptionBox();
    }

    // Deep-linking from the hamburger menu on other pages (e.g.
    // userhome.html#... -> userprofile.html#my-box-btn) previously just left
    // a dead URL hash — the browser can't "open" a modal via anchor scroll.
    // This actually triggers the matching action once the page is ready.
    if (window.location.hash === '#my-box-btn') openMyPrescriptionBox();
    else if (window.location.hash === '#refer-earn-btn') toggleModalDisplay('referral-modal', true);
    else if (window.location.hash === '#help-desk-trigger') toggleModalDisplay('help-modal', true);
}

// ============================================================
// MY PRESCRIPTION BOX - View all past prescriptions + download
// ============================================================
function openMyPrescriptionBox() {
    const myBox = JSON.parse(localStorage.getItem('medi_prescription_box')) || [];
    let popup = document.createElement('div');
    popup.className = "modal active";
    popup.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100vh;background:rgba(0,0,0,0.65);display:flex;justify-content:center;align-items:center;z-index:10000;padding:16px;box-sizing:border-box;`;
    popup.innerHTML = `
        <div style="background:#fff;width:100%;max-width:440px;border-radius:16px;padding:20px;box-sizing:border-box;border-top:5px solid #ff4d4d;max-height:85vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                <h3 style="color:#ff4d4d;margin:0;"><i class="fa-solid fa-box-archive"></i> My Prescription Box</h3>
                <span id="close-mybox-btn" style="cursor:pointer;font-size:1.3rem;color:#747d8c;">&times;</span>
            </div>
            <p style="font-size:0.8rem;color:#747d8c;margin-bottom:12px;">All your uploaded prescriptions are stored here. You can view and download them anytime.</p>
            <div id="mybox-list">
                ${myBox.length === 0 ? `<div style="text-align:center;padding:30px;color:#ccc;"><i class="fa-solid fa-file-medical" style="font-size:2.5rem;"></i><p>No prescriptions uploaded yet.</p></div>` :
                myBox.map(p => `
                    <div style="background:#f8f9fa;border-radius:10px;padding:12px;margin-bottom:10px;border:1px solid #e4e7eb;display:flex;justify-content:space-between;align-items:center;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <i class="fa-solid fa-file-medical" style="color:#ff4d4d;font-size:1.5rem;"></i>
                            <div>
                                <strong style="font-size:0.85rem;display:block;">${p.fileName || 'Prescription'}</strong>
                                <span style="font-size:0.75rem;color:#747d8c;">Uploaded: ${p.date}</span>
                            </div>
                        </div>
                        <div style="display:flex;gap:6px;">
                            ${p.url ? `<a href="${p.url}" target="_blank" style="background:#1c82aa;color:#fff;border:none;padding:6px 10px;border-radius:6px;font-size:0.75rem;text-decoration:none;font-weight:600;"><i class="fa-solid fa-eye"></i></a>` : ''}
                            ${p.url ? `<a href="${p.url}" download style="background:#2ed573;color:#fff;border:none;padding:6px 10px;border-radius:6px;font-size:0.75rem;text-decoration:none;font-weight:600;"><i class="fa-solid fa-download"></i></a>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    document.body.appendChild(popup);
    document.getElementById('close-mybox-btn').onclick = () => popup.remove();
}

function toggleModalDisplay(modalId, makeVisible) {
    const target = document.getElementById(modalId);
    if (target) target.style.display = makeVisible ? "flex" : "none";
}

function renderPatientsListUI() {
    const recordContainerBox = document.getElementById('patients-record-list');
    if (!recordContainerBox) return;
    if (patientsData.length === 0) {
        recordContainerBox.innerHTML = `<p style="font-size:0.75rem;color:#747d8c;">No patient entries registered yet.</p>`;
        return;
    }
    recordContainerBox.innerHTML = patientsData.map(patient => `
        <div style="background:#f8f9fa;border:1px solid #e4e7eb;border-radius:10px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div>
                <strong style="font-size:0.85rem;color:#2f3542;">${patient.name}</strong>
                <p style="margin:2px 0 0 0;font-size:0.75rem;color:#747d8c;">Age: ${patient.age} | Gender: ${patient.gender}</p>
            </div>
            <button onclick="destroyPatientRecordFromVault('${patient.id}')" style="background:none;border:none;cursor:pointer;"><i class="fa-solid fa-trash-can" style="font-size:1rem;color:#ff4d4d;"></i></button>
        </div>
    `).join('');
}

window.destroyPatientRecordFromVault = function(targetPatientId) {
    patientsData = patientsData.filter(p => p.id !== targetPatientId);
    localStorage.setItem('medi_patients', JSON.stringify(patientsData));
    if (supabase) { try { supabase.from('patients').delete().eq('id', targetPatientId).then(() => {}); } catch(e) {} }
    renderPatientsListUI();
};

function renderAlarmsListUI() {
    const alarmContainerBox = document.getElementById('active-alarms-list');
    if (!alarmContainerBox) return;
    if (alarmsData.length === 0) {
        alarmContainerBox.innerHTML = `<p style="font-size:0.75rem;color:#747d8c;">No active scheduled reminders found.</p>`;
        return;
    }
    alarmContainerBox.innerHTML = alarmsData.map(alarm => `
        <div style="background:#f8f9fa;border:1px solid #e4e7eb;border-radius:10px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div>
                <strong style="font-size:0.85rem;color:#2f3542;">${alarm.medicine}</strong>
                <p style="margin:2px 0 0 0;font-size:0.75rem;color:#747d8c;"><i class="fa-solid fa-bell"></i> Scheduled: ${alarm.time}</p>
            </div>
            <button onclick="destroyAlarmSequenceFromScheduler('${alarm.id}')" style="background:#ff4d4d;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:0.7rem;font-weight:700;cursor:pointer;">STOP</button>
        </div>
    `).join('');
}

window.destroyAlarmSequenceFromScheduler = function(targetAlarmId) {
    alarmsData = alarmsData.filter(a => a.id !== targetAlarmId);
    localStorage.setItem('medi_alarms', JSON.stringify(alarmsData));
    if (supabase) { try { supabase.from('reminders').delete().eq('id', targetAlarmId).then(() => {}); } catch(e) {} }
    renderAlarmsListUI();
};

// ============================================================
// PILL ALARM ENGINE - Web Audio + System Notification
// ============================================================
function runBackgroundPillAlarmEngine() {
    if (alarmsData.length === 0) return;
    const liveTimeInstance = new Date();
    const systemStringClockMatch = liveTimeInstance.toTimeString().substring(0, 5);
    alarmsData.forEach(alarmItem => {
        if (alarmItem.time === systemStringClockMatch && alarmItem.active) {
            // Fire system notification (works even when page is in background)
            fireSystemNotification(
                "💊 MediFinder Pill Reminder",
                `Time to take: ${alarmItem.medicine} at ${alarmItem.time}`
            );
            // Fallback alert
            showToast(`Time to take: ${alarmItem.medicine} at ${alarmItem.time}`, "warning");
            alarmItem.active = false;
            setTimeout(() => { alarmItem.active = true; }, 61000);
        }
    });
}

// ============================================================
// LANGUAGE TRANSLATION ENGINE
// ============================================================
function triggerGlobalAppLanguageTranslation(languageKeyToken) {
    const translationDataSet = languageMatrix[languageKeyToken] || languageMatrix.en;
    const structuralTargetElementMappings = [
        { id: 'lang-app-title', content: translationDataSet.title },
        { id: 'lang-edit-name-btn', content: translationDataSet.editBtn },
        { id: 'lang-addr-title', content: translationDataSet.addrTitle },
        { id: 'lang-select-title', content: translationDataSet.selectTitle },
        { id: 'lang-patient-title', content: translationDataSet.patientTitle },
        { id: 'lang-patient-desc', content: translationDataSet.patientDesc },
        { id: 'lang-pill-title', content: translationDataSet.pillTitle },
        { id: 'lang-pill-desc', content: translationDataSet.pillDesc },
        { id: 'lang-refer-title', content: translationDataSet.referTitle },
        { id: 'lang-refer-desc', content: translationDataSet.referDesc },
        { id: 'lang-care-title', content: translationDataSet.careTitle },
        { id: 'lang-help-title', content: translationDataSet.helpTitle },
        { id: 'lang-help-desc', content: translationDataSet.helpDesc },
        { id: 'lang-terms-title', content: translationDataSet.termsTitle },
        { id: 'lang-terms-desc', content: translationDataSet.termsDesc },
        { id: 'lang-logout-title', content: translationDataSet.logoutTitle },
        { id: 'lang-nav-home', content: translationDataSet.navHome },
        { id: 'lang-nav-map', content: translationDataSet.navMap },
        { id: 'lang-nav-order', content: translationDataSet.navOrder },
        { id: 'lang-nav-cart', content: translationDataSet.navCart },
        { id: 'lang-nav-profile', content: translationDataSet.navProfile },
        { id: 'lang-my-box', content: translationDataSet.myBox }
    ];
    structuralTargetElementMappings.forEach(mapping => {
        const targetHtmlNode = document.getElementById(mapping.id);
        if (targetHtmlNode) {
            if (targetHtmlNode.tagName === 'H1') {
                targetHtmlNode.innerHTML = mapping.content.replace("FINDER", "<span>FINDER</span>");
            } else {
                targetHtmlNode.innerText = mapping.content;
            }
        }
    });
}

function updateSearchPlaceholder(lang) {
    const t = languageMatrix[lang] || languageMatrix.en;
    const homeSearch = document.getElementById('home-medicine-search');
    const mapSearch = document.getElementById('medicine-search');
    if (homeSearch) homeSearch.placeholder = t.searchPlaceholder || "Search medicines...";
    if (mapSearch) mapSearch.placeholder = t.searchPlaceholder || "Search medicines...";
}

function initLiveOfferAndBroadcastStream() {
    try {
        supabase
          .channel('live-offers')
          .on('postgres_changes', { event: '*', filter: 'id=eq.1', schema: 'public', table: 'offers' }, payload => {
              const updatedOffer = payload.new;
              const liveBannerNode = document.getElementById('user-app-banner');
              if (liveBannerNode) {
                  if (updatedOffer && updatedOffer.status === 'active' && updatedOffer.text !== "") {
                      liveBannerNode.innerText = updatedOffer.text;
                      liveBannerNode.style.display = 'block';
                  } else {
                      liveBannerNode.style.display = 'none';
                  }
              }
          })
          .subscribe();
    } catch(err) {

    }
}

/* ==========================================================================
   SPONSORED PRODUCTS SLIDER — loads from DB
   ========================================================================== */
async function loadSponsoredProducts() {
    const slider = document.getElementById('home-slider');
    if (!slider || !supabase) return;
    try {
        const { data, error } = await supabase
            .from('sponsored_products')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        if (error || !data || data.length === 0) return;

        // If a sponsor slot is linked to a real product (btn_action contains ?id=...),
        // pull that product's actual photo so the merchant's paid slot shows the real item.
        const linkedIds = data
            .map(item => {
                const m = (item.btn_action || '').match(/[?&]id=([^&#]+)/);
                return m ? decodeURIComponent(m[1]) : null;
            })
            .filter(Boolean);
        let productImageMap = {};
        if (linkedIds.length > 0) {
            try {
                const { data: linkedProducts } = await supabase
                    .from('medicines')
                    .select('id, image_url')
                    .in('id', linkedIds);
                (linkedProducts || []).forEach(p => {
                    productImageMap[p.id] = p.image_url || '';
                });
            } catch (e) { /* fall back to gradient/icon slides below */ }
        }

        slider.innerHTML = '';
        data.forEach((item, i) => {
            const div = document.createElement('div');
            div.className = 'slide' + (i === 0 ? ' active-slide' : '');
            const linkedId = (item.btn_action || '').match(/[?&]id=([^&#]+)/);
            const productImg = linkedId ? productImageMap[decodeURIComponent(linkedId[1])] : null;

            if (productImg) {
                // Real merchant product photo, with the chosen gradient as a subtle overlay for text contrast
                div.style.backgroundImage = `linear-gradient(135deg, rgba(0,0,0,0.55), rgba(0,0,0,0.15)), url('${productImg}')`;
                div.style.backgroundSize = 'cover';
                div.style.backgroundPosition = 'center';
            } else {
                div.style.background = item.gradient || 'linear-gradient(135deg, #ff6b6b, #ee5a24)';
            }

            const isLinkedToProduct = !!linkedId;
            if (isLinkedToProduct) div.style.cursor = 'pointer';

            div.innerHTML = `
                <div class="slide-content">
                    <span class="slide-tag">${item.tag || 'SPONSORED'}</span>
                    <h3>${item.title}</h3>
                    <p>${item.subtitle}</p>
                    ${item.btn_text ? `<button class="slide-btn" data-btn-action="${(item.btn_action || '').replace(/"/g, '&quot;')}">${item.btn_text} <i class="fa-solid fa-arrow-right"></i></button>` : ''}
                </div>
                ${productImg ? '' : `<div class="slide-icon"><i class="${item.icon_class || 'fa-solid fa-capsules'}"></i></div>`}
            `;

            // Whatever page path a merchant/admin typed into btn_action, a slot that's
            // actually linked to a real product (btn_action contains ?id=...) must always
            // land on the real Product Details page with that ID — previously it trusted
            // the raw stored path verbatim, so a slot could open the wrong page entirely.
            if (isLinkedToProduct) {
                const goToProduct = (e) => {
                    e.stopPropagation();
                    window.location.href = `product-detail.html?id=${encodeURIComponent(decodeURIComponent(linkedId[1]))}`;
                };
                div.addEventListener('click', goToProduct);
                div.querySelector('.slide-btn')?.addEventListener('click', goToProduct);
            } else {
                div.querySelector('.slide-btn')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (item.btn_action) window.location.href = item.btn_action;
                });
            }
            slider.appendChild(div);
        });
    } catch (e) {

    }
}


/* ==========================================================================
   AUTO-SLIDING BANNER - Flipkart Style Carousel
   ========================================================================== */
window._autoSliderInterval = null;
function initAutoSlider() {
    const slider = document.getElementById('home-slider');
    const dotsContainer = document.getElementById('slider-dots');
    if (!slider || !dotsContainer) return;

    const slides = slider.querySelectorAll('.slide');
    if (slides.length === 0) return;

    if (window._autoSliderInterval) clearInterval(window._autoSliderInterval);
    dotsContainer.innerHTML = '';

    let currentSlide = 0;

    // Create dots
    slides.forEach((_, i) => {
        const dot = document.createElement('span');
        dot.className = 'dot' + (i === 0 ? ' active-dot' : '');
        dot.addEventListener('click', () => {
            goToSlide(i);
            resetAutoSlide();
        });
        dotsContainer.appendChild(dot);
    });

    function goToSlide(index) {
        slides[currentSlide].classList.remove('active-slide');
        dotsContainer.children[currentSlide].classList.remove('active-dot');
        currentSlide = index;
        slides[currentSlide].classList.add('active-slide');
        dotsContainer.children[currentSlide].classList.add('active-dot');
    }

    function nextSlide() {
        const next = (currentSlide + 1) % slides.length;
        goToSlide(next);
    }

    function startAutoSlide() {
        window._autoSliderInterval = setInterval(nextSlide, 3500);
    }

    function resetAutoSlide() {
        clearInterval(window._autoSliderInterval);
        startAutoSlide();
    }

    startAutoSlide();

    // Touch support for manual swipe
    let touchStartX = 0;
    let touchEndX = 0;
    slider.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });
    slider.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        if (touchStartX - touchEndX > 50) {
            goToSlide((currentSlide + 1) % slides.length);
            resetAutoSlide();
        } else if (touchEndX - touchStartX > 50) {
            goToSlide((currentSlide - 1 + slides.length) % slides.length);
            resetAutoSlide();
        }
    });
}

/* ==========================================================================
   MODAL RATING STARS - Interactive Rating System
   ========================================================================== */
function initModalRatingStars() {
    const starsContainer = document.getElementById('interactive-rating-stars');
    if (!starsContainer) return;

    const stars = starsContainer.querySelectorAll('i');
    const ratingText = document.getElementById('user-rating-text');
    let currentRating = 0;
    const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

    stars.forEach((star, index) => {
        star.addEventListener('click', () => {
            currentRating = index + 1;
            updateStarsDisplay();
            if (ratingText) ratingText.innerText = `You rated: ${currentRating}/5 (${ratingLabels[currentRating]})`;
            // Save rating to localStorage
            const modalName = document.getElementById('modal-prod-name')?.innerText || '';
            const savedRatings = JSON.parse(localStorage.getItem('medi_product_ratings')) || {};
            savedRatings[modalName] = currentRating;
            localStorage.setItem('medi_product_ratings', JSON.stringify(savedRatings));
        });

        star.addEventListener('mouseenter', () => {
            highlightStars(index + 1);
        });

        star.addEventListener('mouseleave', () => {
            highlightStars(currentRating);
        });
    });

    function highlightStars(count) {
        stars.forEach((s, i) => {
            if (i < count) {
                s.className = 'fa-solid fa-star active-star';
            } else {
                s.className = 'fa-regular fa-star';
            }
        });
    }

    function updateStarsDisplay() {
        highlightStars(currentRating);
    }

    // Restore saved rating when modal opens
    window._restoreModalRating = function() {
        const modalName = document.getElementById('modal-prod-name')?.innerText || '';
        const savedRatings = JSON.parse(localStorage.getItem('medi_product_ratings')) || {};
        currentRating = savedRatings[modalName] || 0;
        updateStarsDisplay();
        if (ratingText) {
            if (currentRating > 0) {
                ratingText.innerText = `You rated: ${currentRating}/5 (${ratingLabels[currentRating]})`;
            } else {
                ratingText.innerText = 'Tap to rate this medicine';
            }
        }
    };
}

/* ==========================================================================
   GEMINI AI PRESCRIPTION PARSER
   ========================================================================== */
function fileToGenerativePart(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1];
            resolve({ inlineData: { data: base64Data, mimeType: file.type } });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function analyzePrescriptionWithGemini(file) {
    const GEMINI_API_KEY = "AQ.Ab8RN6LX5AZs3yOlKj2ZgTWJcoQCStf8FBMo-gh09u1b7XzUzg";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    try {
        const imagePart = await fileToGenerativePart(file);
        const prompt = `
            Analyze this image carefully.
            Step 1: Check if this image is a real doctor's medical prescription or hospital diagnostic slip containing medicines.
            Step 2: If it is NOT a prescription, reply EXACTLY: {"status": "FAILED", "reason": "Not a valid medical prescription"}.
            Step 3: If it IS a valid prescription, extract up to 2-3 major medicine names. Reply EXACTLY in this format:
            {
              "status": "SUCCESS",
              "medicines": [
                {"id": "gem_p1", "name": "Medicine Name 1", "price": 120.00, "img": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400"},
                {"id": "gem_p2", "name": "Medicine Name 2", "price": 35.00, "img": "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400"}
              ]
            }
            Return ONLY clean raw JSON text. No markdown.
        `;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, imagePart] }] })
        });
        const result = await response.json();
        if (result.error) { return { status: "FAILED", reason: "Invalid API Key or API configuration error." }; }
        const responseText = result.candidates[0].content.parts[0].text.trim();
        return JSON.parse(responseText);
    } catch (error) {
        return { status: "FAILED", reason: "AI Core Parsing Interrupted or Formatting Failure" };
    }
}

// showToast is provided by prod-utils.js — creates its own container on any page

/* ==========================================================================
   SCROLL TO TOP BUTTON
   ========================================================================== */
function initScrollToTop() {
    const scrollBtn = document.getElementById('scroll-top-btn');
    const mainScroll = document.getElementById('main-scroll');
    if (!scrollBtn || !mainScroll) return;

    mainScroll.addEventListener('scroll', () => {
        if (mainScroll.scrollTop > 400) {
            scrollBtn.classList.add('visible');
        } else {
            scrollBtn.classList.remove('visible');
        }
    });

    scrollBtn.addEventListener('click', () => {
        mainScroll.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

/* ==========================================================================
   WISHLIST BUTTONS
   ========================================================================== */
function initWishlistButtons() {
    const wishlistBtns = document.querySelectorAll('.wishlist-btn');
    const savedWishlist = JSON.parse(localStorage.getItem('medi_wishlist')) || [];

    // Restore saved wishlist state
    savedWishlist.forEach(id => {
        const btn = document.querySelector(`.wishlist-btn[data-id="${id}"]`);
        if (btn) {
            btn.classList.add('active');
            btn.innerHTML = '<i class="fa-solid fa-heart"></i>';
        }
    });

    wishlistBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            btn.classList.toggle('active');
            
            if (btn.classList.contains('active')) {
                btn.innerHTML = '<i class="fa-solid fa-heart"></i>';
                savedWishlist.push(id);
                showToast('Added to wishlist!', 'info');
            } else {
                btn.innerHTML = '<i class="fa-regular fa-heart"></i>';
                const idx = savedWishlist.indexOf(id);
                if (idx > -1) savedWishlist.splice(idx, 1);
                showToast('Removed from wishlist', 'info');
            }
            localStorage.setItem('medi_wishlist', JSON.stringify(savedWishlist));
        });
    });
}

/* ==========================================================================
   VOICE / MIC SEARCH (Web Speech API)
   ========================================================================== */
function initVoiceSearch() {
    const micBtn = document.getElementById('voice-search-btn');
    const searchInput = document.getElementById('home-medicine-search');
    if (!micBtn || !searchInput) return; // mic button not present on this page

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

    // Browser doesn't support voice recognition at all (e.g. old browsers)
    if (!SpeechRecognitionAPI) {
        micBtn.addEventListener('click', () => {
            showToast('Voice search isn\'t supported on this browser. Please use Chrome.', 'warning');
        });
        return;
    }

    // Inject listening-state styles once (no separate CSS file needed)
    if (!document.getElementById('voice-search-inline-style')) {
        const style = document.createElement('style');
        style.id = 'voice-search-inline-style';
        style.textContent = `
            .truemads-mic-btn.listening { color: #e02020 !important; animation: mediMicPulse 1s ease-in-out infinite; }
            @keyframes mediMicPulse {
                0% { box-shadow: 0 0 0 0 rgba(224,32,32,0.45); }
                70% { box-shadow: 0 0 0 12px rgba(224,32,32,0); }
                100% { box-shadow: 0 0 0 0 rgba(224,32,32,0); }
            }
        `;
        document.head.appendChild(style);
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    function langToSpeechCode(lang) {
        if (lang === 'bn') return 'bn-IN';
        if (lang === 'hi') return 'hi-IN';
        return 'en-IN';
    }

    let isListening = false;

    micBtn.addEventListener('click', () => {
        if (isListening) {
            recognition.stop();
            return;
        }
        const savedLang = localStorage.getItem('medi_active_language_env') || 'en';
        recognition.lang = langToSpeechCode(savedLang);

        // Calling start() triggers the browser's native "Allow microphone access?" prompt
        // automatically the first time (or on every call if permission was denied before).
        try {
            recognition.start();
        } catch (err) {
            // start() throws if it's already running - reset and retry
            try { recognition.stop(); } catch (e2) {}
            setTimeout(() => { try { recognition.start(); } catch (e3) {} }, 250);
        }
    });

    recognition.addEventListener('start', () => {
        isListening = true;
        micBtn.classList.add('listening');
        showToast('Listening... say the medicine name', 'info');
    });

    recognition.addEventListener('result', (event) => {
        const transcript = (event.results[0][0].transcript || '').trim();
        if (transcript) {
            searchInput.value = transcript;
            searchInput.dispatchEvent(new Event('input'));
            searchInput.focus();
            showToast(`Searching for "${transcript}"`, 'success');
        }
    });

    recognition.addEventListener('error', (event) => {
        isListening = false;
        micBtn.classList.remove('listening');
        if (event.error === 'not-allowed' || event.error === 'permission-denied' || event.error === 'service-not-allowed') {
            showToast('Microphone access denied. Please allow mic permission in your browser settings and try again.', 'warning');
        } else if (event.error === 'no-speech') {
            showToast('No speech detected. Please try again.', 'info');
        } else if (event.error === 'audio-capture') {
            showToast('No microphone found on this device.', 'warning');
        } else {
            showToast('Voice search failed. Please try again.', 'warning');
        }
    });

    recognition.addEventListener('end', () => {
        isListening = false;
        micBtn.classList.remove('listening');
    });
}

/* ==========================================================================
   SERVICES MENU
   ========================================================================== */
function initServicesMenu() {
    const serviceItems = document.querySelectorAll('.service-item');
    serviceItems.forEach(item => {
        item.addEventListener('click', () => {
            const service = item.dataset.service;
            switch(service) {
                case 'lab':
                    window.location.href = 'lab-booking.html?type=lab';
                    break;
                case 'instrument':
                    window.location.href = 'userhome.html?category=instrument';
                    showToast('Showing medical instruments', 'info');
                    break;
                case 'nurse':
                    window.location.href = 'nurse-booking.html';
                    break;
                case 'doctor':
                    showToast('This service is not available right now. Please try after a few days.', 'warning');
                    break;
                case 'checkup':
                    window.location.href = 'lab-booking.html?type=checkup';
                    break;
                case 'ambulance':
                    window.location.href = 'ambulances-booking.html';
                    break;
                case 'coins':
                    window.location.href = 'tablet-coin.html';
                    break;
                default:
                    showToast('Feature coming soon!', 'info');
            }
        });
    });
}

/* ==========================================================================
   HAMBURGER MENU
   ========================================================================== */
function initHamburgerMenu() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const overlay = document.getElementById('hamburger-overlay');
    const closeBtn = document.getElementById('hamburger-close-btn');
    const hamburgerIcon = hamburgerBtn?.querySelector('.hamburger-icon');

    if (!hamburgerBtn || !overlay) return;

    // Real name/UID is applied via applyUserIdentityToUI() from cache immediately
    // and again once the Supabase session resolves — no fake/random ID here anymore.
    applyUserIdentityToUI(localStorage.getItem('medi_profile_name'), localStorage.getItem('medi_user_uid'), null);

    hamburgerBtn.addEventListener('click', () => {
        overlay.classList.add('active');
        if (hamburgerIcon) hamburgerIcon.classList.add('open');
        document.body.style.overflow = 'hidden';
    });

    function closeMenu() {
        overlay.classList.remove('active');
        if (hamburgerIcon) hamburgerIcon.classList.remove('open');
        document.body.style.overflow = '';
    }

    if (closeBtn) closeBtn.addEventListener('click', closeMenu);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeMenu();
    });
}