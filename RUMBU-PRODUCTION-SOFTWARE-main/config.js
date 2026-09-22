// config.js
// -----------------------------------------------------------
// Shared settings for ALL dashboard pages.
// Change the connection here once; every page uses these values.
//
// SAFE KEY ONLY: this is the publishable (anon) key, which is safe to
// appear in pages served publicly, because the Supabase read-only
// policies limit what it can do. NEVER put the secret key here.
// -----------------------------------------------------------

const SUPABASE_URL = "https://betfhunzmhtdzgvufmfk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_AfDp1FlHghu9TOfqEUj20Q_Pke7GlTp";

// The three master tables in Supabase.
const TABLES = {
  monitoring: "monitoring",   // BigQuery "tracking table" (monitoring room)
  control: "control",         // BigQuery "maintenance log" (control room)
  mat_weaving: "mat_weaving"    // BigQuery "Mat Weaving"
};

// A small shared helper every page can use to read a table read-only.
async function fetchTable(tableName, query = "select=*") {
  const url = SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/" + tableName + "?" + query;
  const res = await fetch(url, {
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + SUPABASE_ANON_KEY
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error("Read failed (HTTP " + res.status + "): " + text);
  }
  return res.json();
}
