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

  if (!session) {
    window.location.href = loginPath;
    return null;
  }

  const { data: profile, error: profErr } = await sb
    .from("profiles")
    .select("id, username, role, super_admin_type, section_id, can_self_manage_todos, must_change_password")
    .eq("id", session.user.id)
    .single();

  if (profErr || !profile) {
    throw new Error("Could not load profile: " + (profErr ? profErr.message : "no profile row for this account"));
  }

  // --- KWP Phase 2: forced password change ---
  if (profile.must_change_password) {
    window.location.href = _kwpForceChangePath(loginPath);
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
      window.location.href = loginPath + "?blocked=inactive";
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
    canSelfManageTodos: !!profile.can_self_manage_todos
  };
}

async function logout(loginPath) {
  await sb.auth.signOut();
  window.location.href = loginPath || "login.html";
}
