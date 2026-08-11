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
   ============================================================ */
import { getItem, setItem } from "./store.js";
import { firebaseConfig, isConfigured } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
let dbPromise = null;

async function getDb(){
  if(!isConfigured()) return null;
  if(!navigator.onLine) return null;
  if(dbPromise) return dbPromise;
  dbPromise = (async ()=>{
    const { initializeApp, getApps } = await import(`${SDK}/firebase-app.js`);
    const { getFirestore, collection, getDocs, orderBy, query } =
      await import(`${SDK}/firebase-firestore.js`);
    // reuse the app if the callable helper below already created it,
    // otherwise initializeApp throws on the duplicate default app
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const db = getFirestore(app);
    return { db, collection, getDocs, orderBy, query };
  })().catch(e=>{ console.warn("Firebase init failed", e); return null; });
  return dbPromise;
}

async function seed(name){
  try{ const r=await fetch(`data/${name}.json`); return r.ok ? await r.json() : []; }
  catch{ return []; }
}

/* ---- View counter ----
   Tells the backend this device has seen an item, so the admin console
   can show a read count. Deliberately best-effort: the app has no auth,
   this is not something the user asked for, and a failure here must
   never surface or interrupt rendering — so every error is swallowed. */
let fnsPromise = null;
async function getFns(){
  if(!isConfigured() || !navigator.onLine) return null;
  if(fnsPromise) return fnsPromise;
  fnsPromise = (async ()=>{
    const { initializeApp, getApps } = await import(`${SDK}/firebase-app.js`);
    const { getFunctions, httpsCallable } = await import(`${SDK}/firebase-functions.js`);
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    return { fns: getFunctions(app, "europe-west2"), httpsCallable };
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

/* Returns { data, source } where source ∈ "live" | "cache" | "seed". */
export async function loadCollection(name, { orderField="date", desc=true } = {}){
  const cacheKey = `cache.${name}`;
  const cached = await getItem(cacheKey, null);

  const fb = await getDb();
  if(fb){
    try{
      const q = fb.query(fb.collection(fb.db, name), fb.orderBy(orderField, desc?"desc":"asc"));
      const snap = await fb.getDocs(q);
      const data = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      await setItem(cacheKey, data);
      return { data, source:"live" };
    }catch(e){ console.warn(`live fetch failed for ${name}`, e); }
  }

  if(cached) return { data: cached, source:"cache" };
  return { data: await seed(name), source:"seed" };
}
