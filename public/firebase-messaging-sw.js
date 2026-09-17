// Import the Firebase scripts inside the service worker using compat library
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

// Initialize Firebase App in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyCU08ox3MZEUCKbdeNjB8XV9E0clLn5RwA",
  authDomain: "abdelazim-3ad39.firebaseapp.com",
  projectId: "abdelazim-3ad39",
  storageBucket: "abdelazim-3ad39.firebasestorage.app",
  messagingSenderId: "1089326447312",
  appId: "1:1089326447312:web:30c32a689fd98b84bbfcd5",
  measurementId: "G-TP0L5VL9Y7"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  const notificationTitle = payload.notification?.title || '⚠️ نداء استغاثة عاجل SOS!';
  const notificationOptions = {
    body: payload.notification?.body || 'تم إرسال نداء طوارئ من أحد الأجهزة النشطة. اضغط للتحقق فورا.',
    icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
    vibrate: [300, 100, 300, 100, 400, 100, 500],
    tag: 'sos-alert',
    renewed: true,
    data: {
      click_action: payload.fcmOptions?.link || '/'
    }
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click to focus or open the app
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If a window is already open, focus it
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
            break;
          }
        }
        return client.focus();
      }
      // If not, open a new window
      return clients.openWindow('/');
    })
  );
});
