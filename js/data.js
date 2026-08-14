/* ============================================================
   DATA LAYER
   Loads the year's prayer times from data/prayer-times.json and
   builds a flat lookup keyed "M-D" with Jamāʿah carried forward
   (a time applies until it changes, like the printed board).
   Row format:
   [date, sehriEnds, sunrise, zuhrStart, asrStart, ishaStart,
    fajrJamaat, zuhrJamaat, asrJamaat, maghrib, ishaJamaat]
   ============================================================ */

export const DOW = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
export const MON = ["January","February","March","April","May","June","July",
                    "August","September","October","November","December"];

export const TABLE = {};
export const RAW = {};

/* Custom Jamaat times set from the admin console, keyed "M-D".
   Each value holds only the prayers that were overridden, e.g.
   { asr:"7.45", maghrib:"9.42" }.  Empty until loadOverrides() runs. */
export const OVERRIDES = {};

/* Which TABLE field each override prayer key writes to. */
const OVERRIDE_FIELD = {
  fajr:"fajrJ", zuhr:"zuhrJ", asr:"asrJ", isha:"ishaJ", maghrib:"maghrib"
};

export function overrideFor(month, day){ return OVERRIDES[month+"-"+day] || null; }

/* Fetch admin overrides (Firestore → cache → seed). Safe to call late;
   the app renders fine before this resolves. */
export async function loadOverrides(){
  const { loadCollection } = await import("./firebase.js");
  const { data } = await loadCollection("jamaat_overrides", { orderField:"month", desc:false });
  for(const key of Object.keys(OVERRIDES)) delete OVERRIDES[key];
  for(const row of (data||[])){
    // doc id is "M-D"; fall back to month/day fields
    const key = row.id || (row.month+"-"+row.day);
    const times = {};
    for(const p of Object.keys(OVERRIDE_FIELD)) if(row[p]) times[p]=row[p];
    if(Object.keys(times).length) OVERRIDES[key]=times;
  }
  return OVERRIDES;
}

/* Merge any override into a base row from TABLE. */
function withOverride(base, key){
  const ov = OVERRIDES[key];
  if(!ov) return base;
  const out = { ...base };
  for(const [p, field] of Object.entries(OVERRIDE_FIELD)) if(ov[p]) out[field]=ov[p];
  return out;
}

export async function initData(){
  const res = await fetch("data/prayer-times.json");
  const raw = await res.json();
  Object.assign(RAW, raw);

  let lastFajr="", lastZuhr="", lastAsr="", lastIsha="";
  for(let m=1;m<=12;m++){
    if(!raw[m]) continue;
    for(const row of raw[m]){
      const [d,sehri,sunrise,zuhrS,asrS,ishaS,fJ,zJ,aJ,maghrib,iJ]=row;
      if(fJ) lastFajr=fJ;
      if(zJ) lastZuhr=zJ;
      if(aJ) lastAsr=aJ;
      if(iJ) lastIsha=iJ;
      TABLE[m+"-"+d]={
        sehri, sunrise, zuhrS, asrS, ishaS, maghrib,
        fajrJ:lastFajr, zuhrJ:lastZuhr, asrJ:lastAsr, ishaJ:lastIsha
      };
    }
  }
  return TABLE;
}

export function dayTimes(date){
  const key = (date.getMonth()+1)+"-"+date.getDate();
  const base = TABLE[key];
  return base ? withOverride(base, key) : null;
}

/* "Begins" time string -> minutes-from-midnight, choosing AM/PM by prayer. */
export function toMinutes(t, prayer){
  if(!t) return null;
  const [h,mm]=t.split(".").map(Number);
  let hr=h, min=mm||0;
  const pm = (prayer==="zuhr"||prayer==="asr"||prayer==="maghrib"||prayer==="isha");
  if(pm && hr!==12) hr+=12;
  if(prayer==="zuhr" && (h===11)) hr=11;        // winter Zuhr ~11.5x stays AM
  if(prayer==="fajr"||prayer==="sunrise"){ if(hr===12) hr=0; }
  return hr*60+min;
}

/* Display a stored "H.MM" for the reader. The stored value carries no
   AM/PM — which half of the day it means comes from which prayer it is —
   so this delegates to toMinutes() rather than re-deciding, keeping the
   displayed time and the scheduling maths from ever disagreeing. */
export function formatTime(t, prayer, hour12=true, meridiem=true){
  if(!t) return t;
  const total = toMinutes(t, prayer);
  if(total === null) return t;
  const mm = String(total % 60).padStart(2, "0");
  if(!hour12) return `${String(Math.floor(total/60)).padStart(2,"0")}:${mm}`;
  const h24 = Math.floor(total / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  /* Dropping AM/PM only makes sense in 12-hour mode; 24-hour is already
     unambiguous, so `meridiem` is ignored above. */
  return meridiem ? `${h12}.${mm} ${h24 < 12 ? "AM" : "PM"}` : `${h12}.${mm}`;
}

/* Shared "find the next prayer from now" walk, wrapping to tomorrow's Fajr.
   `order` is [displayName, prayerKey, TABLE field] and `fajrField` is the
   field to use for tomorrow's Fajr. */
function nextFrom(order, fajrField, from){
  const now = from || new Date();
  const t = dayTimes(now);
  const nowMin = now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
  if(t){
    for(const [name,key,field] of order){
      const mins=toMinutes(t[field],key);
      if(mins!==null && mins>nowMin){
        const tgt=new Date(now); tgt.setHours(Math.floor(mins/60),mins%60,0,0);
        return {name,target:tgt};
      }
    }
  }
  const tm=new Date(now); tm.setDate(tm.getDate()+1);
  const t2=dayTimes(tm);
  if(t2){
    const mins=toMinutes(t2[fajrField],"fajr");
    if(mins!==null){
      const tgt=new Date(tm); tgt.setHours(Math.floor(mins/60),mins%60,0,0);
      return {name:"Fajr",target:tgt};
    }
  }
  return null;
}

/* The prayer period we are currently in — the last one whose start time
   has passed. Before today's Fajr this wraps back to yesterday's Isha.
   Sunrise is included as a period so we never imply Fajr is still open. */
export function currentPrayer(from){
  const now = from || new Date();
  const t = dayTimes(now);
  const nowMin = now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
  if(t){
    const seq=[
      ["Fajr","fajr","sehri","fajrJ",""],
      ["Sunrise","sunrise","sunrise",null,"Fajr has ended"],
      ["Zuhr","zuhr","zuhrS","zuhrJ",""],
      ["Asr","asr","asrS","asrJ",""],
      ["Maghrib","maghrib","maghrib","maghrib",""],
      ["Isha","isha","ishaS","ishaJ",""]
    ];
    let cur=null;
    for(const [name,key,sf,jf,note] of seq){
      const mins=toMinutes(t[sf],key);
      if(mins===null) continue;
      if(mins<=nowMin) cur={ name, key, begins:t[sf], jamaat:jf?t[jf]:"", note };
      else break;                       // list is in time order
    }
    if(cur) return cur;
  }
  const y=new Date(now); y.setDate(y.getDate()-1);
  const ty=dayTimes(y);
  if(ty) return { name:"Isha", key:"isha", begins:ty.ishaS, jamaat:ty.ishaJ, note:"" };
  return null;
}

/* Which day the Prayers page should show by default: today, or tomorrow
   once the last prayer (Isha) has started and today's list is spent. */
export function defaultViewDate(from){
  const now = from || new Date();
  const d = new Date(now); d.setHours(0,0,0,0);
  const t = dayTimes(now);
  if(t){
    const isha = toMinutes(t.ishaS, "isha");
    const nowMin = now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
    if(isha!==null && nowMin >= isha) d.setDate(d.getDate()+1);
  }
  return d;
}

/* Next prayer to BEGIN from now. */
export function nextBegins(from){
  return nextFrom([["Fajr","fajr","sehri"],["Zuhr","zuhr","zuhrS"],["Asr","asr","asrS"],
                   ["Maghrib","maghrib","maghrib"],["Isha","isha","ishaS"]], "sehri", from);
}

/* Next JAMAAT from now (Maghrib's single time serves as both). */
export function nextJamaat(from){
  return nextFrom([["Fajr","fajr","fajrJ"],["Zuhr","zuhr","zuhrJ"],["Asr","asr","asrJ"],
                   ["Maghrib","maghrib","maghrib"],["Isha","isha","ishaJ"]], "fajrJ", from);
}
