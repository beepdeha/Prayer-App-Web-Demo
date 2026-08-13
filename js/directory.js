/* ============================================================
   DIRECTORY VIEW — Masjids (square grid → detail) and
   Businesses (list → detail with offers).
   ============================================================ */
import { loadCollection } from "./firebase.js";
import { normalizeUrl } from "./links.js";
import { enter } from "./motion.js";
import { getLastSeen, markSeen } from "./seen.js";
import { showMap, hideMap, setDetailHandler } from "./map.js";
import { displayCategory } from "./categories.js";

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

/* The Businesses sub-tab carries the same count as the Directory nav icon:
   opening the section clears the nav badge, but this one stays until the
   business itself has been opened, so "something new is in here" survives
   the trip from the nav bar into the section. */
function refreshSubtabBadge(){
  const el = document.querySelector('#directoryView .subtab .badge[data-badge="directory.businesses"]');
  if(!el) return;
  const n = getDirectoryUnread();
  el.textContent = n > 99 ? "99+" : String(n);
  el.hidden = n === 0;
}

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
  refreshSubtabBadge();
}

/* Clears every business at once. Deliberately marks each one seen rather
   than wiping the keys: a missing key means "never visited", which
   computeUnseen() would re-seed to now anyway — same result, but marking
   is explicit about what happened. */
async function resetAllBizNotifications(){
  await Promise.all(businesses.map(b => markSeen(`directory.business.${b.id}`)));
  unseenByBiz = {};
  refreshSubtabBadge();
  document.dispatchEvent(new CustomEvent("content:updated", { detail:"directory" }));
  renderBusinesses();
}

const BUSINESS_INTRO = "Our Business Directory exists to help our community benefit from the services offered by local Muslim-owned businesses. It's a win for everyone: the community gets easy access to trusted local services, the businesses gain visibility and custom, and every business that advertises with us also directly supports Dar Ul Uloom Sheffield.";

let categoryFilter = "all";

/* Copy-to-clipboard for address and phone. navigator.clipboard needs a
   secure context, which the Capacitor webview and localhost both are,
   but a plain-http LAN preview is not — hence the execCommand fallback. */
const COPY_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>`;
const TICK_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>`;

async function copyText(text){
  try{
    if(navigator.clipboard?.writeText){ await navigator.clipboard.writeText(text); return true; }
  }catch{ /* fall through */ }
  try{
    const ta=document.createElement("textarea");
    ta.value=text; ta.setAttribute("readonly","");
    ta.style.cssText="position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta); ta.select();
    const ok=document.execCommand("copy");
    ta.remove(); return ok;
  }catch{ return false; }
}

/* Delegated so it survives every re-render of the detail pane. */
document.addEventListener("click", async e=>{
  const btn = e.target.closest(".copybtn");
  if(!btn) return;
  e.preventDefault(); e.stopPropagation();
  const ok = await copyText(btn.dataset.copy || "");
  if(!ok) return;
  btn.classList.add("copied");
  btn.innerHTML = TICK_SVG;
  setTimeout(()=>{ btn.classList.remove("copied"); btn.innerHTML = COPY_SVG; }, 1600);
});

/* Hand-drawn to match the nav icons — no icon font, no sprite, nothing
   fetched at runtime. Each is a 24x24 viewBox so .social-ico sizes them
   the same way .ico does. */
const SOCIAL_SVG = {
  tiktok: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 2h-2.7v13.2a2.6 2.6 0 1 1-2-2.5V9.9a5.7 5.7 0 1 0 4.7 5.6V8.9a6.6 6.6 0 0 0 3.8 1.2V7.3a3.9 3.9 0 0 1-3.8-3.9V2z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9A5.5 5.5 0 0 1 16.5 22h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm5.6-2.9a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.6-1.6h1.7V4.1A22 22 0 0 0 14.3 4C11.9 4 10.3 5.5 10.3 8.2v2.4H7.5v3.2h2.8V22h3.2z"/></svg>`,
};

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
function field(lbl, val, href, linkLabel, opts={}){
  if(!val) return "";
  const inner = href ? `<a href="${esc(href)}">${esc(linkLabel||val)}</a>` : esc(val);
  const copy = opts.copy
    ? `<button class="copybtn" data-copy="${esc(val)}" aria-label="Copy ${esc(lbl).toLowerCase()}" title="Copy">${COPY_SVG}</button>`
    : "";
  return `<div class="field${copy?" has-copy":""}">
    <div class="fieldmain"><div class="lbl">${lbl}</div><div class="val">${inner}</div></div>${copy}
  </div>`;
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
      ${field("Address", m.address, null, null, { copy:true })}
      ${jummah?`<div class="field"><div class="fieldmain"><div class="lbl">Jummah</div><div class="val">${jummah}</div></div></div>`:""}
      ${field("Phone", m.phone, m.phone?`tel:${m.phone}`:null, null, { copy:true })}
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

  /* Only primary types that something is actually filed under, so the
     filter never offers a category that would return an empty grid. */
  const cats = [...new Set(businesses.map(b=>(b.categoryPrimary||"").trim()).filter(Boolean))].sort();
  const filtered = categoryFilter==="all"
    ? businesses
    : businesses.filter(b=>(b.categoryPrimary||"").trim()===categoryFilter);

  const controls = `
    <div class="dir-filter">
      <select class="sel" id="bizCatFilter" aria-label="Filter by category">
        <option value="all"${categoryFilter==="all"?" selected":""}>All categories</option>
        ${cats.map(c=>`<option value="${esc(c)}"${categoryFilter===c?" selected":""}>${esc(c)}</option>`).join("")}
      </select>
      <button class="backlink resetbtn" id="resetBizNotif" title="Mark every business as read">Reset alerts</button>
    </div>`;

  const grid = filtered.length
    ? `<div class="dir-grid">` + filtered.map(b=>{
        const placeholder = isPlaceholder(b.name);
        const unseen = unseenByBiz[b.id] || 0;
        const cat = displayCategory(b);
        return `<div class="card-sq${placeholder?" placeholder":""}" data-id="${esc(b.id)}">
          ${(!placeholder && b.image) ? `<img class="biz-thumb" src="${esc(b.image)}" alt="" loading="lazy">` : ""}
          <h2>${esc(b.name||"")}</h2>
          ${placeholder ? `<div class="meta">Advertise here</div>`
            : (cat?`<div class="meta">${esc(cat)}</div>`:"")}
          ${unseen ? `<span class="badge">${unseen>99?"99+":unseen}</span>` : ""}
        </div>`;
      }).join("") + `</div>`
    : `<p class="empty">No businesses in this category yet.</p>`;

  list.innerHTML = intro + controls + grid;
  $("resetBizNotif").onclick = resetAllBizNotifications;
  $("bizCatFilter").onchange = e=>{ categoryFilter = e.target.value; renderBusinesses(); };
  list.querySelectorAll(".card-sq").forEach(el=> el.onclick=()=>showBusiness(el.dataset.id));
}

function showBusiness(id){
  const b=businesses.find(x=>x.id===id); if(!b) return;
  /* Opening a business clears its tile badge and the Directory nav count. */
  unseenByBiz[id] = 0;
  markSeen(`directory.business.${id}`);
  refreshSubtabBadge();
  document.dispatchEvent(new CustomEvent("content:updated", { detail:"directory" }));
  $("dirList").hidden=true; hideMap();
  const box=$("mosqueDetail"); box.hidden=false;
  const offers=(offersByBiz[id]||[]).sort((x,y)=>(y.createdAt||0)-(x.createdAt||0));
  const socialLinks = [
    b.tiktok    && { key:"tiktok",    url:b.tiktok,    label:"TikTok" },
    b.instagram && { key:"instagram", url:b.instagram, label:"Instagram" },
    b.facebook  && { key:"facebook",  url:b.facebook,  label:"Facebook" },
  ].filter(Boolean);
  /* data-external so links.js routes these out to the real app/browser
     even if the admin typed a bare handle without a scheme. */
  const socialHtml = socialLinks.length ? `
    <div class="field social-field">
      <div class="lbl">Social media</div>
      <div class="social-row">${socialLinks.map(s=>
        `<a href="${esc(normalizeUrl(s.url))}" class="social-ico" data-external="1" aria-label="${esc(s.label)}">${SOCIAL_SVG[s.key]}</a>`
      ).join("")}</div>
    </div>` : "";

  const offersHtml = offers.length ? `
    <div class="detail">
      <h2 class="section-cap offers-cap">Offers &amp; News</h2>
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
    ${displayCategory(b)?`<p class="subtitle">${esc(displayCategory(b))}</p>`:""}
    ${b.image?`<div class="card" style="margin-top:14px"><img src="${esc(b.image)}" alt="" style="width:100%;display:block"></div>`:""}
    <div class="detail">
      ${b.description?`<div class="field"><div class="val">${esc(b.description).replace(/\n/g,"<br>")}</div></div>`:""}
      ${field("Address", b.address, null, null, { copy:true })}
      ${field("Phone", b.phone, b.phone?`tel:${b.phone}`:null, null, { copy:true })}
      ${field("Website", b.website, b.website?normalizeUrl(b.website):null)}
      ${socialHtml}
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
