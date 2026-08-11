/* ============================================================
   ANNOUNCEMENTS VIEW — Announcements / Janaza / Madrassa / Reminders.
   Each item has a `type` of announcement | death | madrassa | reminder.
   ("death" is kept as the stored key so existing posts still show;
   it is only labelled "Janaza" in the UI.)
   Newest first (by createdAt); shows posted date + time of day.
   ============================================================ */
import { loadCollection, countView } from "./firebase.js";
import { attachPTR } from "./ptr.js";
import { enter, stagger } from "./motion.js";
import { markSeen, unreadCount, hasBeenViewed, markViewed } from "./seen.js";

const $ = id => document.getElementById(id);
const TYPES = { announcement:"announcements", death:"Janaza notices",
                madrassa:"madrassa announcements", reminder:"reminders" };
const SUBTAB_TYPES = ["announcement","death","madrassa","reminder"];
let activeType = "announcement";
let items = [];
let ptrAttached = false;

export const getAnnouncements = () => items;   // read by app.js's badge counter

/* Per-type sub-tab badges. The nav-level Announcements badge is handled
   in app.js and clears as soon as the section is opened at all; these
   stay granular so you can still see which category is unread. */
async function refreshSubtabBadges(){
  for(const t of SUBTAB_TYPES){
    const el = document.querySelector(`#announcementsView .badge[data-badge="announcements.${t}"]`);
    if(!el) continue;
    const n = await unreadCount(`announcements.${t}`, items.filter(i=>(i.type||"announcement")===t));
    el.textContent = n > 99 ? "99+" : String(n);
    el.hidden = n === 0;
  }
}

function esc(s=""){ return String(s).replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }

function postedAt(i){
  if(i.createdAt) return new Date(i.createdAt);
  if(i.date){ const d=new Date(i.date); if(!isNaN(d)) return d; }
  return null;
}
function fmtDateTime(i){
  const d = postedAt(i);
  if(!d) return "";
  return d.toLocaleDateString(undefined,{ day:"numeric", month:"long", year:"numeric" }) +
         " · " + d.toLocaleTimeString(undefined,{ hour:"numeric", minute:"2-digit" });
}

/* `first` is true only on the section's initial render — that is where the
   stagger is worth spending; a sub-tab switch or a refresh just fades. */
function renderList(first=false){
  document.querySelectorAll("#announcementsView .subtab").forEach(b=>
    b.classList.toggle("active", b.dataset.type===activeType));

  const list=$("annList");
  const rows=items
    .filter(i=>(i.type||"announcement")===activeType)
    .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));   // newest first
  if(!rows.length){
    list.classList.remove("stagger");
    list.innerHTML=`<p class="empty">No ${TYPES[activeType]} at the moment.<br>Check back soon.</p>`;
    enter(list, "fade-enter");
    return;
  }
  list.classList.remove("stagger");
  list.innerHTML=rows.map(i=>`
    <div class="item">
      <div class="meta">${esc(fmtDateTime(i))}</div>
      <h2>${esc(i.title||"")}</h2>
      ${i.image?`<img src="${esc(i.image)}" alt="" loading="lazy">`:""}
      ${i.body?`<p>${esc(i.body).replace(/\n/g,"<br>")}</p>`:""}
    </div>`).join("");
  first ? stagger(list) : enter(list, "fade-enter");
  countViews(rows);
}

/* Announcements render in full in the list — there is no detail screen to
   open — so appearing in a rendered list is the only "read" signal there
   is. Fire-and-forget after paint so it never delays rendering. */
function countViews(rows){
  rows.forEach(async i=>{
    if(!i.id || await hasBeenViewed("announcement", i.id)) return;
    // only remember it locally once the backend has actually counted it,
    // otherwise an offline read would be dropped and never retried
    if(await countView("announcements", i.id)) await markViewed("announcement", i.id);
  });
}

async function load(){
  const { data } = await loadCollection("announcements", { orderField:"createdAt", desc:true });
  items=data||[];
  document.dispatchEvent(new CustomEvent("content:updated", { detail:"announcements" }));
}

/* Fetch without rendering, so the nav and sub-tab badges are right even
   for a section the user has never opened. */
export async function primeAnnouncements(){
  await load();
  await refreshSubtabBadges();
}

/* Opening a sub-tab marks that one type read, then repaints the badges. */
async function openType(type){
  activeType = type;
  renderList();
  await markSeen(`announcements.${type}`);
  await refreshSubtabBadges();
}

export async function initAnnouncements(){
  $("annList").innerHTML=`<p class="empty">Loading…</p>`;
  document.querySelectorAll("#announcementsView .subtab").forEach(b=>{
    b.onclick=()=>openType(b.dataset.type);
  });
  await load();
  renderList(true);
  /* The type that is already showing on arrival counts as read too. */
  await markSeen(`announcements.${activeType}`);
  await refreshSubtabBadges();
  if(!ptrAttached){
    ptrAttached = true;
    attachPTR({ sectionId:"announcementsView", ptrId:"ptrAnn", textId:"ptrAnnText",
                onRefresh: async ()=>{ await load(); renderList(); await refreshSubtabBadges(); } });
  }
}
