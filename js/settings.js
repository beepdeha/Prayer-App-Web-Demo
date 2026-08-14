/* ============================================================
   SETTINGS — font scale, light/dark theme, notification prefs.
   Persisted via store.js. Other modules read getSettings().
   ============================================================ */
import { getItem, setItem } from "./store.js";

const PRAYERS = ["fajr","zuhr","asr","maghrib","isha"];
const ANNOUNCE_TYPES = [
  ["events","Events"], ["announcement","Announcements"], ["death","Janaza"],
  ["madrassa","Madrassa"], ["reminder","Reminders"], ["offers","Business offers"]
];
const KEY = "settings.v1";

const DEFAULTS = {
  fontScale: 1,
  theme: "light",            // "light" | "dark"
  display: {
    times: "both",           // prayer table: "both" | "begins" | "jamaat"
    countdown: "both",       // countdown:    "both" | "begins" | "jamaat"
    hour12: true             // true = "7.00 PM", false = "19:00"
  },
  notify: {
    enabled: false,
    target: "jamaat",        // "jamaat" | "start"
    leadMinutes: 10,         // 0–60, minutes before
    prayers: { fajr:true, zuhr:true, asr:true, maghrib:true, isha:true }
  },
  announce: {                // push notifications for posted content
    enabled: false,
    types: { events:true, announcement:true, reminder:true, death:true, madrassa:true, offers:true }
  }
};

let state = structuredClone(DEFAULTS);
let onChange = ()=>{};

export function getSettings(){ return state; }

function apply(){
  document.documentElement.style.setProperty("--fs", state.fontScale.toFixed(2));
  document.documentElement.setAttribute("data-theme", state.theme);
  const tc = document.querySelector('meta[name="theme-color"]');
  if(tc) tc.setAttribute("content", state.theme==="dark" ? "#06081f" : "#0A1247");
}

async function persist(){ await setItem(KEY, state); }

export async function initSettings(changeCb){
  onChange = changeCb || (()=>{});
  const saved = await getItem(KEY, null);
  if(saved) state = Object.assign(structuredClone(DEFAULTS), saved, {
    display: Object.assign(structuredClone(DEFAULTS.display), saved.display||{}),
    notify: Object.assign(structuredClone(DEFAULTS.notify), saved.notify||{}),
    announce: Object.assign(structuredClone(DEFAULTS.announce), saved.announce||{}, {
      types: Object.assign(structuredClone(DEFAULTS.announce.types), saved.announce?.types||{})
    })
  });
  apply();
}

const $ = id => document.getElementById(id);
const clampLead = n => Math.max(0, Math.min(60, Math.round(Number(n)||0)));

/* The Display card's text-size + dark-mode rows are the only settings
   worth asking for before someone has even seen the app — everything else
   (prayer/countdown display mode, both notification cards) is fine to
   discover later in Settings, on purpose, when it's wanted. Shared between
   the full Settings screen and the trimmed first-run render below. */
function displayCard(s, { onboarding }){
  return `
    <div class="set-card">
      <h2>Display</h2>
      <div class="set-row">
        <div class="lbl">Text size</div>
        <div class="stepper">
          <button id="fontDec" aria-label="Smaller text">A−</button>
          <span class="v" id="fontVal">${Math.round(s.fontScale*100)}%</span>
          <button id="fontInc" aria-label="Larger text">A+</button>
        </div>
      </div>
      <div class="set-row">
        <div class="lbl">Dark mode</div>
        <label class="toggle"><input type="checkbox" id="darkToggle" ${s.theme==="dark"?"checked":""}><span class="track"></span><span class="knob"></span></label>
      </div>
      <div class="set-row">
        <div class="lbl">24-hour time<small>Off shows AM/PM, e.g. 7.00 PM</small></div>
        <label class="toggle"><input type="checkbox" id="hour24Toggle" ${!s.display.hour12?"checked":""}><span class="track"></span><span class="knob"></span></label>
      </div>
      ${onboarding ? "" : `
      <div class="set-row">
        <div class="lbl">Prayer times shown<small>Which times to show on the Prayers page</small></div>
        <select class="sel" id="dispTimes">
          <option value="both" ${s.display.times==="both"?"selected":""}>Both</option>
          <option value="begins" ${s.display.times==="begins"?"selected":""}>Start only</option>
          <option value="jamaat" ${s.display.times==="jamaat"?"selected":""}>Jamaat only</option>
        </select>
      </div>
      <div class="set-row">
        <div class="lbl">Countdown<small>Which countdown to display</small></div>
        <select class="sel" id="dispCountdown">
          <option value="both" ${s.display.countdown==="both"?"selected":""}>Both</option>
          <option value="begins" ${s.display.countdown==="begins"?"selected":""}>Start only</option>
          <option value="jamaat" ${s.display.countdown==="jamaat"?"selected":""}>Jamaat only</option>
        </select>
      </div>`}
    </div>`;
}

/* Wires only the two controls onboarding actually renders. The full-screen
   wiring below adds the rest on top of this when !onboarding. */
function wireDisplayCard(s){
  $("fontInc").onclick=()=>setFont(s.fontScale+0.1);
  $("fontDec").onclick=()=>setFont(s.fontScale-0.1);
  $("darkToggle").onchange=e=>{ s.theme=e.target.checked?"dark":"light"; apply(); persist(); onChange("theme"); };
  $("hour24Toggle").onchange=e=>{ s.display.hour12=!e.target.checked; persist(); onChange("display"); };
}

/* `{ onboarding: true }` renders just the Display card (text size + dark
   mode) with no About link and no notification cards — first-run should
   take one glance, not a full tour of every preference in the app. */
export function renderSettings(opts={}){
  const { onboarding=false } = opts;
  const s=state;
  const root=$("settingsView");

  if(onboarding){
    root.querySelector(".settings").innerHTML = displayCard(s, { onboarding:true });
    wireDisplayCard(s);
    return;
  }

  root.querySelector(".settings").innerHTML = `
    <div class="set-card">
      <div class="set-row linkrow" id="aboutLink" role="button" tabindex="0">
        <div class="lbl" style="font-weight:700">About</div>
        <span class="chev">›</span>
      </div>
    </div>

    ${displayCard(s, { onboarding:false })}

    <div class="set-card">
      <h2>Prayer notifications</h2>
      <div class="set-row">
        <div class="lbl">Enable notifications</div>
        <label class="toggle"><input type="checkbox" id="notifToggle" ${s.notify.enabled?"checked":""}><span class="track"></span><span class="knob"></span></label>
      </div>
      <div class="set-row">
        <div class="lbl">Notify for</div>
        <select class="sel" id="notifTarget">
          <option value="jamaat" ${s.notify.target==="jamaat"?"selected":""}>Jamaat time</option>
          <option value="start" ${s.notify.target==="start"?"selected":""}>Starting time</option>
        </select>
      </div>
      <div class="set-row">
        <div class="lbl">Minutes before<small>How early to remind you (0–60)</small></div>
        <input class="num-input" id="notifLead" type="number" inputmode="numeric" min="0" max="60" value="${s.notify.leadMinutes}">
      </div>
      ${PRAYERS.map(p=>`
      <div class="set-row">
        <div class="lbl">${p.charAt(0).toUpperCase()+p.slice(1)}</div>
        <label class="toggle"><input type="checkbox" data-prayer="${p}" ${s.notify.prayers[p]?"checked":""}><span class="track"></span><span class="knob"></span></label>
      </div>`).join("")}
      <p class="note" style="margin-top:14px;text-align:left">Note: Maghrib reminders use its single time. Reminders are scheduled on your device and work offline.</p>
    </div>

    <div class="set-card">
      <h2>Announcement notifications</h2>
      <div class="set-row">
        <div class="lbl">Enable notifications<small>Get notified when new posts are added</small></div>
        <label class="toggle"><input type="checkbox" id="annNotifToggle" ${s.announce.enabled?"checked":""}><span class="track"></span><span class="knob"></span></label>
      </div>
      ${ANNOUNCE_TYPES.map(([k,label])=>`
      <div class="set-row">
        <div class="lbl">${label}</div>
        <label class="toggle"><input type="checkbox" data-anntype="${k}" ${s.announce.types[k]?"checked":""}><span class="track"></span><span class="knob"></span></label>
      </div>`).join("")}
    </div>`;

  // wire controls
  $("aboutLink").onclick=()=>document.dispatchEvent(new CustomEvent("app:navigate",{ detail:"about" }));
  wireDisplayCard(s);
  $("dispTimes").onchange=e=>{ s.display.times=e.target.value; persist(); onChange("display"); };
  $("dispCountdown").onchange=e=>{ s.display.countdown=e.target.value; persist(); onChange("display"); };
  $("notifToggle").onchange=e=>{ s.notify.enabled=e.target.checked; persist(); onChange("notify"); };
  $("notifTarget").onchange=e=>{ s.notify.target=e.target.value; persist(); onChange("notify"); };
  $("notifLead").onchange=e=>{ s.notify.leadMinutes=clampLead(e.target.value); e.target.value=s.notify.leadMinutes; persist(); onChange("notify"); };
  root.querySelectorAll('input[data-prayer]').forEach(cb=>{
    cb.onchange=()=>{ s.notify.prayers[cb.dataset.prayer]=cb.checked; persist(); onChange("notify"); };
  });
  $("annNotifToggle").onchange=e=>{ s.announce.enabled=e.target.checked; persist(); onChange("announce"); };
  root.querySelectorAll('input[data-anntype]').forEach(cb=>{
    cb.onchange=()=>{ s.announce.types[cb.dataset.anntype]=cb.checked; persist(); onChange("announce"); };
  });
}

function setFont(v){
  state.fontScale=Math.max(0.85, Math.min(1.6, Math.round(v*10)/10));
  apply(); persist();
  const el=$("fontVal"); if(el) el.textContent=Math.round(state.fontScale*100)+"%";
  onChange("font");
}
