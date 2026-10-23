// ============================================================
// SHARED AUTH HELPER — include this on every page that needs
// to know who is logged in (index.html and, later, modules).
// Requires the Supabase JS library to be loaded first:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//
// PHASE 2 (KWP) ADDITIONS — both are no-ops for every existing,
// non-KWP account:
//   1. must_change_password gate: if the signed-in profile has
//      must_change_password = true (set when a KWP manager issues a
//      temporary password), requireAuth() redirects to
//      force-change-password.html instead of the caller's page.
//   2. Inactive KWP staff block: if the signed-in profile is linked to
//      a kwp_staff row (kwp_staff.profile_id) whose status is not
//      'Active', the session is signed out and the caller is sent back
//      to login.html. Accounts with no kwp_staff link are unaffected.
// ============================================================

const SUPABASE_URL = "https://betfhunzmhtdzgvufmfk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_AfDp1FlHghu9TOfqEUj20Q_Pke7GlTp";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Derives the force-change-password page path from whatever loginPath
// the caller passed in (e.g. "login.html" -> "force-change-password.html",
// "../../login.html" -> "../../force-change-password.html"), so no
// calling page needs to be edited individually.
function _kwpForceChangePath(loginPath){
  return loginPath.replace(/login\.html$/, "force-change-password.html");
}

// Redirects to loginPath.html if not signed in. Otherwise resolves with the
// full profile: { id, username, role, super_admin_type, section_id,
// section_name, department_ids, department_names }
// Throws a descriptive Error on any failure — callers should wrap this in
// try/catch and show err.message somewhere visible, rather than letting
// it fail silently.
async function requireAuth(loginPath) {
  loginPath = loginPath || "login.html";

  let session;
  try {
    const sessRes = await sb.auth.getSession();
    session = sessRes.data.session;
  } catch (e) {
    throw new Error("Could not reach Supabase Auth: " + e.message);
  }

  // getSession() returns null on mobile when the browser suspended the tab
  // and Supabase's background refresh timer never ran (screen lock, app switch).
  // Before redirecting to login, attempt one explicit token refresh — if the
  // refresh token is still valid (Supabase default: 7 days) the session is
  // silently restored and the user never sees an unexpected logout.
  if (!session) {
    try {
      const { data: rd } = await sb.auth.refreshSession();
      session = rd?.session || null;
    } catch (_) { /* refresh genuinely failed — fall through to redirect */ }
  }

  if (!session) {
    (window.top||window).location.href = loginPath;
    return null;
  }

  const { data: profile, error: profErr } = await sb
    .from("profiles")
    .select("id, username, role, super_admin_type, section_id, can_self_manage_todos, must_change_password, last_open_module")
    .eq("id", session.user.id)
    .single();

  if (profErr || !profile) {
    throw new Error("Could not load profile: " + (profErr ? profErr.message : "no profile row for this account"));
  }

  // --- KWP Phase 2: forced password change ---
  if (profile.must_change_password) {
    (window.top||window).location.href = _kwpForceChangePath(loginPath);
    return null;
  }

  // --- KWP Phase 2: inactive/suspended KWP staff cannot use the system ---
  // No-op for every account that isn't linked to an employees row with a
  // kwp_staff assignment. kwp_staff_current always reflects `employees`
  // live (per the KWP Employee Master Rule) rather than a stored copy.
  try {
    const { data: kwpLink } = await sb
      .from("kwp_staff_current")
      .select("status")
      .eq("linked_profile_id", profile.id)
      .maybeSingle();
    if (kwpLink && kwpLink.status !== "Active") {
      await sb.auth.signOut();
      (window.top||window).location.href = loginPath + "?blocked=inactive";
      return null;
    }
  } catch (e) {
    // Non-fatal: if this lookup fails for some reason, fall through
    // rather than lock every user (KWP or not) out of the whole app.
    console.warn("KWP status check failed (non-fatal):", e);
  }

  let sectionIds = [];
  let sectionNames = [];
  const { data: ps, error: psErr } = await sb.from("profile_sections").select("section_id, app_sections(name)").eq("profile_id", profile.id);
  if (psErr) throw new Error("Could not load Section assignments: " + psErr.message);
  sectionIds = (ps || []).map(r => r.section_id);
  sectionNames = (ps || []).map(r => r.app_sections ? r.app_sections.name : null).filter(Boolean);

  let departmentIds = [];
  let departmentNames = [];
  // Non-fatal by design, same reasoning as the KWP check above: if this
  // lookup ever fails (wrong table name, missing data, anything) it must
  // not block login for every "user"-role account — degrade to empty
  // department info rather than throwing.
  if (profile.role === "user") {
    try {
      const { data: ud, error: udErr } = await sb.from("user_departments").select("department_id").eq("profile_id", profile.id);
      if (udErr) throw udErr;
      departmentIds = (ud || []).map(r => r.department_id);
      if (departmentIds.length) {
        const { data: depts, error: deptErr } = await sb.from("app_departments").select("id,name").in("id", departmentIds);
        if (deptErr) throw deptErr;
        departmentNames = (depts || []).map(d => d.name);
      }
    } catch (e) {
      console.warn("Department assignment lookup failed (non-fatal):", e);
    }
  }

  // itops3 is the system IT administrator with full elevated access.
  // All other super_admin accounts are Viewer-only (read-only across the system).
  const isItops = profile.username === "itops3";
  const readOnly = profile.role === "super_admin" && !isItops;

  if(readOnly) _scheduleReadOnly();

  return {
    id: profile.id,
    username: profile.username,
    role: profile.role,
    superAdminType: profile.super_admin_type,
    sectionId: sectionIds.length ? sectionIds[0] : null,
    sectionName: sectionNames.length ? sectionNames.join(", ") : null,
    sectionIds: sectionIds,
    sectionNames: sectionNames,
    departmentIds: departmentIds,
    departmentNames: departmentNames,
    canSelfManageTodos: !!profile.can_self_manage_todos,
    lastOpenModule: profile.last_open_module || null,
    isItops: isItops,
    readOnly: readOnly
  };
}

// ── Read-Only Enforcement ─────────────────────────────────────────────────────
// Called automatically when a viewer super_admin logs in. Uses a MutationObserver
// so it applies to every element the module renders dynamically — no module
// file changes required. Allows filters, searches, downloads, and exports.
// Blocks all add / save / submit / approve / delete / edit operations.

function _scheduleReadOnly(){
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", ()=>setTimeout(_applyReadOnly, 300));
  } else {
    setTimeout(_applyReadOnly, 300);
  }
}

// Button text that signals a write action — block these
const _RO_WRITE = /^(save|submit|add\b|create|delete|remove|approve|reject|complete|generate label|upload|confirm|send|record|log entry|initiate|offload|dispatch|update|change|archive|assign|link|grant|revoke|switch operator|correct|reset password|mark as|close lot|open lot|set|apply changes|done|finish|process|pick|unlock|release|re-run|rerun|retest)/i;
// Button text that signals a safe read action — always allow these
const _RO_SAFE  = /^(search|filter|find|look|download|export|print|view|refresh|load|show|back|close|cancel|ok|got it|open report|preview|scan|lookup|check|select|go to|open detail|see|toggle|collapse|expand|branch|all branches|today|last|this week|this month|date|range|from|to|clear filter)/i;

function _applyReadOnly(){
  if(document.getElementById("rumbu-ro-active")) return; // already applied

  // Silent marker — no visible banner
  const marker = document.createElement("span");
  marker.id = "rumbu-ro-active";
  marker.style.display = "none";
  document.body.appendChild(marker);

  // MutationObserver watches for dynamically rendered content
  new MutationObserver(_roSweep).observe(document.body,{childList:true,subtree:true});
  _roSweep();
}

function _roSweep(){
  // Buttons
  document.querySelectorAll("button:not([data-ro]),input[type=submit]:not([data-ro]),input[type=button]:not([data-ro])").forEach(el=>{
    el.setAttribute("data-ro","1");
    const txt = (el.textContent||el.value||el.innerText||"").trim();
    const cls = el.className||"";
    if(_RO_SAFE.test(txt)) return; // explicitly safe — leave alone
    if(
      _RO_WRITE.test(txt)            // write keyword in text
      || /\bdanger\b/.test(cls)      // red/danger class
      || /\bdelete\b/.test(cls)
      || /\bsubmit\b/.test(cls)
    ){
      _roBlock(el);
    }
  });

  // Text / number / date inputs — make readonly unless they are clearly a filter
  document.querySelectorAll(
    "input[type=text]:not([data-ro]),input[type=number]:not([data-ro]),"
   +"input[type=email]:not([data-ro]),input[type=password]:not([data-ro]),"
   +"input[type=date]:not([data-ro]),input[type=datetime-local]:not([data-ro]),"
   +"input[type=time]:not([data-ro]),textarea:not([data-ro])"
  ).forEach(el=>{
    el.setAttribute("data-ro","1");
    const id  = (el.id||"").toLowerCase();
    const ph  = (el.placeholder||"").toLowerCase();
    const nm  = (el.name||"").toLowerCase();
    // Allow filter / search / date-range inputs
    if(/search|filter|find|from|to_date|rep_|date_from|date_to|range/.test(id+ph+nm)) return;
    el.setAttribute("readonly","");
    el.style.cssText += ";background:var(--bg,#f5f7fa)!important;cursor:default;";
  });

  // Selects — disable unless they are clearly a filter or branch picker
  document.querySelectorAll("select:not([data-ro])").forEach(el=>{
    el.setAttribute("data-ro","1");
    const id = (el.id||"").toLowerCase();
    if(/branch|section|filter|search|range|rep_|from|to\b|date|period|status_filter|grade_filter|lot_filter/.test(id)) return;
    el.disabled = true;
    el.style.cssText += ";opacity:.5;cursor:default;";
  });

  // File inputs — disable upload
  document.querySelectorAll("input[type=file]:not([data-ro])").forEach(el=>{
    el.setAttribute("data-ro","1");
    el.disabled = true;
  });
}

function _roBlock(el){
  el.disabled = true;
  el.style.cssText += ";opacity:.3;cursor:not-allowed;";
  el.title = "Read-only access — changes are not permitted";
  el.addEventListener("click",e=>{e.preventDefault();e.stopImmediatePropagation();},true);
}
// ─────────────────────────────────────────────────────────────────────────────

async function logout(loginPath) {
  await sb.auth.signOut();
  (window.top||window).location.href = loginPath || "login.html";
}

// Blur any focused number input when the user scrolls — prevents the
// browser's default behaviour of changing the field's value on scroll.
document.addEventListener("wheel", function(){
  if(document.activeElement && document.activeElement.type === "number"){
    document.activeElement.blur();
  }
}, { passive: true });
