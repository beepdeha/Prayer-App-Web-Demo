/* ============================================================
   MAP VIEW — masjids pinned on an OpenStreetMap/Leaflet map.

   Coordinates come from the `lat`/`lng` fields the admin console
   resolves once at save time (see admin.js `geocode`), not from
   geocoding in the app: Nominatim is a free service and is not
   built for one lookup per reader per page view.

   Leaflet itself is bundled under www/vendor/, so the map engine
   works offline — but the tiles are fetched from OSM, so without a
   connection you get the controls and pins over a blank grid. That
   is the honest limit of any tile map, not a bug to fix.
   ============================================================ */
import { enter } from "./motion.js";

const $ = id => document.getElementById(id);

const SHEFFIELD = [53.3811, -1.4701];   // fallback centre when nothing is pinned
let map = null;
let markerLayer = null;
let onOpenDetail = null;   // set by directory.js, avoids a circular import

function esc(s=""){ return String(s).replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }

/* Leaflet resolves its marker images relative to the CSS by default,
   which breaks under the app's folder layout — point it at the bundled
   copies explicitly. */
function markerIcon(){
  return L.icon({
    iconUrl:       "vendor/leaflet/images/marker-icon.png",
    iconRetinaUrl: "vendor/leaflet/images/marker-icon-2x.png",
    shadowUrl:     "vendor/leaflet/images/marker-shadow.png",
    iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41]
  });
}

export function setDetailHandler(fn){ onOpenDetail = fn; }

/* `items` are masjids that already have coordinates. */
export function showMap(items, { onBack } = {}){
  $("dirList").hidden = true;
  $("mosqueDetail").hidden = true;
  $("dirMap").hidden = false;

  $("mapBack").onclick = () => { if(onBack) onBack(); };

  const pinned = (items||[]).filter(m => Number.isFinite(m.lat) && Number.isFinite(m.lng));
  const missing = (items||[]).length - pinned.length;
  $("mapNote").textContent = missing
    ? `${missing} ${missing===1?"masjid has":"masjids have"} no location saved yet, so ${missing===1?"it is":"they are"} not shown here.`
    : "";

  /* One map instance, reused. Creating a new L.map over the same
     container throws, and tearing down/rebuilding loses the user's
     pan and zoom every time they come back. */
  if(!map){
    map = L.map("mapCanvas", { attributionControl:true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }

  markerLayer.clearLayers();
  pinned.forEach(m=>{
    const marker = L.marker([m.lat, m.lng], { icon: markerIcon() }).addTo(markerLayer);
    marker.bindPopup(
      `<strong>${esc(m.name||"Masjid")}</strong>` +
      (m.area ? `<br><span>${esc(m.area)}</span>` : "") +
      `<br><button type="button" class="map-detail" data-id="${esc(m.id)}">View details</button>`
    );
  });

  if(pinned.length){
    const bounds = L.latLngBounds(pinned.map(m=>[m.lat, m.lng]));
    map.fitBounds(bounds, { padding:[40,40], maxZoom:15 });
  }else{
    map.setView(SHEFFIELD, 12);
  }

  /* The container was display:none until a moment ago, so Leaflet has
     measured it as 0×0. Recalculate now that it has real dimensions. */
  requestAnimationFrame(()=> map.invalidateSize());

  enter($("dirMap"), "fade-enter");
}

export function hideMap(){ $("dirMap").hidden = true; }

/* Popups are rebuilt by Leaflet on every open, so delegate rather than
   binding per-button. */
document.addEventListener("click", e=>{
  const btn = e.target.closest?.(".map-detail");
  if(!btn) return;
  if(onOpenDetail) onOpenDetail(btn.dataset.id);
});
