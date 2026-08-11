/* ============================================================
   APP BOOTSTRAP — loads data, wires the bottom nav, and lazily
   initialises each section the first time it is opened.
   Also: first-run onboarding (settings before entering the app),
   auto-refresh of live content on app resume, and the About
   easter egg.
   ============================================================ */
import { initData, loadOverrides } from "./data.js";
import { getItem, setItem } from "./store.js";
import { initSettings, getSettings, renderSettings } from "./settings.js";
import { reschedule } from "./notifications.js";
import { syncSubscriptions } from "./push.js";
import { initLinks } from "./links.js";
import { initPrayers, refreshPrayers } from "./prayers.js";
import { initTimetable } from "./timetable.js";
import { initEvents, getEvents, primeEvents } from "./events.js";
import { initAnnouncements, getAnnouncements, primeAnnouncements } from "./announcements.js";
import { initDirectory, getDirectoryUnread, primeDirectory } from "./directory.js";
import { enter } from "./motion.js";
import { markSeen, unreadCount } from "./seen.js";

const $ = id => document.getElementById(id);
const ONBOARD_KEY = "onboarded.v1";

const SECTIONS = {
  prayers:       { el:"todayView" },
  timetable:     { el:"timetableView" },
  events:        { el:"eventsView" },
  announcements: { el:"announcementsView" },
  directory:     { el:"directoryView" },
  settings:      { el:"settingsView" },
  about:         { el:"aboutView" },
};
const LIVE = ["events","announcements","directory"];   // sections fed by Firebase
const inited = new Set();
let current = "prayers";

function lazyInit(name){
  if(inited.has(name)) {
    if(name==="prayers") refreshPrayers();
    if(name==="settings") renderSettings();
    return;
  }
  inited.add(name);
  switch(name){
    case "prayers":       initPrayers(refreshLiveContent); break;
    case "timetable":     initTimetable(); break;
    case "events":        initEvents(); break;
    case "announcements": initAnnouncements(); break;
    case "directory":     initDirectory(); break;
    case "settings":      renderSettings(); break;
    case "about":         wireAbout(); break;
  }
}

/* Mark live sections stale so they re-fetch next time they're opened,
   and re-pull the admin's custom Jamaat times. */
async function refreshLiveContent(){
  LIVE.forEach(n=>inited.delete(n));
  inited.delete("timetable");
  await loadOverrides().catch(()=>{});
}

/* ---- Unread badges ----
   BADGED sections each own a "seen" watermark; the count is how many
   items are newer than it. Sub-tab and per-business badges are finer
   grained and live in their own modules — these are the nav-bar ones. */
const BADGED = ["events","announcements","directory"];

async function badgeCount(name){
  if(name==="events")        return await unreadCount("events", getEvents());
  if(name==="announcements") return await unreadCount("announcements", getAnnouncements());
  if(name==="directory")     return getDirectoryUnread();
  return 0;
}

async function refreshNavBadges(which){
  for(const name of (which && BADGED.includes(which) ? [which] : BADGED)){
    const el = document.querySelector(`.navitem .badge[data-badge="${name}"]`);
    if(!el) continue;
    const n = await badgeCount(name);
    el.textContent = n > 99 ? "99+" : String(n);
    el.hidden = n === 0;
  }
}

/* Each live section announces when its data changed, so the nav can
   recount without app.js having to re-fetch anything itself. */
document.addEventListener("content:updated", e => { refreshNavBadges(e.detail); });

/* A badge for a section you have never opened is the whole point, so the
   live collections get fetched once up front rather than waiting for
   lazyInit. Skips whichever section is already loading itself, and never
   lets a failed fetch break startup. */
function primeBadges(){
  const primes = { events:primeEvents, announcements:primeAnnouncements, directory:primeDirectory };
  BADGED.filter(n=>!inited.has(n)).forEach(n=>{ primes[n]().catch(()=>{}); });
}

function show(name){
  if(!SECTIONS[name]) return;
  current=name;
  Object.entries(SECTIONS).forEach(([k,v])=> $(v.el).hidden = (k!==name));
  // About lives under Settings in the nav
  const navKey = (name==="about") ? "settings" : name;
  document.querySelectorAll(".navitem").forEach(b=>
    b.classList.toggle("active", b.dataset.nav===navKey));
  lazyInit(name);
  /* Opening a section clears its nav badge straight away rather than
     waiting for the next fetch. Finer-grained badges (announcement
     sub-tabs, individual businesses) stay until their own item is opened. */
  if(BADGED.includes(name)) markSeen(name).then(()=>refreshNavBadges(name));
  window.scrollTo({ top:0 });   // stays instant — never smooth-scroll a view change
  enter($(SECTIONS[name].el));
}

/* ---- About: back link + easter egg (5 taps on Credits) ---- */
function wireAbout(){
  $("aboutBack").onclick=()=>show("settings");
  let clicks=0, timer=null;
  $("creditsBox").onclick=()=>{
    clicks++;
    clearTimeout(timer);
    timer=setTimeout(()=>{ clicks=0; }, 3000);   // taps must be reasonably close together
    if(clicks>=5){
      clicks=0;
      $("aboutContent").hidden=true;
      $("easterEgg").hidden=false;
      window.scrollTo({ top:0 });
    }
  };
  $("easterBack").onclick=()=>{
    $("easterEgg").hidden=true;
    $("aboutContent").hidden=false;
  };
}

function wireNav(){
  document.querySelectorAll(".navitem").forEach(b=>{
    b.onclick=()=>show(b.dataset.nav);
  });
  // other modules (e.g. the About link in Settings) can navigate too
  document.addEventListener("app:navigate", e=>show(e.detail));
}

/* ---- Auto-refresh live content when the app returns to the foreground ---- */
function wireResumeRefresh(){
  const onResume=async ()=>{
    if(document.visibilityState!=="visible") return;
    LIVE.forEach(n=>inited.delete(n));
    if(LIVE.includes(current)) lazyInit(current);   // re-fetch the visible section now
    primeBadges();                                  // and recount the ones that stayed shut
    await loadOverrides().catch(()=>{});            // custom Jamaat times may have changed
    inited.delete("timetable");
    if(current==="timetable") lazyInit("timetable");
    if(current==="prayers") refreshPrayers();
  };
  document.addEventListener("visibilitychange", onResume);
  window.addEventListener("focus", onResume);
}

/* ---- First-run onboarding: one glance, not a tour ----
   Only text size and dark mode are asked up front — the two choices that
   are awkward to discover later because they change how everything else
   looks. Notification granularity and display-mode options are real
   settings, just not ones worth gatekeeping entry on; they wait in
   Settings, discovered on purpose rather than forced now. */
async function startOnboarding(){
  document.querySelector(".bottomnav").style.display="none";
  Object.entries(SECTIONS).forEach(([k,v])=> $(v.el).hidden = (k!=="settings"));
  current="settings";
  inited.add("settings");
  renderSettings({ onboarding:true });
  window.scrollTo({ top:0 });
  enter($("settingsView"));

  const view=$("settingsView");
  view.insertAdjacentHTML("afterbegin",
    `<div class="onboard-banner">Asalaamu Alaikum 👋<br>Set how the app looks — everything else is in Settings whenever you want it.</div>`);
  view.insertAdjacentHTML("beforeend",
    `<button class="onboard-continue" id="onboardContinue">Continue to Prayers →</button>`);
  $("onboardContinue").onclick=async()=>{
    await setItem(ONBOARD_KEY, true);
    view.querySelector(".onboard-banner")?.remove();
    $("onboardContinue")?.remove();
    document.querySelector(".bottomnav").style.display="";
    inited.delete("settings");   // next real visit to Settings renders the full screen
    show("prayers");
  };
}

async function main(){
  initLinks();
  await initData();
  await loadOverrides().catch(()=>{});   // custom Jamaat times from the admin console
  await initSettings(kind=>{
    if(kind==="notify") reschedule(getSettings());
    if(kind==="announce") syncSubscriptions(getSettings());
    if(kind==="theme"||kind==="font"||kind==="display") refreshPrayers();
  });
  wireNav();
  wireResumeRefresh();

  const onboarded = await getItem(ONBOARD_KEY, false);
  if(onboarded) show("prayers");
  else await startOnboarding();

  primeBadges();   // count unread for sections the user hasn't opened

  // apply saved notification prefs on launch
  reschedule(getSettings());
  syncSubscriptions(getSettings());
}

main().catch(e=>{
  console.error(e);
  document.body.insertAdjacentHTML("beforeend",
    `<p class="empty">Something went wrong loading the app.</p>`);
});
