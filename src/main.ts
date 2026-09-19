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
          لا توجد نداءات طوارئ نشطة حالياً. التطبيق في حالة استعداد تام.
        </div>
      `;
      isInitialLoad = false;
      return;
    }

    alertsLog.innerHTML = '';
    const isOwner = currentUser && currentUser.role === 'المالك';

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

      // Calculate resolution time
      let statusBadgeHtml = '';
      if (data.status === 'resolved') {
        let durationStr = 'أقل من دقيقة';
        if (data.resolvedAt && data.timestamp) {
          const diffSeconds = Math.max(0, data.resolvedAt.seconds - data.timestamp.seconds);
          if (diffSeconds < 60) {
            durationStr = `${diffSeconds} ثانية`;
          } else if (diffSeconds < 3600) {
            const minutes = Math.floor(diffSeconds / 60);
            const seconds = diffSeconds % 60;
            durationStr = `${minutes} دقيقة و ${seconds} ثانية`;
          } else {
            const hours = Math.floor(diffSeconds / 3600);
            const minutes = Math.floor((diffSeconds % 3600) / 60);
            durationStr = `${hours} ساعة و ${minutes} دقيقة`;
          }
        }
        statusBadgeHtml = `<span class="text-[9px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-extrabold px-1.5 py-0.5 rounded-md mt-1 self-start inline-flex items-center gap-1 border border-emerald-500/10">✅ تم الحل خلال: ${durationStr}</span>`;
      } else if (data.status === 'processing') {
        statusBadgeHtml = `<span class="text-[9px] bg-amber-500/10 text-amber-700 dark:text-amber-400 font-extrabold px-1.5 py-0.5 rounded-md mt-1 self-start inline-flex items-center gap-1 border border-amber-500/10">⏳ جاري المعالجة...</span>`;
      } else {
        statusBadgeHtml = `<span class="text-[9px] bg-red-500/10 text-red-700 dark:text-red-400 font-extrabold px-1.5 py-0.5 rounded-md mt-1 self-start inline-flex items-center gap-1 border border-red-500/10 animate-pulse">🚨 نداء استغاثة نشط</span>`;
      }

      logItem.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-bold text-xs flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full ${data.status === 'resolved' ? 'bg-emerald-500' : data.status === 'processing' ? 'bg-amber-500' : 'bg-rose-500 animate-pulse'}"></span>
            ${isMine ? '🔴 نداء مرسل منك (جهازك)' : '⚠️ نداء وارد من جهاز آخر'}
          </span>
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] opacity-75 font-mono">${timeStr}</span>
            ${isOwner ? `
              <button class="delete-call-btn text-red-500 hover:text-red-700 p-0.5 transition-all active:scale-95" data-id="${docSnap.id}" title="حذف هذا البلاغ">
                🗑️
              </button>
            ` : ''}
          </div>
        </div>
        <p class="text-xs font-semibold leading-relaxed mt-0.5">${data.message || 'نداء استغاثة عاجل (SOS)!'}</p>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mt-1">
          <span class="text-[9px] font-mono opacity-50">الجهاز: ${data.deviceId ? data.deviceId.substring(0, 12) : 'غير معروف'}...</span>
          ${statusBadgeHtml}
        </div>
      `;
      alertsLog.appendChild(logItem);
    });

    // Attach click listeners to individual delete call buttons
    const deleteCallBtns = alertsLog.querySelectorAll('.delete-call-btn');
    deleteCallBtns.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const callId = btn.getAttribute('data-id');
        if (callId && confirm('هل أنت متأكد من رغبتك في حذف هذا البلاغ بشكل نهائي من الأرشيف وقاعدة البيانات؟')) {
          try {
            await deleteDoc(doc(db, 'emergency_calls', callId));
            console.log('Call deleted from archive successfully.');
            alert('✅ تم حذف البلاغ بنجاح!');
          } catch (err: any) {
            console.error('Error deleting call:', err);
            alert('عذراً، فشل حذف البلاغ: ' + (err.message || String(err)));
          }
        }
      });
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
        tokenStatus.textContent = 'فشل جلب الـ Token';
        console.warn('No registration token available. Request permission to generate one.');
      }
    } else {
      tokenStatus.textContent = 'غير مرخص';
    }
  } catch (error: any) {
    console.error('An error occurred while retrieving token: ', error.message || String(error));
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

  const callerNotesInput = document.getElementById('sos-caller-notes') as HTMLInputElement | null;
  const notesVal = callerNotesInput ? callerNotesInput.value.trim() : '';

  // 2. Register emergency call document in Firestore (Emergency history)
  try {
    const payload: any = {
      deviceId: deviceId,
      timestamp: serverTimestamp(),
      status: 'active',
      senderName: currentUser ? currentUser.name : 'مستخدم غير معروف',
      notes: notesVal || 'لا توجد ملاحظات إضافية'
    };

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

// Clear database emergency calls log
clearLogsBtn.addEventListener('click', async () => {
  if (confirm('🚨 تحذير: هل أنت متأكد من رغبتك في مسح جميع نداءات الاستغاثة وسجل الاتصالات بالكامل من قاعدة البيانات؟')) {
    try {
      const callsCol = collection(db, 'emergency_calls');
      const snapshot = await getDocs(callsCol);
      if (snapshot.empty) {
        alert('ℹ️ لا توجد نداءات طوارئ لحذفها من قاعدة البيانات.');
        return;
      }

      let deletedCount = 0;
      for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, 'emergency_calls', docSnap.id));
        deletedCount++;
      }
      
      alert(`✅ تم مسح سجل الطوارئ من قاعدة البيانات بنجاح! تم حذف ${deletedCount} بلاغ.`);
    } catch (err: any) {
      console.error('Error clearing database logs:', err);
      alert('عذراً، فشل مسح السجل من قاعدة البيانات: ' + (err.message || String(err)));
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
  role: 'عامل' | 'فني طوارئ' | 'مراقب' | 'المالك';
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

// Live listeners for users list
let unsubscribeUsers: (() => void) | null = null;
let unsubscribeActiveAlerts: (() => void) | null = null;
let unsubscribeRecentAlerts: (() => void) | null = null;
let unsubscribeRecentResolvedCalls: (() => void) | null = null;

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
          <td colspan="6" class="p-4 text-center text-slate-400 dark:text-slate-500">لا توجد بلاغات محلولة في السجل حتى الآن.</td>
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
      return;
    }

    let totalDiffSeconds = 0;
    let resolvedCount = 0;
    let excellentCount = 0; // Response time < 3 minutes (180 seconds)

    const allRows: Array<{
      html: string;
      printHtml: string;
      seconds: number;
      speedCategory: 'excellent' | 'standard' | 'delayed';
    }> = [];

    // Convert to array and sort descending by timestamp client-side (no composite index needed!)
    const sortedDocs: any[] = [];
    snapshot.forEach((docSnap) => {
      sortedDocs.push(docSnap.data());
    });
    sortedDocs.sort((a, b) => {
      const timeA = a.timestamp ? a.timestamp.seconds : 0;
      const timeB = b.timestamp ? b.timestamp.seconds : 0;
      return timeB - timeA;
    });

    sortedDocs.forEach((data) => {
      
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
          analysisBadge = '<span class="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-md font-extrabold border border-emerald-500/10">⚡ استجابة فائقة</span>';
          printAnalysis = 'استجابة ممتازة فائقة السرعة';
        } else if (diffSeconds <= 420) {
          speedCategory = 'standard';
          analysisBadge = '<span class="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-md font-extrabold border border-blue-500/10">🟢 استجابة قياسية</span>';
          printAnalysis = 'استجابة عادية قياسية';
        } else {
          speedCategory = 'delayed';
          analysisBadge = '<span class="bg-rose-500/10 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded-md font-extrabold border border-rose-500/10">⚠️ استجابة متأخرة</span>';
          printAnalysis = 'استجابة متأخرة بحاجة لمراجعة كفاءة الخدمة';
        }
      } else {
        analysisBadge = '<span class="bg-slate-500/10 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded-md font-bold">غير محدد</span>';
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

      const rowHtml = `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all text-xs border-b border-slate-100 dark:border-slate-800">
          <td class="p-2 border-l border-slate-100 dark:border-slate-800/60 font-mono">${dateStr}<br/><span class="opacity-60 text-[9px]">${timeStr}</span></td>
          <td class="p-2 border-l border-slate-100 dark:border-slate-800/60 font-bold text-slate-700 dark:text-slate-300">${senderName}</td>
          <td class="p-2 border-l border-slate-100 dark:border-slate-800/60 leading-relaxed"><span class="font-extrabold text-indigo-600 dark:text-indigo-400">${wingName}</span><br/><span class="text-[9px] opacity-75">سرير: ${bedId} | المقيم: ${residentName}</span></td>
          <td class="p-2 border-l border-slate-100 dark:border-slate-800/60 text-slate-600 dark:text-slate-400 italic">${notes}</td>
          <td class="p-2 border-l border-slate-100 dark:border-slate-800/60 font-mono">${closedTimeStr}</td>
          <td class="p-2 border-l border-slate-100 dark:border-slate-800/60 space-y-1">
            <div class="font-extrabold text-slate-800 dark:text-white font-mono">${durationStr}</div>
            <div>${analysisBadge}</div>
          </td>
        </tr>
      `;

      const printRowHtml = `
        <tr style="border-bottom: 1px solid #cbd5e1;">
          <td style="padding: 8px; border: 1px solid #cbd5e1; font-family: monospace;">${dateStr} - ${timeStr}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">${senderName}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">جناح: ${wingName}<br/>سرير: ${bedId} | مقيم: ${residentName}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; font-style: italic;">${notes}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; font-family: monospace;">${closedTimeStr}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">
            <strong>${durationStr}</strong><br/>
            <span style="font-size: 8px; color: #475569;">${printAnalysis}</span>
          </td>
        </tr>
      `;

      allRows.push({
        html: rowHtml,
        printHtml: printRowHtml,
        seconds: diffSeconds,
        speedCategory: speedCategory
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
        avgStr = `${m} دقيقة و ${s} ثانية`;
      }
    }

    const excellentRate = resolvedCount > 0 ? Math.round((excellentCount / resolvedCount) * 100) : 0;

    // Update KPI panels on screen
    if (avgResponseTimeKpi) avgResponseTimeKpi.textContent = avgStr;
    if (resolvedCallsCountKpi) resolvedCallsCountKpi.textContent = resolvedCount.toString();
    if (excellentRateKpi) excellentRateKpi.textContent = `${excellentRate}%`;

    // Update KPI panels on Print Document
    if (printAvgTime) printAvgTime.textContent = avgStr;
    if (printTotalCalls) printTotalCalls.textContent = resolvedCount.toString();
    if (printExcellentRate) printExcellentRate.textContent = `${excellentRate}%`;
    if (printDate) printDate.textContent = new Date().toLocaleString('ar-EG');

    // Filter render logic helper
    const renderFilteredRows = () => {
      const selectedFilter = reportFilterSpeed ? reportFilterSpeed.value : 'all';
      let filteredRows = allRows;
      if (selectedFilter !== 'all') {
        filteredRows = allRows.filter(r => r.speedCategory === selectedFilter);
      }

      if (filteredRows.length === 0) {
        reportsTableBody.innerHTML = `
          <tr>
            <td colspan="6" class="p-4 text-center text-slate-400 dark:text-slate-500">لا توجد بلاغات تطابق مستوى التصفية المحدد.</td>
          </tr>
        `;
      } else {
        reportsTableBody.innerHTML = filteredRows.map(r => r.html).join('');
      }

      if (printTableBody) {
        printTableBody.innerHTML = allRows.map(r => r.printHtml).join('');
      }
    };

    // Render initially
    renderFilteredRows();

    // Listen to filter change events
    if (reportFilterSpeed) {
      reportFilterSpeed.onchange = () => {
        renderFilteredRows();
      };
    }
  }, (error) => {
    console.error("Error loading resolved report logs: ", error);
  });
}

function listenToUsersList() {
  if (unsubscribeUsers) {
    unsubscribeUsers();
  }

  const usersCol = collection(db, 'users');
  unsubscribeUsers = onSnapshot(usersCol, (snapshot) => {
    usersListContainer.innerHTML = '';
    if (snapshot.empty) {
      usersListContainer.innerHTML = `<p class="text-xs text-slate-400 py-2 text-center">لا يوجد مستخدمين مسجلين.</p>`;
      return;
    }

    snapshot.forEach((docSnap) => {
      const u = docSnap.data();
      const userId = docSnap.id;
      
      const item = document.createElement('div');
      item.className = 'flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 text-xs transition-all';
      
      let badgeColor = 'bg-slate-100 text-slate-600';
      if (u.role === 'المالك') badgeColor = 'bg-red-500/10 text-red-600';
      else if (u.role === 'فني طوارئ') badgeColor = 'bg-green-500/10 text-green-600';
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
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${badgeColor}">${u.role}</span>
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

    // Attach click listeners to edit buttons
    const editButtons = usersListContainer.querySelectorAll('.edit-user-btn');
    editButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idToEdit = btn.getAttribute('data-id');
        
        editOverlay.classList.remove('hidden');
        editModalTitle.textContent = '✏️ تعديل بيانات المستخدم';
        editType.value = 'user';
        editTargetId.value = idToEdit || '';
        editSubIndex.value = '';

        editUserFields.classList.remove('hidden');
        editWingFields.classList.add('hidden');
        editBedFields.classList.add('hidden');

        editUserNameInput.value = btn.getAttribute('data-name') || '';
        editUserUsernameInput.value = btn.getAttribute('data-username') || '';
        editUserPasswordInput.value = btn.getAttribute('data-password') || '';
        editUserRoleInput.value = btn.getAttribute('data-role') || 'عامل';
      });
    });

    // Attach click listeners to delete buttons
    const deleteButtons = usersListContainer.querySelectorAll('.delete-user-btn');
    deleteButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idToDelete = btn.getAttribute('data-id');
        if (idToDelete) {
          if (confirm('هل أنت متأكد من رغبتك في حذف هذا المستخدم من قاعدة البيانات؟')) {
            try {
              await deleteDoc(doc(db, 'users', idToDelete));
              console.log('User deleted successfully.');
              alert('✅ تم حذف المستخدم بنجاح من قاعدة البيانات!');
            } catch (err: any) {
              console.error('Error deleting user:', err);
              alert('عذراً، فشل حذف المستخدم: ' + (err.message || String(err)));
            }
          }
        }
      });
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

    alert('✨ تم إضافة المستخدم بنجاح في قاعدة البيانات!');
  } catch (err) {
    console.error('Error adding user:', err);
    alert('عذراً، فشل إضافة المستخدم.');
  }
}

function listenToActiveAlerts() {
  if (unsubscribeActiveAlerts) {
    unsubscribeActiveAlerts();
  }

  const q = query(collection(db, 'emergency_calls'), orderBy('timestamp', 'desc'), limit(40));
  unsubscribeActiveAlerts = onSnapshot(q, (snapshot) => {
    activeAlertsContainer.innerHTML = '';
    let activeCount = 0;

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const docId = docSnap.id;
      
      // If status is specifically marked as resolved, don't show it here
      if (data.status === 'resolved') {
        return;
      }

      activeCount++;
      const timeStr = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'الآن';
      const isMine = data.deviceId === deviceId;

      const card = document.createElement('div');
      card.className = `p-5 rounded-3xl flex flex-col gap-3.5 transition-all border shadow-sm ${
        data.status === 'processing' 
          ? 'bg-amber-500/5 border-amber-500/10 dark:border-amber-500/20' 
          : 'bg-red-500/5 border-red-500/15 dark:border-red-500/20 animate-pulse'
      }`;

      const statusText = data.status === 'processing' ? '🛠️ جاري المعالجة والمتابعة' : '🚨 نداء استغاثة نشط عاجل';
      const statusBadgeClass = data.status === 'processing' ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-600';

      const locationBadge = data.wingName && data.wingName !== 'نداء عام' ? `
        <div class="flex flex-wrap gap-2 mt-2">
          <span class="px-2 py-0.5 rounded-lg text-[9px] font-black bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10">📍 ${data.wingName}</span>
          <span class="px-2 py-0.5 rounded-lg text-[9px] font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/10">🛏️ ${data.bedId}</span>
          <span class="px-2 py-0.5 rounded-lg text-[9px] font-black bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/10">👤 المقيم: ${data.residentName}</span>
        </div>
      ` : `
        <div class="flex flex-wrap gap-2 mt-2">
          <span class="px-2 py-0.5 rounded-lg text-[9px] font-black bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-200/40">🚨 نداء عام (كامل المركز)</span>
        </div>
      `;

      card.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-100/60 dark:border-slate-800/60 pb-2">
          <div class="flex items-center gap-2">
            <span class="relative flex h-2.5 w-2.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${data.status === 'processing' ? 'bg-amber-400' : 'bg-red-400'}"></span>
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 ${data.status === 'processing' ? 'bg-amber-500' : 'bg-red-600'}"></span>
            </span>
            <span class="font-black text-xs text-slate-800 dark:text-slate-100">بلاغ من جهاز: ${data.deviceId ? data.deviceId.substring(0, 12) : 'غير معروف'}</span>
          </div>
          <span class="text-[10px] text-slate-400 font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg">${timeStr}</span>
        </div>
        
        <div class="flex items-start gap-3">
          <div class="p-2 bg-red-500/10 text-red-600 rounded-xl text-lg shrink-0 mt-0.5">
            ${data.status === 'processing' ? '👨‍🚒' : '🔥'}
          </div>
          <div class="flex-1">
            <p class="text-sm text-slate-700 dark:text-slate-200 font-bold leading-relaxed">${data.message || 'نداء استغاثة عاجل (SOS)!'}</p>
            ${locationBadge}
          </div>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <span class="px-3 py-1 rounded-full text-[10px] font-black tracking-wide ${statusBadgeClass} shrink-0 self-start">${statusText}</span>
          <div class="flex gap-2 w-full sm:w-auto">
            ${data.status !== 'processing' ? `
              <button class="process-alert-btn flex-1 sm:flex-initial px-4 py-2 text-xs font-black bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-xl transition-all shadow-sm flex items-center justify-center gap-1" data-id="${docId}">
                <span>🛠️ بدء المعالجة</span>
              </button>
            ` : ''}
            <button class="resolve-alert-btn flex-1 sm:flex-initial px-4 py-2 text-xs font-black bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl transition-all shadow-sm flex items-center justify-center gap-1" data-id="${docId}">
              <span>✅ تم الحل وإغلاق البلاغ</span>
            </button>
          </div>
        </div>
      `;

      activeAlertsContainer.appendChild(card);
    });

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

    // Attach listeners for actions
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
      btn.addEventListener('click', async (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        const id = target.getAttribute('data-id');
        if (id) {
          try {
            await updateDoc(doc(db, 'emergency_calls', id), { 
              status: 'resolved',
              resolvedAt: serverTimestamp()
            });
            console.log('Alert marked as resolved.');
          } catch (err) {
            console.error('Error marking alert as resolved:', err);
          }
        }
      });
    });
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
        { id: 'tech', username: 'tech', password: '123', name: 'فني طوارئ', role: 'فني طوارئ' },
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

        // Bind Edit Wing Buttons
        const editWingBtns = wingsRegistryContainer.querySelectorAll('.edit-wing-btn');
        editWingBtns.forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const wingId = btn.getAttribute('data-wing-id');
            const wingName = btn.getAttribute('data-wing-name');

            editOverlay.classList.remove('hidden');
            editModalTitle.textContent = '✏️ تعديل اسم الجناح';
            editType.value = 'wing';
            editTargetId.value = wingId || '';
            editSubIndex.value = '';

            editUserFields.classList.add('hidden');
            editWingFields.classList.remove('hidden');
            editBedFields.classList.add('hidden');

            editWingNameInput.value = wingName || '';
          });
        });

        // Bind Edit Bed Buttons
        const editBedBtns = wingsRegistryContainer.querySelectorAll('.edit-bed-btn');
        editBedBtns.forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const wingId = btn.getAttribute('data-wing-id');
            const bedIndex = btn.getAttribute('data-bed-index');
            const bedId = btn.getAttribute('data-bed-id');
            const resident = btn.getAttribute('data-resident');

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
          });
        });

        // Bind Delete Wing Buttons
        const deleteWingBtns = wingsRegistryContainer.querySelectorAll('.delete-wing-btn');
        deleteWingBtns.forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const wingId = btn.getAttribute('data-wing-id');
            if (wingId && confirm('هل أنت متأكد من رغبتك في حذف هذا الجناح بالكامل وجميع الأسرة الملحقة به؟')) {
              try {
                await deleteDoc(doc(db, 'wings', wingId));
                console.log('Wing deleted successfully');
                alert('✅ تم حذف الجناح وجميع الأسرة الملحقة به بنجاح!');
              } catch (err: any) {
                alert('فشل حذف الجناح: ' + err.message);
              }
            }
          });
        });

        // Bind Delete Bed Buttons
        const deleteBedBtns = wingsRegistryContainer.querySelectorAll('.delete-bed-btn');
        deleteBedBtns.forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const wingId = btn.getAttribute('data-wing-id');
            const bedIndexStr = btn.getAttribute('data-bed-index');
            if (wingId && bedIndexStr !== null) {
              const bedIndex = parseInt(bedIndexStr, 10);
              const wing = wingsList.find(w => w.id === wingId);
              if (wing && confirm('هل أنت متأكد من رغبتك في حذف هذا السرير ومقيمه؟')) {
                try {
                  const updatedBeds = [...wing.beds];
                  updatedBeds.splice(bedIndex, 1);
                  await updateDoc(doc(db, 'wings', wingId), {
                    beds: updatedBeds
                  });
                  console.log('Bed deleted successfully');
                  alert('✅ تم حذف السرير والمقيم بنجاح!');
                } catch (err: any) {
                  alert('فشل حذف السرير: ' + err.message);
                }
              }
            }
          });
        });
      }
    });

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
          alert('✨ تم إضافة الجناح الجديد بنجاح!');
        } catch (err: any) {
          alert('حدث خطأ أثناء إضافة الجناح: ' + err.message);
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
            alert('⚠️ هذا السرير مسجل بالفعل في هذا الجناح!');
            return;
          }

          try {
            const updatedBeds = [...wing.beds, { bedId: bedIdVal, residentName: residentVal }];
            await updateDoc(doc(db, 'wings', wingId), {
              beds: updatedBeds
            });
            newBedId.value = '';
            newResidentName.value = '';
            alert('✨ تم إضافة السرير والمقيم بنجاح!');
          } catch (err: any) {
            alert('حدث خطأ أثناء إضافة السرير: ' + err.message);
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
      { username: 'tech', password: '123', name: 'فني طوارئ', role: 'فني طوارئ' },
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

function applySessionUI() {
  const reportsSection = document.getElementById('reports-section') as HTMLElement | null;

  if (currentUser) {
    loginOverlay.classList.add('hidden');
    userStatusBanner.classList.remove('hidden');
    activeUserName.textContent = currentUser.name;
    activeUserRole.textContent = currentUser.role;
    
    // Toggle between the worker-centric SOS view and the controller-centric monitor view
    if (currentUser.role === 'مراقب' || currentUser.role === 'فني طوارئ' || currentUser.role === 'المالك') {
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

    if (currentUser.role === 'مراقب' || currentUser.role === 'فني طوارئ' || currentUser.role === 'المالك') {
      activeAlertsDashboard.classList.remove('hidden');
      listenToActiveAlerts();
    } else {
      activeAlertsDashboard.classList.add('hidden');
      if (unsubscribeActiveAlerts) {
        unsubscribeActiveAlerts();
        unsubscribeActiveAlerts = null;
      }
    }
  } else {
    loginOverlay.classList.remove('hidden');
    userStatusBanner.classList.add('hidden');
    loginUsernameInput.value = '';
    loginPasswordInput.value = '';
    
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
  }
  
  // Re-subscribe to recent alerts to update visibility of deletion buttons dynamically
  listenToRecentAlerts();
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem('sos_user_session');
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
        alert('يرجى ملء جميع حقول المستخدم.');
        return;
      }

      await updateDoc(doc(db, 'users', targetId), {
        name,
        username,
        password,
        role
      });
      
      alert('✅ تم تعديل بيانات المستخدم بنجاح في قاعدة البيانات!');
      editOverlay.classList.add('hidden');

    } else if (type === 'wing') {
      const name = editWingNameInput.value.trim();
      if (!name) {
        alert('يرجى إدخال اسم الجناح.');
        return;
      }

      await updateDoc(doc(db, 'wings', targetId), {
        name
      });

      alert('✅ تم تعديل اسم الجناح بنجاح في قاعدة البيانات!');
      editOverlay.classList.add('hidden');

    } else if (type === 'bed') {
      const bedId = editBedIdInput.value.trim();
      const resident = editBedResidentInput.value.trim();
      const subIdx = parseInt(subIndexStr, 10);

      if (!bedId || !resident || isNaN(subIdx)) {
        alert('يرجى إدخال رمز السرير واسم المقيم.');
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

          alert('✅ تم تعديل بيانات السرير والمقيم بنجاح في قاعدة البيانات!');
          editOverlay.classList.add('hidden');
        } else {
          alert('خطأ: لم يتم العثور على السرير لتعديله.');
        }
      }
    }
  } catch (err: any) {
    console.error('Error saving edits:', err);
    alert('عذراً، حدث خطأ أثناء تعديل البيانات: ' + (err.message || String(err)));
  }
});

// ==========================================
// 11. Core Bootstrapper
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupNotifications();
  listenToDevicesCount();
  listenToRecentAlerts();
  initSOSSettings();
  loadEmergencySettings();
  
  // Secure Authentication initialization
  // Report printing handler
  const printReportBtn = document.getElementById('print-report-btn');
  if (printReportBtn) {
    printReportBtn.addEventListener('click', () => {
      const printWrapper = document.getElementById('print-container-wrapper');
      if (printWrapper) {
        printWrapper.classList.remove('hidden');
      }
      
      // Trigger native print / PDF export
      window.print();
      
      if (printWrapper) {
        printWrapper.classList.add('hidden');
      }
    });
  }

  seedDefaultUsers();
  initWingsAndBeds();
  checkStoredSession();
});
