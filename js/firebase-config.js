/* ============================================================
   FIREBASE CONFIG
   Paste the config from your Firebase project here (Project
   Settings → Your apps → SDK setup). Until then the app runs on
   bundled seed data + offline cache, so everything still works.

   The app treats the config as "not set up" while apiKey still
   starts with "PASTE_".
   ============================================================ */
export const firebaseConfig = {
  apiKey: "AIzaSyD471Mrv2QZi9KHrWpAhUKNNiqkdm7omuI",
  authDomain: "ikhaa-ghausia-masjid.firebaseapp.com",
  projectId: "ikhaa-ghausia-masjid",
  storageBucket: "ikhaa-ghausia-masjid.firebasestorage.app",
  messagingSenderId: "285100144950",
  appId: "1:285100144950:web:7b9bc1b9985602ca85db97"
};

/* ---------- The shared business directory ----------

   The business directory is not this masjid's — it is one pool shared by
   every Ikhaa Studios masjid app, so a business listed by any masjid
   appears in all of them. It lives in its own Firebase project, which
   the app reads from directly and anonymously, exactly as it reads this
   masjid's own content.

   This block is IDENTICAL on every masjid branch, unlike everything
   above it. If these two ever disagree between branches, one app
   quietly reads a different directory from the others — so change it in
   one place and merge it outward rather than editing per branch. */
export const hubConfig = {
  apiKey: "AIzaSyDXBcsdCaZq0UjbNhcM7w0AXK6iqmKPcuE",
  authDomain: "ikhaa-shared-directory.firebaseapp.com",
  projectId: "ikhaa-shared-directory",
  storageBucket: "ikhaa-shared-directory.firebasestorage.app",
  messagingSenderId: "129165444490",
  appId: "1:129165444490:web:91b94f53bd8b9cf753b473"
};

export function isConfigured(){
  return !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PASTE_");
}
