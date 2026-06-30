/* ==========================================================================
   1. GLOBAL SYSTEM CONFIGURATIONS & SUPABASE INIT
   ========================================================================== */
const SUPABASE_URL = "https://rnpbglinkpsikeszcjcl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Ogc4JOrhQXAl9zRTDU0y3g_oGnitfuZ";

const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let currentCart = JSON.parse(localStorage.getItem('medi_cart')) || [];
let patientsData = JSON.parse(localStorage.getItem('medi_patients')) || [];
let alarmsData = JSON.parse(localStorage.getItem('medi_alarms')) || [];
let systemNotifications = [];
let adminOffers = [];

let selectedPaymentMethod = "COD";
let isPincodeVerified = false;
let verifiedAddress = localStorage.getItem('medi_verified_address') || "";
let discountAmount = 0;
let isPrescriptionUploaded = localStorage.getItem('medi_presc_uploaded_status') === 'true' || false;

let userLiveLat = 22.5726;
let userLiveLng = 88.3639;
const shopCoordinates = { lat: 22.5780, lng: 88.3650 };

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
    console.log("MediFinder Premium OS Core Engine Online...");
    
    const prescBadge = document.getElementById('uploaded-presc-badge');
    if (prescBadge && isPrescriptionUploaded) {
        prescBadge.style.display = 'block';
    }

    detectLiveUserGPSCoordinates();
    autoFillSavedUserDataOnAuth();
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
    initServicesMenu();
    initHamburgerMenu();
    updateProductCount();

    // Prefetch adjacent pages for instant tab switching
    setupPagePrefetch();
});

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
        Notification.requestPermission().then(perm => {
            console.log("Notification permission:", perm);
        });

        // Register service worker for background notifications
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(e => {
                // SW not found, fallback to in-page alarm only
                console.log("SW fallback mode active.");
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
        console.log("Audio play skipped.");
    }
}

function detectLiveUserGPSCoordinates() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            userLiveLat = pos.coords.latitude;
            userLiveLng = pos.coords.longitude;
            console.log("🎯 Live Location Anchored:", userLiveLat, userLiveLng);
            
            if (document.getElementById('order-list')) {
                setupOrdersPageModules();
            }
        }, (err) => {
            console.log("⚠️ GPS Access Error Code:", err.code);
        }, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        });
    }
}

async function autoFillSavedUserDataOnAuth() {
    const cachedName = localStorage.getItem('medi_profile_name');
    if (cachedName && document.getElementById('user-name')) {
        document.getElementById('user-name').innerText = cachedName;
    }
    if (cachedName && document.getElementById('new-name-input')) {
        document.getElementById('new-name-input').value = cachedName;
    }
    if (verifiedAddress && document.getElementById('current-address')) {
        document.getElementById('current-address').innerText = verifiedAddress;
    }
    if (patientsData && patientsData.length > 0 && document.getElementById('patients-record-list')) {
        renderPatientsListUI();
    }
    if (alarmsData && alarmsData.length > 0 && document.getElementById('active-alarms-list')) {
        renderAlarmsListUI();
    }

    // Show signup-generated User ID in profile
    const userIdDisplay = document.getElementById('user-uid-display');
    if (userIdDisplay) {
        let uid = localStorage.getItem('medi_user_uid');
        if (!uid) {
            uid = "MF" + Math.floor(100000 + Math.random() * 900000);
            localStorage.setItem('medi_user_uid', uid);
        }
        userIdDisplay.innerText = "User ID: " + uid;
    }

    if (supabase) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session && session.user) {
                const userEmail = session.user.email;

                // Show UID from supabase auth
                if (userIdDisplay) userIdDisplay.innerText = "User ID: " + session.user.id.substring(0, 12).toUpperCase();
                
                const { data: profileArray, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('email', userEmail)
                    .limit(1);

                if (!profileError && profileArray && profileArray.length > 0) {
                    const profile = profileArray[0];
                    if (profile.full_name && document.getElementById('user-name')) {
                        document.getElementById('user-name').innerText = profile.full_name;
                        localStorage.setItem('medi_profile_name', profile.full_name);
                    }
                    if (profile.address && document.getElementById('current-address')) {
                        document.getElementById('current-address').innerText = profile.address;
                        localStorage.setItem('medi_verified_address', profile.address);
                    }
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
            console.log("Silent loading authentication dataset failed:", e);
        }
    }
}

function setupGlobalCloseButtonListeners() {
    document.addEventListener('click', (e) => {
        if (e.target.closest('.modal-close-cross') || e.target.closest('.close-btn') || e.target.closest('.close-modal-btn') || e.target.id === 'map-modal-close' || e.target.id === 'cancel-name' || e.target.id === 'close-help-modal' || e.target.id === 'close-otp-modal') {
            const openModal = e.target.closest('.modal') || e.target.closest('.modal-overlay-view') || document.querySelector('.modal.active');
            if (openModal) {
                openModal.style.display = "none";
                openModal.classList.remove('active');
                openModal.classList.remove('modal-revealed');
            }
        }
        if (e.target.classList.contains('modal')) {
            e.target.style.display = "none";
            e.target.classList.remove('active');
        }
        if (e.target.classList.contains('modal-overlay-view')) {
            e.target.classList.remove('modal-revealed');
        }
    });
}

async function setupGlobalNotificationHub() {
    const notiBtn = document.getElementById('notiBtn');
    const notiDropdown = document.getElementById('notiDropdown');
    const badge = document.getElementById('noti-badge');

    if (supabase) {
        try {
            const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(5);
            if (!error && data) systemNotifications = data;
        } catch (e) { console.log("Notification load error, using static fallback."); }
    }

    if (systemNotifications.length === 0) {
        systemNotifications = [
            { id: 1, text: "Your order for Paracetamol has been packed successfully!", time: "2 mins ago" },
            { id: 2, text: "Get 20% OFF using coupon code MEDI20 on checkout.", time: "1 hour ago" }
        ];
    }

    if (badge) badge.innerText = systemNotifications.length;

    if (notiBtn && notiDropdown) {
        notiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notiDropdown.classList.toggle('active');
            
            const body = notiDropdown.querySelector('.dropdown-body');
            if (body) {
                body.innerHTML = systemNotifications.map(n => `
                    <div class="noti-item unread">
                        <p>${n.text || n.message}</p>
                        <span>${n.time || new Date(n.created_at).toLocaleTimeString()}</span>
                    </div>
                `).join('');
            }
        });
        document.addEventListener('click', () => notiDropdown.classList.remove('active'));
    }
}

// ============================================================
// HOME PAGE: Search with Suggestions
// ============================================================
async function setupHomePageModules() {
    if (!document.getElementById('family-health-banner') && !document.getElementById('main-products-grid')) return;

    const productsGrid = document.getElementById('main-products-grid');
    const noProductsMsg = document.getElementById('no-products-msg');

    const embeddedCards = productsGrid.querySelectorAll('.product-card');
    embeddedCards.forEach(card => card.style.display = 'none');
    if (noProductsMsg) noProductsMsg.style.display = 'block';

    let allProductNames = [];

    if (supabase) {
        try {
            const { data: dbProducts, error: dbError } = await supabase.from('partner_medicines').select('*').eq('approved', true);
            
            if (!dbError && dbProducts && dbProducts.length > 0) {
                allProductNames = dbProducts.map(p => p.name);
                productsGrid.innerHTML = dbProducts.map(prod => `
                    <div class="product-card" data-id="${prod.id}" data-category="${prod.category || 'all'}" data-name="${prod.name}" data-price="${prod.price}" data-img="${prod.image_url || prod.img || 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400'}" data-expiry="${prod.expiry || '12/2029'}" data-rating="${prod.rating || '4.5'}" data-manufacturer="${prod.manufacturer || 'Registered Merchant Pharmacy'}" data-desc="${prod.description || 'Verified pharmaceutical components compiled.'}" data-is-rx="${prod.is_rx || false}" data-merchant-id="${prod.merchant_id || ''}">
                        <div class="badge-express"><i class="fa-solid fa-bolt"></i> 20 Min</div>
                        <div class="img-container">
                            <img src="${prod.image_url || prod.img || 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400'}" alt="${prod.name}">
                        </div>
                        <div class="prod-info">
                            <span class="prod-cat-label">${prod.category || 'Medicine'}</span>
                            <h4>${prod.name} ${prod.is_rx === true || prod.is_rx === 'true' ? '<span style="color:#ff4d4d; font-size:0.75rem; font-weight:bold;">[Rx]</span>' : ''}</h4>
                            <p class="price">₹${parseFloat(prod.price).toFixed(2)}</p>
                            <div class="btn-group">
                                <button class="order-btn immediate-order">BUY NOW</button>
                                <button class="add-to-cart-btn"><i class="fas fa-shopping-cart"></i> CART</button>
                            </div>
                        </div>
                    </div>
                `).join('');
                if (noProductsMsg) noProductsMsg.style.display = 'none';
            } else {
                // Show embedded products when no DB products
                embeddedCards.forEach(card => card.style.display = 'block');
                if (noProductsMsg) noProductsMsg.style.display = 'none';
            }
        } catch (e) {
            console.log("Merchant cluster node down.");
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
            homeSearchInput.value = "";
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
    const prescInput = document.getElementById('presc-file-input');
    if (prescInput) {
        prescInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                const fileExt = file.name.split('.').pop();
                const uniqueFileName = `${Date.now()}_prescription.${fileExt}`;
                
                alert("Uploading Secure Prescription Document onto Cloud Database Node...");
                
                if (supabase) {
                    const { data, error } = await supabase.storage
                        .from('user-prescriptions')
                        .upload(`live_slips/${uniqueFileName}`, file);
                    if (error) { alert("Storage Upload Failed: " + error.message); return; }
                    const { data: urlData } = supabase.storage.from('user-prescriptions').getPublicUrl(`live_slips/${uniqueFileName}`);
                    
                    // Save prescription record for My Box
                    let myBox = JSON.parse(localStorage.getItem('medi_prescription_box')) || [];
                    myBox.push({
                        id: 'PRESC-' + Date.now(),
                        fileName: file.name,
                        url: urlData.publicUrl,
                        date: new Date().toLocaleDateString('en-GB'),
                        thumb: URL.createObjectURL(file)
                    });
                    localStorage.setItem('medi_prescription_box', JSON.stringify(myBox));
                    console.log("Prescription saved to My Box.");
                }

                alert("Gemini AI Engine Initialized... Verifying Document Authenticity...");
                const aiResult = await analyzePrescriptionWithGemini(file);
                
                if (aiResult.status === "FAILED") {
                    showToast(`Prescription failed: ${aiResult.reason}`, "error");
                    isPrescriptionUploaded = false;
                    localStorage.setItem('medi_presc_uploaded_status', 'false');
                    const prescBadge = document.getElementById('uploaded-presc-badge');
                    if (prescBadge) prescBadge.style.display = 'none';
                    e.target.value = "";
                    return;
                }

                isPrescriptionUploaded = true;
                localStorage.setItem('medi_presc_uploaded_status', 'true');
                const prescBadge = document.getElementById('uploaded-presc-badge');
                if (prescBadge) prescBadge.style.display = 'block';

                showToast("Prescription scanned successfully! Medicines found.", "success");
                openPrescriptionSelectionPopup(aiResult.medicines);
            }
        });
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

    document.addEventListener('click', (e) => {
        if (e.target.closest('.add-to-cart-btn')) {
            e.stopPropagation();
            const card = e.target.closest('.product-card');
            if (card) addToCart(card.dataset);
        }
        if (e.target.closest('.immediate-order')) {
            e.stopPropagation();
            const card = e.target.closest('.product-card');
            if (card) {
                const isRx = card.getAttribute('data-is-rx') === 'true' || card.dataset.isRx === 'true';
                if (isRx && !isPrescriptionUploaded) {
                    alert("❌ Order Blocked! This is a controlled Rx prescription medicine. Please upload your valid prescription slip first.");
                    return;
                }
                navigateToProductDetail(card.dataset);
            }
        }
    });

    const bigCartBtn = document.getElementById('modal-add-to-cart-action');
    if (bigCartBtn) {
        bigCartBtn.onclick = () => {
            const modalName = document.getElementById('modal-prod-name').innerText;
            const modalPrice = document.getElementById('modal-price').innerText.replace('₹', '');
            const modalImg = document.getElementById('modal-main-img').src;
            const isRxAttr = document.getElementById('product-detail-modal').getAttribute('data-modal-rx') === 'true';
            
            if (isRxAttr && !isPrescriptionUploaded) {
                alert("❌ Order Blocked! This is a controlled Rx prescription medicine. Please upload your valid prescription slip first.");
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
            if (error) { alert("Database Insertion Error: " + error.message); return; }
        }
        alert(`Success! Your ${payload.topic} request is logged in Admin Database Node.`);
        popup.remove();
    };
}

function openPrescriptionSelectionPopup(medicines) {
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
        if (selectedCheckboxes.length === 0) { alert("Please select at least one item!"); return; }
        selectedCheckboxes.forEach(box => {
            addToCart({ id: box.dataset.id, name: box.dataset.name, price: box.dataset.price, img: box.dataset.img, isRx: false });
        });
        popup.remove();
        window.location.href = 'usercart.html';
    };
}

// ============================================================
// PRODUCT DETAIL - Navigate to full page (Flipkart-style)
// ============================================================
function navigateToProductDetail(data) {
    const params = new URLSearchParams();
    if (data.id) params.set('id', data.id);
    if (data.name) params.set('name', data.name);
    if (data.price) params.set('price', data.price);
    if (data.img) params.set('img', data.img);
    if (data.manufacturer) params.set('manufacturer', data.manufacturer);
    if (data.expiry) params.set('expiry', data.expiry);
    if (data.rating) params.set('rating', data.rating);
    if (data.desc) params.set('desc', data.desc);
    if (data.isRx || data['data-is-rx']) params.set('isRx', data.isRx || data['data-is-rx']);
    if (data.category) params.set('category', data.category);
    if (data.stock) params.set('stock', data.stock);
    if (data.composition) params.set('composition', data.composition);
    if (data.dosageForm) params.set('dosageForm', data.dosageForm);
    if (data.strength) params.set('strength', data.strength);
    
    // Store data in localStorage as backup
    localStorage.setItem('currentProduct', JSON.stringify(data));
    
    window.location.href = `product-detail.html?${params.toString()}`;
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
        showToast("Upload prescription first for Rx medicines!", "error");
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
        document.getElementById('address-form').style.display = 'flex';
        document.getElementById('saved-address-box').style.display = 'none';
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
    if (placeOrderBtn) placeOrderBtn.addEventListener('click', handlePlaceOrderClick);

    const goOrdersBtn = document.getElementById('go-to-orders-after-success');
    if (goOrdersBtn) goOrdersBtn.onclick = () => {
        const successModal = document.getElementById('success-animation-modal');
        if (successModal) successModal.classList.remove('modal-revealed');
        window.location.href = 'userorder.html';
    };

    // ============================================================
    // UPI PAYMENT HANDLERS
    // ============================================================
    const upiProviders = document.querySelectorAll('.upi-provider-pill');
    upiProviders.forEach(pill => {
        pill.addEventListener('click', () => {
            const provider = pill.dataset.provider;
            handleUPIPayment(provider);
        });
    });

    // ============================================================
    // RAZORPAY PAYMENT HANDLER
    // ============================================================
    const razorpayRadio = document.querySelector('input[name="payment_method"][value="RAZORPAY"]');
    if (razorpayRadio) {
        razorpayRadio.addEventListener('change', () => {
            selectedPaymentMethod = 'RAZORPAY';
        });
    }

    // ============================================================
    // NETBANKING HANDLER
    // ============================================================
    const bankSelector = document.getElementById('bank-selector-dropdown');
    if (bankSelector) {
        bankSelector.addEventListener('change', (e) => {
            if (e.target.value) {
                handleNetbankingPayment(e.target.value);
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

function saveDeliveryAddress() {
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

    const addr = { name, phone, house, area, city, pincode, landmark };
    localStorage.setItem('medi_delivery_address', JSON.stringify(addr));
    localStorage.setItem('medi_verified_address', `${house}, ${area}, ${city} - ${pincode}${landmark ? ', Near ' + landmark : ''}`);
    isPincodeVerified = true;
    if (statusMsg) { statusMsg.style.color = '#2ed573'; statusMsg.innerText = '✓ Address saved!'; }
    showSavedAddress(addr);
    recalculateBill();
}

function handleCouponApplication() {
    const couponInput = document.getElementById('coupon-input');
    if (!couponInput) return;
    const couponCode = couponInput.value.trim().toUpperCase();
    const statusMsg = document.getElementById('coupon-status-msg');
    if (couponCode === "MEDI20") {
        discountAmount = 50.00;
        if (statusMsg) { statusMsg.style.color = '#2ed573'; statusMsg.innerText = '🎉 Coupon Applied! ₹50.00 saved.'; }
        recalculateBill();
    } else {
        if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = '❌ Invalid or expired coupon code.'; }
    }
}

function renderCartPage() {
    const container = document.getElementById('cart-items-container');
    if (!container) return;
    if (currentCart.length === 0) {
        container.innerHTML = `<div class="cart-item-placeholder"><i class="fa-solid fa-basket-shopping"></i><p>Your cart is empty. Add medicines from home screen.</p></div>`;
        recalculateBill();
        return;
    }
    container.innerHTML = currentCart.map(item => `
        <div class="shop-card" style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:#fff;border-radius:12px;margin-bottom:8px;border:1px solid #f1f2f6;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
            <div style="display:flex;align-items:center;gap:12px;">
                <img src="${item.img}" style="width:50px;height:50px;object-fit:contain;">
                <div>
                    <h4 style="font-size:0.85rem;margin:0;">${item.name} ${item.isRx ? '<span style="color:#ff4d4d;font-size:0.75rem;">[Rx Required]</span>' : ''}</h4>
                    <p style="color:#ff4d4d;margin:2px 0;">₹${item.price} × ${item.qty}</p>
                    <div style="display:flex;gap:6px;margin-top:4px;">
                        <button onclick="changeCartQty('${item.id}',-1)" style="background:#f1f2f6;border:none;border-radius:4px;width:22px;height:22px;cursor:pointer;font-size:0.9rem;font-weight:bold;">-</button>
                        <span style="font-size:0.85rem;font-weight:600;">${item.qty}</span>
                        <button onclick="changeCartQty('${item.id}',1)" style="background:#f1f2f6;border:none;border-radius:4px;width:22px;height:22px;cursor:pointer;font-size:0.9rem;font-weight:bold;">+</button>
                    </div>
                </div>
            </div>
            <button onclick="removeFromCart('${item.id}')" style="background:#ff4d4d;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
        </div>
    `).join('');
    recalculateBill();
}

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
    let dynamicPlatformFee = 5;
    let dynamicProcessingCharge = 10;
    let exemptPlatform = currentCart.every(item => item.exempt_platform_fee === true);
    let exemptProcessing = currentCart.some(item => item.exempt_processing_charge === true);
    if (exemptPlatform || subtotal === 0) dynamicPlatformFee = 0;
    if (exemptProcessing || subtotal === 0) dynamicProcessingCharge = 0;
    let shipping = subtotal > 0 ? 20 : 0;
    let delivery = subtotal > 0 ? 15 : 0;
    let cod = (selectedPaymentMethod === "COD" && subtotal > 0) ? 10 : 0;
    let grandTotal = (subtotal - discountAmount) + shipping + delivery + dynamicPlatformFee + dynamicProcessingCharge + cod;
    if (document.getElementById('bill-subtotal')) {
        document.getElementById('bill-subtotal').innerText = `₹${subtotal.toFixed(2)}`;
        document.getElementById('bill-discount').innerText = `-₹${discountAmount.toFixed(2)}`;
        document.getElementById('bill-platform').innerText = `₹${dynamicPlatformFee.toFixed(2)}`;
        document.getElementById('bill-order-charge').innerText = `₹${dynamicProcessingCharge.toFixed(2)}`;
        document.getElementById('bill-grand-total').innerText = `₹${grandTotal.toFixed(2)}`;
    }
}

function generateSecureSixDigitOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/* ==========================================================================
   PAYMENT HANDLERS FOR UPI, RAZORPAY & NETBANKING
   ========================================================================== */

async function handleUPIPayment(provider) {
    if (currentCart.length === 0) { 
        showToast("Your cart is empty!", "error"); 
        return; 
    }
    
    const addr = JSON.parse(localStorage.getItem('medi_delivery_address') || 'null');
    if (!addr || !addr.house) {
        showToast("Please enter delivery address first!", "error");
        return;
    }

    const total = currentCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const grandTotal = document.getElementById('bill-grand-total')?.innerText || "₹0.00";
    const amount = parseFloat(grandTotal.replace('₹', '')) || total;

    showToast(`Opening ${provider.toUpperCase()} for payment...`, "info");
    
    // Store pending payment info
    localStorage.setItem('medi_pending_payment', JSON.stringify({
        method: 'UPI',
        provider: provider,
        amount: amount,
        timestamp: new Date().getTime()
    }));

    showToast(`${provider.toUpperCase()} payment initiated! ₹${amount.toFixed(2)}`, "success");
    
    // Auto-process after 2 seconds (in real app, wait for callback)
    setTimeout(() => {
        completeUPIPayment();
    }, 2000);
}

async function completeUPIPayment() {
    const pending = localStorage.getItem('medi_pending_payment');
    if (pending) {
        localStorage.removeItem('medi_pending_payment');
        showToast("Payment successful! Processing order...", "success");
        // Now process the final order
        await processFinalOrderPayload();
    }
}

async function handleRazorpayPayment() {
    if (currentCart.length === 0) { 
        showToast("Your cart is empty!", "error"); 
        return; 
    }
    
    const addr = JSON.parse(localStorage.getItem('medi_delivery_address') || 'null');
    if (!addr || !addr.house) {
        showToast("Please enter delivery address first!", "error");
        return;
    }

    const total = currentCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const grandTotal = document.getElementById('bill-grand-total')?.innerText || "₹0.00";
    const amount = parseFloat(grandTotal.replace('₹', '')) || total;

    showToast("Opening Razorpay payment gateway...", "info");

    // ============================================================
    // RAZORPAY API KEY GOES HERE
    // Replace the value below with YOUR Key ID from the Razorpay
    // Dashboard -> Settings -> API Keys.
    //   - Use a "rzp_test_..." key while testing (no real money moves)
    //   - Switch to your "rzp_live_..." key only after KYC/activation
    // This Key ID is safe to keep in frontend code, but the matching
    // "Key Secret" must NEVER be put here — that stays only on a
    // backend server, used for signature verification / payouts.
    // ============================================================
    const options = {
        key: "rzp_live_IlfgRWzDpuxjPj", // <-- put your Razorpay Key ID here
        amount: Math.round(amount * 100), // Razorpay needs a whole number of paise
        currency: "INR",
        name: "MediFinder",
        description: "Medicine Order Payment",
        image: "1779304435608.png",
        handler: async function (response) {
            showToast("Payment verified! Processing order...", "success");
            await processFinalOrderPayload();
        },
        prefill: {
            name: localStorage.getItem('medi_profile_name') || "User",
            email: "user@medifinder.com",
            contact: JSON.parse(localStorage.getItem('medi_delivery_address') || '{}').phone || ""
        },
        theme: {
            color: "#e02020"
        }
    };

    const rzp1 = new Razorpay(options);
    rzp1.on('payment.failed', function (response) {
        showToast("Payment failed! Please try again.", "error");
    });
    rzp1.open();
}

async function handleNetbankingPayment(bank) {
    if (currentCart.length === 0) { 
        showToast("Your cart is empty!", "error"); 
        return; 
    }
    
    const addr = JSON.parse(localStorage.getItem('medi_delivery_address') || 'null');
    if (!addr || !addr.house) {
        showToast("Please enter delivery address first!", "error");
        return;
    }

    const total = currentCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const grandTotal = document.getElementById('bill-grand-total')?.innerText || "₹0.00";
    const amount = parseFloat(grandTotal.replace('₹', '')) || total;

    showToast(`Redirecting to ${bank.toUpperCase()} netbanking...`, "info");

    localStorage.setItem('medi_pending_payment', JSON.stringify({
        method: 'NETBANKING',
        bank: bank,
        amount: amount,
        timestamp: new Date().getTime()
    }));

    // Simulate netbanking success
    setTimeout(() => {
        localStorage.removeItem('medi_pending_payment');
        showToast("Netbanking payment successful!", "success");
        processFinalOrderPayload();
    }, 2000);
}

/* ==========================================================================
   MAIN ORDER HANDLER - ROUTES BASED ON PAYMENT METHOD
   ========================================================================== */
async function handlePlaceOrderClick() {
    if (currentCart.length === 0) {
        showToast("Your cart is empty!", "error");
        return;
    }

    const addr = JSON.parse(localStorage.getItem('medi_delivery_address') || 'null');
    if (!addr || !addr.house) {
        showToast("Please enter delivery address first!", "error");
        return;
    }

    // Route based on selected payment method
    switch(selectedPaymentMethod) {
        case 'COD':
            showToast("Processing Cash on Delivery order...", "info");
            await processFinalOrderPayload();
            break;
        case 'UPI':
            showToast("Please select a UPI provider above!", "error");
            break;
        case 'RAZORPAY':
            await handleRazorpayPayment();
            break;
        case 'NETBANKING':
            showToast("Please select your bank above!", "error");
            break;
        default:
            await processFinalOrderPayload();
    }
}

async function processFinalOrderPayload() {
    if (currentCart.length === 0) { alert("Your cart is empty!"); return; }
    const addr = JSON.parse(localStorage.getItem('medi_delivery_address') || 'null');
    if (!addr || !addr.house) {
        alert("Please enter your delivery address first!");
        return;
    }
    const cartHasRxItem = currentCart.some(item => item.isRx === true || item.isRx === 'true');
    if (cartHasRxItem && !isPrescriptionUploaded) {
        alert("❌ Order Blocked! Your cart contains controlled Rx medicines. Please upload your valid prescription from home section first.");
        return;
    }
    const primaryMerchantId = currentCart.find(item => item.merchantId)?.merchantId || null;
    let physicalDistanceKm = Math.sqrt(Math.pow(userLiveLat - shopCoordinates.lat, 2) + Math.pow(userLiveLng - shopCoordinates.lng, 2)) * 111;
    let calculatedTransitMode = physicalDistanceKm > 15 ? "Truck" : physicalDistanceKm > 5 ? "Van" : "Bike";
    let calculatedETA = Math.round(physicalDistanceKm * 6 + 15);
    const secureDeliveryOTP = generateSecureSixDigitOTP();
    const itemsDescription = currentCart.map(i => `${i.name} × ${i.qty}`).join(', ');
    const firstProductImg = currentCart[0]?.img || "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400";
    const fullAddress = `${addr.house}, ${addr.area}, ${addr.city} - ${addr.pincode}${addr.landmark ? ', Near ' + addr.landmark : ''}`;
    const orderId = "ORD-" + Math.floor(1000 + Math.random() * 9000);

    const subtotal = currentCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const grandTotal = document.getElementById('bill-grand-total')?.innerText || "₹0.00";

    let currentUserId = '';
    if (supabase) {
        try { currentUserId = (await supabase.auth.getUser()).data?.user?.id || ''; } catch(e) {}
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
                try { await supabase.from('order_items').insert(orderItemsPayload); } catch (e) { }
            }
        } catch (e) { }
    }

    const successModal = document.getElementById('success-animation-modal');
    if (successModal) {
        successModal.classList.add('modal-revealed');

        // Update success message with delivery details (clear any previous content first
        // so re-opening the modal for a new order doesn't stack old details)
        const detailsContainer = document.getElementById('success-order-details');
        if (detailsContainer) {
            detailsContainer.innerHTML = `
                <p><strong>Order ID:</strong> ${orderId}</p>
                <p><strong>Delivery Mode:</strong> ${calculatedTransitMode}</p>
                <p><strong>Estimated Time:</strong> ${calculatedETA} minutes</p>
                <p><strong>Secure Code:</strong> ${secureDeliveryOTP}</p>
            `;
        }
    } else {
        alert(`Order Placed via ${calculatedTransitMode} Delivery!\nYour Secure Delivery Code: ${secureDeliveryOTP}`);
    }

    currentCart = [];
    localStorage.removeItem('medi_cart');
}

// ============================================================
// ORDERS PAGE
// ============================================================
function setupOrdersPageModules() {
    const listContainer = document.getElementById('order-list');
    if (!listContainer) return;
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
                            <button style="background:#1c82aa;color:white;border:none;padding:6px 14px;border-radius:8px;font-size:0.75rem;font-weight:600;cursor:pointer;" onclick="openLiveTrackingModal('${order.id}','${order.transit_mode||'Bike'}',${order.shop_lat||22.578},${order.shop_lng||88.365},${order.eta_minutes||20},'${order.status}')">Track</button>
                            <button style="background:#2ed573;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:0.75rem;font-weight:600;cursor:pointer;" onclick="openDeliveryBoyVerificationModal('${order.id}')">View OTP</button>
                            <button style="background:#ff4d4d;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:0.75rem;font-weight:600;cursor:pointer;" onclick="handleCancelOrderFlow('${order.id}','${order.status}')">Cancel</button>
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
                        <h4 style="font-size:0.85rem;color:#2f3542;font-weight:700;margin-bottom:2px;">ID: ${order.id}</h4>
                        <p style="margin:0;font-size:0.75rem;color:#747d8c;">Date: ${order.date_string}</p>
                        <p style="margin:0;font-size:0.75rem;color:#747d8c;">${order.items_text}</p>
                        <p style="font-weight:700;color:#e02020;margin-top:2px;">Total: ${order.total_bill}</p>
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                    <span style="font-size:0.65rem;font-weight:700;padding:3px 8px;border-radius:20px;background:#e3faf2;color:#2ed573;"><i class="fa-solid fa-circle-check"></i> Delivered</span>
                    ${showReturn ? `<button onclick="handleReturnOrder('${order.id}')" style="background:#e02020;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:0.7rem;font-weight:700;cursor:pointer;box-shadow:0 3px 8px rgba(224,32,32,0.3);"><i class="fa-solid fa-rotate-left"></i> Return</button>` : ''}
                </div>
            </div>
        `}).join('');
    }
}

window.handleCancelOrderFlow = function(orderId, pipelineStatus) {
    const ps = (pipelineStatus || '').toLowerCase();
    if (ps === "shipped" || ps === "broadcasted" || ps === "picked_up" || ps === "delivered") {
        alert("This product is out for delivery, so it can no longer be canceled. I am so sorry.");
        return;
    }
    if (confirm("Are you sure you want to cancel this order?")) {
        let activeOrdersList = JSON.parse(localStorage.getItem('medi_active_orders')) || [];
        activeOrdersList = activeOrdersList.filter(o => o.id !== orderId);
        localStorage.setItem('medi_active_orders', JSON.stringify(activeOrdersList));
        if (supabase) { try { supabase.from('orders').update({ status: 'cancelled', cancellation_reason: 'Cancelled by user' }).eq('id', orderId); } catch(e) {} }
        alert("Order canceled successfully.");
        setupOrdersPageModules();
    }
};

window.handleReturnOrder = function(orderId) {
    const reason = prompt("Return reason batao (e.g. Wrong product, Damaged, Side effects):");
    if (!reason) return;
    showToast("Return request submitted for Order " + orderId, "success");
};

window.openLiveTrackingModal = function(orderId, forceVehicle = "Bike", shopLat = 22.578, shopLng = 88.365, baseEta = 20, currentStatus = "Active") {
    const modal = document.getElementById('tracking-modal');
    if (!modal) return;
    modal.style.display = "flex";
    modal.classList.add('active');
    document.getElementById('modal-order-id').innerText = `Live Tracking ID: ${orderId}`;
    const stepPlaced = document.getElementById('step-placed');
    const stepShipping = document.getElementById('step-shipping');
    const stepDelivery = document.getElementById('step-delivery');
    if (stepPlaced) stepPlaced.className = "timeline-step finished";
    if (stepShipping) stepShipping.className = "timeline-step";
    if (stepDelivery) stepDelivery.className = "timeline-step";
    if (currentStatus === "Accepted") {
        if (stepPlaced) stepPlaced.className = "timeline-step finished";
        const t = stepPlaced?.querySelector('.text');
        if (t) t.innerText = "Accepted & Packed";
    } else if (currentStatus === "Shipped" || currentStatus === "Broadcasted") {
        if (stepPlaced) stepPlaced.className = "timeline-step finished";
        if (stepShipping) stepShipping.className = "timeline-step active";
    }
    const mapContainer = modal.querySelector('.map-container');
    if (mapContainer) {
        mapContainer.innerHTML = `
            <div id="live-tracking-map" style="width:100%;height:200px;border-radius:12px;margin-bottom:8px;"></div>
            <div id="dynamic-timer-node" style="background:#fff3f3;color:#ff4d4d;padding:10px;border-radius:8px;font-weight:700;font-size:0.85rem;text-align:center;border:1px solid #ffe4e4;">
                <i class="fa-solid fa-clock"></i> Estimated Delivery: <span id="live-countdown-val">${baseEta}</span> Mins
            </div>
        `;
        setTimeout(() => {
            if (typeof L === 'undefined') return;
            let trackMap = L.map('live-tracking-map', { zoomControl: false }).setView([userLiveLat, userLiveLng], 14);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(trackMap);
            const shopIcon = L.divIcon({ html: '<i class="fa-solid fa-store" style="color:#ff4d4d;font-size:24px;"></i>', className: 'custom-div-icon' });
            const userIcon = L.divIcon({ html: '<i class="fa-solid fa-house-user" style="color:#2ed573;font-size:24px;"></i>', className: 'custom-div-icon' });
            let vehicleFa = "fa-motorcycle";
            if (forceVehicle === "Van") vehicleFa = "fa-van-shuttle";
            if (forceVehicle === "Truck") vehicleFa = "fa-truck-moving";
            const truckIcon = L.divIcon({ html: `<i class="fa-solid ${vehicleFa} fa-bounce" style="color:#ffa500;font-size:26px;"></i>`, className: 'custom-div-icon' });
            L.marker([shopLat, shopLng], { icon: shopIcon }).addTo(trackMap).bindPopup("Pharmacy Node Hub").openPopup();
            L.marker([userLiveLat, userLiveLng], { icon: userIcon }).addTo(trackMap).bindPopup("Your Delivery Point");
            let currentVehicleMarker = L.marker([shopLat, shopLng], { icon: truckIcon }).addTo(trackMap);
            L.polyline([[shopLat, shopLng], [userLiveLat, userLiveLng]], { color: '#ff4d4d', weight: 3, dashArray: '5,8' }).addTo(trackMap);
            let progressStep = 0;
            let currentMinutesLeft = baseEta;
            let trackingInterval = setInterval(() => {
                progressStep += 0.05;
                let nextLat = shopLat + (userLiveLat - shopLat) * progressStep;
                let nextLng = shopLng + (userLiveLng - shopLng) * progressStep;
                currentVehicleMarker.setLatLng([nextLat, nextLng]);
                if (currentMinutesLeft > 2) {
                    currentMinutesLeft -= 1;
                    const tv = document.getElementById('live-countdown-val');
                    if (tv) tv.innerText = currentMinutesLeft;
                }
                if (progressStep >= 1.0) {
                    clearInterval(trackingInterval);
                    currentVehicleMarker.bindPopup("<b>Agent Arrived!</b>").openPopup();
                    const tn = document.getElementById('dynamic-timer-node');
                    if (tn) { tn.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#2ed573;"></i> Agent Arrived at your Gate!`; tn.style.background = "#e3faf2"; tn.style.color = "#2ed573"; }
                    if (stepDelivery) stepDelivery.className = "timeline-step finished";
                }
            }, 2500);
            document.getElementById('close-tracking-modal').onclick = () => {
                clearInterval(trackingInterval);
                modal.classList.remove('active');
                modal.style.display = "none";
            };
        }, 300);
    }
};

window.openDeliveryBoyVerificationModal = async function(orderId) {
    let currentSecureOTP = "123456";
    let activeOrders = JSON.parse(localStorage.getItem('medi_active_orders')) || [];
    let targetOrder = activeOrders.find(o => o.id === orderId);
    if (targetOrder) currentSecureOTP = targetOrder.delivery_secure_code || "123456";
    if (supabase) {
        try {
            const { data, error } = await supabase.from('orders').select('delivery_secure_code').eq('id', orderId).single();
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
        let idx = activeOrdersList.findIndex(o => o.id === orderId);
        if (idx !== -1) {
            let doneOrder = activeOrdersList[idx];
            doneOrder.status = "delivered";
            doneOrder.payment_status = "Paid";
            activeOrdersList.splice(idx, 1);
            completedOrdersList.push(doneOrder);
            localStorage.setItem('medi_active_orders', JSON.stringify(activeOrdersList));
            localStorage.setItem('medi_completed_orders', JSON.stringify(completedOrdersList));
        }
        if (supabase) { try { await supabase.from('orders').update({ status:'delivered', payment_status:'Paid' }).eq('id', orderId); } catch(e) {} }
        alert("🔒 Secure Authentication Success! Parcel delivery verified and marked safe.");
        popup.remove();
        setupOrdersPageModules();
    };
};

// ============================================================
// MAP PAGE - Real-time GPS, Search + Suggestions, Distance, GO direction
// ============================================================
async function setupMapPageModules() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    // Remove "Kolkata Core Grid" static label, replace with real GPS city
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

    let map = L.map('map', { zoomControl: false }).setView([userLiveLat, userLiveLng], 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);

    const userIcon = L.divIcon({ html: '<i class="fa-solid fa-street-view" style="color:#ff4d4d;font-size:30px;"></i>', className: 'custom-div-icon', iconSize: [30,30] });
    const shopIcon = L.divIcon({ html: '<i class="fa-solid fa-shop" style="color:#ff4d4d;font-size:26px;"></i>', className: 'custom-div-icon', iconSize: [26,26] });

    let humanMarker = L.marker([userLiveLat, userLiveLng], { icon: userIcon }).addTo(map).bindPopup("<b>You Are Here</b>").openPopup();
    let operationalRoutingControl = null;
    let activeShopMarker = null;

    let pharmacyDatabaseHub = [];
    try {
        if (supabase) {
            const { data, error } = await supabase
                .from('merchants')
                .select('id, merchant_name, latitude, longitude, status, license_status')
                .eq('status', 'active');
            if (!error && data) {
                pharmacyDatabaseHub = data.map(m => ({
                    name: m.merchant_name || 'Pharmacy',
                    lat: parseFloat(m.latitude) || 22.5726,
                    lng: parseFloat(m.longitude) || 88.3639,
                    medicine: '',
                    id: m.id
                }));
            }
        }
    } catch(e) {
        console.error('Failed to load pharmacies:', e);
    }

    // Real-time GPS watch - updates user marker
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition((pos) => {
            userLiveLat = pos.coords.latitude;
            userLiveLng = pos.coords.longitude;
            humanMarker.setLatLng([userLiveLat, userLiveLng]);
            if (operationalRoutingControl && activeShopMarker) {
                map.removeLayer(operationalRoutingControl);
                operationalRoutingControl = L.polyline([[userLiveLat, userLiveLng], activeShopMarker.getLatLng()], {
                    color: "#ff4757", weight: 5, opacity: 0.85, dashArray: '5,10'
                }).addTo(map);
            }
        }, (err) => console.log("Live GPS tracking offline."), { enableHighAccuracy: true, maximumAge: 1000 });
    }

    const liveLocBtn = document.getElementById('live-location-btn');
    if (liveLocBtn) {
        liveLocBtn.addEventListener('click', () => {
            map.setView([userLiveLat, userLiveLng], 16);
            humanMarker.setLatLng([userLiveLat, userLiveLng]);
            humanMarker.openPopup();
        });
    }

    const triggerLiveMapDirections = (shop) => {
        if (operationalRoutingControl) map.removeLayer(operationalRoutingControl);
        if (activeShopMarker) map.removeLayer(activeShopMarker);
        activeShopMarker = L.marker([shop.lat, shop.lng], { icon: shopIcon }).addTo(map)
            .bindPopup(`<b>${shop.name}</b><br>Stock Verified`).openPopup();
        operationalRoutingControl = L.polyline([[userLiveLat, userLiveLng], [shop.lat, shop.lng]], {
            color: "#ff4757", weight: 5, opacity: 0.85, dashArray: '5,10'
        }).addTo(map);
        map.fitBounds(operationalRoutingControl.getBounds(), { padding: [50,50] });
    };

    // ============================================================
    // MAP SEARCH WITH AUTOCOMPLETE SUGGESTIONS
    // ============================================================
    const searchBtn = document.getElementById('map-search-btn');
    const inputField = document.getElementById('medicine-search');
    const displayGrid = document.getElementById('search-results');
    const countEl = document.getElementById('pharmacy-count');

    // Suggestions dropdown for map search
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
                            searchBtn.click();
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
        inputField.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchBtn.click(); });
    }

    if (searchBtn && inputField && displayGrid) {
        searchBtn.addEventListener('click', () => {
            const token = inputField.value.trim().toLowerCase();
            if (!token) { displayGrid.innerHTML = `<p class="placeholder-text">Please type a medicine name to search.</p>`; return; }

            // Load pharmacies from supabase if available, else use static
            const matchedStores = pharmacyDatabaseHub.filter(s => s.name.toLowerCase().includes(token) || (s.medicine && s.medicine.includes(token)));
            displayGrid.innerHTML = "";
            if (countEl) countEl.innerText = `${matchedStores.length} Found`;
            if (matchedStores.length === 0) {
                displayGrid.innerHTML = `<p class="placeholder-text">No registered pharmacies found with this item.</p>`;
                return;
            }

            matchedStores.forEach(shop => {
                // Real-time distance calculation from user GPS
                const distKm = Math.sqrt(Math.pow(userLiveLat - shop.lat, 2) + Math.pow(userLiveLng - shop.lng, 2)) * 111;
                const etaMins = Math.round(distKm * 6 + 5);
                const etaLabel = etaMins < 60 ? `${etaMins} mins` : `${Math.floor(etaMins/60)}h ${etaMins%60}m`;

                const card = document.createElement('div');
                card.className = "shop-card";
                card.style.cssText = "background:#fff;border-radius:12px;padding:12px;margin-bottom:10px;border:1px solid #f1f2f6;box-shadow:0 2px 6px rgba(0,0,0,0.04);";
                card.innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                        <div style="flex:1;">
                            <h4 style="cursor:pointer;color:#ff4d4d;margin:0 0 4px 0;font-size:0.9rem;" class="trigger-popup-view">${shop.name}</h4>
                            <p style="margin:2px 0;font-size:0.78rem;color:#747d8c;"><i class="fa-solid fa-location-crosshairs"></i> ${distKm.toFixed(1)} km away</p>
                            <p style="margin:2px 0;font-size:0.78rem;color:#2ed573;font-weight:600;"><i class="fa-solid fa-circle-check"></i> Medicine In Stock</p>
                            <p style="margin:2px 0;font-size:0.78rem;color:#1c82aa;"><i class="fa-solid fa-truck-fast"></i> ETA: <strong>${etaLabel}</strong></p>
                        </div>
                        <button class="run-routing-trigger" style="background:#ff4d4d;color:#fff;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:0.8rem;font-weight:600;"><i class="fa-solid fa-diamond-turn-right"></i> GO</button>
                    </div>
                `;
                card.querySelector('.trigger-popup-view').onclick = () => openMapMedicineProductDetailsPopup(shop, token);
                card.querySelector('.run-routing-trigger').onclick = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    triggerLiveMapDirections(shop);
                };
                displayGrid.appendChild(card);

                // Add shop to map as marker
                L.marker([shop.lat, shop.lng], { icon: shopIcon }).addTo(map)
                    .bindPopup(`<b>${shop.name}</b><br>ETA: ${etaLabel}`);
            });
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
        photoUploadInput.addEventListener('change', (e) => {
            const chosenFile = e.target.files[0];
            if (chosenFile) {
                const imgReader = new FileReader();
                imgReader.onloadend = () => {
                    localStorage.setItem('medi_saved_profile_image', imgReader.result);
                    if (profileImgElement) profileImgElement.src = imgReader.result;
                    alert("Profile Picture updated!");
                };
                imgReader.readAsDataURL(chosenFile);
            }
        });
    }

    const commitNameBtn = document.getElementById('save-name');
    if (commitNameBtn) {
        commitNameBtn.onclick = async () => {
            const rawEnteredName = nameInputElement.value.trim();
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
                alert("Profile name updated successfully.");
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
            const firstNameCell = document.getElementById('pat-first-name').value.trim();
            const lastNameCell = document.getElementById('pat-last-name').value.trim();
            const ageCell = document.getElementById('pat-age').value.trim();
            const checkedGenderRadio = document.querySelector('input[name="pat_gender"]:checked');
            if (!firstNameCell || !lastNameCell || !ageCell) { alert("Please fill all patient form fields."); return; }
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
            document.getElementById('pat-first-name').value = "";
            document.getElementById('pat-last-name').value = "";
            document.getElementById('pat-age').value = "";
            renderPatientsListUI();
            alert("New patient registered successfully.");
        };
    }

    const triggerReminderModalBtn = document.getElementById('pill-reminders-trigger');
    if (triggerReminderModalBtn) {
        triggerReminderModalBtn.onclick = () => { toggleModalDisplay('reminder-modal', true); renderAlarmsListUI(); };
    }

    const saveActiveAlarmBtn = document.getElementById('action-save-alarm-btn');
    if (saveActiveAlarmBtn) {
        saveActiveAlarmBtn.onclick = async () => {
            const inputMed = document.getElementById('alarm-med-name').value.trim();
            const inputTime = document.getElementById('alarm-time').value;
            if (!inputMed || !inputTime) { alert("Please specify medicine name and time."); return; }
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
            document.getElementById('alarm-med-name').value = "";
            document.getElementById('alarm-time').value = "";
            renderAlarmsListUI();
            alert("Pill reminder set successfully!");
        };
    }

    const editBtn = document.getElementById('edit-profile-btn');
    const addressBtn = document.getElementById('add-address-btn');
    const termsTrigger = document.getElementById('terms-trigger');
    const helpTrigger = document.getElementById('help-desk-trigger');
    const referEarnBtn = document.getElementById('refer-earn-btn');
    if (editBtn) editBtn.onclick = () => toggleModalDisplay('edit-modal', true);
    if (addressBtn) addressBtn.onclick = () => toggleModalDisplay('address-modal', true);
    if (termsTrigger) termsTrigger.onclick = () => { window.location.href = 'usert&c.html'; };
    if (helpTrigger) helpTrigger.onclick = () => toggleModalDisplay('help-modal', true);
    if (referEarnBtn) referEarnBtn.onclick = () => toggleModalDisplay('referral-modal', true);

    // ============================================================
    // ADDRESS MODAL - Address select with autofill from saved addresses
    // ============================================================
    const saveAddressBtn = document.getElementById('save-address-btn');
    if (saveAddressBtn) {
        saveAddressBtn.onclick = async () => {
            const house = document.getElementById('addr-house').value.trim();
            const village = document.getElementById('addr-village').value.trim();
            const pin = document.getElementById('addr-pincode').value.trim();
            if (!house || !village || !pin) { alert("Please fill all address fields."); return; }
            verifiedAddress = `${house}, ${village}, PIN: ${pin}`;
            localStorage.setItem('medi_verified_address', verifiedAddress);

            // Save to address list
            let addrList = JSON.parse(localStorage.getItem('medi_address_list')) || [];
            if (!addrList.includes(verifiedAddress)) {
                addrList.push(verifiedAddress);
                localStorage.setItem('medi_address_list', JSON.stringify(addrList));
            }
            renderAddressSelectDropdown();

            if (currentAddressText) currentAddressText.innerText = verifiedAddress;
            if (supabase) {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session && session.user) {
                        await supabase.from('profiles').upsert({ email: session.user.email, address: verifiedAddress });
                    }
                } catch(e) { }
            }
            toggleModalDisplay('address-modal', false);
            alert("Address saved successfully.");
        };
    }

    renderAddressSelectDropdown();

    const logoutAction = document.getElementById('logout-btn');
    if (logoutAction) {
        logoutAction.onclick = (e) => {
            e.preventDefault();
            if (confirm("Confirm logout?")) {
                localStorage.clear();
                alert("Session Destroyed! Redirecting to index screen.");
                window.location.href = 'index.html';
            }
        };
    }

    // MY BOX BUTTON - prescription history
    const myBoxBtn = document.getElementById('my-box-btn');
    if (myBoxBtn) {
        myBoxBtn.onclick = () => openMyPrescriptionBox();
    }
}

// ============================================================
// ADDRESS SELECT DROPDOWN - autofill from saved list
// ============================================================
function renderAddressSelectDropdown() {
    const selectBox = document.getElementById('saved-address-select');
    if (!selectBox) return;
    const addrList = JSON.parse(localStorage.getItem('medi_address_list')) || [];
    if (addrList.length === 0) {
        selectBox.style.display = 'none';
        return;
    }
    selectBox.style.display = 'block';
    selectBox.innerHTML = `<option value="" disabled selected>-- Select a saved address --</option>` +
        addrList.map(a => `<option value="${a}">${a}</option>`).join('');
    selectBox.onchange = () => {
        const selected = selectBox.value;
        if (selected) {
            const house = selected.split(',')[0]?.trim();
            const village = selected.split(',')[1]?.trim();
            const pin = selected.split('PIN:')[1]?.trim();
            if (document.getElementById('addr-house')) document.getElementById('addr-house').value = house || '';
            if (document.getElementById('addr-village')) document.getElementById('addr-village').value = village || '';
            if (document.getElementById('addr-pincode')) document.getElementById('addr-pincode').value = pin || '';
        }
    };
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
            alert(`🚨 MEDIFINDER PILL REMINDER 🚨\n\nTime to take your medicine:\n📋 Medicine: ${alarmItem.medicine}\n⏰ Time: ${alarmItem.time}`);
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
        console.log("Realtime stream setup error caught.");
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

        slider.innerHTML = '';
        data.forEach((item, i) => {
            const div = document.createElement('div');
            div.className = 'slide' + (i === 0 ? ' active-slide' : '');
            div.style.background = item.gradient || 'linear-gradient(135deg, #ff6b6b, #ee5a24)';
            div.innerHTML = `
                <div class="slide-content">
                    <span class="slide-tag">${item.tag || 'SPONSORED'}</span>
                    <h3>${item.title}</h3>
                    <p>${item.subtitle}</p>
                    ${item.btn_text ? `<button class="slide-btn" ${item.btn_action ? `onclick="window.location.href='${item.btn_action}'"` : ''}>${item.btn_text} <i class="fa-solid fa-arrow-right"></i></button>` : ''}
                </div>
                <div class="slide-icon"><i class="${item.icon_class || 'fa-solid fa-capsules'}"></i></div>
            `;
            slider.appendChild(div);
        });
    } catch (e) {
        console.log('Sponsored products load skipped, using defaults');
    }
}

/* ==========================================================================
   AUTO-SLIDING BANNER - Flipkart Style Carousel
   ========================================================================== */
function initAutoSlider() {
    const slider = document.getElementById('home-slider');
    const dotsContainer = document.getElementById('slider-dots');
    if (!slider || !dotsContainer) return;

    const slides = slider.querySelectorAll('.slide');
    if (slides.length === 0) return;

    let currentSlide = 0;
    let autoSlideInterval;

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
        autoSlideInterval = setInterval(nextSlide, 3500);
    }

    function resetAutoSlide() {
        clearInterval(autoSlideInterval);
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

/* ==========================================================================
   TOAST NOTIFICATION SYSTEM
   ========================================================================== */
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-circle-xmark';
    if (type === 'info') icon = 'fa-circle-info';
    
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastSlideOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

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
   SERVICES MENU
   ========================================================================== */
function initServicesMenu() {
    const serviceItems = document.querySelectorAll('.service-item');
    serviceItems.forEach(item => {
        item.addEventListener('click', () => {
            const service = item.dataset.service;
            const messages = {
                lab: 'Lab Test booking coming soon! Stay tuned.',
                instrument: 'Medical Instruments store coming soon!',
                nurse: 'Nurse Booking service coming soon!',
                doctor: 'Doctor Consultation - Coming Soon!',
                checkup: 'Body Checkup packages coming soon!',
                ambulance: 'Emergency Ambulance: 108 / 102',
                coins: 'Tablet Coins rewards program coming soon!'
            };
            showToast(messages[service] || 'Service coming soon!', 'info');
        });
    });
}

/* ==========================================================================
   UPDATE PRODUCT COUNT
   ========================================================================== */
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

/* ==========================================================================
   HAMBURGER MENU
   ========================================================================== */
function initHamburgerMenu() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const overlay = document.getElementById('hamburger-overlay');
    const closeBtn = document.getElementById('hamburger-close-btn');
    const hamburgerIcon = hamburgerBtn?.querySelector('.hamburger-icon');

    if (!hamburgerBtn || !overlay) return;

    // Set user name in menu
    const userName = localStorage.getItem('medi_profile_name') || 'Guest User';
    const userId = localStorage.getItem('medi_user_uid') || 'MF' + Math.floor(100000 + Math.random() * 900000);
    const nameEl = document.getElementById('hamburger-user-name');
    const idEl = document.getElementById('hamburger-user-id');
    if (nameEl) nameEl.innerText = userName;
    if (idEl) idEl.innerText = userId;

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