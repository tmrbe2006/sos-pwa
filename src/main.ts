import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  getDocs, 
  onSnapshot, 
  deleteDoc,
  updateDoc,
  serverTimestamp, 
  query, 
  orderBy, 
  where,
  limit 
} from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

// ==========================================
// 1. Configuration & Firebase Initialization
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyCU08ox3MZEUCKbdeNjB8XV9E0clLn5RwA",
  authDomain: "abdelazim-3ad39.firebaseapp.com",
  projectId: "abdelazim-3ad39",
  storageBucket: "abdelazim-3ad39.firebasestorage.app",
  messagingSenderId: "1089326447312",
  appId: "1:1089326447312:web:30c32a689fd98b84bbfcd5",
  measurementId: "G-TP0L5VL9Y7"
};

const VAPID_KEY = "BEkwECEOa7Jv0KJwzgb1-5L8i8cysPtPMmzOZ5uht8yqp86X_cEFnTeZpZ_J0NJR2zKU8XJlfOETiU6cSgCt_KA";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const messaging = getMessaging(app);

// Unique Device ID Generation (to avoid duplicate tokens in Firestore)
function getOrCreateDeviceId(): string {
  let id = localStorage.getItem('sos_device_id');
  if (!id) {
    id = 'device_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem('sos_device_id', id);
  }
  return id;
}
const deviceId = getOrCreateDeviceId();

// Wing, Bed & Resident Type Interfaces and State
interface Bed {
  bedId: string;
  residentName: string;
}

interface WingData {
  id: string;
  name: string;
  beds: Bed[];
}

let wingsList: WingData[] = [];
let selectedWing: WingData | null = null;
let selectedBed: Bed | null = null;

// Google Maps & GPS live tracking variables
let mapInstance: google.maps.Map | null = null;
let activeMarkers: Map<string, any> = new Map();
const lastMarkerUpdate: Map<string, number> = new Map();
let staleMarkerCleanupInterval: any = null;
let unsubscribeLocations: (() => void) | null = null;
let gpsWatchId: number | null = null;
let mapHasFocusedOnce = false;

// ==========================================
// 2. DOM Elements Selection
// ==========================================

const themeToggle = document.getElementById('theme-toggle') as HTMLButtonElement;
const themeSun = document.getElementById('theme-sun') as HTMLElement;
const themeMoon = document.getElementById('theme-moon') as HTMLElement;

const connectionPulse = document.getElementById('connection-pulse') as HTMLElement;
const connectionDot = document.getElementById('connection-dot') as HTMLElement;
const offlineAlert = document.getElementById('offline-alert') as HTMLElement;

const pwaInstallBtn = document.getElementById('pwa-install-btn') as HTMLButtonElement;
const iosInstallModal = document.getElementById('ios-install-modal') as HTMLElement;
const closeIosModal = document.getElementById('close-ios-modal') as HTMLButtonElement;

const sosButton = document.getElementById('sos-button') as HTMLButtonElement;
const supervisorButton = document.getElementById('supervisor-button') as HTMLButtonElement | null;
const countdownOverlay = document.getElementById('countdown-overlay') as HTMLElement;
const countdownNumber = document.getElementById('countdown-number') as HTMLElement;
const sosHintText = document.getElementById('sos-hint-text') as HTMLElement;
const countdownHint = document.getElementById('countdown-hint') as HTMLElement;

const permissionBadge = document.getElementById('permission-badge') as HTMLElement;
const tokenStatus = document.getElementById('token-status') as HTMLElement;
const copyTokenBtn = document.getElementById('copy-token-btn') as HTMLButtonElement;
const devicesCountBadge = document.getElementById('devices-count') as HTMLElement;

const alertsLog = document.getElementById('alerts-log') as HTMLElement;
const clearLogsBtn = document.getElementById('clear-logs-btn') as HTMLButtonElement;

const simForegroundBtn = document.getElementById('sim-foreground-btn') as HTMLButtonElement;
const triggerAlarmBtn = document.getElementById('trigger-alarm-btn') as HTMLButtonElement;

// Collapsible SOS Settings Selectors
const toggleSettingsBtn = document.getElementById('toggle-settings-btn') as HTMLButtonElement;
const settingsChevron = document.getElementById('settings-chevron') as unknown as HTMLElement;
const settingsPanelContainer = document.getElementById('settings-panel-container') as HTMLElement;

const telegramEnable = document.getElementById('telegram-enable') as HTMLInputElement;
const telegramBotToken = document.getElementById('telegram-bot-token') as HTMLInputElement;
const telegramChatId = document.getElementById('telegram-chat-id') as HTMLInputElement;

const whatsappEnable = document.getElementById('whatsapp-enable') as HTMLInputElement;
const whatsappInstanceId = document.getElementById('whatsapp-instance-id') as HTMLInputElement;
const whatsappToken = document.getElementById('whatsapp-token') as HTMLInputElement;
const whatsappRecipients = document.getElementById('whatsapp-recipients') as HTMLTextAreaElement;

const emailEnable = document.getElementById('email-enable') as HTMLInputElement;
const emailServiceType = document.getElementById('email-service-type') as HTMLSelectElement;
const emailCredentialLabel = document.getElementById('email-credential-label') as HTMLElement;
const emailApiKey = document.getElementById('email-api-key') as HTMLInputElement;
const emailSenderContainer = document.getElementById('email-sender-container') as HTMLElement;
const emailSender = document.getElementById('email-sender') as HTMLInputElement;
const emailRecipients = document.getElementById('email-recipients') as HTMLTextAreaElement;
const emailHintText = document.getElementById('email-hint-text') as HTMLElement;

const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;

// Audio Elements
const audioAlarm = document.getElementById('audio-alarm') as HTMLAudioElement;
const audioTick = document.getElementById('audio-tick') as HTMLAudioElement;

// Web Audio API High-Intensity Siren Synthesizer States
let audioCtx: AudioContext | null = null;
let synthOscillator1: OscillatorNode | null = null;
let synthOscillator2: OscillatorNode | null = null;
let synthGainNode: GainNode | null = null;
let synthInterval: any = null;

// ==========================================
// 3. Theme Toggle Setup (Dark/Light)
// ==========================================

function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    document.documentElement.classList.add('dark');
    themeSun.classList.remove('hidden');
    themeMoon.classList.add('hidden');
  } else {
    document.documentElement.classList.remove('dark');
    themeSun.classList.add('hidden');
    themeMoon.classList.remove('hidden');
  }
}

themeToggle.addEventListener('click', () => {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  
  if (isDark) {
    themeSun.classList.remove('hidden');
    themeMoon.classList.add('hidden');
  } else {
    themeSun.classList.add('hidden');
    themeMoon.classList.remove('hidden');
  }
});

// ==========================================
// 4. Online/Offline Status Listeners
// ==========================================

function updateOnlineStatus() {
  if (navigator.onLine) {
    connectionPulse.classList.add('animate-ping');
    connectionDot.classList.remove('bg-rose-500');
    connectionDot.classList.add('bg-emerald-500');
    offlineAlert.classList.add('hidden');
  } else {
    connectionPulse.classList.remove('animate-ping');
    connectionDot.classList.remove('bg-emerald-500');
    connectionDot.classList.add('bg-rose-500');
    offlineAlert.classList.remove('hidden');
  }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// ==========================================
// 5. PWA Installation UI Handling
// ==========================================

let deferredPrompt: any = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Show standard installation button for supported browsers
  pwaInstallBtn.classList.remove('hidden');
});

pwaInstallBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  pwaInstallBtn.disabled = true;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`PWA Installation outcome: ${outcome}`);
  pwaInstallBtn.classList.add('hidden');
  deferredPrompt = null;
});

// Detect iOS and guide user
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;

if (isIOS && !isStandalone) {
  // Show custom installation button for iOS Safari users
  pwaInstallBtn.classList.remove('hidden');
  pwaInstallBtn.addEventListener('click', () => {
    iosInstallModal.classList.remove('hidden');
    setTimeout(() => {
      iosInstallModal.classList.remove('opacity-0');
      iosInstallModal.querySelector('.rounded-t-3xl')?.classList.remove('translate-y-full');
    }, 50);
  });
}

closeIosModal.addEventListener('click', () => {
  iosInstallModal.classList.add('opacity-0');
  iosInstallModal.querySelector('.rounded-t-3xl')?.classList.add('translate-y-full');
  setTimeout(() => {
    iosInstallModal.classList.add('hidden');
  }, 300);
});

// ==========================================
// 5.5. Localization System (Arabic / English)
// ==========================================

let currentLang: 'ar' | 'en' = (localStorage.getItem('sos_language') as 'ar' | 'en') || 'ar';

function translateRole(role: string): string {
  if (currentLang === 'en') {
    switch(role) {
      case 'عامل': return 'Worker';
      case 'الطوارئ': return 'Emergency';
      case 'مراقب': return 'Supervisor';
      case 'المالك': return 'Owner';
    }
  }
  return role;
}

const TRANSLATIONS: Record<string, Record<'ar' | 'en', string>> = {
  'location-resident-title': {
    ar: "📍 موقع الاستغاثة والمقيم:",
    en: "📍 SOS Location & Resident:"
  },
  'wing-label': {
    ar: "الجناح:",
    en: "Wing:"
  },
  'bed-label': {
    ar: "السرير:",
    en: "Bed:"
  },
  'select-general-wing': {
    ar: "🚨 نداء عام (كامل المركز)",
    en: "🚨 General Broadcast (Center-wide)"
  },
  'select-wing-first': {
    ar: "-- اختر الجناح أولاً --",
    en: "-- Select Wing First --"
  },
  'additional-notes-label': {
    ar: "📝 ملاحظات إضافية مرسلة مع البلاغ (اختياري):",
    en: "📝 Additional notes sent with call (Optional):"
  },
  'voice-status-text': {
    ar: "جاري الاستماع...",
    en: "Listening..."
  },
  'connection-token-title': {
    ar: "حالة الاتصال والـ Token",
    en: "FCM Connection & Token Status"
  },
  'notification-permission-label': {
    ar: "صلاحية الإشعارات:",
    en: "Notification Permission:"
  },
  'device-id-label': {
    ar: "معرّف الجهاز (FCM):",
    en: "Device FCM ID:"
  },
  'registered-devices-label': {
    ar: "الأجهزة المسجلة:",
    en: "Registered Devices:"
  },
  'channel-settings-title': {
    ar: "⚙️ إعدادات القنوات",
    en: "⚙️ Channel Settings"
  },
  'case-details-header': {
    ar: "📋 بيانات المقيم والموقع",
    en: "📋 Resident & Location Details"
  },
  'case-wing-label': {
    ar: "الجناح الطبي:",
    en: "Medical Wing:"
  },
  'case-bed-label': {
    ar: "رقم السرير:",
    en: "Bed Number:"
  },
  'case-resident-label': {
    ar: "اسم المقيم المستغيث:",
    en: "Resident Name:"
  },
  'case-notes-title': {
    ar: "📝 ملاحظات إضافية مرسلة مع الاستغاثة:",
    en: "📝 Additional notes sent with request:"
  },
  'case-resolution-title': {
    ar: "🛠️ تفاصيل كيفية الحل وإجراءات المعالجة المتخذة:",
    en: "🛠️ Resolution details & actions taken:"
  },
  'case-timing-title': {
    ar: "⏱️ توقيتات الاستجابة ومؤشر السرعة",
    en: "⏱️ Response Timings & Speed Index"
  },
  'case-created-label': {
    ar: "توقيت إرسال الاستغاثة:",
    en: "Request Time:"
  },
  'case-resolved-label': {
    ar: "توقيت إغلاق البلاغ:",
    en: "Closed Time:"
  },
  'case-responder-label': {
    ar: "العضو المستجيب (المغلق):",
    en: "Responder (Closed By):"
  },
  'case-duration-label': {
    ar: "الزمن المستغرق للاستجابة:",
    en: "Time Elapsed to Respond:"
  },
  'case-evaluation-label': {
    ar: "مستوى جودة الاستجابة للأطقم الطبية:",
    en: "Response Quality Level:"
  },
  'ios-install-title': {
    ar: "تثبيت التطبيق على أجهزة iPhone / iPad",
    en: "Install App on iPhone / iPad"
  },
  'ios-install-desc': {
    ar: "لتحصل على كامل مميزات تطبيق الاستغاثة وتلقي الإشعارات حتى عندما يكون مغلقاً، يرجى تثبيته على شاشتك الرئيسية:",
    en: "To get full SOS benefits and receive notifications even when closed, please install it on your home screen:"
  },
  'ios-install-step-1': {
    ar: "اضغط على زر <strong>مشاركة (Share)</strong> في شريط متصفح Safari بالأسفل.",
    en: "Tap the <strong>Share</strong> button in Safari's bottom bar."
  },
  'ios-install-step-2': {
    ar: "قم بالتمرير للأسفل ثم اضغط على <strong>إضافة للشاشة الرئيسية (Add to Home Screen)</strong>.",
    en: "Scroll down and tap <strong>Add to Home Screen</strong>."
  },
  'close-ios-modal': {
    ar: "موافق، تم الفهم",
    en: "OK, Understood"
  },
  'mute-alert-btn': {
    ar: "🔕 كتم الصوت",
    en: "🔕 Mute"
  },
  'unmute-alert-btn': {
    ar: "🔔 تشغيل الصوت",
    en: "🔔 Unmute"
  },
  'countdown-cancel-text': {
    ar: "إلغاء الأمر",
    en: "Cancel SOS"
  },
  'offline-alert': {
    ar: "⚠️ أنت تعمل في وضع عدم الاتصال (Offline). سيتم تخزين بعض العمليات محلياً.",
    en: "⚠️ Offline mode. Operations will be stored locally."
  },
  'header-title': {
    ar: "🚨 نظام استدعاء طوارئ الأجنحة والأسرة",
    en: "🚨 Bed & Wing SOS Emergency System"
  },
  'pwa-install-btn-text': {
    ar: "📲 تثبيت التطبيق",
    en: "📲 Install App"
  },
  'lang-toggle-text': {
    ar: "EN",
    en: "AR"
  },
  'user-status-label': {
    ar: "مرحباً بك،",
    en: "Welcome,"
  },
  'logout-btn': {
    ar: "🚪 خروج",
    en: "🚪 Logout"
  },
  'switch-tv-btn': {
    ar: "📺 شاشة المراقبين الكبرى",
    en: "📺 Big Monitor Screen"
  },
  'connection-status-title': {
    ar: "📶 حالة التوصيل السحابي الفوري",
    en: "📶 Real-time Cloud Connection"
  },
  'connection-status-subtitle': {
    ar: "مزامنة اللحظة للبلاغات",
    en: "Instant Alert Syncing Status"
  },
  'devices-registered-label': {
    ar: "الأجهزة النشطة:",
    en: "Active Devices:"
  },
  'token-badge-label': {
    ar: "معرف الخدمة السحابية (Token):",
    en: "Cloud Token Identifier:"
  },
  'worker-panel-title': {
    ar: "🆘 بوابة نداء واستغاثة الطوارئ",
    en: "🆘 SOS Emergency Request Portal"
  },
  'caller-notes-label': {
    ar: "📝 ملاحظات وتفاصيل إضافية (اختياري):",
    en: "📝 Additional notes (Optional):"
  },
  'sos-btn-text': {
    ar: "SOS",
    en: "SOS"
  },
  'sos-btn-sub': {
    ar: "إرسال استغاثة",
    en: "Send Emergency"
  },
  'supervisor-btn-text': {
    ar: "إرسال نداء للمشرف",
    en: "Request Supervisor"
  },
  'location-guide-title': {
    ar: "📍 حدد موقع البلاغ والغرفة بدقة:",
    en: "📍 Set exact room & bed location:"
  },
  'select-wing-text': {
    ar: "--- اختر الجناح الطبي ---",
    en: "--- Select Medical Wing ---"
  },
  'select-bed-text': {
    ar: "--- اختر السرير / المقيم ---",
    en: "--- Select Bed / Resident ---"
  },
  'selected-loc-label': {
    ar: "الموقع المختار حالياً:",
    en: "Currently selected location:"
  },
  'selected-loc-none': {
    ar: "لم يتم تحديد موقع (سيتم إرسال نداء عام)",
    en: "No location selected (general broadcast)"
  },
  'live-monitor-title': {
    ar: "🚨 شاشة المراقبة الفورية المباشرة",
    en: "🚨 Real-Time Emergency Monitor"
  },
  'live-monitor-subtitle': {
    ar: "متابعة البلاغات واستجابة الممرضين",
    en: "Track incoming alerts & staff response"
  },
  'emergency-channels-title': {
    ar: "⚙️ إعدادات قنوات الإخطار والطوارئ الذكية",
    en: "⚙️ Smart Notification Settings"
  },
  'telegram-enable-label': {
    ar: "تفعيل قناة تيليجرام (Telegram):",
    en: "Enable Telegram Channel:"
  },
  'telegram-bot-label': {
    ar: "رمز البوت المالي (Bot Token):",
    en: "Bot Token:"
  },
  'telegram-chat-label': {
    ar: "معرف المجموعة (Chat ID):",
    en: "Chat ID:"
  },
  'whatsapp-enable-label': {
    ar: "تفعيل واتساب الفوري (WhatsApp UltraMsg):",
    en: "Enable WhatsApp (UltraMsg):"
  },
  'whatsapp-recipients-label': {
    ar: "أرقام هواتف المستلمين (مفصولة بفاصلة):",
    en: "Recipient Phone Numbers (comma separated):"
  },
  'email-enable-label': {
    ar: "تفعيل البريد الإلكتروني المطور (Resend/Gmail):",
    en: "Enable Email (Resend/Gmail):"
  },
  'email-service-label': {
    ar: "مزود خدمة الإرسال السحابي:",
    en: "Cloud Email Service Provider:"
  },
  'email-sender-label': {
    ar: "عنوان البريد المرسل (الافتراضي للجهة):",
    en: "Sender Email Address:"
  },
  'email-recipients-label': {
    ar: "قائمة المستقبلين (مفصولة بفاصلة):",
    en: "Recipient Emails (comma separated):"
  },
  'save-settings-btn': {
    ar: "💾 حفظ وتفعيل الإعدادات",
    en: "💾 Save & Apply Settings"
  },
  'user-management-title': {
    ar: "👥 إدارة المستخدمين (المالك)",
    en: "👥 User Management (Owner)"
  },
  'add-user-title': {
    ar: "➕ إضافة مستخدم جديد",
    en: "➕ Add New User"
  },
  'full-name-label': {
    ar: "الاسم الكامل:",
    en: "Full Name:"
  },
  'username-label': {
    ar: "اسم المستخدم:",
    en: "Username:"
  },
  'password-label': {
    ar: "كلمة المرور:",
    en: "Password:"
  },
  'role-label': {
    ar: "نوع المستخدم:",
    en: "User Role:"
  },
  'add-user-btn-text': {
    ar: "✨ إضافة المستخدم",
    en: "✨ Add User"
  },
  'registered-users-label': {
    ar: "📋 المستخدمين المسجلين حالياً:",
    en: "📋 Currently Registered Users:"
  },
  'wing-management-title': {
    ar: "🏢 إدارة الأجنحة والأسرة والمقيمين (المالك)",
    en: "🏢 Wing & Resident Management"
  },
  'add-wing-title': {
    ar: "➕ إضافة جناح جديد",
    en: "➕ Add New Wing"
  },
  'wing-name-label': {
    ar: "اسم الجناح بالعربية/الإنجليزية:",
    en: "Wing Name (Arabic/English):"
  },
  'add-wing-btn-text': {
    ar: "✨ إضافة جناح جديد",
    en: "✨ Add Wing"
  },
  'add-bed-title': {
    ar: "🛏️ إضافة سرير ومقيم إلى جناح",
    en: "🛏️ Add Bed & Resident to Wing"
  },
  'select-wing-label': {
    ar: "اختر الجناح:",
    en: "Select Wing:"
  },
  'bed-id-label': {
    ar: "رمز / رقم السرير:",
    en: "Bed Code/ID:"
  },
  'resident-name-label': {
    ar: "اسم المقيم الحالي:",
    en: "Resident Name:"
  },
  'add-bed-btn-text': {
    ar: "✨ إضافة السرير والمقيم",
    en: "✨ Add Bed & Resident"
  },
  'current-registry-title': {
    ar: "📋 سجل الأجنحة والغرف والأسرة:",
    en: "📋 Wings, Beds & Residents Registry:"
  },
  'reports-title': {
    ar: "لوحة التحكم والتحليل الذكي للأداء",
    en: "Performance & Smart Analytics Dashboard"
  },
  'reports-subtitle': {
    ar: "مراقبة جودة الخدمة واستجابة الأطقم الطبية للنداءات",
    en: "Monitor care quality and staff response times"
  },
  'report-preview-btn-text': {
    ar: "👁️ معاينة وطباعة مستقلة",
    en: "👁️ Preview & Print Independent"
  },
  'report-print-btn-text': {
    ar: "🖨️ طباعة التقرير الكلي المعتمد",
    en: "🖨️ Print Final Certified Report"
  },
  'avg-response-label': {
    ar: "⏱️ متوسط زمن الاستجابة",
    en: "⏱️ Average Response Time"
  },
  'resolved-cases-label': {
    ar: "✅ الحالات المحلولة والمؤرشفة",
    en: "✅ Resolved & Archived Cases"
  },
  'excellent-rate-label': {
    ar: "⚡ كفاءة الاستجابة الفائقة (< ٣ د)",
    en: "⚡ Perfect Response Efficiency (< 3m)"
  },
  'search-smart-label': {
    ar: "🔍 بحث ذكي بالاسم أو الملاحظات:",
    en: "🔍 Smart Search by Name/Notes:"
  },
  'filter-speed-label': {
    ar: "🎯 تصفية حسب سرعة الاستجابة:",
    en: "🎯 Filter by Response Speed:"
  },
  'filter-speed-all': {
    ar: "كل المستويات والأزمنة",
    en: "All Levels & Intervals"
  },
  'filter-speed-excellent': {
    ar: "استجابة فائقة السرعة (< ٣ د) ⚡",
    en: "Super-fast Response (< 3m) ⚡"
  },
  'filter-speed-standard': {
    ar: "استجابة قياسية طبيعية (٣ - ٧ د) 🟢",
    en: "Standard Response (3-7m) 🟢"
  },
  'filter-speed-delayed': {
    ar: "استجابة متأخرة وبطيئة (> ٧ د) ⚠️",
    en: "Delayed/Slow Response (> 7m) ⚠️"
  },
  'syncing-data-text': {
    ar: "جاري مزامنة وتحميل بيانات الأداء من السحابة...",
    en: "Syncing performance analytics from cloud..."
  },
  'total-archive-title': {
    ar: "📜 أرشيف الاتصالات الكلي",
    en: "📜 Master Communication Archive"
  },
  'clear-logs-btn': {
    ar: "مسح السجل",
    en: "Clear Logs"
  },
  'no-alerts-placeholder': {
    ar: "لا توجد نداءات طوارئ حالياً.",
    en: "No active emergency alerts."
  },
  'simulation-tools-title': {
    ar: "أدوات محاكاة الإشعارات والصفارة:",
    en: "Notification & Siren Simulation Tools:"
  },
  'sim-foreground-btn-text': {
    ar: "🔔 محاكاة إشعار",
    en: "🔔 Simulate Notification"
  },
  'trigger-alarm-btn-text': {
    ar: "🔊 تجربة الصفارة",
    en: "🔊 Test Siren"
  },
  'login-title': {
    ar: "بوابة الاستغاثة الآمنة",
    en: "Secure SOS Portal"
  },
  'login-subtitle': {
    ar: "يرجى تسجيل الدخول للوصول إلى نظام الطوارئ SOS",
    en: "Please login to access the SOS emergency system"
  },
  'login-username-label': {
    ar: "اسم المستخدم:",
    en: "Username:"
  },
  'login-password-label': {
    ar: "كلمة المرور:",
    en: "Password:"
  },
  'login-submit-btn-text': {
    ar: "🔓 تسجيل الدخول",
    en: "🔓 Login"
  },
  'login-error': {
    ar: "اسم المستخدم أو كلمة المرور غير صحيحة!",
    en: "Incorrect username or password!"
  },
  'tv-title': {
    ar: "نظام المراقبة والنداء المركزي المركزي (Smart TV Dashboard)",
    en: "Centralized Monitoring & Calling System (Smart TV Dashboard)"
  },
  'tv-subtitle': {
    ar: "بث مباشر ورصد حي للاستغاثات 🟢",
    en: "Live broadcast & real-time monitoring of calls 🟢"
  },
  'tv-resolved-count-label': {
    ar: "الحالات المغلقة اليوم:",
    en: "Closed Cases Today:"
  },
  'tv-active-count-label': {
    ar: "البلاغات النشطة حالياً:",
    en: "Currently Active Alerts:"
  },
  'tv-stable-title': {
    ar: "جميع الأجنحة الطبية مستقرة بالكامل",
    en: "All Medical Wings Are Completely Stable"
  },
  'tv-stable-desc': {
    ar: "يقوم نظام الرصد والمسح الفوري بتمشيط قنوات الاتصال سحابياً على مدار الثانية. لا توجد استغاثات أو بلاغات معلقة حالياً.",
    en: "The system scans cloud communication channels second by second. No pending alerts or emergency calls."
  },
  'tv-footer-desc': {
    ar: "شاشة الرصد والمتابعة مصممة خصيصاً لأجهزة الـ Smart TV وغرف العمليات المركزية.",
    en: "The monitor screen is specifically designed for Smart TVs and central operations rooms."
  },
  'tv-switch-standard-btn-text': {
    ar: "💻 الانتقال إلى الوضع العادي (موبايل / تابلت)",
    en: "💻 Switch to Normal Mode (Mobile / Tablet)"
  },
  'edit-modal-save-btn': {
    ar: "حفظ التعديلات",
    en: "Save Changes"
  },
  'close-edit-modal': {
    ar: "إلغاء",
    en: "Cancel"
  },
  'resolve-modal-title': {
    ar: "إغلاق وتأكيد حل البلاغ",
    en: "Confirm Resolution & Close Alert"
  },
  'resolve-modal-cancel-btn': {
    ar: "إلغاء",
    en: "Cancel"
  },
  'resolve-modal-confirm-btn': {
    ar: "تأكيد وإغلاق البلاغ",
    en: "Confirm & Close Alert"
  },
  'resolve-modal-notes-label': {
    ar: "كيفية الحل وإجراءات المعالجة المتخذة:",
    en: "Resolution action and steps taken:"
  },
  'confirm-modal-title': {
    ar: "تأكيد الإجراء",
    en: "Confirm Action"
  },
  'confirm-modal-cancel-btn': {
    ar: "إلغاء",
    en: "Cancel"
  },
  'confirm-modal-confirm-btn': {
    ar: "تأكيد",
    en: "Confirm"
  },
  'print-preview-title': {
    ar: "معاينة المستند والتقرير الجاهز للطباعة",
    en: "Print Preview & Approved Document"
  },
  'print-preview-warning': {
    ar: `⚠️ <strong>تنبيه الأمان لبيئة المعاينة:</strong> المتصفحات تمنع نوافذ الطباعة التلقائية داخل الأطر المؤطرة (iFrame) لحمايتك. لقد جهزنا لك التقرير بالأسفل بالكامل! يمكنك نسخه، أو لطباعته ورقيّاً كملف PDF يرجى الضغط على زر "فتح في نافذة مستقلة" الموجود في الركن العلوي الأيمن من شاشة AI Studio للطباعة المباشرة.`,
    en: `⚠️ <strong>Sandbox Security Warning:</strong> Browsers block direct pop-up printing within sandboxed frames (iFrames) for your security. We prepared the full report below! You can copy it, or to print it on paper/PDF, click "Open in new window" in the top-right corner of AI Studio.`
  },
  'print-preview-copy-btn': {
    ar: "📋 نسخ التقرير كمتن",
    en: "📋 Copy Report Text"
  },
  'print-preview-trigger-btn': {
    ar: "🖨️ محاولة طباعة ورقية",
    en: "🖨️ Attempt Paper Print"
  },
  'close-print-preview-btn': {
    ar: "إغلاق المعاينة",
    en: "Close Preview"
  },
  'case-modal-title': {
    ar: "ملف الحالة والتقرير الطبي المعتمد",
    en: "Case File & Certified Medical Report"
  },
  'dismiss-case-modal': {
    ar: "إغلاق ملف الحالة",
    en: "Close Case File"
  },
  'print-case-tv-btn': {
    ar: "👁️ معاينة مستقلة",
    en: "👁️ Separate Preview"
  },
  'print-case-btn': {
    ar: "🖨️ طباعة التقرير الفردي",
    en: "🖨️ Print Individual Report"
  },
  'active-user-label': {
    ar: "المستخدم النشط:",
    en: "Active User:"
  },
  'map-monitor-title': {
    ar: "🗺️ خريطة الرصد وتتبع المتصلين الفورية",
    en: "🗺️ Live Caller Tracking Map (GPS & Token)"
  },
  'map-status-badge': {
    ar: "مزامنة GPS نشطة",
    en: "GPS Sync Active"
  }
};

const placeholders: Record<string, Record<'ar' | 'en', string>> = {
  'sos-caller-notes': {
    ar: "مثال: المقيم يشعر بدوار شديد، سقوط في الحمام...",
    en: "Example: resident feels dizzy, fell in room..."
  },
  'report-search': {
    ar: "اكتب اسم المقيم، الجناح، أو ملاحظات البلاغ...",
    en: "Type resident name, wing, or notes..."
  },
  'login-username': {
    ar: "مثال: admin",
    en: "e.g., admin"
  },
  'new-user-name': {
    ar: "أحمد علي",
    en: "John Doe"
  },
  'new-user-username': {
    ar: "ahmed",
    en: "john"
  },
  'new-wing-name': {
    ar: "جناح الياسمين - الطابق الثاني",
    en: "Jasmine Wing - Second Floor"
  },
  'new-bed-id': {
    ar: "سرير ١٠٤",
    en: "Bed 104"
  },
  'new-resident-name': {
    ar: "العم عبدالرحمن",
    en: "John Smith"
  },
  'resolve-notes-input': {
    ar: "مثال: تم التوجه للغرفة فوراً ومساعدة المقيم، وتبين أن المشكلة بسيطة وتم حلها بنجاح مع الاطمئنان على علاماته الحيوية.",
    en: "e.g., Immediately went to the room, helped the resident, verified vitals and successfully resolved the issue."
  }
};

function applyLanguage() {
  document.documentElement.setAttribute('dir', currentLang === 'ar' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', currentLang);
  
  // Toggle class for specific styling if needed
  if (currentLang === 'en') {
    document.body.classList.add('lang-en');
    document.body.classList.remove('lang-ar');
  } else {
    document.body.classList.add('lang-ar');
    document.body.classList.remove('lang-en');
  }

  // 1. Core Text Translations
  for (const key in TRANSLATIONS) {
    const el = document.getElementById(key);
    if (el) {
      if (key === 'print-preview-warning' || key === 'ios-install-step-1' || key === 'ios-install-step-2') {
        el.innerHTML = TRANSLATIONS[key][currentLang];
      } else {
        el.textContent = TRANSLATIONS[key][currentLang];
      }
    }
  }

  // Translate Titles / Tooltips dynamically
  const copyTokenBtn = document.getElementById('copy-token-btn');
  if (copyTokenBtn) {
    copyTokenBtn.setAttribute('title', currentLang === 'ar' ? 'نسخ المعرف' : 'Copy Token ID');
  }
  const voiceRecordBtn = document.getElementById('voice-record-btn');
  if (voiceRecordBtn) {
    voiceRecordBtn.setAttribute('title', currentLang === 'ar' ? 'اضغط للتحدث وسجل ملاحظتك بصوتك' : 'Press to talk and record notes');
  }

  // 2. Input Placeholders
  for (const key in placeholders) {
    const el = document.getElementById(key) as HTMLInputElement | HTMLTextAreaElement | null;
    if (el) {
      el.placeholder = placeholders[key][currentLang];
    }
  }

  // 3. Select Placeholder Options
  const wingSelect = document.getElementById('select-wing') as HTMLSelectElement | null;
  if (wingSelect && wingSelect.options[0]) {
    wingSelect.options[0].textContent = currentLang === 'ar' ? "--- اختر الجناح الطبي ---" : "--- Select Medical Wing ---";
  }
  const bedSelect = document.getElementById('select-bed') as HTMLSelectElement | null;
  if (bedSelect && bedSelect.options[0]) {
    bedSelect.options[0].textContent = currentLang === 'ar' ? "--- اختر السرير / المقيم ---" : "--- Select Bed / Resident ---";
  }
  
  // 4. Role Option Translations in Dropdowns
  const roleSelect = document.getElementById('new-user-role') as HTMLSelectElement | null;
  if (roleSelect) {
    Array.from(roleSelect.options).forEach(opt => {
      if (opt.value === 'عامل') opt.textContent = currentLang === 'ar' ? 'عامل' : 'Worker';
      if (opt.value === 'الطوارئ') opt.textContent = currentLang === 'ar' ? 'الطوارئ' : 'Emergency';
      if (opt.value === 'مراقب') opt.textContent = currentLang === 'ar' ? 'مراقب' : 'Supervisor';
      if (opt.value === 'المالك') opt.textContent = currentLang === 'ar' ? 'المالك' : 'Owner';
    });
  }
  const editRoleSelect = document.getElementById('edit-user-role') as HTMLSelectElement | null;
  if (editRoleSelect) {
    Array.from(editRoleSelect.options).forEach(opt => {
      if (opt.value === 'عامل') opt.textContent = currentLang === 'ar' ? 'عامل' : 'Worker';
      if (opt.value === 'الطوارئ') opt.textContent = currentLang === 'ar' ? 'الطوارئ' : 'Emergency';
      if (opt.value === 'مراقب') opt.textContent = currentLang === 'ar' ? 'مراقب' : 'Supervisor';
      if (opt.value === 'المالك') opt.textContent = currentLang === 'ar' ? 'المالك' : 'Owner';
    });
  }

  const emailServiceType = document.getElementById('email-service-type') as HTMLSelectElement | null;
  if (emailServiceType) {
    Array.from(emailServiceType.options).forEach(opt => {
      if (opt.value === 'gmail') opt.textContent = currentLang === 'ar' ? 'حساب جيميل مخصص (Gmail / Apps Script)' : 'Dedicated Gmail Account (Gmail / Apps Script)';
      if (opt.value === 'resend') opt.textContent = currentLang === 'ar' ? 'بوابة الإرسال السحابي المباشر (Resend API)' : 'Direct Cloud Mail Gateway (Resend API)';
    });
  }

  // 5. Table Headers with data-ar and data-en
  const headers = document.querySelectorAll('#reports-table-header th[data-ar]');
  headers.forEach(h => {
    const text = currentLang === 'ar' ? h.getAttribute('data-ar') : h.getAttribute('data-en');
    if (text) h.textContent = text;
  });

  // 6. Active Session details
  if (currentUser) {
    activeUserName.textContent = currentUser.name;
    activeUserRole.textContent = translateRole(currentUser.role);
  }
}

function initLanguageToggle() {
  const langToggle = document.getElementById('lang-toggle');
  if (langToggle) {
    langToggle.addEventListener('click', () => {
      currentLang = currentLang === 'ar' ? 'en' : 'ar';
      localStorage.setItem('sos_language', currentLang);
      applyLanguage();
      
      // Re-trigger user list subscription to apply localization to roles on lists
      if (currentUser && currentUser.role === 'المالك') {
        listenToUsersList();
      }
    });
  }
  applyLanguage();
}

// ==========================================
// 6. Firestore Real-time Monitoring & Logging
// ==========================================

let isInitialLoad = true;

// Track total device counts registered in Firestore
function listenToDevicesCount() {
  onSnapshot(collection(db, 'device_tokens'), (snapshot) => {
    const total = snapshot.size.toString();
    devicesCountBadge.textContent = total;
    if (monitoringDevicesCount) {
      monitoringDevicesCount.textContent = `${total} جهاز`;
    }
  }, (error) => {
    console.error("Error fetching devices count: ", error.message || String(error));
  });
}

// Track emergency logs from Firestore to display recent alerts in real time
function listenToRecentAlerts() {
  if (unsubscribeRecentAlerts) {
    unsubscribeRecentAlerts();
  }

  const alertsQuery = query(collection(db, 'emergency_calls'), orderBy('timestamp', 'desc'), limit(15));
  
  unsubscribeRecentAlerts = onSnapshot(alertsQuery, (snapshot) => {
    if (snapshot.empty) {
      alertsLog.innerHTML = `
        <div class="text-center text-xs text-slate-400 dark:text-slate-500 py-4">
          ${currentLang === 'ar' ? 'لا توجد نداءات طوارئ نشطة حالياً. التطبيق في حالة استعداد تام.' : 'No active emergency alerts. The system is fully ready.'}
        </div>
      `;
      isInitialLoad = false;
      return;
    }

    alertsLog.innerHTML = '';
    const isOwner = currentUser && currentUser.role === 'المالك';

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      
      // Filter out supervisor-only alerts from non-supervisors (excluding Emergency 'الطوارئ')
      const isSupervisorOnly = data.isSupervisorOnly === true;
      if (isSupervisorOnly) {
        const isSupervisorUser = currentUser && (currentUser.role === 'مراقب' || currentUser.role === 'المالك');
        if (!isSupervisorUser) {
          return; // Skip rendering this alert for regular workers and emergency users
        }
      }

      // Format time string correctly based on language
      const timeStr = data.timestamp 
        ? new Date(data.timestamp.seconds * 1000).toLocaleTimeString(currentLang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
        : (currentLang === 'ar' ? 'الآن' : 'Now');
      const isMine = data.deviceId === deviceId;

      const logItem = document.createElement('div');
      logItem.className = `p-3 rounded-2xl flex flex-col gap-1 transition-all animate-fade-in ${
        isMine 
          ? 'bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300' 
          : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
      }`;

      // Calculate resolution time
      let statusBadgeHtml = '';
      if (data.status === 'resolved') {
        let durationStr = currentLang === 'ar' ? 'أقل من دقيقة' : 'Less than a minute';
        if (data.resolvedAt && data.timestamp) {
          const diffSeconds = Math.max(0, data.resolvedAt.seconds - data.timestamp.seconds);
          if (diffSeconds < 60) {
            durationStr = currentLang === 'ar' ? `${diffSeconds} ثانية` : `${diffSeconds} seconds`;
          } else if (diffSeconds < 3600) {
            const minutes = Math.floor(diffSeconds / 60);
            const seconds = diffSeconds % 60;
            durationStr = currentLang === 'ar' ? `${minutes} دقيقة و ${seconds} ثانية` : `${minutes}m and ${seconds}s`;
          } else {
            const hours = Math.floor(diffSeconds / 3600);
            const minutes = Math.floor((diffSeconds % 3600) / 60);
            durationStr = currentLang === 'ar' ? `${hours} ساعة و ${minutes} دقيقة` : `${hours}h and ${minutes}m`;
          }
        }
        statusBadgeHtml = `<span class="text-[9px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-extrabold px-1.5 py-0.5 rounded-md mt-1 self-start inline-flex items-center gap-1 border border-emerald-500/10">✅ ${currentLang === 'ar' ? 'تم الحل خلال:' : 'Resolved in:'} ${durationStr}</span>`;
      } else if (data.status === 'processing') {
        statusBadgeHtml = `<span class="text-[9px] bg-amber-500/10 text-amber-700 dark:text-amber-400 font-extrabold px-1.5 py-0.5 rounded-md mt-1 self-start inline-flex items-center gap-1 border border-amber-500/10">${currentLang === 'ar' ? '⏳ جاري المعالجة...' : '⏳ Processing...'}</span>`;
      } else {
        statusBadgeHtml = `<span class="text-[9px] bg-red-500/10 text-red-700 dark:text-red-400 font-extrabold px-1.5 py-0.5 rounded-md mt-1 self-start inline-flex items-center gap-1 border border-red-500/10 animate-pulse">${currentLang === 'ar' ? '🚨 نداء استغاثة نشط' : '🚨 Active SOS Call'}</span>`;
      }

      logItem.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-bold text-xs flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full ${data.status === 'resolved' ? 'bg-emerald-500' : data.status === 'processing' ? 'bg-amber-500' : 'bg-rose-500 animate-pulse'}"></span>
            ${isMine 
              ? (currentLang === 'ar' ? '🔴 نداء مرسل منك (جهازك)' : '🔴 SOS Sent by you (Your device)') 
              : (currentLang === 'ar' ? '⚠️ نداء وارد من جهاز آخر' : '⚠️ Incoming from another device')}
          </span>
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] opacity-75 font-mono">${timeStr}</span>
            ${isOwner ? `
              <button class="delete-call-btn text-red-500 hover:text-red-700 p-0.5 transition-all active:scale-95" data-id="${docSnap.id}" title="${currentLang === 'ar' ? 'حذف هذا البلاغ' : 'Delete call record'}">
                🗑️
              </button>
            ` : ''}
          </div>
        </div>
        <p class="text-xs font-semibold leading-relaxed mt-0.5">${data.message || (currentLang === 'ar' ? 'نداء استغاثة عاجل (SOS)!' : 'Urgent SOS Call!')}</p>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mt-1">
          <span class="text-[9px] font-mono opacity-50">${currentLang === 'ar' ? 'الجهاز' : 'Device'}: ${data.deviceId ? data.deviceId.substring(0, 12) : 'unknown'}...</span>
          ${statusBadgeHtml}
        </div>
      `;
      alertsLog.appendChild(logItem);
    });

    // Click listeners are now handled via robust Event Delegation on the static parent alertsLog container for 100% reliability.

    // Detect new additions in real-time to trigger the physical siren/alarm on other devices!
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added' && !isInitialLoad) {
        const data = change.doc.data();
        if (data.deviceId !== deviceId) {
          // Verify that this is indeed a newly created alert (not loaded from cache or previous session)
          const docTime = data.timestamp ? data.timestamp.seconds : 0;
          const nowSeconds = Math.floor(Date.now() / 1000);
          // Only play siren if the alert is extremely fresh (less than 15 seconds old)
          if (nowSeconds - docTime < 15) {
            // Check if supervisor-only and filter (excluding Emergency 'الطوارئ')
            const isSupervisorOnly = data.isSupervisorOnly === true;
            if (isSupervisorOnly) {
              const isSupervisorUser = currentUser && (currentUser.role === 'مراقب' || currentUser.role === 'المالك');
              if (!isSupervisorUser) {
                return; // Do NOT play siren or show foreground alert for regular workers and emergency users!
              }
            }

            // Gating: Only play sound and show alert for Supervisor, Emergency, and Owner roles
            const isAuthorizedRecipient = currentUser && (currentUser.role === 'مراقب' || currentUser.role === 'الطوارئ' || currentUser.role === 'المالك');
            if (isAuthorizedRecipient) {
              // Play tick beep sound
              playTickSound();
              // Let listenToActiveAlerts authoritatively drive the physical siren state!

              // Translate alerts according to selected language
              let alertTitle = '';
              let alertMsg = '';
              if (currentLang === 'en') {
                alertTitle = isSupervisorOnly ? '🔔 New Supervisor Call!' : '🚨 Active Urgent Emergency!';
                alertMsg = isSupervisorOnly ? `${data.message}` : `Device ${data.deviceId ? data.deviceId.substring(0, 12) : 'unknown'} sent a SOS alert! Sirens activated automatically.`;
              } else {
                alertTitle = isSupervisorOnly ? '🔔 طلب استدعاء مشرف جديد!' : '🚨 استغاثة عاجلة نشطة!';
                alertMsg = isSupervisorOnly ? `${data.message}` : 'أرسل أحد الأجهزة نداء استغاثة SOS الآن! تم تفعيل صفارات الإنذار تلقائياً.';
              }

              showForegroundAlert(alertTitle, alertMsg);
            }
          }
        }
      }
    });

    isInitialLoad = false;
  }, (error) => {
    console.error("Error reading alert records: ", error.message || String(error));
  });
}

// ==========================================
// 7. Request Notification Permission & Get Token
// ==========================================

let activeToken: string | null = null;

async function setupNotifications() {
  try {
    // 1. Update initial UI state
    updatePermissionBadge(Notification.permission);

    if (Notification.permission === 'denied') {
      tokenStatus.textContent = 'مرفوض';
      return;
    }

    // 2. Request Permission
    const permission = await Notification.requestPermission();
    updatePermissionBadge(permission);

    if (permission === 'granted') {
      tokenStatus.textContent = 'جاري جلب الـ Token...';
      
      // Register service worker to handle FCM background push messages
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/'
      });
      console.log('Service Worker registered successfully with scope: ', registration.scope);

      // Get FCM Token
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration
      });

      if (token) {
        activeToken = token;
        tokenStatus.textContent = token.substring(0, 16) + '...';
        tokenStatus.title = token;

        // Save token securely in Firestore (De-duplication mapping)
        await setDoc(doc(db, 'device_tokens', deviceId), {
          token: token,
          updatedAt: serverTimestamp(),
          platform: 'web',
          deviceId: deviceId
        });

        console.log('Token generated and saved to Firestore for device ID: ', deviceId);
      } else {
        tokenStatus.textContent = currentLang === 'ar' ? 'فشل جلب الـ Token' : 'FCM Token failed';
        console.warn('No registration token available. Request permission to generate one.');
      }
    } else {
      tokenStatus.textContent = currentLang === 'ar' ? 'غير مرخص' : 'Unauthorized';
    }
  } catch (error: any) {
    console.error('An error occurred while retrieving token: ', error.message || String(error));
    tokenStatus.textContent = currentLang === 'ar' ? 'خطأ في التهيئة' : 'Initialization Error';
  }
}

function updatePermissionBadge(permission: NotificationPermission) {
  permissionBadge.className = 'px-2.5 py-1 text-xs font-bold rounded-lg';
  
  if (permission === 'granted') {
    permissionBadge.textContent = currentLang === 'ar' ? 'مقبول' : 'Granted';
    permissionBadge.classList.add('bg-emerald-500/10', 'text-emerald-600', 'dark:text-emerald-400');
  } else if (permission === 'denied') {
    permissionBadge.textContent = currentLang === 'ar' ? 'مرفوض' : 'Denied';
    permissionBadge.classList.add('bg-rose-500/10', 'text-rose-600', 'dark:text-rose-400');
  } else {
    permissionBadge.textContent = currentLang === 'ar' ? 'غير محدّد' : 'N/A';
    permissionBadge.classList.add('bg-amber-500/10', 'text-amber-600', 'dark:text-amber-400');
  }
}

// Copy Token Helper
copyTokenBtn.addEventListener('click', () => {
  if (activeToken) {
    navigator.clipboard.writeText(activeToken).then(() => {
      const originalText = tokenStatus.textContent;
      tokenStatus.textContent = currentLang === 'ar' ? 'تم النسخ بنجاح!' : 'Copied successfully!';
      setTimeout(() => {
        tokenStatus.textContent = originalText;
      }, 1500);
    });
  } else {
    alert(currentLang === 'ar' ? 'الـ Token غير متوفر حالياً لتسهيل النسخ.' : 'Token is not available yet for copying.');
  }
});

// ==========================================
// 8. Foreground Notification Listener (onMessage)
// ==========================================

onMessage(messaging, (payload) => {
  console.log('Message received in foreground: ', { title: payload.notification?.title, body: payload.notification?.body });
  
  // 1. Play Warning Sound
  playTickSound();
  
  // 2. Trigger standard browser notification
  const title = payload.notification?.title || '⚠️ نداء طوارئ SOS!';
  const body = payload.notification?.body || 'تم إرسال نداء طوارئ عاجل.';
  
  if (Notification.permission === 'granted') {
    new Notification(title, {
      body: body,
      icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png'
    });
  }

  // 3. Custom Alert UI Box
  showForegroundAlert(title, body);
});

function showForegroundAlert(title: string, body: string) {
  const alertBox = document.createElement('div');
  alertBox.className = 'fixed top-4 left-4 right-4 md:left-auto md:w-80 bg-red-600 text-white p-4 rounded-3xl shadow-2xl z-50 transition-all transform duration-300 translate-y-[-20px] opacity-0 flex items-start gap-3 border border-red-400/40 animate-fade-in';
  
  alertBox.innerHTML = `
    <div class="p-1.5 bg-white/20 rounded-xl shrink-0">
      <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
    </div>
    <div class="flex-1">
      <h4 class="font-bold text-sm text-white">${title}</h4>
      <p class="text-xs text-white/90 mt-0.5">${body}</p>
    </div>
    <button class="p-1 text-white/75 hover:text-white" onclick="this.parentElement.remove()">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
    </button>
  `;

  document.body.appendChild(alertBox);
  setTimeout(() => {
    alertBox.classList.remove('opacity-0', 'translate-y-[-20px]');
  }, 10);

  // Auto-remove after 8 seconds
  setTimeout(() => {
    alertBox.remove();
  }, 8000);
}

// ==========================================
// 9. SOS Countdown & Dispatch System
// ==========================================

let countdownTimer: any = null;
let isCountingDown = false;
let countdownVal = 3;
let isAlarmPlaying = false;
const locallyMutedAlerts = new Set<string>();

// Trigger Tick Sound
function playTickSound() {
  audioTick.volume = 1.0;
  audioTick.currentTime = 0;
  audioTick.play().catch(e => console.log('Audio playback block: ', e));
}

// Stop Countdown
function resetCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  isCountingDown = false;
  countdownOverlay.classList.add('hidden');
  countdownOverlay.classList.remove('flex');
  countdownOverlay.classList.add('opacity-0');
  
  sosHintText.classList.remove('hidden');
  countdownHint.classList.add('hidden');
  sosButton.disabled = false;
}

// Handle Click/Hold on SOS
sosButton.addEventListener('click', (e) => {
  e.stopPropagation();
  
  if (isAlarmPlaying) {
    // If the alarm is currently active, clicking again turns it off
    stopSiren();
    return;
  }

  if (isCountingDown) {
    // If already counting down, clicking anywhere cancels it
    resetCountdown();
    return;
  }

  startCountdown();
});

// Click anywhere on the body to cancel countdown (except on or inside the SOS button itself)
document.body.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (isCountingDown && target && !sosButton.contains(target)) {
    resetCountdown();
  }
});

if (supervisorButton) {
  supervisorButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    const confirmed = await customConfirm(
      currentLang === 'ar'
        ? `هل أنت متأكد من رغبتك في إرسال طلب استدعاء مشرف عاجل؟ سيتم إرساله باسمك كعامل إلى شاشة المراقبة فقط دون إزعاج زملائك العمال.`
        : `Are you sure you want to send an urgent supervisor request? It will be sent in your name to the monitor screen only without disturbing other staff members.`,
      currentLang === 'ar' ? "تأكيد استدعاء المشرف" : "Confirm Supervisor Request",
      currentLang === 'ar' ? "إرسال نداء للمشرف" : "Send Request",
      "👤",
      "bg-indigo-600 hover:bg-indigo-700",
      "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
    );
    if (confirmed) {
      await triggerSupervisorCall();
    }
  });
}

function startCountdown() {
  isCountingDown = true;
  countdownVal = 3;
  countdownNumber.textContent = countdownVal.toString();
  
  countdownOverlay.classList.remove('hidden');
  countdownOverlay.classList.add('flex');
  setTimeout(() => {
    countdownOverlay.classList.remove('opacity-0');
  }, 10);

  sosHintText.classList.add('hidden');
  countdownHint.classList.remove('hidden');

  playTickSound();

  countdownTimer = setInterval(() => {
    countdownVal--;
    if (countdownVal <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      triggerSOS();
    } else {
      countdownNumber.textContent = countdownVal.toString();
      playTickSound();
    }
  }, 1000);
}

// Main SOS Trigger Execution
async function triggerSOS() {
  resetCountdown();
  
  // 1. Play Alarm Sirens (Removed as the initiator does not hear the siren on their own device)

  const callerNotesInput = document.getElementById('sos-caller-notes') as HTMLInputElement | null;
  const notesVal = callerNotesInput ? callerNotesInput.value.trim() : '';

  // 2. Register emergency call document in Firestore (Emergency history)
  try {
    const coords = await getCurrentCoordinates();
    
    const payload: any = {
      deviceId: deviceId,
      timestamp: serverTimestamp(),
      status: 'active',
      senderName: currentUser ? currentUser.name : 'مستخدم غير معروف',
      notes: notesVal || 'لا توجد ملاحظات إضافية'
    };

    const finalCoords = coords || getFallbackCoordinates(deviceId);
    payload.lat = finalCoords.lat;
    payload.lng = finalCoords.lng;
    
    // Update location document status to SOS in real-time
    const locPayload: any = {
      status: 'sos',
      lat: finalCoords.lat,
      lng: finalCoords.lng,
      updatedAt: serverTimestamp()
    };
    if (currentUser) {
      locPayload.deviceId = deviceId;
      locPayload.token = activeToken || '';
      locPayload.username = currentUser.username;
      locPayload.name = currentUser.name;
      locPayload.role = currentUser.role;
    }
    await setDoc(doc(db, 'user_locations', deviceId), locPayload, { merge: true });

    if (selectedWing && selectedBed) {
      payload.wingId = selectedWing.id;
      payload.wingName = selectedWing.name;
      payload.bedId = selectedBed.bedId;
      payload.residentName = selectedBed.residentName;
      payload.message = `🚨 استغاثة عاجلة في ${selectedWing.name} - ${selectedBed.bedId} للمقيم: ${selectedBed.residentName}! يرجى التوجه الفوري.`;
    } else {
      payload.wingId = 'general';
      payload.wingName = 'نداء عام';
      payload.message = '🚨 نداء استغاثة فوري عاجل! يرجى المساعدة والتحقق من كامل المركز (نداء عام).';
    }

    const emergencyRef = doc(collection(db, 'emergency_calls'));
    await setDoc(emergencyRef, payload);
    console.log('Emergency broadcast recorded in database with custom details.');

    // Clear notes input field on success
    if (callerNotesInput) {
      callerNotesInput.value = '';
    }
  } catch (error: any) {
    console.error('Failed to log emergency record: ', error.message || String(error));
  }

  // 3. Fetch all device tokens from Firestore and call Cloudflare worker simulation
  try {
    const tokenSnapshots = await getDocs(collection(db, 'device_tokens'));
    const tokens: string[] = [];
    tokenSnapshots.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.token) {
        tokens.push(data.token);
      }
    });

    console.log(`Retrieved ${tokens.length} device token(s) to notify.`);

    // Dispatch Push notifications via Cloudflare Worker
    await sendPushNotificationRequest(tokens);

  } catch (error: any) {
    console.error('Error fetching device tokens for dispatch: ', error.message || String(error));
  }
}

// Supervisor-Only Notification Trigger Execution
async function triggerSupervisorCall() {
  // 1. Play a quick pleasant tick sound locally to confirm sending
  playTickSound();

  const callerNotesInput = document.getElementById('sos-caller-notes') as HTMLInputElement | null;
  const notesVal = callerNotesInput ? callerNotesInput.value.trim() : '';

  // 2. Register supervisor call document in Firestore (isSupervisorOnly is true)
  try {
    const payload: any = {
      deviceId: deviceId,
      timestamp: serverTimestamp(),
      status: 'active',
      senderName: currentUser ? currentUser.name : (currentLang === 'ar' ? 'عامل غير معروف' : 'Unknown staff'),
      isSupervisorOnly: true,
      notes: notesVal || (currentLang === 'ar' ? 'طلب استدعاء مشرف فوري' : 'Urgent supervisor request')
    };

    if (selectedWing && selectedBed) {
      payload.wingId = selectedWing.id;
      payload.wingName = selectedWing.name;
      payload.bedId = selectedBed.bedId;
      payload.residentName = selectedBed.residentName;
      payload.message = currentLang === 'ar'
        ? `👤 طلب حضور مشرف من قِبل العامل: ${currentUser ? currentUser.name : 'عامل'} | في ${selectedWing.name} - ${selectedBed.bedId} (للمقيم: ${selectedBed.residentName}).`
        : `👤 Supervisor request by staff: ${currentUser ? currentUser.name : 'Staff'} | in ${selectedWing.name} - ${selectedBed.bedId} (for resident: ${selectedBed.residentName}).`;
    } else {
      payload.wingId = 'general';
      payload.wingName = currentLang === 'ar' ? 'نداء عام' : 'General Broadcast';
      payload.message = currentLang === 'ar'
        ? `👤 طلب حضور مشرف من قِبل العامل: ${currentUser ? currentUser.name : 'عامل'} (نداء عام).`
        : `👤 Supervisor request by staff: ${currentUser ? currentUser.name : 'Staff'} (General Broadcast).`;
    }

    const emergencyRef = doc(collection(db, 'emergency_calls'));
    await setDoc(emergencyRef, payload);
    console.log('Supervisor-only call logged in database.');

    // Clear notes input field on success
    if (callerNotesInput) {
      callerNotesInput.value = '';
    }

    alert(
      currentLang === 'ar'
        ? `✅ تم إرسال طلب استدعاء المشرف بنجاح إلى شاشة المراقبين فقط!`
        : `✅ Supervisor request sent successfully to the monitors screen only!`
    );

  } catch (error: any) {
    console.error('Failed to log supervisor call: ', error.message || String(error));
    alert(
      currentLang === 'ar'
        ? `⚠️ عذراً، فشل إرسال نداء المشرف: ${error.message || String(error)}`
        : `⚠️ Sorry, failed to send supervisor request: ${error.message || String(error)}`
    );
  }
}

// Send request to Cloudflare Worker to send Push Notifications to devices
async function sendPushNotificationRequest(tokens: string[]) {
  // Use a pseudo-mock workers link as specified by the user
  const workerUrl = 'https://sos-sender.tmrbe2006.workers.dev/';
  
  const payload = {
    title: '🚨 نداء استغاثة عاجل (SOS)!',
    body: `تم إرسال استغاثة طوارئ من جهاز ${deviceId.substring(0, 8)}... يرجى التحرك فورا!`,
    tokens: tokens,
    telegram: emergencySettings.telegram.enable ? {
      botToken: emergencySettings.telegram.botToken,
      chatId: emergencySettings.telegram.chatId
    } : null,
    whatsapp: emergencySettings.whatsapp.enable ? {
      instanceId: emergencySettings.whatsapp.instanceId,
      token: emergencySettings.whatsapp.token,
      recipients: emergencySettings.whatsapp.recipients.split(',').map(n => n.trim()).filter(Boolean)
    } : null,
    email: emergencySettings.email.enable ? {
      serviceType: emergencySettings.email.serviceType,
      apiKey: emergencySettings.email.apiKey,
      sender: emergencySettings.email.sender,
      recipients: emergencySettings.email.recipients.split(',').map(n => n.trim()).filter(Boolean)
    } : null
  };

  console.log(`[Cloudflare Worker Fetch] Sending payload to ${workerUrl}:`, payload);

  try {
    // Perform fetch request. In production, connect this endpoint to your Cloudflare FCM script.
    // We add a try-catch so it won't crash if the mock worker is unreachable.
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log('Push notification broadcast requests sent successfully to CF Worker!');
    } else {
      console.warn('CF Worker returned a non-ok response: ', response.status);
    }
  } catch (error) {
    // This is expected during mockup testing. Show a clean debug message.
    console.log('%c[محاكاة Cloudflare Worker]', 'color: #ef4444; font-weight: bold;', 
      '\nتم محاكاة إرسال الطلب بنجاح!' +
      '\nلتفعيل الإرسال الحقيقي، قم بربط كود خادم Cloudflare Worker مع FCM Admin SDK واستخدم الـ Tokens المذكورة أعلاه.'
    );
  }
}

function startSiren() {
  isAlarmPlaying = true;
  audioAlarm.volume = 1.0;
  audioAlarm.currentTime = 0;
  audioAlarm.play().catch(e => console.log('Audio Siren Blocked: ', e));

  // --- Web Audio API High-Intensity Dual Siren ---
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      if (!audioCtx) {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      // 1. Create a Master Gain node to boost the volume to max
      synthGainNode = audioCtx.createGain();
      // Double gain boost (0.8 is extremely loud when combined with oscillators)
      synthGainNode.gain.setValueAtTime(0.8, audioCtx.currentTime);
      synthGainNode.connect(audioCtx.destination);

      // 2. Create Oscillator 1 - Sawtooth wave (extremely piercing and sharp)
      synthOscillator1 = audioCtx.createOscillator();
      synthOscillator1.type = 'sawtooth';
      synthOscillator1.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch (A5 note)
      synthOscillator1.connect(synthGainNode);

      // 3. Create Oscillator 2 - Square wave (buzzing, rich harmonics, high volume)
      synthOscillator2 = audioCtx.createOscillator();
      synthOscillator2.type = 'square';
      synthOscillator2.frequency.setValueAtTime(932, audioCtx.currentTime); // High pitch (A#5 note)
      synthOscillator2.connect(synthGainNode);

      // 4. Start both oscillators
      synthOscillator1.start();
      synthOscillator2.start();

      // 5. Dynamic Frequency Modulation (Pitch sweeping sliding effect - Warble sound)
      // This slides the pitch up and down between 800Hz and 1300Hz every 150ms for a loud vehicle/siren sweep!
      let direction = 1;
      let freqBase = 880;
      synthInterval = setInterval(() => {
        if (!audioCtx || !synthOscillator1 || !synthOscillator2) return;
        freqBase += direction * 80;
        if (freqBase > 1300) {
          direction = -1;
        } else if (freqBase < 800) {
          direction = 1;
        }
        synthOscillator1.frequency.linearRampToValueAtTime(freqBase, audioCtx.currentTime + 0.1);
        synthOscillator2.frequency.linearRampToValueAtTime(freqBase + 52, audioCtx.currentTime + 0.1);
      }, 150);

    }
  } catch (error) {
    console.error('Failed to initiate high-intensity synth siren:', error);
  }

  sosButton.classList.remove('from-red-500', 'to-rose-700');
  sosButton.classList.add('from-amber-500', 'to-yellow-600', 'animate-pulse');
  sosButton.querySelector('span:nth-child(1)')!.textContent = currentLang === 'ar' ? 'إيقاف' : 'STOP';
  sosButton.querySelector('span:nth-child(2)')!.textContent = currentLang === 'ar' ? 'اضغط لإلغاء الإنذار' : 'Press to cancel alarm';
}

function stopSiren() {
  isAlarmPlaying = false;
  
  // Force browser to stop and reset HTML5 audio completely
  try {
    audioAlarm.pause();
    audioAlarm.currentTime = 0;
    audioAlarm.volume = 0;
    const oldSrc = audioAlarm.src;
    audioAlarm.src = ''; // Force break of buffering audio thread
    audioAlarm.load();
    audioAlarm.src = oldSrc; // Re-assign for future triggers
  } catch (e) {
    console.error('Failed to force stop HTML5 audio:', e);
  }

  // --- Stop and Cleanup Web Audio API Synth Siren ---
  if (synthInterval) {
    clearInterval(synthInterval);
    synthInterval = null;
  }
  try {
    if (synthOscillator1) {
      synthOscillator1.stop();
      synthOscillator1.disconnect();
      synthOscillator1 = null;
    }
    if (synthOscillator2) {
      synthOscillator2.stop();
      synthOscillator2.disconnect();
      synthOscillator2 = null;
    }
    if (synthGainNode) {
      synthGainNode.disconnect();
      synthGainNode = null;
    }
    if (audioCtx) {
      if (audioCtx.state !== 'suspended') {
        audioCtx.suspend();
      }
    }
  } catch (error) {
    console.error('Error stopping synth siren:', error);
  }

  sosButton.classList.remove('from-amber-500', 'to-yellow-600', 'animate-pulse');
  sosButton.classList.add('from-red-500', 'to-rose-700');
  sosButton.querySelector('span:nth-child(1)')!.textContent = 'SOS';
  sosButton.querySelector('span:nth-child(2)')!.textContent = currentLang === 'ar' ? 'إرسال استغاثة' : 'Send Emergency';
}

// ==========================================
// 10. Simulation & Test Tools
// ==========================================

// Manual alarm check
triggerAlarmBtn.addEventListener('click', () => {
  if (isAlarmPlaying) {
    stopSiren();
    triggerAlarmBtn.textContent = currentLang === 'ar' ? '🔊 تجربة صفارة الإنذار' : '🔊 Test Siren';
  } else {
    startSiren();
    triggerAlarmBtn.textContent = currentLang === 'ar' ? '🔇 إيقاف تجربة الصفارة' : '🔇 Mute Test Siren';
  }
});

// Foreground simulated broadcast
simForegroundBtn.addEventListener('click', () => {
  playTickSound();
  showForegroundAlert(
    '⚠️ نداء تجريبي محاكي',
    'هذه محاكاة لإشعار استغاثة في المقدمة لتجربة ظهور الرسالة الفورية.'
  );
  
  // Add temporary log locally
  const logItem = document.createElement('div');
  logItem.className = 'p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 p-3 rounded-2xl flex flex-col gap-1 transition-all animate-fade-in';
  logItem.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="font-bold text-xs text-amber-500 flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
        🛠️ نداء تجريبي محاكي
      </span>
      <span class="text-[10px] opacity-75 font-mono">الآن</span>
    </div>
    <p class="text-xs font-semibold mt-0.5">نداء استغاثة محاكي للتجربة والتحقق.</p>
  `;
  
  if (alertsLog.querySelector('.text-slate-400')) {
    alertsLog.innerHTML = '';
  }
  alertsLog.insertBefore(logItem, alertsLog.firstChild);
});

// Clear database emergency calls log
clearLogsBtn.addEventListener('click', async () => {
  const confirmed = await customConfirm(
    currentLang === 'ar'
      ? "⚠️ هل أنت متأكد من رغبتك في مسح الأرشيف بالكامل وحذف جميع البلاغات نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذه العملية!"
      : "⚠️ Are you sure you want to clear the entire archive and delete all alerts permanently from the database? This action cannot be undone!"
  );
  if (confirmed) {
    try {
      const callsCol = collection(db, 'emergency_calls');
      const snapshot = await getDocs(callsCol);
      if (snapshot.empty) {
        alert(
          currentLang === 'ar'
            ? 'ℹ️ لا توجد نداءات طوارئ لحذفها من قاعدة البيانات.'
            : 'ℹ️ No emergency alerts found in the database to delete.'
        );
        return;
      }

      let deletedCount = 0;
      for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, 'emergency_calls', docSnap.id));
        deletedCount++;
      }

      // Empty the JavaScript array that holds the archive data immediately
      allRowsResolvedCache = [];
      
      // Immediately empty and re-render the archive and resolved dashboards to show "Archive is empty" state
      alertsLog.innerHTML = `
        <div class="text-center text-xs text-slate-400 dark:text-slate-500 py-4">
          ⚠️ ${currentLang === 'ar' ? 'الأرشيف فارغ (لا توجد نداءات طوارئ حالياً).' : 'Archive is empty (no emergency calls at this time).'}
        </div>
      `;
      
      const reportsTableBody = document.getElementById('report-table-body');
      if (reportsTableBody) {
        reportsTableBody.innerHTML = `
          <tr>
            <td colspan="6" class="p-6 text-center text-slate-400 dark:text-slate-500 font-medium">⚠️ ${currentLang === 'ar' ? 'الأرشيف فارغ تماماً.' : 'Archive is completely empty.'}</td>
          </tr>
        `;
      }
      
      const printTableBody = document.getElementById('print-table-body');
      if (printTableBody) {
        printTableBody.innerHTML = `
          <tr>
            <td colspan="6" style="padding: 10px; text-align: center; color: #94a3b8;">⚠️ ${currentLang === 'ar' ? 'الأرشيف فارغ تماماً.' : 'Archive is completely empty.'}</td>
          </tr>
        `;
      }
      
      // Reset dashboard stats counters
      const avgResponseTimeKpi = document.getElementById('avg-response-time-kpi');
      const resolvedCallsCountKpi = document.getElementById('resolved-calls-count-kpi');
      const excellentRateKpi = document.getElementById('excellent-rate-kpi');
      const excellentBar = document.getElementById('excellent-bar');
      if (avgResponseTimeKpi) avgResponseTimeKpi.textContent = '-';
      if (resolvedCallsCountKpi) resolvedCallsCountKpi.textContent = '0';
      if (excellentRateKpi) excellentRateKpi.textContent = '0%';
      if (excellentBar) excellentBar.style.width = '0%';
      
      alert(
        currentLang === 'ar'
          ? `✅ تم مسح سجل الطوارئ من قاعدة البيانات بنجاح! تم حذف ${deletedCount} بلاغ.`
          : `✅ Emergency log cleared from database successfully! Deleted ${deletedCount} alerts.`
      );
    } catch (err: any) {
      console.error('Error clearing database logs:', err);
      alert(
        (currentLang === 'ar'
          ? 'عذراً، فشل مسح السجل من قاعدة البيانات: '
          : 'Sorry, failed to clear the log from database: ') + (err.message || String(err))
      );
    }
  }
});

// ==========================================
// 10.5. Emergency Channels Settings Management
// ==========================================

let emergencySettings = {
  telegram: {
    enable: false,
    botToken: '',
    chatId: ''
  },
  whatsapp: {
    enable: false,
    instanceId: '',
    token: '',
    recipients: ''
  },
  email: {
    enable: false,
    serviceType: 'gmail', // 'gmail' or 'resend'
    apiKey: '', // maps to script url for apps script
    sender: '', // only needed for resend if custom sender is used
    recipients: ''
  }
};

function initSOSSettings() {
  // Toggle Collapsible Settings Panel
  toggleSettingsBtn.addEventListener('click', () => {
    const isHidden = settingsPanelContainer.classList.toggle('hidden');
    if (isHidden) {
      settingsChevron.classList.remove('rotate-180');
    } else {
      settingsChevron.classList.add('rotate-180');
    }
  });

  // Dynamic UI updating depending on Email Service Type
  emailServiceType.addEventListener('change', () => {
    updateEmailUIFields();
  });

  // Save Settings to Firestore
  saveSettingsBtn.addEventListener('click', saveEmergencySettings);
}

function updateEmailUIFields() {
  const service = emailServiceType.value;
  if (service === 'gmail') {
    emailCredentialLabel.textContent = 'رابط تطبيق ويب جوجل (Apps Script Web App URL):';
    emailApiKey.placeholder = 'مثال: https://script.google.com/macros/s/...';
    emailSenderContainer.classList.add('hidden');
    emailHintText.innerHTML = 'ملاحظة: تتيح لك طريقة جوجل الإرسال من بريدك الشخصي مباشرة بدون أي تكلفة أو قيود معقدة!';
  } else {
    emailCredentialLabel.textContent = 'Resend API Key (مفتاح Resend):';
    emailApiKey.placeholder = 'مثال: re_123456789...';
    emailSenderContainer.classList.remove('hidden');
    emailHintText.innerHTML = 'ملاحظة: يتطلب هذا الخيار ربط اسم نطاق خاص (Domain) في موقع resend.com لإرسال البريد.';
  }
}

async function loadEmergencySettings() {
  try {
    const docRef = doc(db, 'settings', 'emergency_channels');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.telegram) {
        emergencySettings.telegram = data.telegram;
        telegramEnable.checked = data.telegram.enable || false;
        telegramBotToken.value = data.telegram.botToken || '';
        telegramChatId.value = data.telegram.chatId || '';
      }
      if (data.whatsapp) {
        emergencySettings.whatsapp = data.whatsapp;
        whatsappEnable.checked = data.whatsapp.enable || false;
        whatsappInstanceId.value = data.whatsapp.instanceId || '';
        whatsappToken.value = data.whatsapp.token || '';
        whatsappRecipients.value = data.whatsapp.recipients || '';
      }
      if (data.email) {
        emergencySettings.email = {
          enable: data.email.enable || false,
          serviceType: data.email.serviceType || 'gmail',
          apiKey: data.email.apiKey || '',
          sender: data.email.sender || '',
          recipients: data.email.recipients || ''
        };
        emailEnable.checked = data.email.enable || false;
        emailServiceType.value = data.email.serviceType || 'gmail';
        emailApiKey.value = data.email.apiKey || '';
        emailSender.value = data.email.sender || '';
        emailRecipients.value = data.email.recipients || '';
        updateEmailUIFields();
      }
      console.log('Emergency channels settings loaded successfully.');
    }
  } catch (error: any) {
    console.error('Error loading emergency settings: ', error.message || String(error));
  }
}

async function saveEmergencySettings() {
  try {
    saveSettingsBtn.disabled = true;
    const originalText = saveSettingsBtn.textContent;
    saveSettingsBtn.textContent = '⏳ جاري الحفظ وتحديث التفعيل...';

    const settingsData = {
      telegram: {
        enable: telegramEnable.checked,
        botToken: telegramBotToken.value.trim(),
        chatId: telegramChatId.value.trim()
      },
      whatsapp: {
        enable: whatsappEnable.checked,
        instanceId: whatsappInstanceId.value.trim(),
        token: whatsappToken.value.trim(),
        recipients: whatsappRecipients.value.trim()
      },
      email: {
        enable: emailEnable.checked,
        serviceType: emailServiceType.value,
        apiKey: emailApiKey.value.trim(),
        sender: emailSender.value.trim(),
        recipients: emailRecipients.value.trim()
      }
    };

    const docRef = doc(db, 'settings', 'emergency_channels');
    await setDoc(docRef, settingsData);

    // Update state in memory
    emergencySettings = settingsData;

    saveSettingsBtn.textContent = '✅ تم الحفظ وتفعيل القنوات!';
    saveSettingsBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
    saveSettingsBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');

    setTimeout(() => {
      saveSettingsBtn.disabled = false;
      saveSettingsBtn.textContent = originalText;
      saveSettingsBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
      saveSettingsBtn.classList.add('bg-red-600', 'hover:bg-red-700');
    }, 2500);

  } catch (error: any) {
    saveSettingsBtn.disabled = false;
    saveSettingsBtn.textContent = '❌ فشل حفظ الإعدادات';
    console.error('Error saving emergency settings: ', error.message || String(error));
  }
}

// ==========================================
// 10.5 Secure Session & Authentication Management
// ==========================================

interface AppUser {
  username: string;
  role: 'عامل' | 'الطوارئ' | 'مراقب' | 'المالك';
  name: string;
}

let currentUser: AppUser | null = null;

const loginOverlay = document.getElementById('login-overlay') as HTMLElement;
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const loginUsernameInput = document.getElementById('login-username') as HTMLInputElement;
const loginPasswordInput = document.getElementById('login-password') as HTMLInputElement;
const loginErrorAlert = document.getElementById('login-error') as HTMLElement;

const userStatusBanner = document.getElementById('user-status-banner') as HTMLElement;
const activeUserName = document.getElementById('active-user-name') as HTMLElement;
const activeUserRole = document.getElementById('active-user-role') as HTMLElement;
const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;
const switchTvBtn = document.getElementById('switch-tv-btn') as HTMLButtonElement | null;

const connectionStatusSection = document.getElementById('connection-status-section') as HTMLElement;
const sosChannelsSettingsSection = document.getElementById('sos-channels-settings-section') as HTMLElement;
const userManagementSection = document.getElementById('user-management-section') as HTMLElement;
const activeAlertsDashboard = document.getElementById('active-alerts-dashboard') as HTMLElement;
const activeAlertsContainer = document.getElementById('active-alerts-container') as HTMLElement;
const activeAlertsCount = document.getElementById('active-alerts-count') as HTMLElement;

const mainContainer = document.getElementById('main-container') as HTMLElement;
const workerPanel = document.getElementById('worker-panel') as HTMLElement;
const monitorPanel = document.getElementById('monitor-panel') as HTMLElement;

const systemStatusIndicator = document.getElementById('system-status-indicator') as HTMLElement;
const systemStatusText = document.getElementById('system-status-text') as HTMLElement;
const activeCasesIndicator = document.getElementById('active-cases-indicator') as HTMLElement;
const monitoringActiveCount = document.getElementById('monitoring-active-count') as HTMLElement;
const monitoringDevicesCount = document.getElementById('monitoring-devices-count') as HTMLElement;

// Wing, Bed & Resident SOS selectors
const sosWingSelect = document.getElementById('sos-wing-select') as HTMLSelectElement;
const sosBedSelect = document.getElementById('sos-bed-select') as HTMLSelectElement;
const selectedResidentBio = document.getElementById('selected-resident-bio') as HTMLElement;
const selectedResidentName = document.getElementById('selected-resident-name') as HTMLElement;

// User Management form and list selectors
const addUserForm = document.getElementById('add-user-form') as HTMLFormElement;
const newUserName = document.getElementById('new-user-name') as HTMLInputElement;
const newUserUsername = document.getElementById('new-user-username') as HTMLInputElement;
const newUserPassword = document.getElementById('new-user-password') as HTMLInputElement;
const newUserRole = document.getElementById('new-user-role') as HTMLSelectElement;
const usersListContainer = document.getElementById('users-list-container') as HTMLElement;

// Wing & Bed management selectors
const wingManagementSection = document.getElementById('wing-management-section') as HTMLElement;
const addWingForm = document.getElementById('add-wing-form') as HTMLFormElement;
const newWingName = document.getElementById('new-wing-name') as HTMLInputElement;
const addBedForm = document.getElementById('add-bed-form') as HTMLFormElement;
const bedWingSelect = document.getElementById('bed-wing-select') as HTMLSelectElement;
const newBedId = document.getElementById('new-bed-id') as HTMLInputElement;
const newResidentName = document.getElementById('new-resident-name') as HTMLInputElement;
const wingsRegistryContainer = document.getElementById('wings-registry-container') as HTMLElement;

// Edit Modal selectors
const editOverlay = document.getElementById('edit-overlay') as HTMLElement;
const editModalTitle = document.getElementById('edit-modal-title') as HTMLElement;
const editModalForm = document.getElementById('edit-modal-form') as HTMLFormElement;
const editType = document.getElementById('edit-type') as HTMLInputElement;
const editTargetId = document.getElementById('edit-target-id') as HTMLInputElement;
const editSubIndex = document.getElementById('edit-sub-index') as HTMLInputElement;

const editUserFields = document.getElementById('edit-user-fields') as HTMLElement;
const editUserNameInput = document.getElementById('edit-user-name') as HTMLInputElement;
const editUserUsernameInput = document.getElementById('edit-user-username') as HTMLInputElement;
const editUserPasswordInput = document.getElementById('edit-user-password') as HTMLInputElement;
const editUserRoleInput = document.getElementById('edit-user-role') as HTMLSelectElement;

const editWingFields = document.getElementById('edit-wing-fields') as HTMLElement;
const editWingNameInput = document.getElementById('edit-wing-name') as HTMLInputElement;

const editBedFields = document.getElementById('edit-bed-fields') as HTMLElement;
const editBedIdInput = document.getElementById('edit-bed-id') as HTMLInputElement;
const editBedResidentInput = document.getElementById('edit-bed-resident') as HTMLInputElement;

const closeEditModalBtn = document.getElementById('close-edit-modal') as HTMLButtonElement;

// Custom Confirmation dialog helper to bypass sandboxed iframe restrictions
function customConfirm(
  message: string, 
  title: string = "تأكيد الإجراء", 
  confirmText: string = "تأكيد الحذف", 
  icon: string = "⚠️", 
  buttonColorClass: string = "bg-red-600 hover:bg-red-700",
  iconColorClass: string = "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400"
): Promise<boolean> {
  return new Promise((resolve) => {
    const confirmOverlay = document.getElementById('confirm-modal-overlay') as HTMLElement;
    const confirmMessage = document.getElementById('confirm-modal-message') as HTMLElement;
    const cancelBtn = document.getElementById('confirm-modal-cancel-btn') as HTMLButtonElement;
    const confirmBtn = document.getElementById('confirm-modal-confirm-btn') as HTMLButtonElement;
    const confirmTitle = document.getElementById('confirm-modal-title') as HTMLElement;
    const confirmIcon = document.getElementById('confirm-modal-icon') as HTMLElement;

    if (!confirmOverlay || !confirmMessage || !cancelBtn || !confirmBtn) {
      // Fallback if elements are missing
      resolve(confirm(message));
      return;
    }

    // Set custom texts and attributes
    confirmMessage.textContent = message;
    if (confirmTitle) confirmTitle.textContent = title;
    if (confirmIcon) {
      confirmIcon.textContent = icon;
      // Reset classes on the icon container
      confirmIcon.className = `w-12 h-12 rounded-full flex items-center justify-center text-xl mx-auto mb-4 ${iconColorClass}`;
    }

    // Set confirm button style and text
    confirmBtn.textContent = confirmText;
    confirmBtn.className = `py-2 text-white font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95 ${buttonColorClass}`;

    confirmOverlay.classList.remove('hidden');

    const cleanUp = () => {
      confirmOverlay.classList.add('hidden');
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
    };

    const onCancel = () => {
      cleanUp();
      resolve(false);
    };

    const onConfirm = () => {
      cleanUp();
      resolve(true);
    };

    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
  });
}

// Independent popup print function that opens a clean window without buttons and automatically triggers window.print()
function openPrintWindow(htmlContent: string, title: string) {
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>${title}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap');
            body {
              font-family: 'Tajawal', system-ui, -apple-system, sans-serif;
              background-color: #ffffff;
              color: #000000;
              margin: 0;
              padding: 40px;
              direction: rtl;
              text-align: right;
            }
            .container {
              max-width: 21cm;
              margin: 0 auto;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
              font-size: 11px;
            }
            th, td {
              border: 1px solid #cbd5e1;
              padding: 10px;
              text-align: right;
            }
            th {
              background-color: #f8fafc;
              font-weight: 700;
            }
            @media print {
              body {
                padding: 0;
              }
              .no-print {
                display: none !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            ${htmlContent}
          </div>
          <script>
            window.addEventListener('load', () => {
              setTimeout(() => {
                window.print();
              }, 600);
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  } else {
    alert(
      currentLang === 'ar'
        ? '⚠️ عذراً، قام المتصفح بمنع فتح الصفحة المنبثقة للمعاينة والطباعة. يرجى تفعيل السماح بالنوافذ المنبثقة (Popups) لهذا الموقع من شريط العنوان وتكرار المحاولة لفتح المعاينة المستقلة.'
        : '⚠️ Sorry, the browser blocked opening the pop-up page for preview and printing. Please allow popups for this site from the address bar and try again.'
    );
  }
}

// Custom Print Preview Overlay helper to show fully-rendered reports in the iframe sandboxed environment
function showPrintPreview(htmlContent: string, plainTextText: string, targetWrapperId?: string) {
  const overlay = document.getElementById('print-preview-overlay') as HTMLElement;
  const contentContainer = document.getElementById('print-preview-content') as HTMLElement;
  const closeBtn1 = document.getElementById('close-print-preview') as HTMLButtonElement;
  const closeBtn2 = document.getElementById('close-print-preview-btn') as HTMLButtonElement;
  const copyBtn = document.getElementById('print-preview-copy-btn') as HTMLButtonElement;
  const triggerBtn = document.getElementById('print-preview-trigger-btn') as HTMLButtonElement;

  if (!overlay || !contentContainer) {
    // Fallback if elements are missing
    window.print();
    return;
  }

  contentContainer.innerHTML = htmlContent;
  overlay.classList.remove('hidden');

  const hideModal = () => {
    overlay.classList.add('hidden');
    cleanup();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plainTextText);
      alert(currentLang === 'ar' ? '✅ تم نسخ التقرير كمتن إلى الحافظة بنجاح!' : '✅ Report text copied to clipboard successfully!');
    } catch (err) {
      alert(currentLang === 'ar' ? '❌ فشل نسخ النص تلقائياً، يمكنك نسخه يدوياً من الشاشة.' : '❌ Failed to copy text automatically, you can manually copy it from the screen.');
    }
  };

  const handlePrint = async () => {
    const confirmed = await customConfirm(
      currentLang === 'ar' ? "هل أنت متأكد من رغبتك في طباعة هذا التقرير ورقيّاً الآن؟" : "Are you sure you want to print this report to paper now?",
      currentLang === 'ar' ? "تأكيد الطباعة" : "Confirm Printing",
      currentLang === 'ar' ? "بدء الطباعة" : "Start Print",
      "🖨️",
      "bg-indigo-600 hover:bg-indigo-700",
      "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
    );
    if (!confirmed) return;

    // Unhide target wrapper if specified to ensure print CSS displays it on paper
    let targetWrapper: HTMLElement | null = null;
    if (targetWrapperId) {
      targetWrapper = document.getElementById(targetWrapperId);
    }
    
    if (targetWrapper) {
      targetWrapper.classList.remove('hidden');
    }

    try {
      // 1. Try standard window print
      window.print();
    } catch (err) {
      console.warn("Main window.print() failed/blocked, initiating iframe print bypass...", err);
      try {
        // 2. Dynamic Hidden iframe printing bypass (highly effective for sandboxed iFrame environments)
        let printFrame = document.getElementById('print-fallback-iframe') as HTMLIFrameElement | null;
        if (!printFrame) {
          printFrame = document.createElement('iframe');
          printFrame.id = 'print-fallback-iframe';
          printFrame.style.position = 'fixed';
          printFrame.style.right = '0';
          printFrame.style.bottom = '0';
          printFrame.style.width = '0';
          printFrame.style.height = '0';
          printFrame.style.border = '0';
          document.body.appendChild(printFrame);
        }
        
        const doc = printFrame.contentWindow?.document || printFrame.contentDocument;
        if (doc) {
          doc.open();
          doc.write(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
              <meta charset="UTF-8">
              <title>طباعة التقرير</title>
              <style>
                body {
                  font-family: system-ui, -apple-system, sans-serif;
                  direction: rtl;
                  text-align: right;
                  color: #000;
                  background: #fff;
                  padding: 20px;
                }
                table {
                  border-collapse: collapse;
                  width: 100%;
                  margin-top: 15px;
                }
                th, td {
                  border: 1px solid #cbd5e1;
                  padding: 8px;
                  font-size: 11px;
                }
                th {
                  background-color: #f8fafc;
                  font-weight: 700;
                }
              </style>
            </head>
            <body>
              ${htmlContent}
            </body>
            </html>
          `);
          doc.close();
          
          setTimeout(() => {
            printFrame?.contentWindow?.focus();
            printFrame?.contentWindow?.print();
          }, 250);
        }
      } catch (innerErr) {
        alert(
          currentLang === 'ar'
            ? '⚠️ تعذر تشغيل واجهة الطباعة بسبب قيود أمان المتصفح داخل نافذة المعاينة. للطباعة الورقية، يرجى تشغيل التطبيق في نافذة مستقلة عبر زر "فتح في نافذة مستقلة" في الركن العلوي الأيمن من شاشة AI Studio للطباعة المباشرة.'
            : '⚠️ Failed to start printing interface due to browser sandbox security restrictions inside the preview window. To print on physical paper, please open the application in a standalone window using the "Open in Standalone Window" button in the top-right corner of the AI Studio screen.'
        );
      }
    } finally {
      // Re-hide the background layout container after a delay so that the browser print engine captures it correctly
      setTimeout(() => {
        if (targetWrapper) {
          targetWrapper.classList.add('hidden');
        }
      }, 1500);
    }
  };

  const cleanup = () => {
    closeBtn1?.removeEventListener('click', hideModal);
    closeBtn2?.removeEventListener('click', hideModal);
    copyBtn?.removeEventListener('click', handleCopy);
    triggerBtn?.removeEventListener('click', handlePrint);
  };

  closeBtn1?.addEventListener('click', hideModal);
  closeBtn2?.addEventListener('click', hideModal);
  copyBtn?.addEventListener('click', handleCopy);
  triggerBtn?.addEventListener('click', handlePrint);
}

// Live listeners for users list
let unsubscribeUsers: (() => void) | null = null;
let unsubscribeActiveAlerts: (() => void) | null = null;
let unsubscribeRecentAlerts: (() => void) | null = null;
let unsubscribeRecentResolvedCalls: (() => void) | null = null;
let allRowsResolvedCache: any[] = [];

// Populate resolved calls reports dashboard for Owner (deterministic data analytics)
function listenToResolvedCallsReport() {
  if (unsubscribeRecentResolvedCalls) {
    unsubscribeRecentResolvedCalls();
  }

  const reportsTableBody = document.getElementById('report-table-body') as HTMLElement | null;
  const avgResponseTimeKpi = document.getElementById('avg-response-time-kpi') as HTMLElement | null;
  const resolvedCallsCountKpi = document.getElementById('resolved-calls-count-kpi') as HTMLElement | null;
  const excellentRateKpi = document.getElementById('excellent-rate-kpi') as HTMLElement | null;
  const reportFilterSpeed = document.getElementById('report-filter-speed') as HTMLSelectElement | null;
  const reportSearch = document.getElementById('report-search') as HTMLInputElement | null;

  const printTableBody = document.getElementById('print-table-body') as HTMLElement | null;
  const printDate = document.getElementById('print-date') as HTMLElement | null;
  const printAvgTime = document.getElementById('print-avg-time') as HTMLElement | null;
  const printTotalCalls = document.getElementById('print-total-calls') as HTMLElement | null;
  const printExcellentRate = document.getElementById('print-excellent-rate') as HTMLElement | null;

  if (!reportsTableBody) return;

  const resolvedQuery = query(
    collection(db, 'emergency_calls'),
    where('status', '==', 'resolved')
  );

  unsubscribeRecentResolvedCalls = onSnapshot(resolvedQuery, (snapshot) => {
    if (snapshot.empty) {
      reportsTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="p-6 text-center text-slate-400 dark:text-slate-500 font-medium">لا توجد بلاغات محلولة في السجل حتى الآن.</td>
        </tr>
      `;
      if (printTableBody) {
        printTableBody.innerHTML = `
          <tr>
            <td colspan="6" style="padding: 10px; text-align: center; color: #94a3b8;">لا توجد بلاغات محلولة في السجل حتى الآن.</td>
          </tr>
        `;
      }
      if (avgResponseTimeKpi) avgResponseTimeKpi.textContent = '-';
      if (resolvedCallsCountKpi) resolvedCallsCountKpi.textContent = '0';
      if (excellentRateKpi) excellentRateKpi.textContent = '0%';
      const excellentBar = document.getElementById('excellent-bar');
      if (excellentBar) excellentBar.style.width = '0%';
      return;
    }

    let totalDiffSeconds = 0;
    let resolvedCount = 0;
    let excellentCount = 0; // Response time < 3 minutes (180 seconds)

    allRowsResolvedCache = [];

    // Convert to array and sort descending by timestamp client-side
    const sortedDocs: any[] = [];
    snapshot.forEach((docSnap) => {
      sortedDocs.push({ id: docSnap.id, ...docSnap.data() });
    });
    sortedDocs.sort((a, b) => {
      const timeA = a.timestamp ? a.timestamp.seconds : 0;
      const timeB = b.timestamp ? b.timestamp.seconds : 0;
      return timeB - timeA;
    });

    sortedDocs.forEach((docDataWithId) => {
      const data = docDataWithId;
      const docId = docDataWithId.id;

      // Calculate response speed
      let diffSeconds = 0;
      let durationStr = 'غير محدد';
      if (data.resolvedAt && data.timestamp) {
        diffSeconds = Math.max(0, data.resolvedAt.seconds - data.timestamp.seconds);
        totalDiffSeconds += diffSeconds;
        resolvedCount++;

        if (diffSeconds < 180) {
          excellentCount++;
        }

        if (diffSeconds < 60) {
          durationStr = `${diffSeconds} ثانية`;
        } else if (diffSeconds < 3600) {
          const m = Math.floor(diffSeconds / 60);
          const s = diffSeconds % 60;
          durationStr = `${m} د و ${s} ث`;
        } else {
          const h = Math.floor(diffSeconds / 3600);
          const m = Math.floor((diffSeconds % 3600) / 60);
          durationStr = `${h} س و ${m} د`;
        }
      }

      // Rule-based classification
      let speedCategory: 'excellent' | 'standard' | 'delayed' = 'standard';
      let analysisBadge = '';
      let printAnalysis = '';
      
      if (diffSeconds > 0) {
        if (diffSeconds < 180) {
          speedCategory = 'excellent';
          analysisBadge = '<span class="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-lg font-black border border-emerald-500/10 text-[9px]">⚡ ممتازة</span>';
          printAnalysis = 'استجابة ممتازة فائقة السرعة';
        } else if (diffSeconds <= 420) {
          speedCategory = 'standard';
          analysisBadge = '<span class="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-lg font-black border border-blue-500/10 text-[9px]">🟢 قياسية</span>';
          printAnalysis = 'استجابة عادية قياسية';
        } else {
          speedCategory = 'delayed';
          analysisBadge = '<span class="bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-lg font-black border border-rose-500/10 text-[9px]">⚠️ متأخرة</span>';
          printAnalysis = 'استجابة متأخرة بحاجة لمراجعة كفاءة الخدمة';
        }
      } else {
        analysisBadge = '<span class="bg-slate-500/10 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-lg font-bold text-[9px]">غير محدد</span>';
        printAnalysis = 'مدة غير معروفة';
      }

      const dateObj = data.timestamp ? new Date(data.timestamp.seconds * 1000) : new Date();
      const dateStr = dateObj.toLocaleDateString('ar-EG');
      const timeStr = dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      const closedTimeStr = data.resolvedAt ? new Date(data.resolvedAt.seconds * 1000).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'غير محدد';

      const wingName = data.wingName || 'نداء عام';
      const bedId = data.bedId || '-';
      const residentName = data.residentName || '-';
      const senderName = data.senderName || 'غير معروف';
      const notes = data.notes || 'لا توجد ملاحظات';

      const resolverNameHtml = data.resolvedBy 
        ? `<span class="font-bold text-slate-700 dark:text-slate-300">${senderName}</span><br/><span class="text-[9px] text-emerald-600 dark:text-emerald-500 font-extrabold flex items-center gap-1 mt-1">✔️ حل: ${data.resolvedBy}</span>`
        : `<span class="font-bold text-slate-700 dark:text-slate-300">${senderName}</span>`;

      const resolutionNoteHtml = data.resolutionNotes 
        ? `<div class="mt-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 p-2 rounded-xl text-[9px] font-bold border border-emerald-500/10 leading-relaxed">🛠️ كيفية الحل: ${data.resolutionNotes}</div>` 
        : '';

      const printResolverName = data.resolvedBy ? `${senderName} (بواسطة: ${data.resolvedBy})` : senderName;
      const printNotes = data.resolutionNotes ? `${notes} | كيفية الحل: ${data.resolutionNotes}` : notes;

      const rowHtml = `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all text-xs border-b border-slate-100 dark:border-slate-800">
          <td class="p-3 border-l border-slate-100 dark:border-slate-800/60 font-mono">${dateStr}<br/><span class="opacity-60 text-[9px]">${timeStr}</span></td>
          <td class="p-3 border-l border-slate-100 dark:border-slate-800/60 leading-relaxed">${resolverNameHtml}</td>
          <td class="p-3 border-l border-slate-100 dark:border-slate-800/60 leading-relaxed">
            <span class="font-black text-indigo-600 dark:text-indigo-400">${wingName}</span>
            <br/>
            <span class="text-[9px] opacity-75">سرير: ${bedId} | المقيم: <strong class="text-slate-700 dark:text-slate-300">${residentName}</strong></span>
          </td>
          <td class="p-3 border-l border-slate-100 dark:border-slate-800/60 text-slate-600 dark:text-slate-400 max-w-xs" title="${notes}">
            <span class="italic font-semibold">${notes}</span>
            ${resolutionNoteHtml}
          </td>
          <td class="p-3 border-l border-slate-100 dark:border-slate-800/60 font-mono">
            <strong>${durationStr}</strong>
            <div class="mt-1">${analysisBadge}</div>
          </td>
          <td class="p-3 text-center">
            <div class="flex items-center justify-center gap-1.5">
              <button class="view-case-detail-btn px-2.5 py-1.5 text-[9px] font-black bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all active:scale-95 flex items-center gap-0.5" data-id="${docId}">
                <span>📄 عرض التفاصيل</span>
              </button>
              ${currentUser && currentUser.role === 'المالك' ? `
                <button class="delete-case-btn p-1.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all active:scale-95" data-id="${docId}" title="حذف نهائي">
                  🗑️
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;

      const printRowHtml = `
        <tr style="border-bottom: 1px solid #cbd5e1;">
          <td style="padding: 8px; border: 1px solid #cbd5e1; font-family: monospace;">${dateStr} - ${timeStr}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">${printResolverName}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">جناح: ${wingName}<br/>سرير: ${bedId} | مقيم: ${residentName}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; font-style: italic;">${printNotes}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; font-family: monospace;">${closedTimeStr}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">
            <strong>${durationStr}</strong><br/>
            <span style="font-size: 8px; color: #475569;">${printAnalysis}</span>
          </td>
        </tr>
      `;

      allRowsResolvedCache.push({
        id: docId,
        html: rowHtml,
        printHtml: printRowHtml,
        seconds: diffSeconds,
        speedCategory: speedCategory,
        residentName: residentName,
        wingName: wingName,
        bedId: bedId,
        notes: notes,
        senderName: senderName,
        data: data
      });
    });

    // Compute Overall Statistics
    const avgSecs = resolvedCount > 0 ? Math.round(totalDiffSeconds / resolvedCount) : 0;
    let avgStr = '-';
    if (avgSecs > 0) {
      if (avgSecs < 60) {
        avgStr = `${avgSecs} ثانية`;
      } else {
        const m = Math.floor(avgSecs / 60);
        const s = avgSecs % 60;
        avgStr = `${m} دقيقة و ${s} ث`;
      }
    }

    const excellentRate = resolvedCount > 0 ? Math.round((excellentCount / resolvedCount) * 100) : 0;

    // Update KPI panels on screen
    if (avgResponseTimeKpi) avgResponseTimeKpi.textContent = avgStr;
    if (resolvedCallsCountKpi) resolvedCallsCountKpi.textContent = resolvedCount.toString();
    if (excellentRateKpi) excellentRateKpi.textContent = `${excellentRate}%`;

    const excellentBar = document.getElementById('excellent-bar');
    if (excellentBar) {
      excellentBar.style.width = `${excellentRate}%`;
    }

    // Update KPI panels on Print Document
    if (printAvgTime) printAvgTime.textContent = avgStr;
    if (printTotalCalls) printTotalCalls.textContent = resolvedCount.toString();
    if (printExcellentRate) printExcellentRate.textContent = `${excellentRate}%`;
    if (printDate) printDate.textContent = new Date().toLocaleString('ar-EG');

    // Filter & Search render logic helper
    const renderFilteredRows = () => {
      const selectedFilter = reportFilterSpeed ? reportFilterSpeed.value : 'all';
      const searchText = reportSearch ? reportSearch.value.trim().toLowerCase() : '';

      let filteredRows = allRowsResolvedCache;
      if (selectedFilter !== 'all') {
        filteredRows = allRowsResolvedCache.filter(r => r.speedCategory === selectedFilter);
      }

      if (searchText !== '') {
        filteredRows = filteredRows.filter(r => 
          r.residentName.toLowerCase().includes(searchText) ||
          r.wingName.toLowerCase().includes(searchText) ||
          r.bedId.toLowerCase().includes(searchText) ||
          r.notes.toLowerCase().includes(searchText) ||
          r.senderName.toLowerCase().includes(searchText)
        );
      }

      if (filteredRows.length === 0) {
        reportsTableBody.innerHTML = `
          <tr>
            <td colspan="6" class="p-6 text-center text-slate-400 dark:text-slate-500 font-medium">لا توجد بلاغات تطابق معايير البحث والتصفية المحددة.</td>
          </tr>
        `;
      } else {
        reportsTableBody.innerHTML = filteredRows.map(r => r.html).join('');
        
        // Event listeners are managed via robust Event Delegation on the parent reportsTableBody container.
      }

      if (printTableBody) {
        printTableBody.innerHTML = allRowsResolvedCache.map(r => r.printHtml).join('');
      }
    };

    // Render initially
    renderFilteredRows();

    // Listen to search and filter events
    if (reportFilterSpeed) {
      reportFilterSpeed.onchange = () => {
        renderFilteredRows();
      };
    }

    if (reportSearch) {
      reportSearch.oninput = () => {
        renderFilteredRows();
      };
    }
  }, (error) => {
    console.error("Error loading resolved report logs: ", error);
  });
}

// Open Detailed Modal showing Individual Case File reports with native PDF printing support
function openDetailedCaseModal(matchedRow: any) {
  const overlay = document.getElementById('single-case-overlay') as HTMLElement;
  const modalId = document.getElementById('case-modal-id') as HTMLElement;
  const modalWing = document.getElementById('case-modal-wing') as HTMLElement;
  const modalBed = document.getElementById('case-modal-bed') as HTMLElement;
  const modalResident = document.getElementById('case-modal-resident') as HTMLElement;
  const modalNotes = document.getElementById('case-modal-notes') as HTMLElement;
  const modalCreatedAt = document.getElementById('case-modal-created-at') as HTMLElement;
  const modalResolvedAt = document.getElementById('case-modal-resolved-at') as HTMLElement;
  const modalResolver = document.getElementById('case-modal-resolver') as HTMLElement;
  const modalDuration = document.getElementById('case-modal-duration') as HTMLElement;
  const modalEvaluation = document.getElementById('case-modal-evaluation') as HTMLElement;

  if (!overlay) return;

  const data = matchedRow.data;
  modalId.textContent = `رقم البلاغ الفريد: ${matchedRow.id}`;
  modalWing.textContent = matchedRow.wingName;
  modalBed.textContent = matchedRow.bedId;
  modalResident.textContent = matchedRow.residentName;
  modalNotes.textContent = matchedRow.notes;

  const modalResolution = document.getElementById('case-modal-resolution');
  if (modalResolution) {
    modalResolution.textContent = data.resolutionNotes || 'لم يتم تسجيل كيفية الحل تفصيلياً أو تم الإغلاق مباشرة.';
  }

  const createdDate = data.timestamp ? new Date(data.timestamp.seconds * 1000) : new Date();
  modalCreatedAt.textContent = createdDate.toLocaleString('ar-EG');
  
  const resolvedDate = data.resolvedAt ? new Date(data.resolvedAt.seconds * 1000) : null;
  modalResolvedAt.textContent = resolvedDate ? resolvedDate.toLocaleString('ar-EG') : 'غير محدد';
  
  modalResolver.textContent = data.resolvedBy || matchedRow.senderName;

  // Compute duration
  const diffSeconds = matchedRow.seconds;
  let durationStr = 'غير محدد';
  if (diffSeconds < 60) {
    durationStr = `${diffSeconds} ثانية`;
  } else if (diffSeconds < 3600) {
    const m = Math.floor(diffSeconds / 60);
    const s = diffSeconds % 60;
    durationStr = `${m} دقيقة و ${s} ثانية`;
  } else {
    const h = Math.floor(diffSeconds / 3600);
    const m = Math.floor((diffSeconds % 3600) / 60);
    durationStr = `${h} ساعة و ${m} دقيقة`;
  }
  modalDuration.textContent = durationStr;

  // Set evaluation
  if (matchedRow.speedCategory === 'excellent') {
    modalEvaluation.textContent = '⚡ ممتازة وفائقة السرعة';
    modalEvaluation.className = 'px-3 py-1 rounded-lg text-[9px] font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/20';
  } else if (matchedRow.speedCategory === 'standard') {
    modalEvaluation.textContent = '🟢 استجابة قياسية مقبولة';
    modalEvaluation.className = 'px-3 py-1 rounded-lg text-[9px] font-black bg-blue-500/10 text-blue-600 border border-blue-500/20';
  } else {
    modalEvaluation.textContent = '⚠️ استجابة متأخرة تحتاج تحسين';
    modalEvaluation.className = 'px-3 py-1 rounded-lg text-[9px] font-black bg-rose-500/10 text-rose-600 border border-rose-500/20';
  }

  // Show modal
  overlay.classList.remove('hidden');

  // Wire up custom print preview overlay for this specific case
  const populatePrintLayout = () => {
    const printCaseId = document.getElementById('print-case-id');
    const printCaseCurrentDate = document.getElementById('print-case-current-date');
    const printCaseWing = document.getElementById('print-case-wing');
    const printCaseBed = document.getElementById('print-case-bed');
    const printCaseResident = document.getElementById('print-case-resident');
    const printCaseNotes = document.getElementById('print-case-notes');
    const printCaseResolution = document.getElementById('print-case-resolution');
    const printCaseCreatedAt = document.getElementById('print-case-created-at');
    const printCaseResolvedAt = document.getElementById('print-case-resolved-at');
    const printCaseResolver = document.getElementById('print-case-resolver');
    const printCaseDuration = document.getElementById('print-case-duration');
    const printCaseEvaluation = document.getElementById('print-case-evaluation');

    const evalText = matchedRow.speedCategory === 'excellent'
      ? 'استجابة ممتازة وفائقة السرعة للأطقم الطبية (أقل من 3 دقائق) ⚡'
      : matchedRow.speedCategory === 'standard'
        ? 'استجابة قياسية طبيعية ومقبولة طبياً (3 - 7 دقائق) 🟢'
        : 'استجابة متأخرة وبطيئة تتجاوز المعايير القياسية الصحية (أكثر من 7 دقائق) ⚠️';

    const evalColor = matchedRow.speedCategory === 'excellent' ? '#059669' : matchedRow.speedCategory === 'standard' ? '#2563eb' : '#dc2626';

    if (printCaseId) printCaseId.textContent = matchedRow.id;
    if (printCaseCurrentDate) printCaseCurrentDate.textContent = new Date().toLocaleString('ar-EG');
    if (printCaseWing) printCaseWing.textContent = matchedRow.wingName;
    if (printCaseBed) printCaseBed.textContent = matchedRow.bedId;
    if (printCaseResident) printCaseResident.textContent = matchedRow.residentName;
    if (printCaseNotes) printCaseNotes.textContent = matchedRow.notes;
    if (printCaseResolution) printCaseResolution.textContent = data.resolutionNotes || 'لم يتم تسجيل كيفية الحل تفصيلياً أو تم الإغلاق مباشرة.';
    if (printCaseCreatedAt) printCaseCreatedAt.textContent = createdDate.toLocaleString('ar-EG');
    if (printCaseResolvedAt) printCaseResolvedAt.textContent = resolvedDate ? resolvedDate.toLocaleString('ar-EG') : 'غير محدد';
    if (printCaseResolver) printCaseResolver.textContent = data.resolvedBy || matchedRow.senderName;
    if (printCaseDuration) printCaseDuration.textContent = durationStr;
    
    if (printCaseEvaluation) {
      printCaseEvaluation.textContent = evalText;
      printCaseEvaluation.style.color = evalColor;
    }
  };

  const printCaseBtn = document.getElementById('print-case-btn');
  if (printCaseBtn) {
    printCaseBtn.onclick = () => {
      populatePrintLayout();
      const printWrapper = document.getElementById('single-case-print-wrapper');
      if (printWrapper) {
        // Grab the fully formatted inner HTML
        const htmlContent = printWrapper.innerHTML;
        const evalText = matchedRow.speedCategory === 'excellent'
          ? 'استجابة ممتازة وفائقة السرعة للأطقم الطبية (أقل من 3 دقائق) ⚡'
          : matchedRow.speedCategory === 'standard'
            ? 'استجابة قياسية طبيعية ومقبولة طبياً (3 - 7 دقائق) 🟢'
            : 'استجابة متأخرة وبطيئة تتجاوز المعايير القياسية الصحية (أكثر من 7 دقائق) ⚠️';
        
        // Generate neat plain text
        const plainText = `📄 تقرير حالة طوارئ فردية عاجلة (SOS)
--------------------------------------------------
رقم المستند: ${matchedRow.id}
تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')}
 
📋 بيانات البلاغ والموقع:
- الجناح الطبي: ${matchedRow.wingName}
- رقم السرير: ${matchedRow.bedId}
- المقيم المستغيث: ${matchedRow.residentName}
- ملاحظات البلاغ الطبية المرفقة: ${matchedRow.notes}

🛠️ كيفية الحل وإجراءات المعالجة المتخذة:
- تفاصيل الحل والمعالجة: ${data.resolutionNotes || 'لم يتم تسجيل كيفية الحل تفصيلياً أو تم الإغلاق مباشرة.'}
 
⏱️ توقيتات الاستجابة والأداء التشغيلي:
- تاريخ ووقت إرسال الاستغاثة: ${createdDate.toLocaleString('ar-EG')}
- تاريخ ووقت إغلاق النداء والحل: ${resolvedDate ? resolvedDate.toLocaleString('ar-EG') : 'غير محدد'}
- العضو الطبي المسؤول: ${data.resolvedBy || matchedRow.senderName}
- الزمن المستغرق للاستجابة: ${durationStr}
- تقييم كفاءة الاستجابة: ${evalText}`;

        showPrintPreview(htmlContent, plainText, 'single-case-print-wrapper');
      }
    };
  }

  const printCaseTvBtn = document.getElementById('print-case-tv-btn');
  if (printCaseTvBtn) {
    printCaseTvBtn.onclick = () => {
      populatePrintLayout();
      const printWrapper = document.getElementById('single-case-print-wrapper');
      if (printWrapper) {
        const htmlContent = printWrapper.innerHTML;
        openPrintWindow(htmlContent, `تقرير حالة طوارئ فردية - ${matchedRow.residentName}`);
      }
    };
  }
}

function listenToUsersList() {
  if (unsubscribeUsers) {
    unsubscribeUsers();
  }

  const usersCol = collection(db, 'users');
  unsubscribeUsers = onSnapshot(usersCol, (snapshot) => {
    usersListContainer.innerHTML = '';
    if (snapshot.empty) {
      usersListContainer.innerHTML = `<p class="text-xs text-slate-400 py-2 text-center">${currentLang === 'ar' ? 'لا يوجد مستخدمين مسجلين.' : 'No registered users found.'}</p>`;
      return;
    }

    snapshot.forEach((docSnap) => {
      const u = docSnap.data();
      const userId = docSnap.id;
      
      const item = document.createElement('div');
      item.className = 'flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 text-xs transition-all';
      
      let badgeColor = 'bg-slate-100 text-slate-600';
      if (u.role === 'المالك') badgeColor = 'bg-red-500/10 text-red-600';
      else if (u.role === 'الطوارئ') badgeColor = 'bg-green-500/10 text-green-600';
      else if (u.role === 'مراقب') badgeColor = 'bg-amber-500/10 text-amber-600';
      else if (u.role === 'عامل') badgeColor = 'bg-indigo-500/10 text-indigo-600';

      const isProtected = u.username === 'admin';

      item.innerHTML = `
        <div class="flex flex-col gap-0.5">
          <span class="font-bold text-slate-800 dark:text-slate-100">${u.name}</span>
          <div class="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span>Username: <span class="font-mono">${u.username}</span></span>
            <span>•</span>
            <span>Pass: <span class="font-mono">${u.password}</span></span>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${badgeColor}">${translateRole(u.role)}</span>
          <button class="edit-user-btn text-indigo-500 hover:text-indigo-700 p-1" 
                  data-id="${userId}" 
                  data-name="${u.name}" 
                  data-username="${u.username}" 
                  data-password="${u.password}" 
                  data-role="${u.role}" 
                  title="تعديل المستخدم">
            ✏️
          </button>
          ${isProtected ? '' : `
            <button class="delete-user-btn text-red-500 hover:text-red-700 p-1" data-id="${userId}" title="حذف المستخدم">
              🗑️
            </button>
          `}
        </div>
      `;

      usersListContainer.appendChild(item);
    });
  });
}

async function handleAddUser(e: Event) {
  e.preventDefault();
  const name = newUserName.value.trim();
  const username = newUserUsername.value.trim().toLowerCase();
  const password = newUserPassword.value;
  const role = newUserRole.value;

  if (!name || !username || !password) return;

  try {
    // Generate a unique safe ID
    const userId = username.replace(/[^a-z0-9]/g, '_');
    await setDoc(doc(db, 'users', userId), {
      name,
      username,
      password,
      role
    });

    // Reset inputs
    newUserName.value = '';
    newUserUsername.value = '';
    newUserPassword.value = '';
    newUserRole.selectedIndex = 0;

    alert(
      currentLang === 'ar'
        ? '✨ تم إضافة المستخدم بنجاح في قاعدة البيانات!'
        : '✨ User added successfully to the database!'
    );
  } catch (err) {
    console.error('Error adding user:', err);
    alert(currentLang === 'ar' ? 'عذراً، فشل إضافة المستخدم.' : 'Sorry, failed to add user.');
  }
}

function listenToActiveAlerts() {
  if (unsubscribeActiveAlerts) {
    unsubscribeActiveAlerts();
  }

  const q = query(collection(db, 'emergency_calls'), orderBy('timestamp', 'desc'), limit(40));
  unsubscribeActiveAlerts = onSnapshot(q, (snapshot) => {
    activeAlertsContainer.innerHTML = '';
    
    const tvGrid = document.getElementById('tv-alerts-grid');
    const tvEmptyRadar = document.getElementById('tv-empty-radar');
    const tvActiveCount = document.getElementById('tv-active-count');
    
    if (tvGrid) {
      tvGrid.innerHTML = '';
    }

    let activeCount = 0;
    let pendingCount = 0;
    let unmutedPendingCount = 0;

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const docId = docSnap.id;
      
      // If status is specifically marked as resolved, don't show it here
      if (data.status === 'resolved') {
        return;
      }

      // Filter out supervisor-only alerts from non-supervisors (excluding Emergency 'الطوارئ' and Workers 'عامل')
      const isSupervisorOnly = data.isSupervisorOnly === true;
      if (isSupervisorOnly) {
        const isSupervisorUser = currentUser && (currentUser.role === 'مراقب' || currentUser.role === 'المالك');
        if (!isSupervisorUser) {
          return; // Skip rendering/counting this supervisor-only alert for emergency users
        }
      }

      activeCount++;
      if (data.status !== 'processing') {
        pendingCount++;
        if (!locallyMutedAlerts.has(docId)) {
          unmutedPendingCount++;
        }
      }
      const alertTimeObj = data.timestamp ? new Date(data.timestamp.seconds * 1000) : new Date();
      const locale = currentLang === 'ar' ? 'ar-EG' : 'en-US';
      const timeStr = data.timestamp 
        ? alertTimeObj.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
        : (currentLang === 'ar' ? 'الآن' : 'Now');
      const isMine = data.deviceId === deviceId;

      // 1. Mobile/Standard Alert Card
      const card = document.createElement('div');
      card.className = `p-5 rounded-3xl flex flex-col gap-3.5 transition-all border shadow-sm ${
        data.status === 'processing' 
          ? 'bg-amber-500/5 border-amber-500/10 dark:border-amber-500/20' 
          : 'bg-red-500/5 border-red-500/15 dark:border-red-500/20 animate-pulse'
      }`;

      const statusText = data.status === 'processing' 
        ? (currentLang === 'ar' ? '🛠️ جاري المعالجة والمتابعة' : '🛠️ Processing & In Progress') 
        : (currentLang === 'ar' ? '🚨 نداء استغاثة نشط عاجل' : '🚨 Active SOS Emergency');
      const statusBadgeClass = data.status === 'processing' ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-600';

      const locationBadge = data.wingName && data.wingName !== 'نداء عام' ? `
        <div class="flex flex-wrap gap-2 mt-2">
          <span class="px-2 py-0.5 rounded-lg text-[9px] font-black bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10">📍 ${data.wingName}</span>
          <span class="px-2 py-0.5 rounded-lg text-[9px] font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/10">🛏️ ${data.bedId}</span>
          <span class="px-2 py-0.5 rounded-lg text-[9px] font-black bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/10">${currentLang === 'ar' ? '👤 المقيم:' : '👤 Resident:'} ${data.residentName}</span>
        </div>
      ` : `
        <div class="flex flex-wrap gap-2 mt-2">
          <span class="px-2 py-0.5 rounded-lg text-[9px] font-black bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-200/40">🚨 ${currentLang === 'ar' ? 'نداء عام (كامل المركز)' : 'General Broadcast (Center-wide)'}</span>
        </div>
      `;

        const isMuted = locallyMutedAlerts.has(docId);
        const muteBtnClass = isMuted 
          ? 'bg-slate-500 hover:bg-slate-600 text-white' 
          : 'bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60';
        const muteBtnText = isMuted
          ? (currentLang === 'ar' ? '🔔 تشغيل الصوت' : '🔔 Unmute')
          : (currentLang === 'ar' ? '🔕 كتم مؤقت' : '🔕 Mute');

        card.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-100/60 dark:border-slate-800/60 pb-2">
          <div class="flex items-center gap-2">
            <span class="relative flex h-2.5 w-2.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${data.status === 'processing' ? 'bg-amber-400' : 'bg-red-400'}"></span>
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 ${data.status === 'processing' ? 'bg-amber-500' : 'bg-red-600'}"></span>
            </span>
            <span class="font-black text-xs text-slate-800 dark:text-slate-100">${currentLang === 'ar' ? 'بلاغ من جهاز:' : 'Device alert:'} ${data.deviceId ? data.deviceId.substring(0, 12) : (currentLang === 'ar' ? 'غير معروف' : 'Unknown')}</span>
          </div>
          <span class="text-[10px] text-slate-400 font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg">${timeStr}</span>
        </div>
        
        <div class="flex items-start gap-3">
          <div class="p-2 bg-red-500/10 text-red-600 rounded-xl text-lg shrink-0 mt-0.5">
            ${data.status === 'processing' ? '👨‍🚒' : '🔥'}
          </div>
          <div class="flex-1">
            <p class="text-sm text-slate-700 dark:text-slate-200 font-bold leading-relaxed">${data.message || (currentLang === 'ar' ? 'نداء استغاثة عاجل (SOS)!' : 'Urgent SOS Call!')}</p>
            ${locationBadge}
            ${data.notes ? `
              <div class="mt-2.5 bg-slate-100 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 p-2.5 rounded-xl text-xs font-semibold border border-slate-200/50 dark:border-slate-800/80 leading-relaxed flex items-start gap-1.5 animate-fade-in">
                <span class="shrink-0 text-amber-500">📝</span>
                <div>
                  <span class="block text-[9px] text-slate-400 dark:text-slate-500 font-extrabold mb-0.5">${currentLang === 'ar' ? 'ملاحظات البلاغ المرفقة:' : 'Attached alert notes:'}</span>
                  <span class="italic text-slate-800 dark:text-slate-200">${data.notes}</span>
                </div>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <span class="px-3 py-1 rounded-full text-[10px] font-black tracking-wide ${statusBadgeClass} shrink-0 self-start">${statusText}</span>
          <div class="flex flex-wrap gap-2 w-full sm:w-auto">
            ${data.status !== 'processing' ? `
              <button class="mute-alert-toggle-btn flex-1 sm:flex-initial px-3 py-2 text-xs font-black ${muteBtnClass} rounded-xl transition-all shadow-sm flex items-center justify-center gap-1" data-id="${docId}">
                <span>${muteBtnText}</span>
              </button>
              <button class="process-alert-btn flex-1 sm:flex-initial px-4 py-2 text-xs font-black bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-xl transition-all shadow-sm flex items-center justify-center gap-1" data-id="${docId}">
                <span>🛠️ ${currentLang === 'ar' ? 'بدء المعالجة' : 'Start Processing'}</span>
              </button>
            ` : ''}
            <button class="resolve-alert-btn flex-1 sm:flex-initial px-4 py-2 text-xs font-black bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl transition-all shadow-sm flex items-center justify-center gap-1" data-id="${docId}">
              <span>✅ ${currentLang === 'ar' ? 'تم الحل وإغلاق البلاغ' : 'Resolve & Close'}</span>
            </button>
          </div>
        </div>
      `;

      activeAlertsContainer.appendChild(card);

      // 2. Smart TV Dashboard Large Card
      if (tvGrid) {
        const tvCard = document.createElement('div');
        tvCard.className = `p-6 rounded-3xl border flex flex-col justify-between min-h-[220px] transition-all duration-300 relative ${
          data.status === 'processing' 
            ? 'bg-gradient-to-b from-slate-900 to-amber-950/20 border-amber-500/30' 
            : 'bg-gradient-to-b from-slate-900 to-red-950/40 border-red-500/40 animate-pulse'
        }`;

        const alertSeconds = data.timestamp ? data.timestamp.seconds : Math.floor(Date.now() / 1000);
        const diffSecs = Math.max(0, Math.floor(Date.now() / 1000) - alertSeconds);
        const m = Math.floor(diffSecs / 60);
        const s = diffSecs % 60;
        const countUpText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        
        const isCritical = diffSecs >= 180 && data.status !== 'processing';
        const elapsedClass = isCritical 
          ? 'text-red-500 font-extrabold animate-bounce text-2xl font-mono tracking-wider' 
          : 'text-slate-300 text-2xl font-mono tracking-wider';

        const tvNotesHtml = data.notes ? `
          <div class="text-lg font-bold text-slate-300 mt-2 bg-slate-950/50 p-3 rounded-xl border border-slate-800 flex items-start gap-2">
            <span class="text-xl shrink-0 text-amber-500">📝</span>
            <div class="text-right">
              <span class="block text-[11px] text-slate-500 dark:text-slate-500 font-extrabold mb-0.5">${currentLang === 'ar' ? 'ملاحظات البلاغ المرفقة:' : 'Attached alert notes:'}</span>
              <span class="italic text-amber-400 text-xl font-extrabold leading-relaxed">${data.notes}</span>
            </div>
          </div>
        ` : '';

        const tvLocationHtml = data.wingName && data.wingName !== 'نداء عام' ? `
          <div>
            <div class="text-3xl font-black text-white leading-tight mb-2 flex items-center gap-2">
              <span>📍 ${data.wingName}</span>
            </div>
            <div class="text-xl font-extrabold text-indigo-400 mt-1">
              🛏️ ${currentLang === 'ar' ? 'رقم السرير:' : 'Bed Number:'} <span class="font-mono text-white text-2xl">${data.bedId}</span>
            </div>
            <div class="text-lg font-bold text-slate-300 mt-2 bg-slate-950/50 p-3 rounded-xl border border-slate-800 flex items-center gap-2 mb-2">
              <span class="text-xl">👤</span>
              <span>${currentLang === 'ar' ? 'المقيم المستغيث:' : 'Resident Caller:'} <strong class="text-emerald-400 text-xl">${data.residentName}</strong></span>
            </div>
            ${tvNotesHtml}
          </div>
        ` : `
          <div>
            <div class="text-3xl font-black text-red-500 leading-tight mb-2">
              🚨 ${currentLang === 'ar' ? 'نداء عام (كامل المركز)' : 'General Broadcast (Center-wide)'}
            </div>
            <div class="text-lg text-slate-300 italic bg-red-950/20 p-3 rounded-xl border border-red-900/30 mb-2">
              ${data.message || (currentLang === 'ar' ? 'نداء استغاثة عاجل (SOS) في جميع الأجنحة والساحات العامة!' : 'Urgent SOS Call in all wings and public areas!')}
            </div>
            ${tvNotesHtml}
          </div>
        `;

          const isMuted = locallyMutedAlerts.has(docId);
          const muteBtnClass = isMuted 
            ? 'bg-slate-500 hover:bg-slate-600 text-white' 
            : 'bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60';
          const muteBtnText = isMuted
            ? (currentLang === 'ar' ? '🔔 تشغيل الصوت' : '🔔 Unmute')
            : (currentLang === 'ar' ? '🔕 كتم مؤقت' : '🔕 Mute');

          tvCard.innerHTML = `
          <div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div class="flex items-center gap-3">
              <span class="relative flex h-4 w-4">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${data.status === 'processing' ? 'bg-amber-400' : 'bg-red-400'}"></span>
                <span class="relative inline-flex rounded-full h-4 w-4 ${data.status === 'processing' ? 'bg-amber-500' : 'bg-red-600'}"></span>
              </span>
              <span class="text-sm font-black uppercase tracking-wider ${data.status === 'processing' ? 'text-amber-500' : 'text-red-500'}">
                ${data.status === 'processing' ? (currentLang === 'ar' ? '🛠️ قيد المتابعة والمعالجة' : '🛠️ Processing & In Progress') : (currentLang === 'ar' ? '🚨 استغاثة عاجلة نشطة' : '🚨 Active Urgent Emergency')}
              </span>
            </div>
            <span class="text-xs text-slate-400 font-mono font-bold bg-slate-950/60 border border-slate-800 px-2.5 py-1 rounded-xl">${timeStr}</span>
          </div>

          <div class="flex-1 mb-5">
            ${tvLocationHtml}
          </div>

          <div class="border-t border-slate-800 pt-4 flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-[10px] text-slate-400 font-bold mb-0.5">${currentLang === 'ar' ? 'الزمن المنقضي:' : 'Time Elapsed:'}</span>
              <strong class="text-2xl font-mono tracking-wider ${elapsedClass}" data-alert-time="${alertSeconds}" data-status="${data.status}">${countUpText}</strong>
            </div>
            
            <div class="flex flex-wrap gap-2">
              ${data.status !== 'processing' ? `
                <button class="mute-alert-toggle-btn px-4 py-2.5 text-xs font-black ${muteBtnClass} rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1" data-id="${docId}">
                  <span>${muteBtnText}</span>
                </button>
                <button class="process-alert-btn px-5 py-2.5 text-xs font-black bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1" data-id="${docId}">
                  <span>🛠️ ${currentLang === 'ar' ? 'معالجة' : 'Process'}</span>
                </button>
              ` : ''}
              <button class="resolve-alert-btn px-5 py-2.5 text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1" data-id="${docId}">
                <span>✅ ${currentLang === 'ar' ? 'حل وإغلاق' : 'Resolve'}</span>
              </button>
            </div>
          </div>
        `;

        tvGrid.appendChild(tvCard);
      }
    });

    // Toggle Empty State Radar on Smart TV
    if (tvEmptyRadar && tvGrid) {
      if (activeCount === 0) {
        tvEmptyRadar.classList.remove('hidden');
        tvGrid.classList.add('hidden');
      } else {
        tvEmptyRadar.classList.add('hidden');
        tvGrid.classList.remove('hidden');
      }
    }

    if (tvActiveCount) {
      tvActiveCount.textContent = String(activeCount);
    }

    // Update real-time telemetry elements
    if (monitoringActiveCount) {
      monitoringActiveCount.textContent = `${activeCount} بلاغ`;
    }
    activeAlertsCount.textContent = `${activeCount} بلاغ نشط`;

    if (activeCount > 0) {
      if (systemStatusText) {
        systemStatusText.textContent = "تنبيه طوارئ نشط";
        systemStatusText.className = "text-sm font-black text-red-600 dark:text-red-400";
      }
      if (systemStatusIndicator) {
        systemStatusIndicator.className = "w-11 h-11 rounded-2xl bg-red-500/10 text-red-600 flex items-center justify-center text-xl shrink-0 animate-bounce";
        systemStatusIndicator.innerHTML = "⚠️";
      }
      if (activeCasesIndicator) {
        activeCasesIndicator.className = "w-11 h-11 rounded-2xl bg-red-500/10 text-red-600 flex items-center justify-center text-xl shrink-0 animate-pulse";
      }
    } else {
      if (systemStatusText) {
        systemStatusText.textContent = "آمن ومستقر";
        systemStatusText.className = "text-sm font-black text-emerald-600 dark:text-emerald-400";
      }
      if (systemStatusIndicator) {
        systemStatusIndicator.className = "w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-xl shrink-0";
        systemStatusIndicator.innerHTML = "🛡️";
      }
      if (activeCasesIndicator) {
        activeCasesIndicator.className = "w-11 h-11 rounded-2xl bg-slate-500/10 text-slate-400 flex items-center justify-center text-xl shrink-0";
      }
    }

    if (activeCount === 0) {
      activeAlertsContainer.innerHTML = `
        <div class="text-center text-xs text-slate-400 py-12">
          لا توجد بلاغات نشطة حالياً. جميع الأنظمة مستقرة.
        </div>
      `;
    }

    // Attach listeners for actions on normal cards
    const attachMuteToggleListeners = (container: HTMLElement) => {
      const muteButtons = container.querySelectorAll('.mute-alert-toggle-btn');
      muteButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const target = e.currentTarget as HTMLButtonElement;
          const id = target.getAttribute('data-id');
          if (id) {
            if (locallyMutedAlerts.has(id)) {
              locallyMutedAlerts.delete(id);
            } else {
              locallyMutedAlerts.add(id);
            }
            const isNowMuted = locallyMutedAlerts.has(id);
            const allMuteBtns = document.querySelectorAll(`.mute-alert-toggle-btn[data-id="${id}"]`);
            allMuteBtns.forEach((mBtn) => {
              const span = mBtn.querySelector('span');
              if (isNowMuted) {
                mBtn.className = mBtn.classList.contains('px-4') 
                  ? "mute-alert-toggle-btn px-4 py-2.5 text-xs font-black bg-slate-500 hover:bg-slate-600 text-white rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1"
                  : "mute-alert-toggle-btn flex-1 sm:flex-initial px-3 py-2 text-xs font-black bg-slate-500 hover:bg-slate-600 text-white rounded-xl transition-all shadow-sm flex items-center justify-center gap-1";
                if (span) span.textContent = currentLang === 'ar' ? '🔔 تشغيل الصوت' : '🔔 Unmute';
              } else {
                mBtn.className = mBtn.classList.contains('px-4')
                  ? "mute-alert-toggle-btn px-4 py-2.5 text-xs font-black bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1"
                  : "mute-alert-toggle-btn flex-1 sm:flex-initial px-3 py-2 text-xs font-black bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1";
                if (span) span.textContent = currentLang === 'ar' ? '🔕 كتم مؤقت' : '🔕 Mute';
              }
            });

            let currentUnmutedPendingCount = 0;
            const activeMuteBtns = document.querySelectorAll('.mute-alert-toggle-btn');
            const uniqueUnmutedActiveIds = new Set<string>();
            activeMuteBtns.forEach(btnEl => {
              const btnId = btnEl.getAttribute('data-id');
              if (btnId && !locallyMutedAlerts.has(btnId)) {
                uniqueUnmutedActiveIds.add(btnId);
              }
            });
            currentUnmutedPendingCount = uniqueUnmutedActiveIds.size;

            if (isAuthorizedForSiren) {
              if (currentUnmutedPendingCount > 0) {
                if (!isAlarmPlaying) {
                  console.log(`[Siren] Auto-starting siren from local mute toggle. ${currentUnmutedPendingCount} unmuted pending alerts.`);
                  startSiren();
                }
              } else {
                if (isAlarmPlaying) {
                  console.log('[Siren] No unmuted pending alerts remaining. Stopping siren.');
                  stopSiren();
                }
              }
            }
          }
        });
      });
    };

    attachMuteToggleListeners(activeAlertsContainer);
    if (tvGrid) {
      attachMuteToggleListeners(tvGrid);
    }

    const processButtons = activeAlertsContainer.querySelectorAll('.process-alert-btn');
    processButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        const id = target.getAttribute('data-id');
        if (id) {
          try {
            await updateDoc(doc(db, 'emergency_calls', id), { status: 'processing' });
            console.log('Alert processing started.');
          } catch (err) {
            console.error('Error starting alert processing:', err);
          }
        }
      });
    });

    const resolveButtons = activeAlertsContainer.querySelectorAll('.resolve-alert-btn');
    resolveButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        const id = target.getAttribute('data-id');
        if (id) {
          const overlay = document.getElementById('resolve-modal-overlay');
          const targetInput = document.getElementById('resolve-target-id') as HTMLInputElement;
          const notesInput = document.getElementById('resolve-notes-input') as HTMLTextAreaElement;
          
          if (overlay && targetInput) {
            targetInput.value = id;
            if (notesInput) notesInput.value = '';
            overlay.classList.remove('hidden');
          }
        }
      });
    });

    // Attach listeners for actions on TV cards
    if (tvGrid) {
      const tvProcessBtns = tvGrid.querySelectorAll('.process-alert-btn');
      tvProcessBtns.forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          const target = e.currentTarget as HTMLButtonElement;
          const id = target.getAttribute('data-id');
          if (id) {
            try {
              await updateDoc(doc(db, 'emergency_calls', id), { status: 'processing' });
              console.log('Alert processing started on TV view.');
            } catch (err) {
              console.error('Error starting alert processing:', err);
            }
          }
        });
      });

      const tvResolveBtns = tvGrid.querySelectorAll('.resolve-alert-btn');
      tvResolveBtns.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const target = e.currentTarget as HTMLButtonElement;
          const id = target.getAttribute('data-id');
          if (id) {
            const overlay = document.getElementById('resolve-modal-overlay');
            const targetInput = document.getElementById('resolve-target-id') as HTMLInputElement;
            const notesInput = document.getElementById('resolve-notes-input') as HTMLTextAreaElement;
            
            if (overlay && targetInput) {
              targetInput.value = id;
              if (notesInput) notesInput.value = '';
              overlay.classList.remove('hidden');
            }
          }
        });
      });
    }

    // Role-based physical alarm state control (Supervisor, Emergency, Owner hear sirens while there are pending alerts)
    // Also, if the TV Monitor screen itself is active, it MUST play the siren regardless of active session
    const isTvActive = !document.getElementById('smart-tv-dashboard')?.classList.contains('hidden');
    const isAuthorizedForSiren = isTvActive || (currentUser && (
      currentUser.role === 'مراقب' || 
      currentUser.role === 'الطوارئ' || 
      currentUser.role === 'المالك'
    ));
    if (isAuthorizedForSiren) {
      if (unmutedPendingCount > 0) {
        if (!isAlarmPlaying) {
          console.log(`[Siren] Auto-starting siren for authorized role/state. ${unmutedPendingCount} unmuted pending alerts.`);
          startSiren();
        }
      } else {
        if (isAlarmPlaying) {
          console.log('[Siren] No unmuted pending alerts. Auto-stopping siren.');
          stopSiren();
        }
      }
    } else {
      // Force non-authorized roles (like worker/guest) or logged-out users to never hear/continue the siren
      if (isAlarmPlaying) {
        console.log('[Siren] Current role is not authorized or user logged out. Stopping siren.');
        stopSiren();
      }
    }

  });
}

async function seedDefaultUsers() {
  try {
    const usersCol = collection(db, 'users');
    const q = query(usersCol, limit(1));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log('Seeding default users...');
      const defaults = [
        { id: 'admin', username: 'admin', password: '123', name: 'المالك (المدير)', role: 'المالك' },
        { id: 'worker', username: 'worker', password: '123', name: 'عامل الصيانة', role: 'عامل' },
        { id: 'tech', username: 'tech', password: '123', name: 'الطوارئ', role: 'الطوارئ' },
        { id: 'monitor', username: 'monitor', password: '123', name: 'مراقب العمليات', role: 'مراقب' }
      ];
      
      for (const d of defaults) {
        await setDoc(doc(db, 'users', d.id), {
          username: d.username,
          password: d.password,
          name: d.name,
          role: d.role
        });
      }
      console.log('Default users seeded successfully.');
    }
  } catch (error) {
    console.error('Error seeding default users:', error);
  }
}

// ==========================================
// Wing & Bed Seeding & Initialization
// ==========================================

async function seedDefaultWingsAndBeds() {
  try {
    const wingsCol = collection(db, 'wings');
    const q = query(wingsCol, limit(1));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('Seeding default wings and resident beds...');
      const defaultWings = [
        {
          name: '🌸 جناح الياسمين - الطابق الأول',
          beds: [
            { bedId: 'سرير ١٠١', residentName: 'العم أحمد بن صالح الحربي' },
            { bedId: 'سرير ١٠٢', residentName: 'العم سليمان منصور السديري' },
            { bedId: 'سرير ١٠٣', residentName: 'العم محمد عبدالمحسن العتيبي' }
          ]
        },
        {
          name: '🌿 جناح الريحان - الطابق الأول',
          beds: [
            { bedId: 'سرير ٢٠١', residentName: 'العم خالد سعد القحطاني' },
            { bedId: 'سرير ٢٠٢', residentName: 'العم فيصل عبدالعزيز بن راشد' }
          ]
        },
        {
          name: '🌺 جناح الجوري - الطابق الثاني',
          beds: [
            { bedId: 'سرير ٣٠١', residentName: 'العم منصور خلف الدوسري' },
            { bedId: 'سرير ٣٠٢', residentName: 'العم عبدالله صالح العسيري' },
            { bedId: 'سرير ٣٠٣', residentName: 'العم فهد محمد الرويلي' }
          ]
        }
      ];

      for (let i = 0; i < defaultWings.length; i++) {
        const wingDocRef = doc(wingsCol, `wing_0${i + 1}`);
        await setDoc(wingDocRef, defaultWings[i]);
      }
      console.log('Wings successfully seeded!');
    }
  } catch (err) {
    console.error('Error seeding default wings:', err);
  }
}

let unsubscribeWings: (() => void) | null = null;
let wingsDelegationSetup = false;

async function initWingsAndBeds() {
  await seedDefaultWingsAndBeds();
  
  if (unsubscribeWings) {
    unsubscribeWings();
  }

  try {
    const wingsCol = collection(db, 'wings');
    unsubscribeWings = onSnapshot(wingsCol, (snapshot) => {
      // Preserve current selection if possible
      const prevSelectedWingId = selectedWing ? selectedWing.id : null;
      const prevSelectedBedId = selectedBed ? selectedBed.bedId : null;

      wingsList = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        wingsList.push({
          id: docSnap.id,
          name: data.name,
          beds: data.beds || []
        });
      });

      console.log(`Loaded ${wingsList.length} wings in real-time.`);

      // 1. Populate Worker SOS Wing Dropdown
      if (sosWingSelect) {
        sosWingSelect.innerHTML = '<option value="general">🚨 نداء عام (كامل المركز)</option>';
        wingsList.forEach((wing) => {
          const option = document.createElement('option');
          option.value = wing.id;
          option.textContent = wing.name;
          sosWingSelect.appendChild(option);
        });

        // Restore selection if it still exists
        if (prevSelectedWingId && wingsList.some(w => w.id === prevSelectedWingId)) {
          sosWingSelect.value = prevSelectedWingId;
          selectedWing = wingsList.find(w => w.id === prevSelectedWingId) || null;
          
          if (selectedWing && sosBedSelect) {
            sosBedSelect.disabled = false;
            sosBedSelect.innerHTML = '';
            selectedWing.beds.forEach((bed) => {
              const option = document.createElement('option');
              option.value = bed.bedId;
              option.textContent = bed.bedId;
              sosBedSelect.appendChild(option);
            });

            if (prevSelectedBedId && selectedWing.beds.some(b => b.bedId === prevSelectedBedId)) {
              sosBedSelect.value = prevSelectedBedId;
              selectedBed = selectedWing.beds.find(b => b.bedId === prevSelectedBedId) || null;
            } else if (selectedWing.beds.length > 0) {
              selectedBed = selectedWing.beds[0];
              sosBedSelect.value = selectedBed.bedId;
            } else {
              selectedBed = null;
            }
            updateResidentBio();
          }
        } else {
          sosWingSelect.value = 'general';
          if (sosBedSelect) {
            sosBedSelect.disabled = true;
            sosBedSelect.innerHTML = '<option value="none">-- اختر الجناح أولاً --</option>';
          }
          if (selectedResidentBio) selectedResidentBio.classList.add('hidden');
          selectedWing = null;
          selectedBed = null;
        }
      }

      // 2. Populate Owner "Add Bed to Wing" Dropdown
      if (bedWingSelect) {
        bedWingSelect.innerHTML = '';
        wingsList.forEach((wing) => {
          const option = document.createElement('option');
          option.value = wing.id;
          option.textContent = wing.name;
          bedWingSelect.appendChild(option);
        });
      }

      // 3. Populate Owner Wings Registry View (List with beds, residents, and delete buttons)
      if (wingsRegistryContainer) {
        wingsRegistryContainer.innerHTML = '';
        if (wingsList.length === 0) {
          wingsRegistryContainer.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center">لا توجد أجنحة مسجلة حالياً.</p>`;
          return;
        }

        wingsList.forEach((wing) => {
          const wingDiv = document.createElement('div');
          wingDiv.className = 'p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 text-xs transition-all space-y-2';
          
          let bedsHtml = '';
          if (wing.beds.length === 0) {
            bedsHtml = `<p class="text-[10px] text-slate-400 dark:text-slate-500 italic pr-2">لا توجد أسرة في هذا الجناح بعد.</p>`;
          } else {
            bedsHtml = `
              <div class="space-y-1.5 pl-2">
                ${wing.beds.map((b, idx) => `
                  <div class="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60">
                    <div class="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                      <span>🛏️ ${b.bedId}</span>
                      <span class="text-slate-300 dark:text-slate-700">|</span>
                      <span class="text-slate-500 dark:text-slate-400">👤 المقيم: ${b.residentName}</span>
                    </div>
                    <div class="flex items-center gap-1">
                      <button class="edit-bed-btn text-indigo-500 hover:text-indigo-700 p-1" 
                              data-wing-id="${wing.id}" 
                              data-bed-index="${idx}" 
                              data-bed-id="${b.bedId}" 
                              data-resident="${b.residentName}" 
                              title="تعديل السرير والمقيم">
                        ✏️
                      </button>
                      <button class="delete-bed-btn text-red-500 hover:text-red-700 p-1" data-wing-id="${wing.id}" data-bed-index="${idx}" title="حذف السرير">
                        🗑️
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            `;
          }

          wingDiv.innerHTML = `
            <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-1.5">
              <div class="flex items-center gap-1.5">
                <span class="font-extrabold text-slate-800 dark:text-slate-100">${wing.name}</span>
                <button class="edit-wing-btn text-indigo-500 hover:text-indigo-700 text-xs p-1" 
                        data-wing-id="${wing.id}" 
                        data-wing-name="${wing.name}" 
                        title="تعديل اسم الجناح">
                  ✏️
                </button>
              </div>
              <button class="delete-wing-btn text-xs text-red-600 hover:text-red-700 font-bold px-2 py-0.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition-all" data-wing-id="${wing.id}">
                🗑️ حذف الجناح
              </button>
            </div>
            ${bedsHtml}
          `;
          wingsRegistryContainer.appendChild(wingDiv);
        });
      }
    });

    // Static Event Delegation for Wings & Beds Registry (Attached once)
    if (wingsRegistryContainer && !wingsDelegationSetup) {
      wingsDelegationSetup = true;
      wingsRegistryContainer.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;

        // 1. Edit Wing Button
        const editWingBtn = target.closest('.edit-wing-btn') as HTMLElement | null;
        if (editWingBtn) {
          e.preventDefault();
          e.stopPropagation();
          const wingId = editWingBtn.getAttribute('data-wing-id');
          const wingName = editWingBtn.getAttribute('data-wing-name');

          editOverlay.classList.remove('hidden');
          editModalTitle.textContent = '✏️ تعديل اسم الجناح';
          editType.value = 'wing';
          editTargetId.value = wingId || '';
          editSubIndex.value = '';

          editUserFields.classList.add('hidden');
          editWingFields.classList.remove('hidden');
          editBedFields.classList.add('hidden');

          editWingNameInput.value = wingName || '';
          return;
        }

        // 2. Edit Bed Button
        const editBedBtn = target.closest('.edit-bed-btn') as HTMLElement | null;
        if (editBedBtn) {
          e.preventDefault();
          e.stopPropagation();
          const wingId = editBedBtn.getAttribute('data-wing-id');
          const bedIndex = editBedBtn.getAttribute('data-bed-index');
          const bedId = editBedBtn.getAttribute('data-bed-id');
          const resident = editBedBtn.getAttribute('data-resident');

          editOverlay.classList.remove('hidden');
          editModalTitle.textContent = '✏️ تعديل السرير والمقيم';
          editType.value = 'bed';
          editTargetId.value = wingId || '';
          editSubIndex.value = bedIndex || '';

          editUserFields.classList.add('hidden');
          editWingFields.classList.add('hidden');
          editBedFields.classList.remove('hidden');

          editBedIdInput.value = bedId || '';
          editBedResidentInput.value = resident || '';
          return;
        }

        // 3. Delete Wing Button
        const deleteWingBtn = target.closest('.delete-wing-btn') as HTMLElement | null;
        if (deleteWingBtn) {
          e.preventDefault();
          e.stopPropagation();
          const wingId = deleteWingBtn.getAttribute('data-wing-id');
          if (wingId) {
            const confirmed = await customConfirm(
              currentLang === 'ar'
                ? 'هل أنت متأكد من رغبتك في حذف هذا الجناح بالكامل وجميع الأسرة الملحقة به؟'
                : 'Are you sure you want to delete this entire wing and all beds attached to it?'
            );
            if (confirmed) {
              try {
                await deleteDoc(doc(db, 'wings', wingId));
                console.log('Wing deleted successfully');
                alert(
                  currentLang === 'ar'
                    ? '✅ تم حذف الجناح وجميع الأسرة الملحقة به بنجاح!'
                    : '✅ Wing and all of its beds deleted successfully!'
                );
              } catch (err: any) {
                console.error('Error deleting wing:', err);
                alert(
                  (currentLang === 'ar' ? 'عذراً، فشل حذف الجناح: ' : 'Sorry, failed to delete wing: ') + err.message
                );
              }
            }
          }
          return;
        }

        // 4. Delete Bed Button
        const deleteBedBtn = target.closest('.delete-bed-btn') as HTMLElement | null;
        if (deleteBedBtn) {
          e.preventDefault();
          e.stopPropagation();
          const wingId = deleteBedBtn.getAttribute('data-wing-id');
          const bedIndexStr = deleteBedBtn.getAttribute('data-bed-index');
          if (wingId && bedIndexStr !== null) {
            const bedIndex = parseInt(bedIndexStr, 10);
            const wing = wingsList.find(w => w.id === wingId);
            if (wing) {
              const confirmed = await customConfirm(
                currentLang === 'ar'
                  ? 'هل أنت متأكد من رغبتك في حذف هذا السرير ومقيمه؟'
                  : 'Are you sure you want to delete this bed and its resident?'
              );
              if (confirmed) {
                try {
                  const updatedBeds = [...wing.beds];
                  updatedBeds.splice(bedIndex, 1);
                  await updateDoc(doc(db, 'wings', wingId), {
                    beds: updatedBeds
                  });
                  console.log('Bed deleted successfully');
                  alert(
                    currentLang === 'ar' ? '✅ تم حذف السرير والمقيم بنجاح!' : '✅ Bed and resident deleted successfully!'
                  );
                } catch (err: any) {
                  console.error('Error deleting bed:', err);
                  alert(
                    (currentLang === 'ar' ? 'عذراً، فشل حذف السرير: ' : 'Sorry, failed to delete bed: ') + err.message
                  );
                }
              }
            }
          }
          return;
        }
      });
    }

    // Populate drop-down listeners once
    if (sosWingSelect) {
      sosWingSelect.addEventListener('change', () => {
        const wingId = sosWingSelect.value;
        if (wingId === 'general') {
          if (sosBedSelect) {
            sosBedSelect.disabled = true;
            sosBedSelect.innerHTML = '<option value="none">-- اختر الجناح أولاً --</option>';
          }
          if (selectedResidentBio) {
            selectedResidentBio.classList.add('hidden');
          }
          selectedWing = null;
          selectedBed = null;
        } else {
          selectedWing = wingsList.find(w => w.id === wingId) || null;
          if (selectedWing && sosBedSelect) {
            sosBedSelect.disabled = false;
            sosBedSelect.innerHTML = '';
            selectedWing.beds.forEach((bed) => {
              const option = document.createElement('option');
              option.value = bed.bedId;
              option.textContent = bed.bedId;
              sosBedSelect.appendChild(option);
            });
            
            if (selectedWing.beds.length > 0) {
              selectedBed = selectedWing.beds[0];
              sosBedSelect.value = selectedBed.bedId;
              updateResidentBio();
            } else {
              selectedBed = null;
              if (selectedResidentBio) selectedResidentBio.classList.add('hidden');
            }
          }
        }
      });
    }

    if (sosBedSelect) {
      sosBedSelect.addEventListener('change', () => {
        if (selectedWing) {
          const bedId = sosBedSelect.value;
          selectedBed = selectedWing.beds.find(b => b.bedId === bedId) || null;
          updateResidentBio();
        }
      });
    }

    // Register Form submissions for Wing & Bed additions (Owner management)
    if (addWingForm) {
      addWingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameVal = newWingName.value.trim();
        if (!nameVal) return;

        try {
          const newWingRef = doc(collection(db, 'wings'));
          await setDoc(newWingRef, {
            name: nameVal,
            beds: []
          });
          newWingName.value = '';
          alert(currentLang === 'ar' ? '✨ تم إضافة الجناح الجديد بنجاح!' : '✨ New wing added successfully!');
        } catch (err: any) {
          alert((currentLang === 'ar' ? 'حدث خطأ أثناء إضافة الجناح: ' : 'An error occurred while adding the wing: ') + err.message);
        }
      });
    }

    if (addBedForm) {
      addBedForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const wingId = bedWingSelect.value;
        const bedIdVal = newBedId.value.trim();
        const residentVal = newResidentName.value.trim();
        
        if (!wingId || !bedIdVal || !residentVal) return;

        const wing = wingsList.find(w => w.id === wingId);
        if (wing) {
          const exists = wing.beds.some(b => b.bedId === bedIdVal);
          if (exists) {
            alert(currentLang === 'ar' ? '⚠️ هذا السرير مسجل بالفعل في هذا الجناح!' : '⚠️ This bed is already registered in this wing!');
            return;
          }

          try {
            const updatedBeds = [...wing.beds, { bedId: bedIdVal, residentName: residentVal }];
            await updateDoc(doc(db, 'wings', wingId), {
              beds: updatedBeds
            });
            newBedId.value = '';
            newResidentName.value = '';
            alert(currentLang === 'ar' ? '✨ تم إضافة السرير والمقيم بنجاح!' : '✨ Bed and resident added successfully!');
          } catch (err: any) {
            alert((currentLang === 'ar' ? 'حدث خطأ أثناء إضافة السرير: ' : 'An error occurred while adding the bed: ') + err.message);
          }
        }
      });
    }

  } catch (err) {
    console.error('Error loading wings:', err);
  }
}

function updateResidentBio() {
  if (selectedBed) {
    if (selectedResidentName) selectedResidentName.textContent = selectedBed.residentName;
    if (selectedResidentBio) selectedResidentBio.classList.remove('hidden');
  } else {
    if (selectedResidentBio) selectedResidentBio.classList.add('hidden');
  }
}

async function handleLogin(e: Event) {
  e.preventDefault();
  loginErrorAlert.classList.add('hidden');
  
  const username = loginUsernameInput.value.trim().toLowerCase();
  const password = loginPasswordInput.value;
  
  try {
    const usersCol = collection(db, 'users');
    const q = query(usersCol);
    const querySnapshot = await getDocs(q);
    
    let authenticatedUser: AppUser | null = null;
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.username === username && data.password === password) {
        authenticatedUser = {
          username: data.username,
          role: data.role as any,
          name: data.name
        };
      }
    });
    
    if (authenticatedUser) {
      currentUser = authenticatedUser;
      localStorage.setItem('sos_user_session', JSON.stringify(currentUser));
      applySessionUI();
    } else {
      loginErrorAlert.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Login error:', error);
    // Safe offline fallback
    const localDefaults = [
      { username: 'admin', password: '123', name: 'المالك (المدير)', role: 'المالك' },
      { username: 'worker', password: '123', name: 'عامل الصيانة', role: 'عامل' },
      { username: 'tech', password: '123', name: 'الطوارئ', role: 'الطوارئ' },
      { username: 'monitor', password: '123', name: 'مراقب العمليات', role: 'مراقب' }
    ];
    const matched = localDefaults.find(u => u.username === username && u.password === password);
    if (matched) {
      currentUser = {
        username: matched.username,
        role: matched.role as any,
        name: matched.name
      };
      localStorage.setItem('sos_user_session', JSON.stringify(currentUser));
      applySessionUI();
    } else {
      loginErrorAlert.classList.remove('hidden');
    }
  }
}

function setTvMode(enable: boolean) {
  const standardHeader = document.querySelector('body > header') as HTMLElement | null;
  const userStatusBanner = document.getElementById('user-status-banner');
  const mainContainer = document.getElementById('main-container');
  const tvDashboard = document.getElementById('smart-tv-dashboard');

  if (enable) {
    if (standardHeader) standardHeader.classList.add('hidden');
    if (userStatusBanner) userStatusBanner.classList.add('hidden');
    if (mainContainer) mainContainer.classList.add('hidden');
    if (tvDashboard) tvDashboard.classList.remove('hidden');
  } else {
    if (standardHeader) standardHeader.classList.remove('hidden');
    if (userStatusBanner && currentUser) userStatusBanner.classList.remove('hidden');
    if (mainContainer) mainContainer.classList.remove('hidden');
    if (tvDashboard) tvDashboard.classList.add('hidden');
  }
}

// ==========================================
// 10. Google Maps & Geolocation Live Tracking
// ==========================================

function getCurrentCoordinates(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        console.warn("Could not get current coordinates:", error.message);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  });
}

function getFallbackCoordinates(id: string): { lat: number; lng: number } {
  let seed = 0;
  for (let i = 0; i < id.length; i++) {
    seed += id.charCodeAt(i);
  }
  // Deterministic fallback coordinates near Riyadh Center
  const offsetLat = ((seed * 17) % 100) / 2000 - 0.025;
  const offsetLng = ((seed * 23) % 100) / 2000 - 0.025;
  return {
    lat: 24.7136 + offsetLat,
    lng: 46.6753 + offsetLng
  };
}

async function updateUserLocationInFirestore(lat: number, lng: number) {
  if (!currentUser) return;
  try {
    const nameVal = currentUser.name;
    const roleVal = currentUser.role;
    const usernameVal = currentUser.username;

    const docRef = doc(db, 'user_locations', deviceId);
    try {
      // To prevent race conditions after logout (where the document is deleted),
      // we use updateDoc. If it fails because the document was deleted, we do NOT recreate it
      // unless we verify we are still logged in and explicitly initialize it.
      await updateDoc(docRef, {
        token: activeToken || '',
        username: usernameVal,
        name: nameVal,
        role: roleVal,
        lat: lat,
        lng: lng,
        updatedAt: serverTimestamp(),
        status: isAlarmPlaying ? 'sos' : 'online'
      });
      console.log(`Firestore location updated (updateDoc): ${lat}, ${lng} for device ${deviceId}`);
    } catch (updateError: any) {
      // If document doesn't exist yet and we are still logged in, initialize with setDoc
      if (currentUser) {
        await setDoc(docRef, {
          deviceId,
          token: activeToken || '',
          username: usernameVal,
          name: nameVal,
          role: roleVal,
          lat: lat,
          lng: lng,
          updatedAt: serverTimestamp(),
          status: isAlarmPlaying ? 'sos' : 'online'
        }, { merge: true });
        console.log(`Firestore location initialized (setDoc): ${lat}, ${lng} for device ${deviceId}`);
      }
    }
  } catch (error) {
    console.error("Error updating location in Firestore:", error);
  }
}

async function startGPSTracking() {
  if (!currentUser) return;

  if (gpsWatchId !== null) {
    return; // Already tracking
  }

  // Set up immediate fallback first to make sure device appears on map instantly under any testing conditions
  const fallback = getFallbackCoordinates(deviceId);
  await updateUserLocationInFirestore(fallback.lat, fallback.lng);

  if (!navigator.geolocation) {
    console.warn("Geolocation is not supported by this browser. Using fallback coordinates.");
    return;
  }

  // Attempt to update with actual GPS coordinate immediately if available
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      await updateUserLocationInFirestore(position.coords.latitude, position.coords.longitude);
    },
    (error) => {
      console.warn("Initial GPS fetch failed, continuing with fallback. Error:", error.message);
    },
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
  );

  // Set up the watchPosition for dynamic real-time tracking
  gpsWatchId = navigator.geolocation.watchPosition(
    async (position) => {
      await updateUserLocationInFirestore(position.coords.latitude, position.coords.longitude);
    },
    (error) => {
      console.warn("GPS tracking watch error:", error.message);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

function stopGPSTracking() {
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
}

async function initOwnerMap() {
  const mapCanvas = document.getElementById('map-canvas');
  if (!mapCanvas) return;

  // Reset map focus state to allow initial centering
  mapHasFocusedOnce = false;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyC2OXlAQy8Xr8omGeQNTjxSl_tYhRVk2JM";
  setOptions({
    key: apiKey,
    v: "weekly"
  });

  try {
    const { Map } = await importLibrary('maps') as google.maps.MapsLibrary;
    const { AdvancedMarkerElement, PinElement } = await importLibrary('marker') as google.maps.MarkerLibrary;

    // Initialize Map
    mapInstance = new Map(mapCanvas, {
      center: { lat: 24.7136, lng: 46.6753 }, // Riyadh center by default
      zoom: 12,
      mapId: 'DEMO_MAP_ID'
    });

    console.log('Google Map initialized successfully on Owner Dashboard!');

    // Start listening to real-time locations of all users
    listenToUserLocations(AdvancedMarkerElement, PinElement);

  } catch (error) {
    console.error('Failed to load Google Maps:', error);
    mapCanvas.innerHTML = `<div class="p-6 text-center text-xs text-red-500 font-bold bg-red-500/5 h-full flex items-center justify-center">⚠️ فشل تحميل خرائط جوجل: يرجى التحقق من مفتاح الـ API وصلاحيته.</div>`;
  }
}

function listenToUserLocations(AdvancedMarkerElement: any, PinElement: any) {
  if (unsubscribeLocations) {
    unsubscribeLocations();
  }

  // Ensure periodic cleanup interval is active to sweep away inactive/logged-out devices immediately
  if (!staleMarkerCleanupInterval) {
    staleMarkerCleanupInterval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, lastTime] of lastMarkerUpdate.entries()) {
        if (now - lastTime > 40000) { // 40 seconds stale threshold
          const marker = activeMarkers.get(id);
          if (marker) {
            marker.map = null;
            activeMarkers.delete(id);
          }
          lastMarkerUpdate.delete(id);
          changed = true;
          console.log(`Cleaned up stale inactive device marker: ${id}`);
        }
      }
      if (changed && mapInstance && activeMarkers.size > 0) {
        const bounds = new google.maps.LatLngBounds();
        for (const marker of activeMarkers.values()) {
          if (marker.position) bounds.extend(marker.position);
        }
        mapInstance.fitBounds(bounds);
      }
    }, 5000);
  }

  unsubscribeLocations = onSnapshot(collection(db, 'user_locations'), (snapshot) => {
    const activeIds = new Set<string>();
    const now = Date.now();

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;

      // Heartbeat stale check: If updatedAt is older than 40 seconds, skip entirely (consider offline)
      let isStale = false;
      if (data.updatedAt) {
        const updatedTime = data.updatedAt.seconds ? data.updatedAt.seconds * 1000 : now;
        if (now - updatedTime > 40000) {
          isStale = true;
        }
      }

      if (isStale) {
        return; // Don't add to activeIds, so it will be cleaned up/removed
      }

      activeIds.add(id);
      lastMarkerUpdate.set(id, now); // Update local heartbeat timestamp

      const lat = data.lat;
      const lng = data.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;

      const position = { lat, lng };
      const name = data.name || data.username || 'مستخدم هاتف';
      const role = data.role || 'عامل';
      const status = data.status || 'online';

      let pinBackground = '#10b981'; // Green for normal online
      let pinBorderColor = '#047857';
      let pinGlyph = '🟢';

      if (status === 'sos') {
        pinBackground = '#ef4444'; // Red pulsing for active SOS
        pinBorderColor = '#b91c1c';
        pinGlyph = '🚨';
      }

      const pin = new PinElement({
        background: pinBackground,
        borderColor: pinBorderColor,
        glyph: pinGlyph,
        scale: status === 'sos' ? 1.2 : 1.0
      });

      if (activeMarkers.has(id)) {
        const marker = activeMarkers.get(id)!;
        marker.position = position;
        marker.content = pin.element;
      } else {
        const marker = new AdvancedMarkerElement({
          map: mapInstance,
          position: position,
          title: `${name} (${translateRole(role)})`,
          content: pin.element
        });

        // Add infowindow
        const infoContent = document.createElement('div');
        infoContent.className = 'p-3 text-right text-slate-800 font-sans';
        infoContent.dir = 'rtl';
        infoContent.innerHTML = `
          <h4 class="font-bold text-xs text-slate-900 border-b border-slate-100 pb-1.5 mb-1.5 flex items-center gap-1">
            <span>${status === 'sos' ? '🚨' : '🟢'}</span>
            <span>${name}</span>
          </h4>
          <div class="space-y-1 text-[10px] font-semibold text-slate-500">
            <p>الدور: <span class="text-slate-700">${translateRole(role)}</span></p>
            <p>الهاتف FCM Token: <span class="text-slate-700 font-mono text-[9px]" title="${data.token}">${data.token ? data.token.substring(0, 15) + '...' : 'غير متوفر'}</span></p>
            <p>الموقع: <span class="text-slate-700 font-mono">${lat.toFixed(5)}, ${lng.toFixed(5)}</span></p>
            <p>آخر تحديث: <span class="text-slate-700 font-mono">${data.updatedAt ? new Date(data.updatedAt.seconds * 1000).toLocaleTimeString() : 'الآن'}</span></p>
          </div>
        `;

        const infoWindow = new google.maps.InfoWindow({
          content: infoContent
        });

        marker.addListener('click', () => {
          infoWindow.open(mapInstance, marker);
        });

        activeMarkers.set(id, marker);
      }
    });

    for (const [id, marker] of activeMarkers.entries()) {
      if (!activeIds.has(id)) {
        marker.map = null;
        activeMarkers.delete(id);
        lastMarkerUpdate.delete(id);
      }
    }

    if (mapInstance && activeMarkers.size > 0 && !mapHasFocusedOnce) {
      const bounds = new google.maps.LatLngBounds();
      for (const marker of activeMarkers.values()) {
        if (marker.position) {
          bounds.extend(marker.position as google.maps.LatLng);
        }
      }
      
      if (activeMarkers.size === 1) {
        const singlePos = Array.from(activeMarkers.values())[0].position;
        if (singlePos) {
          mapInstance.setCenter(singlePos as google.maps.LatLng);
          mapInstance.setZoom(15);
        }
      } else {
        mapInstance.fitBounds(bounds);
      }
      mapHasFocusedOnce = true;
    }
  }, (error) => {
    console.error("Error fetching user locations:", error);
  });
}

function applySessionUI() {
  const reportsSection = document.getElementById('reports-section') as HTMLElement | null;

  const params = new URLSearchParams(window.location.search);
  const forceTv = params.has('view') && params.get('view') === 'tv';

  if (currentUser) {
    loginOverlay.classList.add('hidden');
    userStatusBanner.classList.remove('hidden');
    activeUserName.textContent = currentUser.name;
    activeUserRole.textContent = translateRole(currentUser.role);

    // Request notification permission and refresh the FCM token immediately on login, then start GPS tracking to ensure absolute accuracy
    setupNotifications().then(() => {
      startGPSTracking();
    }).catch((err) => {
      console.warn("FCM token setup failed/rejected on login, fallback to direct tracking:", err);
      startGPSTracking();
    });

    // Load Google Map if they have access to the monitor panel
    if (currentUser.role === 'مراقب' || currentUser.role === 'الطوارئ' || currentUser.role === 'المالك') {
      initOwnerMap();
    }
    
    // Show/hide Switch back to TV Mode button based on role & standard mode preference
    if (switchTvBtn) {
      if ((currentUser.role === 'مراقب' || currentUser.role === 'المالك' || currentUser.role === 'الطوارئ') && sessionStorage.getItem('prefer_standard_mode') === 'true') {
        switchTvBtn.classList.remove('hidden');
      } else {
        switchTvBtn.classList.add('hidden');
      }
    }

    // Toggle between the worker-centric SOS view and the controller-centric monitor view
    if (currentUser.role === 'مراقب' || currentUser.role === 'الطوارئ' || currentUser.role === 'المالك') {
      if (monitorPanel) monitorPanel.classList.remove('hidden');
      if (workerPanel) workerPanel.classList.add('hidden');
    } else {
      if (monitorPanel) monitorPanel.classList.add('hidden');
      if (workerPanel) workerPanel.classList.remove('hidden');
    }

    if (currentUser.role === 'المالك') {
      connectionStatusSection.classList.remove('hidden');
      sosChannelsSettingsSection.classList.remove('hidden');
      userManagementSection.classList.remove('hidden');
      wingManagementSection.classList.remove('hidden');
      if (reportsSection) reportsSection.classList.remove('hidden');
      listenToUsersList();
      listenToResolvedCallsReport();
    } else {
      connectionStatusSection.classList.add('hidden');
      sosChannelsSettingsSection.classList.add('hidden');
      userManagementSection.classList.add('hidden');
      wingManagementSection.classList.add('hidden');
      if (reportsSection) reportsSection.classList.add('hidden');
      if (unsubscribeUsers) {
        unsubscribeUsers();
        unsubscribeUsers = null;
      }
      if (unsubscribeRecentResolvedCalls) {
        unsubscribeRecentResolvedCalls();
        unsubscribeRecentResolvedCalls = null;
      }
    }

    if (currentUser.role === 'مراقب' || currentUser.role === 'الطوارئ' || currentUser.role === 'المالك') {
      activeAlertsDashboard.classList.remove('hidden');
      listenToActiveAlerts();
    } else {
      activeAlertsDashboard.classList.add('hidden');
      if (unsubscribeActiveAlerts) {
        unsubscribeActiveAlerts();
        unsubscribeActiveAlerts = null;
      }
      if (isAlarmPlaying) {
        stopSiren();
      }
    }
  } else {
    // Stop GPS tracking and remove user location on logout so they don't stay on the map
    stopGPSTracking();
    deleteDoc(doc(db, 'user_locations', deviceId)).catch((err) => console.error("Error clearing location on logout:", err));

    if (unsubscribeLocations) {
      unsubscribeLocations();
      unsubscribeLocations = null;
    }
    // Clear active map markers and instance since map is hidden
    for (const marker of activeMarkers.values()) {
      marker.map = null;
    }
    activeMarkers.clear();
    lastMarkerUpdate.clear();
    if (staleMarkerCleanupInterval) {
      clearInterval(staleMarkerCleanupInterval);
      staleMarkerCleanupInterval = null;
    }
    mapInstance = null;

    loginOverlay.classList.remove('hidden');
    userStatusBanner.classList.add('hidden');
    loginUsernameInput.value = '';
    loginPasswordInput.value = '';
    
    if (isAlarmPlaying) {
      stopSiren();
    }
    
    if (workerPanel) workerPanel.classList.add('hidden');
    if (monitorPanel) monitorPanel.classList.add('hidden');
    
    connectionStatusSection.classList.add('hidden');
    sosChannelsSettingsSection.classList.add('hidden');
    userManagementSection.classList.add('hidden');
    wingManagementSection.classList.add('hidden');
    activeAlertsDashboard.classList.add('hidden');
    if (reportsSection) reportsSection.classList.add('hidden');
    if (unsubscribeUsers) {
      unsubscribeUsers();
      unsubscribeUsers = null;
    }
    if (unsubscribeActiveAlerts) {
      unsubscribeActiveAlerts();
      unsubscribeActiveAlerts = null;
    }
    if (unsubscribeRecentResolvedCalls) {
      unsubscribeRecentResolvedCalls();
      unsubscribeRecentResolvedCalls = null;
    }
    if (switchTvBtn) switchTvBtn.classList.add('hidden');
  }

  // Handle Smart TV layout activation based on Role or URL Param and user's session preference
  const preferStandard = sessionStorage.getItem('prefer_standard_mode') === 'true';
  if (((currentUser && (currentUser.role === 'مراقب' || currentUser.role === 'الطوارئ')) && !preferStandard) || forceTv) {
    setTvMode(true);
    listenToActiveAlerts();
  } else {
    setTvMode(false);
  }
  
  // Re-subscribe to recent alerts to update visibility of deletion buttons dynamically
  listenToRecentAlerts();
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem('sos_user_session');
  sessionStorage.removeItem('prefer_standard_mode');
  
  // Stop GPS tracking and remove device location from Firestore securely
  stopGPSTracking();
  deleteDoc(doc(db, 'user_locations', deviceId)).catch((err) => console.error("Error clearing location on logout:", err));
  
  applySessionUI();
}

function checkStoredSession() {
  const stored = localStorage.getItem('sos_user_session');
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
    } catch (e) {
      currentUser = null;
    }
  }
  applySessionUI();
}

// Set up listeners
loginForm.addEventListener('submit', handleLogin);
logoutBtn.addEventListener('click', handleLogout);

const recenterMapBtn = document.getElementById('btn-recenter-map');
if (recenterMapBtn) {
  recenterMapBtn.addEventListener('click', () => {
    mapHasFocusedOnce = false;
    if (mapInstance && activeMarkers.size > 0) {
      const bounds = new google.maps.LatLngBounds();
      for (const marker of activeMarkers.values()) {
        if (marker.position) bounds.extend(marker.position as google.maps.LatLng);
      }
      if (activeMarkers.size === 1) {
        const singlePos = Array.from(activeMarkers.values())[0].position;
        if (singlePos) {
          mapInstance.setCenter(singlePos as google.maps.LatLng);
          mapInstance.setZoom(15);
        }
      } else {
        mapInstance.fitBounds(bounds);
      }
      console.log('Map centered manually on active markers.');
    }
  });
}

if (switchTvBtn) {
  switchTvBtn.addEventListener('click', () => {
    sessionStorage.removeItem('prefer_standard_mode');
    applySessionUI();
  });
}
addUserForm.addEventListener('submit', handleAddUser);

// Close Edit Modal
closeEditModalBtn.addEventListener('click', () => {
  editOverlay.classList.add('hidden');
});

// Submit Edit Form to Firestore
editModalForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const type = editType.value;
  const targetId = editTargetId.value;
  const subIndexStr = editSubIndex.value;

  if (!targetId) return;

  try {
    if (type === 'user') {
      const name = editUserNameInput.value.trim();
      const username = editUserUsernameInput.value.trim().toLowerCase();
      const password = editUserPasswordInput.value;
      const role = editUserRoleInput.value;

      if (!name || !username || !password) {
        alert(currentLang === 'ar' ? 'يرجى ملء جميع حقول المستخدم.' : 'Please fill in all user fields.');
        return;
      }

      await updateDoc(doc(db, 'users', targetId), {
        name,
        username,
        password,
        role
      });
      
      alert(currentLang === 'ar' ? '✅ تم تعديل بيانات المستخدم بنجاح في قاعدة البيانات!' : '✅ User details updated successfully in the database!');
      editOverlay.classList.add('hidden');

    } else if (type === 'wing') {
      const name = editWingNameInput.value.trim();
      if (!name) {
        alert(currentLang === 'ar' ? 'يرجى إدخال اسم الجناح.' : 'Please enter the wing name.');
        return;
      }

      await updateDoc(doc(db, 'wings', targetId), {
        name
      });

      alert(currentLang === 'ar' ? '✅ تم تعديل اسم الجناح بنجاح في قاعدة البيانات!' : '✅ Wing name updated successfully in the database!');
      editOverlay.classList.add('hidden');

    } else if (type === 'bed') {
      const bedId = editBedIdInput.value.trim();
      const resident = editBedResidentInput.value.trim();
      const subIdx = parseInt(subIndexStr, 10);

      if (!bedId || !resident || isNaN(subIdx)) {
        alert(currentLang === 'ar' ? 'يرجى إدخال رمز السرير واسم المقيم.' : 'Please enter the bed ID and resident name.');
        return;
      }

      // Read current wing doc, modify its beds array, and write it back
      const wingRef = doc(db, 'wings', targetId);
      const wingSnap = await getDoc(wingRef);
      if (wingSnap.exists()) {
        const wingData = wingSnap.data();
        const beds = [...(wingData.beds || [])];
        if (beds[subIdx]) {
          beds[subIdx] = {
            bedId,
            residentName: resident
          };

          await updateDoc(wingRef, {
            beds
          });

          alert(currentLang === 'ar' ? '✅ تم تعديل بيانات السرير والمقيم بنجاح في قاعدة البيانات!' : '✅ Bed and resident details updated successfully in the database!');
          editOverlay.classList.add('hidden');
        } else {
          alert(currentLang === 'ar' ? 'خطأ: لم يتم العثور على السرير لتعديله.' : 'Error: Bed not found to edit.');
        }
      }
    }
  } catch (err: any) {
    console.error('Error saving edits:', err);
    alert(
      (currentLang === 'ar'
        ? 'عذراً، حدث خطأ أثناء تعديل البيانات: '
        : 'Sorry, an error occurred while updating the details: ') + (err.message || String(err))
    );
  }
});

// ==========================================
// 11. Core Bootstrapper
// ==========================================

function initApp() {
  try { initTheme(); } catch (e) { console.error('Error in initTheme:', e); }
  try { initLanguageToggle(); } catch (e) { console.error('Error in initLanguageToggle:', e); }
  try { setupNotifications(); } catch (e) { console.error('Error in setupNotifications:', e); }
  try { listenToDevicesCount(); } catch (e) { console.error('Error in listenToDevicesCount:', e); }
  try { listenToRecentAlerts(); } catch (e) { console.error('Error in listenToRecentAlerts:', e); }
  try { initSOSSettings(); } catch (e) { console.error('Error in initSOSSettings:', e); }
  try { loadEmergencySettings(); } catch (e) { console.error('Error in loadEmergencySettings:', e); }
  
  // Secure Authentication initialization
  // Report printing handler
  const printReportBtn = document.getElementById('print-report-btn');
  if (printReportBtn) {
    printReportBtn.addEventListener('click', () => {
      const printWrapper = document.getElementById('print-container-wrapper');
      if (printWrapper) {
        // We capture the fully formatted inner HTML of our print container!
        const htmlContent = printWrapper.innerHTML;
        
        // Let's create a beautiful clean plain text representation of the report for easy copying!
        const avgTime = document.getElementById('print-avg-time')?.textContent || '-';
        const totalCalls = document.getElementById('print-total-calls')?.textContent || '0';
        const excellentRate = document.getElementById('print-excellent-rate')?.textContent || '0%';
        const reportDate = document.getElementById('print-date')?.textContent || new Date().toLocaleString('ar-EG');
        
        const plainText = `📝 تقرير الأداء التشغيلي العام وسجل سرعة الاستجابة للنداءات المغلقة
--------------------------------------------------
تاريخ إصدار التقرير: ${reportDate}
المستلم: المالك (المدير)

📊 ملخص مؤشرات الأداء الرئيسية (KPIs):
- متوسط زمن الاستجابة للمركز: ${avgTime}
- إجمالي الحالات المحلولة: ${totalCalls}
- معدل الاستجابة القياسية الفورية: ${excellentRate}

تم توليد التقرير بنجاح من قاعدة البيانات المركزية لضمان الدقة التشغيلية.`;

        showPrintPreview(htmlContent, plainText, 'print-container-wrapper');
      }
    });
  }

  // Independent clean window preview printing handler (No buttons)
  const printReportTvBtn = document.getElementById('print-report-tv-btn');
  if (printReportTvBtn) {
    printReportTvBtn.addEventListener('click', () => {
      const printWrapper = document.getElementById('print-container-wrapper');
      if (printWrapper) {
        // Force the title and date to update to the latest values
        const printDate = document.getElementById('print-date');
        if (printDate) {
          printDate.textContent = new Date().toLocaleString('ar-EG');
        }
        
        const htmlContent = printWrapper.innerHTML;
        openPrintWindow(htmlContent, 'تقرير الأداء التشغيلي العام - نظام الاستغاثة الذكي SOS');
      }
    });
  }

  // Close Single Case Modal
  const closeCaseModal = document.getElementById('close-case-modal');
  const dismissCaseModal = document.getElementById('dismiss-case-modal');
  const singleCaseOverlay = document.getElementById('single-case-overlay');

  const hideCaseModal = () => {
    if (singleCaseOverlay) {
      singleCaseOverlay.classList.add('hidden');
    }
  };

  if (closeCaseModal) closeCaseModal.addEventListener('click', hideCaseModal);
  if (dismissCaseModal) dismissCaseModal.addEventListener('click', hideCaseModal);

  // Resolution Note Modal Event Listeners
  const resolveModalOverlay = document.getElementById('resolve-modal-overlay');
  const resolveModalForm = document.getElementById('resolve-modal-form') as HTMLFormElement | null;
  const resolveModalClose = document.getElementById('resolve-modal-close');
  const resolveModalCancelBtn = document.getElementById('resolve-modal-cancel-btn');
  const resolveTargetId = document.getElementById('resolve-target-id') as HTMLInputElement | null;
  const resolveNotesInput = document.getElementById('resolve-notes-input') as HTMLTextAreaElement | null;

  const hideResolveModal = () => {
    if (resolveModalOverlay) {
      resolveModalOverlay.classList.add('hidden');
    }
  };

  if (resolveModalClose) resolveModalClose.addEventListener('click', hideResolveModal);
  if (resolveModalCancelBtn) resolveModalCancelBtn.addEventListener('click', hideResolveModal);

  if (resolveModalForm) {
    resolveModalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = resolveTargetId ? resolveTargetId.value : '';
      const notes = resolveNotesInput ? resolveNotesInput.value.trim() : '';

      if (!id || !notes) {
        alert(currentLang === 'ar' ? 'يرجى كتابة تفاصيل كيفية حل البلاغ.' : 'Please enter details on how the alert was resolved.');
        return;
      }

      try {
        const resolverName = currentUser ? currentUser.name : 'المالك';
        await updateDoc(doc(db, 'emergency_calls', id), { 
          status: 'resolved',
          resolvedAt: serverTimestamp(),
          resolutionNotes: notes,
          resolvedBy: resolverName
        });
        console.log('Alert resolved with custom resolution notes.');

        // Update caller's location status back to online in Firestore
        try {
          const docRef = doc(db, 'emergency_calls', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const callData = docSnap.data();
            const callerDeviceId = callData.deviceId;
            if (callerDeviceId) {
              await setDoc(doc(db, 'user_locations', callerDeviceId), {
                status: 'online',
                updatedAt: serverTimestamp()
              }, { merge: true });
              console.log(`Caller device ${callerDeviceId} location status reset to online.`);
            }
          }
        } catch (gpsErr) {
          console.warn('Could not reset caller location status in user_locations:', gpsErr);
        }

        hideResolveModal();
        alert(
          currentLang === 'ar'
            ? '✅ تم إغلاق وحل البلاغ بنجاح وتوثيق كيفية الحل في التقارير وسجل الأداء!'
            : '✅ Alert resolved and closed successfully, documented in reports and performance logs!'
        );
      } catch (err: any) {
        console.error('Error marking alert as resolved:', err);
        alert(
          (currentLang === 'ar' ? 'عذراً، فشل إغلاق البلاغ: ' : 'Sorry, failed to close the alert: ') + (err.message || String(err))
        );
      }
    });
  }

  // Task 1: Static Event Delegation for Recent Alerts Logs
  if (alertsLog) {
    alertsLog.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const deleteBtn = target.closest('.delete-call-btn') as HTMLElement | null;
      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const callId = deleteBtn.getAttribute('data-id');
        if (callId) {
          const confirmed = await customConfirm(
            currentLang === 'ar'
              ? 'هل أنت متأكد من رغبتك في حذف هذا البلاغ بشكل نهائي من الأرشيف وقاعدة البيانات؟'
              : 'Are you sure you want to permanently delete this alert from the archive and database?'
          );
          if (confirmed) {
            try {
              await deleteDoc(doc(db, 'emergency_calls', callId));
              
              // Remove row/card from the DOM immediately (no reload required)
              const card = deleteBtn.closest('.p-3.rounded-2xl');
              if (card) {
                card.remove();
              }
              alert(currentLang === 'ar' ? '✅ تم حذف البلاغ بنجاح!' : '✅ Alert deleted successfully!');
            } catch (err: any) {
              console.error('Error deleting call:', err);
              alert(
                (currentLang === 'ar' ? 'عذراً، فشل حذف البلاغ: ' : 'Sorry, failed to delete alert: ') + (err.message || String(err))
              );
            }
          }
        }
      }
    });
  }

  // Task 1: Static Event Delegation for Resolved Reports Table
  const reportsTableBody = document.getElementById('report-table-body');
  if (reportsTableBody) {
    reportsTableBody.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const viewBtn = target.closest('.view-case-detail-btn') as HTMLElement | null;
      const deleteBtn = target.closest('.delete-case-btn') as HTMLElement | null;
      
      if (viewBtn) {
        e.preventDefault();
        e.stopPropagation();
        const callId = viewBtn.getAttribute('data-id');
        const matchedRow = allRowsResolvedCache.find(r => r.id === callId);
        if (matchedRow) {
          openDetailedCaseModal(matchedRow);
        }
      } else if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const callId = deleteBtn.getAttribute('data-id');
        if (callId) {
          const confirmed = await customConfirm(
            currentLang === 'ar'
              ? '⚠️ هل أنت متأكد من رغبتك في حذف ملف هذه الحالة نهائياً من أرشيف المركز الطبي؟ لا يمكن استعادة البيانات المحذوفة لاحقاً.'
              : '⚠️ Are you sure you want to permanently delete this case file from the medical center archive? Deleted data cannot be recovered.'
          );
          if (confirmed) {
            try {
              await deleteDoc(doc(db, 'emergency_calls', callId));
              
              // Remove row from the DOM immediately upon success (no page reload)
              const tr = deleteBtn.closest('tr');
              if (tr) {
                tr.remove();
              }
              alert(
                currentLang === 'ar'
                  ? '✅ تم حذف ملف الحالة بنجاح وتحديث الواجهة!'
                  : '✅ Case file deleted successfully and interface updated!'
              );
            } catch (err: any) {
              console.error('Error deleting case:', err);
              alert(
                (currentLang === 'ar' ? 'عذراً، حدث خطأ أثناء حذف الحالة: ' : 'Sorry, an error occurred while deleting the case: ') + (err.message || String(err))
              );
            }
          }
        }
      }
    });
  }

  // Task 1: Static Event Delegation for Users List Container
  if (usersListContainer) {
    usersListContainer.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      
      // Handle User Edit click delegation
      const editBtn = target.closest('.edit-user-btn') as HTMLElement | null;
      if (editBtn) {
        e.preventDefault();
        e.stopPropagation();
        const idToEdit = editBtn.getAttribute('data-id');
        
        editOverlay.classList.remove('hidden');
        editModalTitle.textContent = '✏️ تعديل بيانات المستخدم';
        editType.value = 'user';
        editTargetId.value = idToEdit || '';
        editSubIndex.value = '';

        editUserFields.classList.remove('hidden');
        editWingFields.classList.add('hidden');
        editBedFields.classList.add('hidden');

        editUserNameInput.value = editBtn.getAttribute('data-name') || '';
        editUserUsernameInput.value = editBtn.getAttribute('data-username') || '';
        editUserPasswordInput.value = editBtn.getAttribute('data-password') || '';
        editUserRoleInput.value = editBtn.getAttribute('data-role') || 'عامل';
        return;
      }

      // Handle User Delete click delegation using deleteUser function
      const deleteBtn = target.closest('.delete-user-btn') as HTMLElement | null;
      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const idToDelete = deleteBtn.getAttribute('data-id');
        if (idToDelete) {
          await deleteUser(idToDelete, deleteBtn);
        }
      }
    });
  }

  // Smart TV Dashboard Switch Standard button
  const tvSwitchStandardBtn = document.getElementById('tv-switch-standard-btn');
  if (tvSwitchStandardBtn) {
    tvSwitchStandardBtn.addEventListener('click', () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('view');
      window.history.pushState({}, '', url);
      sessionStorage.setItem('prefer_standard_mode', 'true');
      setTvMode(false);
      applySessionUI();
    });
  }

  // Central Clock & Active Timers ticks for Smart TV screen
  setInterval(() => {
    const timeEl = document.getElementById('tv-current-time');
    const dateEl = document.getElementById('tv-current-date');
    if (timeEl) {
      timeEl.textContent = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    }
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    const timers = document.querySelectorAll('[data-alert-time]');
    timers.forEach((timer) => {
      const startTime = parseInt(timer.getAttribute('data-alert-time') || '0', 10);
      const status = timer.getAttribute('data-status');
      if (startTime > 0) {
        const diffSecs = Math.max(0, Math.floor(Date.now() / 1000) - startTime);
        const m = Math.floor(diffSecs / 60);
        const s = diffSecs % 60;
        timer.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        
        if (diffSecs >= 180 && status !== 'processing') {
          timer.className = "text-red-500 font-extrabold animate-bounce text-2xl font-mono tracking-wider";
        } else {
          timer.className = "text-slate-300 text-2xl font-mono tracking-wider";
        }
      }
    });
  }, 1000);

  seedDefaultUsers();
  initWingsAndBeds();
  checkStoredSession();
  try {
    initVoiceTranslation();
  } catch (e) {
    console.error('Error in initVoiceTranslation:', e);
  }
}

// ==========================================
// 12. Smart Free Voice Translation Service (White-label, Zero Cost)
// ==========================================
function initVoiceTranslation() {
  const voiceRecordBtn = document.getElementById('voice-record-btn');
  const voiceLangSelect = document.getElementById('voice-lang-select') as HTMLSelectElement | null;
  const callerNotesInput = document.getElementById('sos-caller-notes') as HTMLInputElement | null;
  const voiceStatusIndicator = document.getElementById('voice-status-indicator');
  const translationStatusBanner = document.getElementById('translation-status-banner');
  const translationSpinner = document.getElementById('translation-spinner');
  const translationStatusText = document.getElementById('translation-status-text');
  const cancelTranslationBtn = document.getElementById('cancel-translation-btn');
  const micIcon = document.getElementById('mic-icon');
  const micActiveIcon = document.getElementById('mic-active-icon');

  if (!voiceRecordBtn) return;

  let isRecording = false;
  let currentRecognition: any = null;
  let translationAbortController: AbortController | null = null;

  // Initialize Speech Recognition
  const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  function showBanner(text: string, showSpinner = false, showCancel = false) {
    if (!translationStatusBanner || !translationStatusText) return;
    translationStatusBanner.classList.remove('hidden');
    translationStatusText.textContent = text;
    
    if (translationSpinner) {
      if (showSpinner) translationSpinner.classList.remove('hidden');
      else translationSpinner.classList.add('hidden');
    }
    
    if (cancelTranslationBtn) {
      if (showCancel) cancelTranslationBtn.classList.remove('hidden');
      else cancelTranslationBtn.classList.add('hidden');
    }
  }

  function hideBanner() {
    if (translationStatusBanner) {
      translationStatusBanner.classList.add('hidden');
    }
  }

  function stopRecordingUI() {
    isRecording = false;
    if (micIcon) micIcon.classList.remove('hidden');
    if (micActiveIcon) micActiveIcon.classList.add('hidden');
    if (voiceStatusIndicator) voiceStatusIndicator.classList.add('hidden');
  }

  async function translateText(text: string, sourceLang: string): Promise<string> {
    // If language is Arabic, no need to translate
    if (sourceLang.startsWith('ar')) {
      return text;
    }

    translationAbortController = new AbortController();
    const signal = translationAbortController.signal;

    // Standard public Google Translate client-side API (No keys required, CORS compliant)
    const sl = sourceLang.split('-')[0]; // Extract 'ur', 'en', 'hi', etc.
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=ar&dt=t&q=${encodeURIComponent(text)}`;

    try {
      const response = await fetch(url, { signal });
      if (!response.ok) {
        throw new Error('فشلت عملية الترجمة تلقائياً');
      }
      const data = await response.json();
      if (data && data[0]) {
        const translated = data[0].map((item: any) => item[0]).join('');
        return translated.trim();
      }
      throw new Error('صيغة رد غير مدعومة');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('cancelled');
      }
      throw err;
    }
  }

  voiceRecordBtn.addEventListener('click', async () => {
    if (isRecording) {
      if (currentRecognition) {
        currentRecognition.stop();
      }
      stopRecordingUI();
      return;
    }

    if (!SpeechRecognitionAPI) {
      showBanner('❌ ميزة التعرف الصوتي غير مدعومة بالكامل على هذا المتصفح. يرجى استخدام متصفح حديث (مثل Chrome).', false, false);
      setTimeout(hideBanner, 5000);
      return;
    }

    // Step 1: Explicitly request microphone permission first using getUserMedia to force browser prompt
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      showBanner('🎙️ يرجى الموافقة على طلب إذن الميكروفون الموضح في المتصفح...', false, false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Close stream immediately to release microphone hardware until recognition starts
        stream.getTracks().forEach(track => track.stop());
      } catch (err: any) {
        console.error('Microphone access denied:', err);
        stopRecordingUI();
        showBanner('🎙️ يرجى السماح للتطبيق باستخدام الميكروفون من إعدادات المتصفح للبدء في تسجيل الملاحظة.', false, false);
        setTimeout(hideBanner, 5000);
        return;
      }
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      currentRecognition = recognition;
      
      const lang = voiceLangSelect ? voiceLangSelect.value : 'ar-SA';
      recognition.lang = lang;
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        isRecording = true;
        if (micIcon) micIcon.classList.add('hidden');
        if (micActiveIcon) micActiveIcon.classList.remove('hidden');
        if (voiceStatusIndicator) voiceStatusIndicator.classList.remove('hidden');
        
        const langName = voiceLangSelect?.options[voiceLangSelect.selectedIndex]?.textContent || (currentLang === 'ar' ? 'اللغة المحددة' : 'Selected Language');
        showBanner(currentLang === 'ar' ? `🎙️ جاري الاستماع للتسجيل بـ (${langName})... تحدّث الآن.` : `🎙️ Listening to speech in (${langName})... Speak now.`, false, false);
      };

      recognition.onresult = async (event: any) => {
        const resultText = event.results[0][0].transcript;
        if (!resultText || !resultText.trim()) {
          showBanner(currentLang === 'ar' ? '⚠️ لم نتمكن من سماع أي كلام واضح. يرجى المحاولة مجدداً.' : '⚠️ No clear speech detected. Please try again.', false, false);
          setTimeout(hideBanner, 3000);
          return;
        }

        // Handle speech text
        stopRecordingUI();
        
        if (lang.startsWith('ar')) {
          if (callerNotesInput) {
            callerNotesInput.value = resultText;
            // Dispatch input event to trigger any reactive UI binding if exists
            callerNotesInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          showBanner(currentLang === 'ar' ? '✅ تم إدخال النص بنجاح!' : '✅ Text entered successfully!', false, false);
          setTimeout(hideBanner, 3000);
        } else {
          // Translate
          showBanner(currentLang === 'ar' ? '⏳ جاري الترجمة التلقائية إلى اللغة العربية...' : '⏳ Translating speech to Arabic...', true, true);
          try {
            const translatedText = await translateText(resultText, lang);
            if (callerNotesInput) {
              callerNotesInput.value = translatedText;
              // Dispatch input event to trigger any reactive UI binding if exists
              callerNotesInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            showBanner(currentLang === 'ar' ? '✅ تمت الترجمة والكتابة بنجاح!' : '✅ Speech translated and written successfully!', false, false);
            setTimeout(hideBanner, 3000);
          } catch (err: any) {
            if (err.message === 'cancelled') {
              showBanner(currentLang === 'ar' ? '⚠️ تم إلغاء الترجمة التلقائية.' : '⚠️ Auto-translation cancelled.', false, false);
            } else {
              console.error('Translation error:', err);
              // Fallback: put the original text into the notes input
              if (callerNotesInput) {
                callerNotesInput.value = resultText;
                callerNotesInput.dispatchEvent(new Event('input', { bubbles: true }));
              }
              showBanner(currentLang === 'ar' ? '⚠️ فشلت الترجمة التلقائية. تم إدخال النص بلغته الأصلية.' : '⚠️ Auto-translation failed. Transcribed in original language.', false, false);
            }
            setTimeout(hideBanner, 4000);
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        stopRecordingUI();
        
        let errorMessage = currentLang === 'ar' ? '⚠️ حدث خطأ أثناء التعرف الصوتي.' : '⚠️ Voice recognition error occurred.';
        if (event.error === 'not-allowed') {
          errorMessage = currentLang === 'ar' ? '🎙️ يرجى السماح للتطبيق باستخدام الميكروفون من إعدادات المتصفح.' : '🎙️ Please allow microphone access from browser settings.';
        } else if (event.error === 'no-speech') {
          errorMessage = currentLang === 'ar' ? '⚠️ لم يتم اكتشاف صوت واضح. يرجى إعادة المحاولة.' : '⚠️ No clear speech detected. Please try again.';
        }
        
        showBanner(errorMessage, false, false);
        setTimeout(hideBanner, 4000);
      };

      recognition.onend = () => {
        stopRecordingUI();
      };

      recognition.start();

    } catch (e: any) {
      console.error('Failed to start speech recognition:', e);
      stopRecordingUI();
      showBanner(currentLang === 'ar' ? '⚠️ فشل في تشغيل ميزة التسجيل الصوتي.' : '⚠️ Failed to start speech recognition features.', false, false);
      setTimeout(hideBanner, 3000);
    }
  });

  if (cancelTranslationBtn) {
    cancelTranslationBtn.addEventListener('click', () => {
      if (translationAbortController) {
        translationAbortController.abort();
      }
    });
  }
}

// Explicit deleteUser function with custom confirm dialog
async function deleteUser(idToDelete: string, deleteBtnElement?: HTMLElement) {
  const confirmed = await customConfirm(
    currentLang === 'ar'
      ? "هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء."
      : "Are you sure you want to delete this user? This action cannot be undone."
  );
  if (confirmed) {
    try {
      await deleteDoc(doc(db, 'users', idToDelete));
      
      if (deleteBtnElement) {
        const itemRow = deleteBtnElement.closest('.flex.items-center.justify-between');
        if (itemRow) {
          itemRow.remove();
        }
      }
      alert(
        currentLang === 'ar'
          ? '✅ تم حذف المستخدم بنجاح من قاعدة البيانات!'
          : '✅ User deleted successfully from the database!'
      );
    } catch (err: any) {
      console.error('Error deleting user:', err);
      alert(
        (currentLang === 'ar' ? 'عذراً، فشل حذف المستخدم: ' : 'Sorry, failed to delete user: ') + (err.message || String(err))
      );
    }
  }
}

// Robust bootstrap checker
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
