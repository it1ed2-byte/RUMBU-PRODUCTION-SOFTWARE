/**
 * auth-contracts.js
 * Contract module authentication + access guard.
 * Load via <script src="auth-contracts.js"></script> at the TOP of every
 * internal-staff page. Every page must then call guardPage() at the start
 * of its init() function and return early if it returns null.
 *
 * Access rule: active cnt_profiles row required for regular users.
 * Super admins bypass cnt_profiles and get full access automatically.
 */

'use strict';

const _CNT_URL = 'https://betfhunzmhtdzgvufmfk.supabase.co';
const _CNT_KEY = 'sb_publishable_AfDp1FlHghu9TOfqEUj20Q_Pke7GlTp';

/**
 * Returns the best available Supabase client.
 * Prefers the parent window's client (shares the live session when running
 * inside the RumbuApp iframe). Falls back to creating a fresh client that
 * reads the persisted session from localStorage.
 *
 * Root cause of original bug: the main app declares `const sb = ...` in
 * auth.js, which does NOT become a window property (only `var` does), so
 * window.parent.sb is always undefined from an iframe. The fallback below
 * fixes this transparently without touching the main app.
 */
function _getSb() {
  // ── Option 1: window.parent.sb ────────────────────────────────────
  // Works if auth.js declares `var sb` or `window.sb = …` (var at
  // script top-level DOES become a window property; const/let do NOT).
  if (window.parent?.sb) return window.parent.sb;

  // ── Option 2: window.parent.eval('sb') ───────────────────────────
  // const/let are NOT window properties but ARE in the parent window's
  // JavaScript execution scope. eval() runs in that scope on same-origin
  // frames, so this reliably returns the exact authenticated client
  // object the main app is already using — JWT, session and all.
  try {
    const parentSb = window.parent.eval(
      'typeof sb !== "undefined" && sb'
    );
    if (parentSb) return parentSb;
  } catch (_) { /* cross-origin or eval blocked — fall through */ }

  // ── Option 3: create a fresh client from parent's library ─────────
  // Same-origin frames share localStorage, so Supabase finds the active
  // session token and subsequent getSession()/getUser() calls succeed.
  // Use this only as a last resort because a new client needs one
  // async round-trip before its JWT is applied to DB queries.
  const lib = window.supabase ?? window.parent?.supabase;
  if (!lib?.createClient) {
    throw new Error(
      'Cannot reach Supabase from this frame. ' +
      'Reload the app — if the problem persists, contact IT.'
    );
  }
  return lib.createClient(_CNT_URL, _CNT_KEY);
}

/**
 * Check auth and cnt_profiles membership.
 * Super admins are granted full synthetic access without a cnt_profiles row.
 * Regular users must have an active cnt_profiles row.
 * Shows a lock screen and returns null for anyone not authorised.
 * @returns {Promise<{user, profile, permissions: Set<string>, sb} | null>}
 */
async function guardPage() {
  const sb = _getSb();

  // getSession() loads the stored session into this client instance so the
  // JWT is attached to every subsequent PostgREST request. getUser() makes
  // a network call but does not guarantee the token is set on the client
  // before the first DB query fires — causing auth.uid() / request.jwt.claim.sub
  // to resolve as null in RLS policies even when the user is authenticated.
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { _accessDenied(); return null; }
  const user = session.user;

  // ── Super Admin bypass ──────────────────────────────────────────────────
  // Super admins can administer any module, including Government Contracts,
  // without needing a cnt_profiles row. They receive a synthetic profile
  // with a full permission set so all UI branches render correctly.
  const { data: mainProfile } = await sb
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (mainProfile?.role === 'super_admin') {
    return {
      user,
      profile: {
        id: user.id,
        full_name: 'Super Admin',
        status: 'active',
        org_id: null,
        branch_id: null,
        company_id: null
      },
      permissions: new Set([
        'contracts.read', 'contracts.write', 'contracts.delete',
        'users.manage', 'reports.view', 'kpi.review', 'progress.review',
        'corrective.manage', 'agencies.manage', 'companies.manage'
      ]),
      sb
    };
  }

  // ── Regular user: must have active cnt_profiles row ─────────────────────
  const { data: profile, error } = await sb
    .from('cnt_profiles')
    .select(`
      id, full_name, email, phone, status,
      org_id, branch_id, company_id,
      cnt_profile_roles(
        cnt_roles(
          id, name,
          cnt_role_permissions(cnt_permissions(code))
        )
      )
    `)
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    // Surface the real DB error so future issues are immediately visible
    _accessDenied(error.message + (error.code ? ' [' + error.code + ']' : ''));
    return null;
  }
  if (!profile || profile.status !== 'active') {
    _accessDenied(); return null;
  }

  const permissions = new Set();
  profile.cnt_profile_roles?.forEach(pr =>
    pr.cnt_roles?.cnt_role_permissions?.forEach(rp => {
      if (rp.cnt_permissions?.code) permissions.add(rp.cnt_permissions.code);
    })
  );

  return { user, profile, permissions, sb };
}

/**
 * Portal auth — subcontractors only (must have company_id).
 * Call at the start of portal sub-pages.
 */
async function guardPortal() {
  const sb = _getSb();

  const { data: { user } } = await sb.auth.getUser();
  if (!user) { window.location.href = '/portal.html'; return null; }

  const { data: profile } = await sb
    .from('cnt_profiles')
    .select('id,full_name,status,company_id,org_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !profile.company_id || profile.status !== 'active') {
    window.location.href = '/portal.html'; return null;
  }

  const { data: company } = await sb
    .from('cnt_companies')
    .select('id,name,contact_name')
    .eq('id', profile.company_id)
    .maybeSingle();

  if (!company) { window.location.href = '/portal.html'; return null; }

  return { user, profile, company, sb };
}

/** Replace the page body with a lock screen. Pass detail for a DB error hint. */
function _accessDenied(detail) {
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
      height:100vh;text-align:center;font-family:system-ui,sans-serif;background:#f8fafc;
      padding:20px">
      <div style="font-size:52px;margin-bottom:20px;line-height:1">🔒</div>
      <h2 style="font-size:18px;font-weight:700;color:#1F3864;margin-bottom:10px">
        Access Restricted
      </h2>
      <p style="color:#64748b;font-size:14px;max-width:320px;line-height:1.65;margin-bottom:0">
        You do not have permission to access the
        Government Contracts module.
      </p>
      <p style="color:#94a3b8;font-size:12px;margin-top:12px">
        Contact IT if you believe this is an error.
      </p>
      ${detail ? `<p style="color:#ef4444;font-size:11px;margin-top:8px;max-width:400px;
        font-family:monospace;background:#fee2e2;padding:6px 10px;border-radius:6px">
        ${detail}</p>` : ''}
    </div>`;
}

/* ── Shared utilities ────────────────────────────────────────── */

function fmtNGN(v) {
  if (v == null) return '—';
  return 'NGN ' + Number(v).toLocaleString('en-NG', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function contractStatusBadge(status) {
  const m = {
    pipeline:   ['warn', 'Pipeline'],
    awarded:    ['ok',   'Awarded'],
    active:     ['ok',   'Active'],
    on_hold:    ['warn', 'On Hold'],
    completed:  ['',     'Completed'],
    terminated: ['err',  'Terminated'],
    closeout:   ['',     'Closeout'],
  };
  const [cls, label] = m[status] ?? ['', status ?? '—'];
  return `<span class="status ${cls}">${label}</span>`;
}

function progressBar(pct) {
  const v = Math.min(100, Math.max(0, pct ?? 0));
  const col = v >= 80 ? 'var(--ok)' : v >= 40 ? 'var(--accent)' : 'var(--warn)';
  return `<div style="background:var(--line);border-radius:4px;height:6px">
    <div style="background:${col};width:${v}%;height:6px;border-radius:4px"></div>
  </div><small style="color:var(--muted);font-size:11px">${v}%</small>`;
}

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:9999;padding:10px 18px;
    border-radius:8px;color:#fff;font-size:14px;
    background:${type === 'ok' ? '#22c55e' : type === 'err' ? '#ef4444' : '#f59e0b'};
    box-shadow:0 2px 8px rgba(0,0,0,.2)`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
