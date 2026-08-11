/* ============================================================
   DIRECTORY VIEW — Masjids (square grid → detail) and
   Businesses (list → detail with offers).
   ============================================================ */
import { loadCollection } from "./firebase.js";
import { normalizeUrl } from "./links.js";
import { enter } from "./motion.js";
import { getLastSeen, markSeen } from "./seen.js";
import { showMap, hideMap, setDetailHandler } from "./map.js";

const $ = id => document.getElementById(id);
let activeTab = "mosques";
let mosques = [];
let businesses = [];
let offersByBiz = {};
/* businessId -> count of offers newer than the last time this device
   opened that business. Precomputed because seen.js is async but the
   grid renderers are not. */
let unseenByBiz = {};

export const getDirectoryUnread = () =>
  Object.values(unseenByBiz).filter(n => n > 0).length;

async function computeUnseen(){
  const next = {};
  for(const b of businesses){
    const last = await getLastSeen(`directory.business.${b.id}`);
    /* Never seen this business before: treat its existing offers as read,
       matching seen.js's quiet-first-run rule, so a fresh install does not
       badge every business at once. */
    next[b.id] = last === null
      ? 0
      : (offersByBiz[b.id] || []).filter(o => (o.createdAt || 0) > last).length;
    if(last === null) await markSeen(`directory.business.${b.id}`);
  }
  unseenByBiz = next;
}

const BUSINESS_INTRO = "Our Business Directory exists to help our community benefit from the services offered by local Muslim-owned businesses. It's a win for everyone: the community gets easy access to trusted local services, the businesses gain visibility and custom, and every business that advertises with us also directly supports Dar Ul Uloom Sheffield.";

function esc(s=""){ return String(s).replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }

/* Admin-entered placeholder slots ("Masjid 3 (to be added)", "Business 4
   (available)") are real, intentional content — reserved directory space,
   not an error. But rendered with full card weight they read as a broken
   or abandoned feature. Give them an honest, visually distinct "reserved
   slot" treatment instead of pretending they're a finished listing. */
const isPlaceholder = name => /\((?:to be added|available)\)\s*$/i.test(String(name||"").trim());

/* `cls` picks the entrance: a plain fade when switching sub-tabs, a
   return-from-the-left when coming back out of a detail page. */
function showSection(cls="fade-enter"){
  document.querySelectorAll("#directoryView .subtab").forEach(b=>
    b.classList.toggle("active", b.dataset.dir===activeTab));
  $("mosqueDetail").hidden=true;
  hideMap();
  $("dirList").hidden=false;
  activeTab==="mosques" ? renderMasjids() : renderBusinesses();
  enter($("dirList"), cls);
}
const backToList = ()=>showSection("back-enter");

/* Opening the map, and coming back out of a detail page that was reached
   from it, both route through here so "back" lands where the user came
   from rather than always dumping them on the grid. */
function openMap(){ showMap(mosques, { onBack: backToList }); }
setDetailHandler(id => { showMasjid(id); $("backBtn").onclick = openMap; });

/* ---------- Masjids (square cards, 2-up) ---------- */
function renderMasjids(){
  const list=$("dirList");
  if(!mosques.length){ list.innerHTML=`<p class="empty">No masjids listed yet.</p>`; return; }
  /* Only offer the map once at least one masjid actually has a pin,
     otherwise it opens onto an empty map. */
  const anyPinned = mosques.some(m=>Number.isFinite(m.lat) && Number.isFinite(m.lng));
  list.innerHTML =
    (anyPinned ? `<button class="backlink mapbtn" id="viewMapBtn">📍 View on map</button>` : "") +
    `<div class="dir-grid">` + mosques.map(m=>{
      const placeholder = isPlaceholder(m.name);
      return `<div class="card-sq${placeholder?" placeholder":""}" data-id="${esc(m.id)}">
        <h2>${esc(m.name||"Masjid")}</h2>
        ${placeholder ? `<div class="meta">Reserved &middot; coming soon</div>`
          : (m.area?`<div class="meta">${esc(m.area)}</div>`:"")}
      </div>`;
    }).join("") + `</div>`;
  const mapBtn = $("viewMapBtn");
  if(mapBtn) mapBtn.onclick = openMap;
  list.querySelectorAll(".card-sq").forEach(el=> el.onclick=()=>showMasjid(el.dataset.id));
}

/* `linkLabel` overrides the visible link text for values that are only
   meaningful as a destination, not to read (a Maps URL) — phone/email/
   website calls omit it and keep showing the real value, since those ARE
   meant to be read. */
function field(lbl, val, href, linkLabel){
  if(!val) return "";
  const inner = href ? `<a href="${esc(href)}">${esc(linkLabel||val)}</a>` : esc(val);
  return `<div class="field"><div class="lbl">${lbl}</div><div class="val">${inner}</div></div>`;
}

function showMasjid(id){
  const m=mosques.find(x=>x.id===id); if(!m) return;
  $("dirList").hidden=true; hideMap();
  const box=$("mosqueDetail"); box.hidden=false;
  const jummah = Array.isArray(m.jummah)
    ? m.jummah.map(j=>`${esc(j.label||"Jummah")}: ${esc(j.time||"")}`).join("<br>")
    : esc(m.jummah||"");
  box.innerHTML=`
    <button class="backlink" id="backBtn">‹ All masjids</button>
    <h1 class="title" style="margin-top:10px">${esc(m.name||"Masjid")}</h1>
    ${m.area?`<p class="subtitle">${esc(m.area)}</p>`:""}
    <div class="detail">
      ${field("Address", m.address)}
      ${jummah?`<div class="field"><div class="lbl">Jummah</div><div class="val">${jummah}</div></div>`:""}
      ${field("Phone", m.phone, m.phone?`tel:${m.phone}`:null)}
      ${field("Email", m.email, m.email?`mailto:${m.email}`:null)}
      ${field("Website", m.website, m.website?normalizeUrl(m.website):null)}
      ${field("Location", m.location, m.location?normalizeUrl(m.location):null, "Get directions")}
      ${field("Notes", m.notes)}
      ${(!m.address&&!jummah&&!m.phone&&!m.location)?`<p class="empty">Details for this masjid will be added soon.</p>`:""}
    </div>`;
  $("backBtn").onclick=backToList;
  // instant, not smooth — a scroll animation would fight the slide-in
  window.scrollTo({top:0});
  enter(box, "detail-enter");
}

/* ---------- Businesses (list → detail with offers) ---------- */
function renderBusinesses(){
  const list=$("dirList");
  const intro = `<div class="intro">${esc(BUSINESS_INTRO)}</div>`;
  if(!businesses.length){ list.innerHTML=intro+`<p class="empty">No businesses listed yet.</p>`; return; }
  list.innerHTML = intro + `<div class="dir-grid">` + businesses.map(b=>{
    const placeholder = isPlaceholder(b.name);
    const unseen = unseenByBiz[b.id] || 0;
    return `<div class="card-sq${placeholder?" placeholder":""}" data-id="${esc(b.id)}">
      <h2>${esc(b.name||"")}</h2>
      ${placeholder ? `<div class="meta">Advertise here</div>`
        : (b.category?`<div class="meta">${esc(b.category)}</div>`:"")}
      ${unseen ? `<span class="badge">${unseen>99?"99+":unseen}</span>` : ""}
    </div>`;
  }).join("") + `</div>`;
  list.querySelectorAll(".card-sq").forEach(el=> el.onclick=()=>showBusiness(el.dataset.id));
}

function showBusiness(id){
  const b=businesses.find(x=>x.id===id); if(!b) return;
  /* Opening a business clears its tile badge and the Directory nav count. */
  unseenByBiz[id] = 0;
  markSeen(`directory.business.${id}`);
  document.dispatchEvent(new CustomEvent("content:updated", { detail:"directory" }));
  $("dirList").hidden=true; hideMap();
  const box=$("mosqueDetail"); box.hidden=false;
  const offers=(offersByBiz[id]||[]).sort((x,y)=>(y.createdAt||0)-(x.createdAt||0));
  const offersHtml = offers.length ? `
    <div class="detail">
      <h2 class="section-cap">Offers &amp; News</h2>
      ${offers.map(o=>`<div class="offer">
        ${o.createdAt?`<div class="meta">${new Date(o.createdAt).toLocaleDateString(undefined,{day:"numeric",month:"long",year:"numeric"})}</div>`:""}
        <h3>${esc(o.title||"")}</h3>
        ${o.image?`<img src="${esc(o.image)}" alt="" loading="lazy">`:""}
        ${o.body?`<p>${esc(o.body).replace(/\n/g,"<br>")}</p>`:""}
      </div>`).join("")}
    </div>` : "";
  box.innerHTML=`
    <button class="backlink" id="backBtn">‹ All businesses</button>
    <h1 class="title" style="margin-top:10px">${esc(b.name||"")}</h1>
    ${b.category?`<p class="subtitle">${esc(b.category)}</p>`:""}
    ${b.image?`<div class="card" style="margin-top:14px"><img src="${esc(b.image)}" alt="" style="width:100%;display:block"></div>`:""}
    <div class="detail">
      ${b.description?`<div class="field"><div class="val">${esc(b.description).replace(/\n/g,"<br>")}</div></div>`:""}
      ${field("Phone", b.phone, b.phone?`tel:${b.phone}`:null)}
      ${field("Website", b.website, b.website?normalizeUrl(b.website):null)}
    </div>
    ${offersHtml}`;
  $("backBtn").onclick=backToList;
  // instant, not smooth — a scroll animation would fight the slide-in
  window.scrollTo({top:0});
  enter(box, "detail-enter");
}

/* Shared by the full init and by the badge-only prime below. */
async function loadData(){
  const [m,b,o]=await Promise.all([
    loadCollection("mosques",{ orderField:"name", desc:false }),
    loadCollection("businesses",{ orderField:"name", desc:false }),
    loadCollection("offers",{ orderField:"createdAt", desc:true })
  ]);
  mosques=m.data||[];
  businesses=b.data||[];
  offersByBiz={};
  (o.data||[]).forEach(of=>{ (offersByBiz[of.businessId] ||= []).push(of); });
  await computeUnseen();
  document.dispatchEvent(new CustomEvent("content:updated", { detail:"directory" }));
}

/* Fetch without rendering, so the nav badge is right even for a section
   the user has never opened. */
export async function primeDirectory(){ await loadData(); }

export async function initDirectory(){
  $("dirList").innerHTML=`<p class="empty">Loading…</p>`;
  document.querySelectorAll("#directoryView .subtab").forEach(b=>{
    b.onclick=()=>{ activeTab=b.dataset.dir; showSection(); };   // fade
  });
  await loadData();
  showSection();
}
