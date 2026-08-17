/* ============================================================
   PUSH NOTIFICATIONS (Android via Firebase Cloud Messaging).
   Uses @capacitor-firebase/messaging topic subscriptions so no
   device-token management is needed: a Cloud Function publishes
   to a topic when content is posted, and devices subscribed to
   that topic receive it.
   No-ops on the web (plugin only present in the native shell).
   ============================================================ */

// settings type-key  ->  FCM topic
const TOPIC = { events:"events", announcement:"announcements", reminder:"reminders",
                death:"deaths", madrassa:"madrassa", offers:"offers" };

function plugin(){
  try{ return window.Capacitor?.Plugins?.FirebaseMessaging || null; }catch{ return null; }
}
export function pushAvailable(){ return !!plugin(); }

/* Android 8+ drops any notification posted to a channel that does not exist,
   silently — no error, nothing in the tray. The Cloud Functions send
   channelId:"default" (see pushToTopic in functions/index.js), and
   @capacitor/local-notifications owns a channel by that id but only creates
   it when a local notification is first scheduled. So a user who enables
   announcements but never prayer reminders would have no channel, and every
   push would vanish. Create it up front instead. Idempotent — Android
   ignores a repeat create for the same id. */
async function ensureChannel(){
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  if(!LN?.createChannel) return;
  try{
    await LN.createChannel({
      id: "default",
      name: "Masjid notifications",
      description: "Announcements, events and prayer time reminders",
      importance: 4,          // HIGH — heads-up, matching the priority the functions send
      visibility: 1           // PUBLIC — safe on a lock screen; nothing here is private
    });
  }catch(e){ console.warn("notification channel setup failed", e); }
}

async function ensurePermission(){
  const M=plugin(); if(!M) return false;
  try{
    let r = await M.checkPermissions();
    if(r.receive!=="granted") r = await M.requestPermissions();
    if(r.receive!=="granted") return false;
    await ensureChannel();
    await M.getToken();          // registers the device with FCM
    return true;
  }catch(e){ console.warn("push permission failed", e); return false; }
}

/* Bring topic subscriptions in line with the saved settings. */
export async function syncSubscriptions(settings){
  const M=plugin(); if(!M) return;
  const a = settings.announce || {};
  try{
    if(!a.enabled){
      for(const t of Object.values(TOPIC)){ try{ await M.unsubscribeFromTopic({ topic:t }); }catch{} }
      return;
    }
    const granted = await ensurePermission();
    if(!granted) return;
    for(const [key, topic] of Object.entries(TOPIC)){
      const on = a.types?.[key];
      try{
        if(on) await M.subscribeToTopic({ topic });
        else   await M.unsubscribeFromTopic({ topic });
      }catch(e){ console.warn("topic sync failed", topic, e); }
    }
  }catch(e){ console.warn("syncSubscriptions failed", e); }
}
