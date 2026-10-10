/**
 * auth-contracts.js
 * Contract module authentication + access guard.
 * Load via <script src="auth-contracts.js"></script> at the TOP of every
 * internal-staff page. Every page must then call guardPage() at the start
 * of its init() function and return early if it returns null.
 *
 * Access rule: the user must have an active row in cnt_profiles.
 * Any authenticated Rumbu user WITHOUT a cnt_profiles row is denied.
 */

'use strict';

/**
 * Check auth and cnt_profiles membership.
 * Shows a lock screen and returns null for anyone not authorised.
 * @returns {Promise<{user, profile, permissions: Set<string>, sb} | null>}
 */
async function guardPage() {
  const sb = window.parent?.sb;
  if (!sb) { _accessDenied(); return null; }

  const { data: { user } } = await sb.auth.getUser();
  if (!user) { _accessDenied(); return null; }

  // Use maybeSingle() — returns null (not an error) when no row exists
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

  if (error || !profile || profile.status !== 'active') {
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
  const sb = window.parent?.sb ?? (() => {
    const { createClient } = window.supabase;
    return createClient(
      'https://betfhunzmhtdzgvufmfk.supabase.co',
      'sb_publishable_AfDp1FlHghu9TOfqEUj20Q_Pke7GlTp'
    );
  })();

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

/** Replace the page body with a lock screen. */
function _accessDenied() {
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
