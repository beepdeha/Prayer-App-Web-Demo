/* ============================================================
   SEEN — on-device tracking of what this user has already looked
   at. Two deliberately separate mechanisms, because they answer
   two different questions:

   1. A per-scope timestamp watermark ("seen.<scope>") drives the
      unread badges: "how many items are newer than the last time
      I opened this tab".
   2. A per-item boolean ("viewed.<kind>.<id>") drives the admin's
      view counter. This can't reuse the watermark: opening a tab
      advances the watermark past everything currently posted, but
      re-opening an individual item weeks later must still not
      count twice.

   Nothing here touches the network — it's all local device state
   via store.js (Capacitor Preferences, or localStorage in a
   browser).
   ============================================================ */
import { getItem, setItem } from "./store.js";

const seenKey   = scope      => `seen.${scope}`;
const viewedKey = (kind, id) => `viewed.${kind}.${id}`;

export async function getLastSeen(scope){ return await getItem(seenKey(scope), null); }
export async function markSeen(scope, ts = Date.now()){ await setItem(seenKey(scope), ts); }

export async function hasBeenViewed(kind, id){ return !!(await getItem(viewedKey(kind, id), false)); }
export async function markViewed(kind, id){ await setItem(viewedKey(kind, id), true); }

/* First run seeds the watermark to "now" rather than leaving it
   unset. An unset watermark would treat every already-posted item
   as unread, so a fresh install would open onto a wall of red
   badges for content the user has never had a chance to miss. */
async function ensureSeeded(scope){
  if(await getLastSeen(scope) === null) await markSeen(scope);
}

/* The one function callers need: how many items are new to this
   device for this scope. Handles first-run seeding itself so no
   call site has to special-case it. */
export async function unreadCount(scope, items, field = "createdAt"){
  await ensureSeeded(scope);
  const last = await getLastSeen(scope);
  return (items || []).filter(i => (i[field] || 0) > last).length;
}
