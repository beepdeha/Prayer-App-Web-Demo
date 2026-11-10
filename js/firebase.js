/* ============================================================
   CONTENT SOURCE
   Resolves a collection (announcements / mosques / businesses) by:
     1. returning the offline cache immediately if we have it, then
     2. fetching live from Firestore (only if configured + online),
        updating the cache, and
     3. falling back to bundled seed JSON (data/<name>.json) when
        there is no cache yet.
   Firebase is imported lazily from the CDN so the app stays
   offline-first and works before Firebase is even set up.

   The app reads from TWO projects: this masjid's own, and the shared
   business directory ("the Hub"). Both are read anonymously — the app
   has no auth of any kind — so the second project costs nothing but a
   second connection. Which project a collection lives in is decided by
   the caller, see loadCollection's `from` option.
   ============================================================ */
import { getItem, setItem } from "./store.js";
import { firebaseConfig, hubConfig, isConfigured } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

/* Named so the two projects cannot be confused for one another.
   Firebase's own default app is unnamed; giving both of ours a name
   keeps every lookup explicit. */
export const MASJID = "masjid";
export const HUB = "hub";

const CONFIGS = { [MASJID]: firebaseConfig, [HUB]: hubConfig };
const dbPromises = {};

/* Resolve an app strictly BY NAME.

   This used to be `getApps().length ? getApps()[0] : initializeApp(...)`
   — reuse whatever app happens to exist. That was fine while there was
   only ever one, and silently wrong the moment a second project was
   added: getApps() returns every app in creation order, so whichever
   initialised first would have served every read, and the app would
   have shown one project's data under another's name with no error to
   notice. */
async function appFor(which){
  const { initializeApp, getApp, getApps } = await import(`${SDK}/firebase-app.js`);
  const existing = getApps().find(a => a.name === which);
  return existing || initializeApp(CONFIGS[which], which);
}

async function getDb(which = MASJID){
  if(!isConfigured()) return null;
  if(!navigator.onLine) return null;
  if(dbPromises[which]) return dbPromises[which];
  dbPromises[which] = (async ()=>{
    const { getFirestore, collection, getDocs, orderBy, query } =
      await import(`${SDK}/firebase-firestore.js`);
    const db = getFirestore(await appFor(which));
    return { db, collection, getDocs, orderBy, query };
  })().catch(e=>{ console.warn(`Firebase init failed (${which})`, e); return null; });
  return dbPromises[which];
}

async function seed(name){
  try{ const r=await fetch(`data/${name}.json`); return r.ok ? await r.json() : []; }
  catch{ return []; }
}

/* ---- View counter ----
   Tells the backend this device has seen an item, so the admin console
   can show a read count. Deliberately best-effort: the app has no auth,
   this is not something the user asked for, and a failure here must
   never surface or interrupt rendering — so every error is swallowed.

   Stays on the masjid project: only events and announcements are
   counted, and both are this masjid's own. */
let fnsPromise = null;
async function getFns(){
  if(!isConfigured() || !navigator.onLine) return null;
  if(fnsPromise) return fnsPromise;
  fnsPromise = (async ()=>{
    const { getFunctions, httpsCallable } = await import(`${SDK}/firebase-functions.js`);
    return { fns: getFunctions(await appFor(MASJID), "europe-west2"), httpsCallable };
  })().catch(()=>null);
  return fnsPromise;
}

/* Returns true only if the backend actually recorded the view, so the
   caller knows whether it may mark the item counted locally. Offline or
   mid-outage this returns false and the view is retried next time the
   item is rendered, rather than being silently lost forever. */
export async function countView(collection, id){
  try{
    const f = await getFns(); if(!f) return false;
    await f.httpsCallable(f.fns, "incrementViews")({ collection, id });
    return true;
  }catch{ return false; }   // a missed view count is not worth surfacing
}

/* Returns { data, source } where source ∈ "live" | "cache" | "seed".
   `from` picks the project: MASJID for this masjid's own content, HUB
   for the shared business directory. */
export async function loadCollection(name, { orderField="date", desc=true, from=MASJID } = {}){
  /* The cache key carries the project. Two reasons: a collection name
     could exist in both, and — the one that actually bit — a device
     upgrading from the version that read businesses from its masjid
     still has that old cache. Keyed this way the stale copy is simply
     never read again, instead of being served forever whenever the Hub
     is unreachable. */
  const cacheKey = `cache.${from}.${name}`;
  const cached = await getItem(cacheKey, null);

  const fb = await getDb(from);
  if(fb){
    try{
      const q = fb.query(fb.collection(fb.db, name), fb.orderBy(orderField, desc?"desc":"asc"));
      const snap = await fb.getDocs(q);
      const data = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      await setItem(cacheKey, data);
      return { data, source:"live" };
    }catch(e){ console.warn(`live fetch failed for ${name} (${from})`, e); }
  }

  if(cached) return { data: cached, source:"cache" };
  return { data: await seed(name), source:"seed" };
}
