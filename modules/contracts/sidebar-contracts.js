/**
 * sidebar-contracts.js  v2
 * Government Contracts — self-initialising grouped sidebar navigation.
 *
 * USAGE: Add ONE line after auth-contracts.js on every internal page:
 *   <script src="sidebar-contracts.js"></script>
 *
 * That is all — no initSidebar() call is needed anywhere.
 * auth-contracts.js must be loaded first (provides _getSb()).
 * contracts.css must be loaded (provides the .cnt-* styles).
 *
 * NAVIGATION GROUPS (Contract Navigation Redesign Spec §4):
 *   OVERVIEW               → Management Dashboard
 *   CONTRACT SETUP         → Agencies, Companies, Contracts, New Contract
 *   PEOPLE & MOBILISATION  → Contract Staff, Mobilization Checklist
 *   PERFORMANCE & COMPLIANCE→KPI Review, Performance Evaluation,
 *                             Progress Review, Prequalification
 *   RISK & CORRECTIVE ACTIONS→Corrective Actions, NCR Register
 *   REPORTING              → Monthly Performance Report
 *   ADMINISTRATION         → User Management
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
 * Navigation group definitions
 * ═══════════════════════════════════════════════════════════════════════════ */
const _CNT_GROUPS = [
  {
    label: 'OVERVIEW',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    stems: ['management-dashboard']
  },
  {
    label: 'CONTRACT SETUP',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    stems: ['agencies', 'companies', 'contracts', 'new-contract']
  },
  {
    label: 'PEOPLE & MOBILISATION',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    stems: ['contract-staff', 'mobilization-checklist']
  },
  {
    label: 'PERFORMANCE & COMPLIANCE',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    stems: ['kpi-review', 'performance-scorecard', 'progress-review', 'prequalification']
  },
  {
    label: 'RISK & CORRECTIVE ACTIONS',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    stems: ['corrective-actions', 'ncr-register']
  },
  {
    label: 'REPORTING',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="12" y1="9" x2="8" y2="9"/></svg>',
    stems: ['monthly-report']
  },
  {
    label: 'ADMINISTRATION',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3.2 8-7 10-3.8-2-7-5-7-10V6l7-3Z"/></svg>',
    stems: ['admin-users']
  }
];

/* Stem → group index lookup (built once at load time) */
const _CNT_STEM_MAP = {};
_CNT_GROUPS.forEach((g, i) => g.stems.forEach(s => (_CNT_STEM_MAP[s] = i)));

/* ═══════════════════════════════════════════════════════════════════════════
 * Layout injection — runs once on DOMContentLoaded
 * Wraps .page-hdr and .content inside the two-column shell.
 * Portal pages (no .page-hdr/.content) are left untouched.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function _boot() {
  function inject() {
    if (document.getElementById('cnt-shell')) return; // already done
    const hdr     = document.querySelector('.page-hdr');
    const content = document.querySelector('.content');
    if (!hdr || !content) return; // portal page or non-standard layout — skip

    /* Shell:  <div id="cnt-shell">
     *           <nav id="cnt-nav">…</nav>
     *           <div class="cnt-main">[hdr][content]</div>
     *         </div>                                                        */
    const shell = document.createElement('div');
    shell.id = 'cnt-shell'; shell.className = 'cnt-shell';

    const nav = document.createElement('nav');
    nav.id = 'cnt-nav';
    nav.className = 'cnt-nav';  // required — CSS selector is .cnt-nav, not #cnt-nav
    nav.setAttribute('aria-label', 'Government Contracts navigation');

    const main = document.createElement('div');
    main.className = 'cnt-main';

    hdr.parentNode.insertBefore(shell, hdr);
    main.appendChild(hdr);
    main.appendChild(content);
    shell.appendChild(nav);
    shell.appendChild(main);

    /* Mobile overlay (backdrop to close the drawer) */
    const overlay = document.createElement('div');
    overlay.id = 'cntMobOverlay';
    overlay.className = 'cnt-mob-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.addEventListener('click', cntCloseMobile);
    document.body.appendChild(overlay);

    /* Mobile hamburger button, prepended to .ph-left inside .page-hdr */
    const phLeft = hdr.querySelector('.ph-left');
    if (phLeft) {
      const ham = document.createElement('button');
      ham.className = 'cnt-mob-ham';
      ham.setAttribute('aria-label', 'Open navigation');
      ham.setAttribute('title', 'Open menu');
      ham.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" width="18" height="18"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
      ham.addEventListener('click', cntOpenMobile);
      phLeft.insertBefore(ham, phLeft.firstChild);
    }

    /* Restore saved collapse state */
    try {
      if (localStorage.getItem('cnt_nav_collapsed') === '1') {
        shell.classList.add('cnt-collapsed');
      }
    } catch (_) {}

    /* Populate the sidebar */
    _renderNav(nav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject, { once: true });
  } else {
    inject();
  }
}());

/* ═══════════════════════════════════════════════════════════════════════════
 * Sidebar rendering
 * ═══════════════════════════════════════════════════════════════════════════ */
async function _renderNav(nav) {
  const SHIELD_SVG  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M12 3l7 3v5c0 5-3.2 8-7 10-3.8-2-7-5-7-10V6l7-3Z"/></svg>';
  const BARS_SVG    = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" width="13" height="13"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
  const CHEV_UP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="18 15 12 9 6 15"/></svg>';
  const CHEV_DN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="6 9 12 15 18 9"/></svg>';

  /* Determine initial topbar state from localStorage */
  let _topHidden = false;
  try { _topHidden = localStorage.getItem('cnt_top_hidden') === '1'; } catch(_) {}
  /* Apply it to the parent frame immediately (same-origin, so direct DOM access works) */
  try {
    const shell = window.parent.document.getElementById('appShell');
    if (shell) { _topHidden ? shell.classList.add('cnt-top-hidden') : shell.classList.remove('cnt-top-hidden'); }
  } catch(_) {}

  /* Render the chrome immediately so the toggle button is usable at once */
  nav.innerHTML = `
    <div class="cnt-nav-header">
      <div class="cnt-nav-brand">
        ${SHIELD_SVG}
        <span>GOVT. CONTRACTS</span>
      </div>
      <div class="cnt-nav-actions">
        <button class="cnt-nav-toggle"
                id="cntTopToggle"
                onclick="cntToggleTopBar()"
                aria-label="${_topHidden ? 'Show top bar' : 'Hide top bar'}"
                title="${_topHidden ? 'Show top bar' : 'Hide top bar'}">
          ${_topHidden ? CHEV_DN_SVG : CHEV_UP_SVG}
        </button>
        <button class="cnt-nav-toggle"
                onclick="cntToggleNav()"
                aria-label="Collapse sidebar"
                title="Collapse / expand">
          ${BARS_SVG}
        </button>
      </div>
    </div>
    <div class="cnt-nav-body" id="cntNavBody">
      <div class="cnt-nav-loading">Loading…</div>
    </div>`;

  /* Detect the active page from the current URL */
  const stem       = window.location.pathname.split('/').pop().replace(/\.html?$/i, '');
  const activePath = 'contracts/' + stem;

  /* Fetch pages from the database */
  let pages = [];
  try {
    const sb = _getSb(); // defined in auth-contracts.js
    const { data, error } = await sb
      .from('pages')
      .select('id, name, module_path')
      .like('module_path', 'contracts/%')
      .order('name');
    if (error) throw error;
    pages = data || [];
  } catch (err) {
    document.getElementById('cntNavBody').innerHTML =
      `<div class="cnt-nav-err">⚠ Navigation error<small>${_cntEsc(err.message)}</small></div>`;
    return;
  }

  if (!pages.length) {
    document.getElementById('cntNavBody').innerHTML =
      '<div class="cnt-nav-err">No pages configured in database.</div>';
    return;
  }

  /* Distribute pages into their groups */
  const buckets   = _CNT_GROUPS.map(() => []);
  const ungrouped = [];
  pages.forEach(p => {
    const s  = p.module_path.split('/').pop();
    const gi = _CNT_STEM_MAP[s];
    (gi !== undefined ? buckets[gi] : ungrouped).push(p);
  });

  /* Build HTML */
  let html = '';
  _CNT_GROUPS.forEach((g, gi) => {
    if (!buckets[gi].length) return;
    html += `
      <div class="cnt-nav-group">
        <div class="cnt-nav-section" title="${_cntEsc(g.label)}">
          <span class="cnt-nav-group-icon">${g.icon}</span>
          <span class="cnt-nav-group-label">${_cntEsc(g.label)}</span>
        </div>
        ${buckets[gi].map(p => {
          const active = p.module_path === activePath;
          const href   = p.module_path.split('/').pop() + '.html';
          return `<a class="cnt-nav-item${active ? ' active' : ''}"
                     href="${href}"
                     title="${_cntEsc(p.name)}">${_cntEsc(p.name)}</a>`;
        }).join('')}
      </div>`;
  });

  /* Fallback: pages not matched to any group */
  if (ungrouped.length) {
    html += `
      <div class="cnt-nav-group">
        <div class="cnt-nav-section" title="OTHER">
          <span class="cnt-nav-group-label">OTHER</span>
        </div>
        ${ungrouped.map(p => {
          const active = p.module_path === activePath;
          const href   = p.module_path.split('/').pop() + '.html';
          return `<a class="cnt-nav-item${active ? ' active' : ''}"
                     href="${href}"
                     title="${_cntEsc(p.name)}">${_cntEsc(p.name)}</a>`;
        }).join('')}
      </div>`;
  }

  document.getElementById('cntNavBody').innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Top bar hide / show — collapses the main app's header + m-bar so the
 * contracts content fills the full viewport height.
 * Accesses the parent frame directly (same-origin iframe, no postMessage needed).
 * ═══════════════════════════════════════════════════════════════════════════ */
function cntToggleTopBar() {
  const CHEV_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="18 15 12 9 6 15"/></svg>';
  const CHEV_DN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="6 9 12 15 18 9"/></svg>';
  try {
    const shell = window.parent.document.getElementById('appShell');
    if (!shell) return;
    const hidden = shell.classList.toggle('cnt-top-hidden');
    /* Update the button icon and label */
    const btn = document.getElementById('cntTopToggle');
    if (btn) {
      btn.innerHTML    = hidden ? CHEV_DN : CHEV_UP;
      btn.title        = hidden ? 'Show top bar' : 'Hide top bar';
      btn.setAttribute('aria-label', hidden ? 'Show top bar' : 'Hide top bar');
    }
    /* Persist so the state survives page-to-page navigation within contracts */
    try { localStorage.setItem('cnt_top_hidden', hidden ? '1' : '0'); } catch(_) {}
  } catch(e) {
    console.warn('cntToggleTopBar: could not access parent frame', e);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Collapse / expand (desktop)
 * ═══════════════════════════════════════════════════════════════════════════ */
function cntToggleNav() {
  const shell = document.getElementById('cnt-shell');
  if (!shell) return;
  const collapsed = shell.classList.toggle('cnt-collapsed');
  try { localStorage.setItem('cnt_nav_collapsed', collapsed ? '1' : '0'); } catch (_) {}
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Mobile drawer open / close
 * ═══════════════════════════════════════════════════════════════════════════ */
function cntOpenMobile() {
  const nav     = document.getElementById('cnt-nav');
  const overlay = document.getElementById('cntMobOverlay');
  if (nav)     nav.classList.add('cnt-open');
  if (overlay) overlay.classList.add('cnt-show');
  document.body.style.overflow = 'hidden';
}
function cntCloseMobile() {
  const nav     = document.getElementById('cnt-nav');
  const overlay = document.getElementById('cntMobOverlay');
  if (nav)     nav.classList.remove('cnt-open');
  if (overlay) overlay.classList.remove('cnt-show');
  document.body.style.overflow = '';
}
/* Close on Escape */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') cntCloseMobile();
});

/* ── Utility ──────────────────────────────────────────────────────────────── */
function _cntEsc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
