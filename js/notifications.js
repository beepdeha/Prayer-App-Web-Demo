/* ============================================================
   LOCAL PRAYER NOTIFICATIONS
   Schedules on-device reminders from the prayer data per the
   user's settings. No network needed. No-ops in a plain browser
   (the Capacitor plugin is only present in the native shell).
   ============================================================ */
import { dayTimes, toMinutes, TBC } from "./data.js";

const PRAYERS = [
  { key:"fajr",    label:"Fajr",    startField:"sehri",  jamField:"fajrJ" },
  { key:"zuhr",    label:"Zuhr",    startField:"zuhrS",  jamField:"zuhrJ" },
  { key:"asr",     label:"Asr",     startField:"asrS",   jamField:"asrJ" },
  { key:"maghrib", label:"Maghrib", startField:"maghrib",jamField:"maghrib" },
  { key:"isha",    label:"Isha",    startField:"ishaS",  jamField:"ishaJ" },
];

/* The Azaan setting. Sound files ship outside the gitignored native
   projects: resources/android/raw/*.mp3 (copied into res/raw by
   scripts/build-apk.js) and resources/ios/sounds/*.wav (added to the Xcode
   App target by hand — see NOTES.md). iOS refuses notification sounds over
   30 seconds, so its "full" file is the opening takbir only.
   Android 8+ fixes a sound per notification channel and never lets an app
   change it afterwards, so each choice is its own channel; "none" uses the
   plugin's default channel and the phone's normal notification sound. */
const SOUNDS = {
  full:  { channel:"prayer-azan-full",  name:"Prayer reminders: Full Azaan",      android:"azan_full.mp3",       ios:"azan_full.wav" },
  hayya: { channel:"prayer-azan-hayya", name:"Prayer reminders: Hayya Ala Salah", android:"hayya_ala_salah.mp3", ios:"hayya_ala_salah.wav" },
  none:  null
};

const platform = () => window.Capacitor?.getPlatform?.() || "web";

async function ensureChannels(LN){
  if(platform()!=="android" || !LN.createChannel) return;
  for(const s of Object.values(SOUNDS)){
    if(!s) continue;
    try{
      await LN.createChannel({ id:s.channel, name:s.name, importance:4, sound:s.android, vibration:true, visibility:1 });
    }catch(e){ console.warn("channel create failed", s.channel, e); }
  }
}

/* Fields to add to each notification for the chosen sound. */
function soundFields(choice){
  const s = SOUNDS[choice];
  if(!s) return {};
  return platform()==="ios" ? { sound:s.ios } : { channelId:s.channel, sound:s.android };
}

function plugin(){
  try{ return window.Capacitor?.Plugins?.LocalNotifications || null; }catch{ return null; }
}

export function notificationsAvailable(){ return !!plugin(); }

export async function requestPermission(){
  const LN=plugin(); if(!LN) return false;
  try{ const r=await LN.requestPermissions(); return r.display==="granted"; }
  catch{ return false; }
}

/* Build notification objects for the next `days` days from a base date. */
function buildSchedule(settings, baseDate, days=2){
  const list=[];
  const lead = Math.max(0, Math.min(60, settings.notify.leadMinutes|0));
  const sound = soundFields(settings.notify.sound);
  for(let off=0; off<days; off++){
    const date=new Date(baseDate); date.setDate(date.getDate()+off);
    const t=dayTimes(date); if(!t) continue;
    for(const p of PRAYERS){
      if(!settings.notify.prayers[p.key]) continue;
      /* A Jamaat still to be confirmed has no time to remind at, so that
         prayer falls back to its start time and says why. */
      const tbc = settings.notify.target==="jamaat" && t[p.jamField]===TBC;
      const useJam = settings.notify.target==="jamaat" && !tbc;
      const timeStr = useJam ? (t[p.jamField]||t[p.startField]) : t[p.startField];
      const mins = toMinutes(timeStr, p.key);
      if(mins==null) continue;
      const at=new Date(date); at.setHours(Math.floor(mins/60), mins%60, 0, 0);
      at.setMinutes(at.getMinutes()-lead);
      if(at <= new Date()) continue;             // skip past times
      // stable-ish id: dayOfYear*100 + prayerIndex
      const doy = Math.floor((at - new Date(at.getFullYear(),0,0)) / 86400000);
      const id = doy*100 + PRAYERS.indexOf(p);
      const when = useJam ? "Jamaat" : "starts";
      const body = (lead>0 ? `${p.label} ${when} in ${lead} min` : `${p.label} ${when} now`)
                 + (tbc ? " · Jamaat time TBC" : "");
      list.push({ id, title:"Prayer Times", body, schedule:{ at }, smallIcon:"ic_stat_icon", ...sound });
    }
  }
  return list;
}

/* Cancel everything we previously scheduled, then schedule fresh. */
export async function reschedule(settings){
  const LN=plugin(); if(!LN) return;
  try{
    const pending = await LN.getPending();
    if(pending?.notifications?.length){
      await LN.cancel({ notifications: pending.notifications.map(n=>({id:n.id})) });
    }
    if(!settings.notify.enabled) return;
    const granted = await requestPermission();
    if(!granted) return;
    await ensureChannels(LN);
    const notifications = buildSchedule(settings, new Date(), 2);
    if(notifications.length) await LN.schedule({ notifications });
  }catch(e){ console.warn("notification reschedule failed", e); }
}
