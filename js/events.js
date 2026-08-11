/* ============================================================
   EVENTS VIEW — upcoming events, soonest first.
   Past events disappear automatically. Each event:
   { title, date(YYYY-MM-DD), startTime(HH:MM), durationHours?,
     location, description, image? }
   ============================================================ */
import { loadCollection, countView } from "./firebase.js";
import { attachPTR } from "./ptr.js";
import { enter, stagger } from "./motion.js";
import { hasBeenViewed, markViewed } from "./seen.js";

const $ = id => document.getElementById(id);
let ptrAttached = false;
let visible = [];                       // upcoming events currently rendered
export const getEvents = () => visible; // read by app.js's badge counter

function esc(s=""){ return String(s).replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }

function startOf(ev){
  if(!ev.date) return null;
  const t = ev.startTime && /^\d{1,2}:\d{2}$/.test(ev.startTime) ? ev.startTime : "00:00";
  const d = new Date(`${ev.date}T${t}`);
  return isNaN(d) ? null : d;
}
function endOf(ev, start){
  const h = Number(ev.durationHours);
  if(h>0) return new Date(start.getTime() + h*3600000);
  // no duration → lasts until end of its day
  const e = new Date(start); e.setHours(23,59,59,999); return e;
}
function fmtTime(d){
  return d.toLocaleTimeString(undefined,{ hour:"numeric", minute:"2-digit" });
}
function fmtWhen(start, end, hasDuration){
  const day = start.toLocaleDateString(undefined,{ weekday:"short", day:"numeric", month:"long" });
  const time = hasDuration ? `${fmtTime(start)} – ${fmtTime(end)}` : fmtTime(start);
  return `${day} · ${time}`;
}

/* Load, keep only what is still to come, soonest first. Shared by the
   full render and by the badge-only prime below.
   Only upcoming events feed the badge — badging one that has already
   finished would show a count against an empty list. */
async function loadUpcoming(){
  const { data } = await loadCollection("events", { orderField:"date", desc:false });
  const now = new Date();
  const upcoming = (data||[])
    .map(ev=>{ const s=startOf(ev); return s ? { ev, start:s, end:endOf(ev,s), hasDur:Number(ev.durationHours)>0 } : null; })
    .filter(x=> x && x.end >= now)
    .sort((a,b)=> a.start - b.start);
  visible = upcoming.map(x=>x.ev);
  document.dispatchEvent(new CustomEvent("content:updated", { detail:"events" }));
  return upcoming;
}

/* Fetch without rendering, so the nav badge is right even for a section
   the user has never opened. */
export async function primeEvents(){ await loadUpcoming(); }

/* `first` is true only on the section's initial render — that is where the
   stagger is worth spending; a pull-to-refresh just fades. */
async function loadAndRender(first=false){
  const upcoming = await loadUpcoming();
  const list = $("eventsList");
  list.classList.remove("stagger");
  if(!upcoming.length){
    list.innerHTML = `<p class="empty">No upcoming events at the moment.<br>Check back soon.</p>`;
    enter(list, "fade-enter");
    return;
  }
  list.innerHTML = upcoming.map(x=>{
    const e=x.ev;
    return `<div class="event">
      <h2>${esc(e.title||"Event")}</h2>
      <div class="when">${esc(fmtWhen(x.start, x.end, x.hasDur))}</div>
      ${e.location?`<div class="where">📍 ${esc(e.location)}</div>`:""}
      ${e.image?`<img src="${esc(e.image)}" alt="" loading="lazy">`:""}
      ${e.description?`<p>${esc(e.description).replace(/\n/g,"<br>")}</p>`:""}
    </div>`;
  }).join("");
  first ? stagger(list) : enter(list, "fade-enter");

  /* Events render in full in the list — there is no detail screen to open
     — so appearing in a rendered list is the only "read" signal there is.
     Fire-and-forget after paint so it never delays rendering. */
  upcoming.forEach(async x=>{
    const id = x.ev.id;
    if(!id || await hasBeenViewed("event", id)) return;
    // only remember it locally once the backend has actually counted it,
    // otherwise an offline read would be dropped and never retried
    if(await countView("events", id)) await markViewed("event", id);
  });
}

export async function initEvents(){
  $("eventsList").innerHTML = `<p class="empty">Loading…</p>`;
  await loadAndRender(true);
  if(!ptrAttached){
    ptrAttached = true;
    attachPTR({ sectionId:"eventsView", ptrId:"ptrEvents", textId:"ptrEventsText", onRefresh: loadAndRender });
  }
}
