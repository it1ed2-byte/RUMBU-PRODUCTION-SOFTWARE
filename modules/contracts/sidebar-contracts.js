/**
 * sidebar-contracts.js
 * Government Contracts module — sidebar navigation.
 *
 * USAGE IN EACH PAGE:
 *   1. Add <script src="sidebar-contracts.js"></script> BEFORE the closing </body>.
 *      auth-contracts.js must already be loaded (it provides _getSb()).
 *   2. Call initSidebar() inside your page's init() function, after
 *      guardPage() succeeds, passing the authenticated sb client:
 *
 *        const auth = await guardPage();
 *        if (!auth) return;
 *        initSidebar(auth.sb);
 *
 * HOW IT WORKS:
 *   On first call, the script wraps the existing .page-hdr + .content
 *   elements inside a two-column layout (sidebar left, content right).
 *   It then queries the pages table for Government Contracts pages,
 *   ordered by sort_order then name, and renders grouped navigation with
 *   section labels (OVERVIEW, MONITORING, etc.) derived from the
 *   sort_order decade.
 *
 * REQUIRES:
 *   sidebar-reorder.sql must have been applied to the database so that
 *   the pages table has a sort_order column with values set.
 */

'use strict';

/* ── Section group definitions ─────────────────────────────────────────────
 * sort_order decade → section label shown above the group of links.
 * ─────────────────────────────────────────────────────────────────────────── */
const _CNT_GROUPS = [
  { min: 10, max: 19, label: 'OVERVIEW'             },
  { min: 20, max: 29, label: 'MONITORING'            },
  { min: 30, max: 39, label: 'QUALITY & COMPLIANCE'  },
  { min: 40, max: 49, label: 'CONTRACT LIFECYCLE'    },
  { min: 50, max: 59, label: 'REFERENCE'             },
  { min: 90, max: 99, label: 'ADMINISTRATION'        },
];

function _sidebarGroup(sortOrder) {
  if (sortOrder == null) return null;
  const g = _CNT_GROUPS.find(g => sortOrder >= g.min && sortOrder <= g.max);
  return g ? g.label : null;
}

/* ── Layout injection (runs once at script load) ───────────────────────────
 * Wraps .page-hdr and .content inside a two-column shell so the sidebar
 * sits beside the existing content. Pages need NO HTML changes.
 * ─────────────────────────────────────────────────────────────────────────── */
(function _injectLayout() {
  document.addEventListener('DOMContentLoaded', () => {
    const hdr     = document.querySelector('.page-hdr');
    const content = document.querySelector('.content');
    if (!hdr || !content) return;   // page has a non-standard layout — skip

    // Build: <div class="cnt-shell">
    //          <nav id="cnt-nav">…populated by initSidebar()…</nav>
    //          <div class="cnt-main">
    //            [page-hdr]
    //            [content]
    //          </div>
    //        </div>
    const shell = document.createElement('div');
    shell.className = 'cnt-shell';

    const nav = document.createElement('nav');
    nav.id = 'cnt-nav';
    nav.innerHTML = '<div class="cnt-nav-loading">Loading…</div>';

    const main = document.createElement('div');
    main.className = 'cnt-main';

    // Move existing nodes into the new wrapper
    hdr.parentNode.insertBefore(shell, hdr);
    main.appendChild(hdr);
    main.appendChild(content);
    shell.appendChild(nav);
    shell.appendChild(main);
  });
})();

/* ── Public API ─────────────────────────────────────────────────────────────
 *
 * initSidebar(sb, [currentPath])
 *
 *   sb          — authenticated Supabase client from guardPage()
 *   currentPath — (optional) e.g. 'contracts/ncr-register'
 *                 If omitted, derived automatically from window.location.
 * ─────────────────────────────────────────────────────────────────────────── */
async function initSidebar(sb, currentPath) {
  // Wait until the layout is in the DOM
  await new Promise(r => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', r, { once: true });
    } else { r(); }
  });

  const nav = document.getElementById('cnt-nav');
  if (!nav) return;

  /* ── Detect active page from URL ──────────────────────────────────────── */
  if (!currentPath) {
    // /modules/contracts/ncr-register.html  →  'contracts/ncr-register'
    const stem = window.location.pathname
      .split('/').pop()
      .replace(/\.html?$/i, '');
    currentPath = 'contracts/' + stem;
  }

  /* ── Fetch pages, ordered by sort_order then name ─────────────────────── */
  const { data: pages, error } = await sb
    .from('pages')
    .select('id, name, module_path, sort_order')
    .like('module_path', 'contracts/%')
    .order('sort_order', { nullsFirst: false })
    .order('name');

  if (error) {
    nav.innerHTML = `
      <div class="cnt-nav-err">
        ⚠ Navigation error
        <small>${_sidebarEsc(error.message)}</small>
      </div>`;
    return;
  }

  if (!pages?.length) {
    nav.innerHTML = `<div class="cnt-nav-err">No pages configured.</div>`;
    return;
  }

  /* ── Build HTML: group headers + links ────────────────────────────────── */
  let html   = '';
  let lastLbl = undefined;   // undefined = first iteration

  for (const page of pages) {
    const lbl = _sidebarGroup(page.sort_order);

    // Emit a new section header whenever the group changes
    if (lbl !== lastLbl) {
      if (lastLbl !== undefined) {
        html += '<div class="cnt-nav-divider"></div>';
      }
      if (lbl) {
        html += `<div class="cnt-nav-section">${_sidebarEsc(lbl)}</div>`;
      }
      lastLbl = lbl;
    }

    const isActive = page.module_path === currentPath;
    // 'contracts/ncr-register'  →  href: 'ncr-register.html'
    const href = page.module_path.split('/').pop() + '.html';

    html += `
      <a class="cnt-nav-item${isActive ? ' active' : ''}" href="${href}">
        ${_sidebarEsc(page.name)}
      </a>`;
  }

  nav.innerHTML = html;
}

function _sidebarEsc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
