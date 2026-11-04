// config.js
// -----------------------------------------------------------
// Shared settings for ALL dashboard pages.
// Change the connection here once; every page uses these values.
//
// SAFE KEY ONLY: this is the publishable (anon) key, which is safe to
// appear in pages served publicly, because the Supabase read-only
// policies limit what it can do. NEVER put the secret key here.
// -----------------------------------------------------------

// Which database: live on rumbu.vercel.app, the TEST database on preview links and local copies (see window.RUMBU_DB).
const SUPABASE_URL = (window.RUMBU_DB = window.RUMBU_DB || (function(){var h = String(location.hostname || "");var test = h !== "rumbu.vercel.app" && (/\.vercel\.app$/.test(h) || h === "localhost" || /^127\./.test(h) || h === "" || location.protocol === "file:");return test ? { env: "test", url: "https://cbityajrnwmdjymzhgzt.supabase.co", key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiaXR5YWpybndtZGp5bXpoZ3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3ODA5OTcsImV4cCI6MjEwOTM1Njk5N30.ZJWt4-No17YZhmjFOJ8yedGC0TiD4uOeE7arlAu9T_k" } : { env: "live", url: "https://betfhunzmhtdzgvufmfk.supabase.co", key: "sb_publishable_AfDp1FlHghu9TOfqEUj20Q_Pke7GlTp" };})()).url;
const SUPABASE_ANON_KEY = (window.RUMBU_DB = window.RUMBU_DB || (function(){var h = String(location.hostname || "");var test = h !== "rumbu.vercel.app" && (/\.vercel\.app$/.test(h) || h === "localhost" || /^127\./.test(h) || h === "" || location.protocol === "file:");return test ? { env: "test", url: "https://cbityajrnwmdjymzhgzt.supabase.co", key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiaXR5YWpybndtZGp5bXpoZ3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3ODA5OTcsImV4cCI6MjEwOTM1Njk5N30.ZJWt4-No17YZhmjFOJ8yedGC0TiD4uOeE7arlAu9T_k" } : { env: "live", url: "https://betfhunzmhtdzgvufmfk.supabase.co", key: "sb_publishable_AfDp1FlHghu9TOfqEUj20Q_Pke7GlTp" };})()).key;

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
