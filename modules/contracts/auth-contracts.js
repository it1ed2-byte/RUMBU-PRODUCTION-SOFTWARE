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
/**
 * Returns a Supabase library reference for creating clients.
 * The actual authenticated client is built inside guardPage()
 * using an explicit setSession() call to avoid cross-frame
 * auth-header propagation issues.
 */
function _getLib() {
  const lib = window.supabase ?? window.parent?.supabase;
  if (!lib?.createClient) {
    throw new Error(
      'Cannot reach Supabase from this frame. ' +
      'Reload the app — if the problem persists, contact IT.'
    );
  }
  return lib;
}

/**
 * Creates a fresh Supabase client in the iframe's own context,
 * then explicitly sets the session so the JWT is attached to
 * every PostgREST request via the client's internal auth hook.
 * Falls back gracefully through multiple session sources.
 */
async function _buildAuthenticatedSb() {
  const lib = _getLib();

  // Build a fresh client scoped to this iframe
  const fresh = lib.createClient(_CNT_URL, _CNT_KEY, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false }
  });

  // ── Try to find an active session ────────────────────────────────
  let accessToken = null, refreshToken = null;

  // Source 1: parent's sb (now exposed as window.sb in auth.js)
  try {
    const parentSb = window.parent?.sb;
    if (parentSb) {
      const { data: { session: ps } } = await parentSb.auth.getSession();
      if (ps?.access_token) {
        accessToken  = ps.access_token;
        refreshToken = ps.refresh_token;
      }
    }
  } catch (_) {}

  // Source 2: localStorage — Supabase v2 key format
  if (!accessToken) {
    try {
      const ref = _CNT_URL.split('//')[1].split('.')[0];
      const raw = localStorage.getItem(`sb-${ref}-auth-token`);
      const stored = raw ? JSON.parse(raw) : null;
      if (stored?.access_token) {
        accessToken  = stored.access_token;
        refreshToken = stored.refresh_token;
      }
    } catch (_) {}
  }

  // Source 3: fresh.auth.getSession() — reads localStorage via client
  if (!accessToken) {
    try {
      const { data: { session: ls } } = await fresh.auth.getSession();
      if (ls?.access_token) {
        accessToken  = ls.access_token;
        refreshToken = ls.refresh_token;
      }
    } catch (_) {}
  }

  // Apply the session so the JWT reaches every PostgREST request
  if (accessToken) {
    await fresh.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  }

  return { fresh, hasSession: !!accessToken };
}

/**
 * Check auth and cnt_profiles membership.
 * Super admins are granted full synthetic access without a cnt_profiles row.
 * Regular users must have an active cnt_profiles row.
 * Shows a lock screen and returns null for anyone not authorised.
 * @returns {Promise<{user, profile, permissions: Set<string>, sb} | null>}
 */
async function guardPage() {
  const { fresh: sb, hasSession } = await _buildAuthenticatedSb();

  if (!hasSession) { _accessDenied(); return null; }

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
  // Two separate queries instead of an embedded select — avoids PGRST201
  // ("more than one relationship found") when PostgREST finds an ambiguous
  // FK between cnt_profiles and cnt_profile_roles.
  const { data: profile, error: profileErr } = await sb
    .from('cnt_profiles')
    .select('id, full_name, email, phone, status, org_id, branch_id, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileErr) {
    _accessDenied(profileErr.message + (profileErr.code ? ' [' + profileErr.code + ']' : ''));
    return null;
  }
  if (!profile || profile.status !== 'active') {
    _accessDenied(); return null;
  }

  // Build permissions via SECURITY DEFINER function — bypasses RLS so
  // the join chain (cnt_profile_roles → cnt_role_permissions → cnt_permissions)
  // never triggers recursive policies. Replaces the unreliable nested embed.
  const { data: permRows, error: permErr } = await sb
    .rpc('get_my_cnt_permissions');

  if (permErr) {
    _accessDenied(permErr.message + (permErr.code ? ' [' + permErr.code + ']' : ''));
    return null;
  }

  const permissions = new Set((permRows ?? []).map(r => r.code));

  return { user, profile, permissions, sb };
}

/**
 * Portal auth — subcontractors only (must have company_id).
 * Call at the start of portal sub-pages.
 */
async function guardPortal() {
  const { fresh: sb } = await _buildAuthenticatedSb();

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
