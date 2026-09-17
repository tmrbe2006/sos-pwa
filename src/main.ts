import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  onSnapshot, 
  serverTimestamp, 
  query, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

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

// Audio Elements
const audioAlarm = document.getElementById('audio-alarm') as HTMLAudioElement;
const audioTick = document.getElementById('audio-tick') as HTMLAudioElement;

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
// 6. Firestore Real-time Monitoring & Logging
// ==========================================

let isInitialLoad = true;

// Track total device counts registered in Firestore
function listenToDevicesCount() {
  onSnapshot(collection(db, 'device_tokens'), (snapshot) => {
    devicesCountBadge.textContent = snapshot.size.toString();
  }, (error) => {
    console.error("Error fetching devices count: ", error);
  });
}

// Track emergency logs from Firestore to display recent alerts in real time
function listenToRecentAlerts() {
  const alertsQuery = query(collection(db, 'emergency_calls'), orderBy('timestamp', 'desc'), limit(15));
  
  onSnapshot(alertsQuery, (snapshot) => {
    if (snapshot.empty) {
      alertsLog.innerHTML = `
        <div class="text-center text-xs text-slate-400 dark:text-slate-500 py-4">
          لا توجد نداءات طوارئ نشطة حالياً. التطبيق في حالة استعداد تام.
        </div>
      `;
      isInitialLoad = false;
      return;
    }

    alertsLog.innerHTML = '';
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const timeStr = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'الآن';
      const isMine = data.deviceId === deviceId;

      const logItem = document.createElement('div');
      logItem.className = `p-3 rounded-2xl flex flex-col gap-1 transition-all animate-fade-in ${
        isMine 
          ? 'bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300' 
          : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
      }`;

      logItem.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-bold text-xs flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full bg-rose-500 animate-pulse"></span>
            ${isMine ? '🔴 نداء مرسل منك (جهازك)' : '⚠️ نداء وارد من جهاز آخر'}
          </span>
          <span class="text-[10px] opacity-75 font-mono">${timeStr}</span>
        </div>
        <p class="text-xs font-semibold leading-relaxed mt-0.5">${data.message || 'نداء استغاثة عاجل (SOS)!'}</p>
        <span class="text-[9px] font-mono opacity-50 block text-left">الجهاز: ${data.deviceId ? data.deviceId.substring(0, 12) : 'غير معروف'}...</span>
      `;
      alertsLog.appendChild(logItem);
    });

    // Detect new additions in real-time to trigger the physical siren/alarm on other devices!
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added' && !isInitialLoad) {
        const data = change.doc.data();
        if (data.deviceId !== deviceId) {
          // Play tick beep sound and activate the full physical emergency siren
          playTickSound();
          startSiren();
          showForegroundAlert(
            '🚨 استغاثة عاجلة نشطة!',
            'أرسل أحد الأجهزة نداء استغاثة SOS الآن! تم تفعيل صفارات الإنذار تلقائياً.'
          );
        }
      }
    });

    isInitialLoad = false;
  }, (error) => {
    console.error("Error reading alert records: ", error);
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
      console.log('Service Worker registered successfully: ', registration);

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
        tokenStatus.textContent = 'فشل جلب الـ Token';
        console.warn('No registration token available. Request permission to generate one.');
      }
    } else {
      tokenStatus.textContent = 'غير مرخص';
    }
  } catch (error) {
    console.error('An error occurred while retrieving token: ', error);
    tokenStatus.textContent = 'خطأ في التهيئة';
  }
}

function updatePermissionBadge(permission: NotificationPermission) {
  permissionBadge.className = 'px-2.5 py-1 text-xs font-bold rounded-lg';
  
  if (permission === 'granted') {
    permissionBadge.textContent = 'مقبول';
    permissionBadge.classList.add('bg-emerald-500/10', 'text-emerald-600', 'dark:text-emerald-400');
  } else if (permission === 'denied') {
    permissionBadge.textContent = 'مرفوض';
    permissionBadge.classList.add('bg-rose-500/10', 'text-rose-600', 'dark:text-rose-400');
  } else {
    permissionBadge.textContent = 'غير محدّد';
    permissionBadge.classList.add('bg-amber-500/10', 'text-amber-600', 'dark:text-amber-400');
  }
}

// Copy Token Helper
copyTokenBtn.addEventListener('click', () => {
  if (activeToken) {
    navigator.clipboard.writeText(activeToken).then(() => {
      const originalText = tokenStatus.textContent;
      tokenStatus.textContent = 'تم النسخ بنجاح!';
      setTimeout(() => {
        tokenStatus.textContent = originalText;
      }, 1500);
    });
  } else {
    alert('الـ Token غير متوفر حالياً لتسهيل النسخ.');
  }
});

// ==========================================
// 8. Foreground Notification Listener (onMessage)
// ==========================================

onMessage(messaging, (payload) => {
  console.log('Message received in foreground: ', payload);
  
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

// Click anywhere on the body to cancel countdown
document.body.addEventListener('click', () => {
  if (isCountingDown) {
    resetCountdown();
  }
});

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
  
  // 1. Play Alarm Sirens
  startSiren();

  // 2. Register emergency call document in Firestore (Emergency history)
  try {
    const emergencyRef = doc(collection(db, 'emergency_calls'));
    await setDoc(emergencyRef, {
      deviceId: deviceId,
      message: '🚨 نداء استغاثة فوري عاجل! يرجى المساعدة والتحقق من الموقع.',
      timestamp: serverTimestamp()
    });
    console.log('Emergency broadcast recorded in database.');
  } catch (error) {
    console.error('Failed to log emergency record: ', error);
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

  } catch (error) {
    console.error('Error fetching device tokens for dispatch: ', error);
  }
}

// Send request to Cloudflare Worker to send Push Notifications to devices
async function sendPushNotificationRequest(tokens: string[]) {
  // Use a pseudo-mock workers link as specified by the user
  const workerUrl = 'https://sos-worker.workers.dev/send';
  
  const payload = {
    title: '🚨 نداء استغاثة عاجل (SOS)!',
    body: `تم إرسال استغاثة طوارئ من جهاز ${deviceId.substring(0, 8)}... يرجى التحرك فورا!`,
    tokens: tokens
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
  
  sosButton.classList.remove('from-red-500', 'to-rose-700');
  sosButton.classList.add('from-amber-500', 'to-yellow-600', 'animate-pulse');
  sosButton.querySelector('span:nth-child(1)')!.textContent = 'إيقاف';
  sosButton.querySelector('span:nth-child(2)')!.textContent = 'اضغط لإلغاء الإنذار';
}

function stopSiren() {
  isAlarmPlaying = false;
  audioAlarm.pause();
  audioAlarm.currentTime = 0;
  
  sosButton.classList.remove('from-amber-500', 'to-yellow-600', 'animate-pulse');
  sosButton.classList.add('from-red-500', 'to-rose-700');
  sosButton.querySelector('span:nth-child(1)')!.textContent = 'SOS';
  sosButton.querySelector('span:nth-child(2)')!.textContent = 'إرسال استغاثة';
}

// ==========================================
// 10. Simulation & Test Tools
// ==========================================

// Manual alarm check
triggerAlarmBtn.addEventListener('click', () => {
  if (isAlarmPlaying) {
    stopSiren();
    triggerAlarmBtn.textContent = '🔊 تجربة صفارة الإنذار';
  } else {
    startSiren();
    triggerAlarmBtn.textContent = '🔇 إيقاف تجربة الصفارة';
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

// Clear local storage / logs helper
clearLogsBtn.addEventListener('click', () => {
  alertsLog.innerHTML = `
    <div class="text-center text-xs text-slate-400 dark:text-slate-500 py-4">
      تم مسح سجل النداءات بنجاح.
    </div>
  `;
});

// ==========================================
// 11. Core Bootstrapper
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupNotifications();
  listenToDevicesCount();
  listenToRecentAlerts();
});
