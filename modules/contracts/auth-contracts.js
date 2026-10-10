/**
 * auth-contracts.js
 * Contract module authentication helper.
 * Load via <script src="../../modules/contracts/auth-contracts.js"></script>
 * Requires window.parent.sb (the RumbuApp Supabase client from auth.js).
 */
'use strict';

function _sb() {
  const c = window.parent?.sb;
  if (!c) throw new Error('Supabase client unavailable');
  return c;
}

async function requireContractAuth() {
  let sb;
  try { sb = _sb(); } catch { window.location.replace('/'); return null; }

  const { data: { user } } = await sb.auth.getUser();
  if (!user) { window.location.replace('/'); return null; }

  const { data: profile } = await sb
    .from('cnt_profiles')
    .select(`id,display_name,email,phone,status,org_id,branch_id,company_id,
             cnt_profile_roles(cnt_roles(id,name,
               cnt_role_permissions(cnt_permissions(code))))`)
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'active') {
    window.location.replace('/'); return null;
  }

  const permissions = new Set();
  profile.cnt_profile_roles?.forEach(pr =>
    pr.cnt_roles?.cnt_role_permissions?.forEach(rp => {
      if (rp.cnt_permissions?.code) permissions.add(rp.cnt_permissions.code);
    })
  );

  return { user, profile, permissions, sb };
}

async function requirePortalAuth() {
  const auth = await requireContractAuth();
  if (!auth) return null;
  if (!auth.profile.company_id) { window.location.replace('/'); return null; }

  const { data: company } = await auth.sb
    .from('cnt_companies')
    .select('id,name,reg_number,address,contact_name,contact_phone,contact_email,status')
    .eq('id', auth.profile.company_id)
    .single();

  if (!company) { window.location.replace('/'); return null; }
  return { ...auth, company };
}

/* ── Shared utilities ──────────────────────────────────────── */

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
    pipeline:   ['warn',   'Pipeline'],
    awarded:    ['ok',     'Awarded'],
    active:     ['ok',     'Active'],
    on_hold:    ['warn',   'On Hold'],
    completed:  ['',       'Completed'],
    terminated: ['err',    'Terminated'],
    closeout:   ['',       'Closeout'],
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
    border-radius:var(--radius,8px);color:#fff;font-size:14px;
    background:${type === 'ok' ? 'var(--ok)' : type === 'err' ? 'var(--bad)' : 'var(--warn)'};
    box-shadow:0 2px 8px rgba(0,0,0,.2)`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
