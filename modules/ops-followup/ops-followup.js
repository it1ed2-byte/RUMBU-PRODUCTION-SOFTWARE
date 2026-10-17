/* =====================================================================
   RUMBU INDUSTRIES GROUP: Operations Follow-up module, shared script
   Ported from the Google Apps Script web app (Code.gs / Index.html).
   Needs, loaded first: supabase-js and ../../auth.js (gives `sb` and
   requireAuth). Every page calls OF.start({...}).

   Reads use the RLS-protected tables and ops_followup_items_v. Every
   write goes through a database function (ops_fu_*), which holds the
   rules the Apps Script enforced.
   ===================================================================== */
(function () {
  'use strict';

  var OF = window.OF = {};

  /* ---------- constants ---------- */
  var STATUS = OF.STATUS = { open: 'Open', in_progress: 'In progress', overdue: 'Overdue', verified_closed: 'Verified closed' };
  var CEO = OF.CEO = { no: 'Not escalated', conditional: 'Conditional', yes: 'CEO escalation' };
  var PRIORITIES = OF.PRIORITIES = ['Emergency', 'Critical', 'High', 'Medium', 'Low'];
  var PRANK = { Emergency: 0, Critical: 1, High: 2, Medium: 3, Low: 4 };
  var RESPONSES = OF.RESPONSES = ['No response received', 'Response received: partial', 'Response received: scope mismatch', 'Response received: complete'];
  var PROGRESS = OF.PROGRESS = { done: 'Done, fixed', in_progress: 'In progress', need_help: 'Need help or a decision', update: 'Other update' };
  var REVIEW = OF.REVIEW = { pending: 'Waiting for review', accepted: 'Accepted into the record', more_info: 'More information requested' };
  OF.OUTCOMES = ['Approve recommended direction', 'Approve with amendment', 'Request more information', 'Defer to next review', 'Reject'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var LABELS = OF.LABELS = {
    id: 'Item ID', period: 'Review period', facility: 'Facility', facility_id: 'Facility', priority: 'Priority',
    issue: 'Issue', action: 'Required action', owner: 'Owner', owner_id: 'Owner', due: 'Due date',
    response_status: 'Response status', response_summary: 'Owner response summary', evidence: 'Evidence assessment',
    resolution: 'Direction to owner', status: 'Status', ceo_flag: 'CEO escalation', ceo_decision: 'CEO decision',
    ceo_decision_date: 'CEO decision date', notes: 'Follow-up notes', closure_evidence: 'Closure evidence',
    closed_source: 'Closure source', created: 'Item created', updated_at: 'Last updated', updated_by: 'Updated by'
  };
  var AGE = OF.AGE = [
    { k: 'nd', label: 'No due date', col: 'var(--line)', dark: true },
    { k: 'ny', label: 'Not yet due', col: 'var(--of-a0)', dark: true },
    { k: 'a1', label: '1 to 7 days late', col: 'var(--of-a1)', dark: true },
    { k: 'a2', label: '8 to 14 days late', col: 'var(--of-a2)' },
    { k: 'a3', label: '15 to 30 days late', col: 'var(--of-a3)' },
    { k: 'a4', label: 'Over 30 days late', col: 'var(--of-a4)' }
  ];

  /* ---------- state ---------- */
  var S = OF.S = { me: null, access: {}, items: [], owners: [], facilities: [], settings: {}, today: '', pending: {}, ownerPeople: {} };

  /* ---------- DOM helper ---------- */
  function h(tag, p) {
    var e = document.createElement(tag); p = p || {};
    Object.keys(p).forEach(function (k) {
      var v = p[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'value') e.value = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function add(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(e, x); }); return; }
    e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  OF.h = h; OF.add = add;

  /* ---------- dates and rules (same logic as the Apps Script) ---------- */
  function validIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }
  function fmt(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? m[3] + ' ' + MON[+m[2] - 1] + ' ' + m[1] : (iso || ''); }
  var STAMP = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  // Built from parts with our own month names: some browsers print "Sept".
  function fmtStamp(ts) {
    if (!ts) return '';
    var d = new Date(ts); if (isNaN(d)) return String(ts);
    var p = {}; STAMP.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    var hh = p.hour === '24' ? '00' : p.hour;
    return p.day + ' ' + MON[Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', month: 'numeric' }).format(d)) - 1] + ' ' + p.year + ' ' + hh + ':' + p.minute;
  }
  function utc(iso) { var p = iso.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function diff(a, b) { return Math.round((utc(b) - utc(a)) / 86400000); }
  function addDays(iso, n) { return new Date(utc(iso) + n * 86400000).toISOString().slice(0, 10); }
  function addWorkingDays(iso, n) {
    var d = iso;
    while (n > 0) { d = addDays(d, 1); var w = new Date(utc(d)).getUTCDay(); if (w !== 0 && w !== 6) n--; }
    return d;
  }
  function isoWeek(iso) {
    var d = new Date(utc(iso)); var day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
    var y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.ceil(((d - y0) / 86400000 + 1) / 7);
  }
  function outstanding(it) { return it.status !== 'verified_closed'; }
  function daysLate(it) { return (validIso(it.due) && outstanding(it)) ? diff(it.due, S.today) : null; }
  function lateText(it) {
    if (!outstanding(it)) return 'Closed';
    var d = daysLate(it);
    if (d == null) return 'No due date';
    if (d > 0) return d + (d === 1 ? ' day' : ' days') + ' overdue';
    if (d === 0) return 'Due today';
    return 'Due in ' + (-d) + (d === -1 ? ' day' : ' days');
  }
  function isLate(it) { return outstanding(it) && (it.status === 'overdue' || (daysLate(it) || 0) > 0); }
  function isJoint(o) { return /\s\/\s|\(with\b/i.test(o || ''); }
  function isGeneric(name) { return /^plant\s*\/\s*functional head/i.test(String(name || '').trim()); }
  function ceoPending(it) { return outstanding(it) && it.ceo_flag !== 'no' && !it.ceo_decision; }
  function noResp(it) { return outstanding(it) && /^no response/i.test(it.response_status || ''); }
  function pr(p) { return PRANK[p] == null ? 9 : PRANK[p]; }
  function ageKey(it) {
    var d = daysLate(it);
    if (d == null) return 'nd';
    if (d <= 0) return 'ny';
    if (d <= 7) return 'a1';
    if (d <= 14) return 'a2';
    if (d <= 30) return 'a3';
    return 'a4';
  }
  function byAttention(a, b) {
    var la = daysLate(a), lb = daysLate(b);
    return pr(a.priority) - pr(b.priority) ||
      ((lb == null ? -9999 : lb) - (la == null ? -9999 : la)) ||
      (a.id < b.id ? -1 : 1);
  }
  function uniq(arr) { var s = {}; return arr.filter(function (x) { if (!x || s[x]) return false; s[x] = 1; return true; }); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function groupBy(arr, fn) {
    var order = [], map = {};
    arr.forEach(function (x) { var k = fn(x) || 'Unassigned'; if (!map[k]) { map[k] = []; order.push(k); } map[k].push(x); });
    return order.map(function (k) { return [k, map[k]]; });
  }
  Object.assign(OF, {
    validIso: validIso, fmt: fmt, fmtStamp: fmtStamp, diff: diff, addDays: addDays, isoWeek: isoWeek,
    outstanding: outstanding, daysLate: daysLate, lateText: lateText, isLate: isLate, isJoint: isJoint,
    isGeneric: isGeneric, ceoPending: ceoPending, noResp: noResp, pr: pr, ageKey: ageKey,
    byAttention: byAttention, uniq: uniq, plural: plural, groupBy: groupBy
  });

  OF.VIEWS = {
    outstanding: { label: 'Outstanding', test: outstanding },
    overdue: { label: 'Past due', test: isLate },
    emcrit: { label: 'Emergency and critical outstanding', test: function (it) { return outstanding(it) && pr(it.priority) <= 1; } },
    ceo: { label: 'Awaiting CEO decision', test: ceoPending },
    noresp: { label: 'No response from owner', test: noResp },
    joint: { label: 'Joint or cross-department', test: function (it) { return outstanding(it) && isJoint(it.owner); } },
    closed: { label: 'Verified closed', test: function (it) { return it.status === 'verified_closed'; } },
    review: { label: 'Owner responses to review', test: function (it) { return (S.pending[it.id] || 0) > 0; } }
  };

  /* ---------- tags ---------- */
  OF.prioTag = function (p) { return h('span', { class: 'pill pr-' + String(p).toLowerCase() }, p); };
  OF.statusTag = function (s) { return h('span', { class: 'pill st-' + s }, STATUS[s] || s); };
  OF.ceoTag = function (it) {
    return it.ceo_flag === 'no' ? null : h('span', { class: 'pill ceo-' + it.ceo_flag }, it.ceo_flag === 'yes' ? 'CEO' : 'CEO conditional');
  };

  /* ---------- toast and errors ---------- */
  var toastEl, toastT;
  OF.toast = function (msg, bad) {
    if (!toastEl) { toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.className = 'toast'; }, bad ? 6500 : 3200);
  };
  function errMsg(e) {
    if (!e) return 'Something went wrong. Reload and try again.';
    var m = e.message || e.error_description || e.details || String(e);
    return String(m).replace(/^Exception:\s*/, '');
  }
  OF.errMsg = errMsg;
  OF.handleErr = function (e, target) {
    var m = errMsg(e);
    if (target) target.textContent = m;
    OF.toast(m, true);
    if (/^CONFLICT/.test(m)) OF.reload();
  };

  /* ---------- server bridge ---------- */
  OF.rpc = function (fn, args) {
    return sb.rpc(fn, args || {}).then(function (r) { if (r.error) throw r.error; return r.data; });
  };
  // Pages through PostgREST's 1,000-row cap.
  OF.fetchAll = function (makeQuery) {
    var size = 1000, out = [];
    function page(from) {
      return makeQuery().range(from, from + size - 1).then(function (r) {
        if (r.error) throw r.error;
        out = out.concat(r.data || []);
        return (r.data || []).length === size ? page(from + size) : out;
      });
    }
    return page(0);
  };

  /* ---------- loading ---------- */
  OF.load = function () {
    return OF.rpc('ops_fu_my_access').then(function (acc) {
      S.access = acc || {};
      S.today = S.access.today || new Date().toISOString().slice(0, 10);
      if (!S.access.can_read) { var e = new Error('NO_ACCESS'); e.noAccess = true; throw e; }
      return Promise.all([
        OF.fetchAll(function () { return sb.from('ops_followup_items_v').select('*').order('id'); }),
        sb.from('ops_followup_owners').select('*').order('name'),
        sb.from('ops_followup_facilities').select('*').order('sort_order'),
        sb.from('ops_followup_settings').select('*'),
        sb.from('ops_followup_responses').select('item_id').eq('review_status', 'pending'),
        sb.rpc('ops_fu_owner_people')
      ]);
    }).then(function (r) {
      [r[1], r[2], r[3]].forEach(function (x) { if (x.error) throw x.error; });
      S.pending = {};
      if (!r[4].error) (r[4].data || []).forEach(function (x) { S.pending[x.item_id] = (S.pending[x.item_id] || 0) + 1; });
      S.ownerPeople = {};
      if (!r[5].error) (r[5].data || []).forEach(function (x) { (S.ownerPeople[x.owner_id] = S.ownerPeople[x.owner_id] || []).push(x); });
      S.items = r[0];
      S.owners = r[1].data || [];
      S.facilities = r[2].data || [];
      S.settings = {};
      (r[3].data || []).forEach(function (s) { S.settings[s.key] = s.value; });
    });
  };
  OF.replaceItem = function (item) {
    if (!item) return;
    var i = S.items.findIndex(function (x) { return x.id === item.id; });
    if (i > -1) S.items[i] = item; else S.items.push(item);
  };
  OF.canEdit = function () { return !!S.access.can_edit; };

  /* ---------- who an owner title goes to ---------- */
  function personText(x) { return x.full_name ? x.full_name + ' (' + x.username + ')' : x.username; }
  OF.goesTo = function (ownerId) {
    return (S.ownerPeople[ownerId] || []).map(personText).join(', ');
  };
  var peopleP = null;
  OF.people = function () {
    if (!peopleP) peopleP = OF.rpc('ops_fu_people').catch(function (e) { peopleP = null; throw e; });
    return peopleP;
  };
  // "Full Name (username)" or a bare username -> username
  OF.usernameFrom = function (v) {
    v = String(v || '').trim();
    var m = /\(([^()]+)\)\s*$/.exec(v);
    return m ? m[1].trim() : v;
  };
  OF.refreshOwnerPeople = function () {
    return sb.rpc('ops_fu_owner_people').then(function (r) {
      if (r.error) return;
      S.ownerPeople = {};
      (r.data || []).forEach(function (x) { (S.ownerPeople[x.owner_id] = S.ownerPeople[x.owner_id] || []).push(x); });
    });
  };
  OF.canManage = function () { return !!S.access.can_manage; };

  /* ---------- page shell ---------- */
  var CFG = null, mainEl = null, bannerEl = null, heroEl = null;
  OF.param = function (k) { return new URLSearchParams(location.search).get(k) || ''; };
  OF.go = function (page, params) {
    var q = new URLSearchParams();
    Object.keys(params || {}).forEach(function (k) { if (params[k]) q.set(k, params[k]); });
    location.href = page + '.html' + (q.toString() ? '?' + q.toString() : '');
  };

  OF.start = function (cfg) {
    CFG = cfg;
    var wrap = h('div', { class: 'of-wrap' });
    heroEl = h('section', { class: 'hero' },
      h('div', { class: 'ht' }, h('h2', null, cfg.title), cfg.sub ? h('p', null, cfg.sub) : null));
    bannerEl = h('div');
    mainEl = h('main', null, h('div', { class: 'of-loading' }, 'Loading the follow-up register...'));
    wrap.appendChild(heroEl); wrap.appendChild(bannerEl); wrap.appendChild(mainEl);
    wrap.appendChild(h('p', { class: 'of-foot' }, 'Confidential, internal use only. Rumbu Industries Group, Group Operations Office. Every change to an item is recorded in its history.'));
    document.body.appendChild(wrap);
    buildDrawer();

    requireAuth('../../login.html').then(function (me) {
      if (!me) return;
      S.me = me;
      return OF.reload().then(function () {
        var openId = OF.param('open');
        if (openId) OF.openItem(openId);
      });
    }).catch(function (e) { showFatal(e); });
  };

  function showFatal(e) {
    mainEl.innerHTML = '';
    if (e && e.noAccess) {
      mainEl.appendChild(h('div', { class: 'status warn' },
        'You do not have access to the operations follow-up register. Ask the Group Operations Office or IT to assign you a page in this module.'));
    } else {
      mainEl.appendChild(h('div', { class: 'status bad' }, 'The register could not be loaded. ' + errMsg(e)));
    }
  }

  OF.reload = function () {
    return ((CFG && CFG.load) || OF.load)().then(OF.render).catch(showFatal);
  };

  // Hero: page title, a one-line summary, review date, access level and
  // two or three headline figures supplied by the page (cfg.hero).
  function renderHero() {
    var a = S.access, x = (CFG.hero && CFG.hero()) || {};
    var reloadBtn = h('button', { class: 'btn small', type: 'button', onclick: function () {
      OF.reload().then(function () { OF.toast('Register reloaded.'); });
    } }, 'Reload');
    var text = x.text != null ? x.text : CFG.sub;
    heroEl.innerHTML = '';
    heroEl.appendChild(h('div', { class: 'ht' },
      h('h2', null, x.title || CFG.title),
      text ? h('p', null, text) : null,
      h('div', { class: 'meta' },
        h('span', { class: 'tag' }, (a.as_at_fixed ? 'Review date ' : 'As at ') + fmt(S.today)),
        h('span', { class: 'tag' + (a.can_edit ? ' edit' : '') }, CFG.roleLabel ? CFG.roleLabel() : a.can_manage ? 'Manager' : a.can_edit ? 'Editor' : 'View only'),
        reloadBtn)));
    if (x.stats && x.stats.length) {
      heroEl.appendChild(h('div', { class: 'hs' }, x.stats.map(function (st) {
        var inner = [h('span', { class: 'n' }, String(st.n)), h('span', { class: 'l' }, st.l)];
        return st.go ? h('button', { class: 'hero-stat', type: 'button', onclick: st.go }, inner)
                     : h('div', { class: 'hero-stat' }, inner);
      })));
    }
  }

  OF.render = function () {
    renderHero();
    bannerEl.innerHTML = '';
    if (!S.access.can_edit && CFG.editHint !== false) {
      bannerEl.appendChild(h('div', { class: 'status info' },
        'You have view-only access. Ask the Group Operations Office to make you an editor if you need to update items.'));
    }
    mainEl.innerHTML = '';
    mainEl.appendChild(CFG.render());
  };

  /* ---------- item row ---------- */
  OF.rowEl = function (it) {
    var late = isLate(it);
    return h('button', { class: 'irow p-' + String(it.priority).toLowerCase(), type: 'button', onclick: function () { OF.openItem(it.id); } },
      h('span', { class: 'stripe', 'aria-hidden': 'true' }),
      h('span', { class: 'rid' }, it.id, h('small', null, it.period)),
      h('span', { class: 'rmain' }, h('span', { class: 'rissue' }, it.issue), h('span', { class: 'rmeta' }, it.owner + ', ' + it.facility)),
      h('span', { class: 'rdue' + (late ? ' late' : '') }, fmt(it.due) || 'No due date', h('small', null, lateText(it))),
      h('span', { class: 'rtags' }, OF.prioTag(it.priority), OF.statusTag(it.status), OF.ceoTag(it),
        isJoint(it.owner) ? h('span', { class: 'pill joint' }, 'Joint') : null,
        S.pending[it.id] ? h('span', { class: 'pill resp' }, 'New response') : null));
  };

  // A list of items laid out like the app's tables, with a dark header row.
  OF.itemList = function (list) {
    return h('div', { class: 'ilist' },
      h('div', { class: 'ihead', 'aria-hidden': 'true' },
        h('span'), h('span', null, 'Item'), h('span', null, 'Issue and owner'), h('span', null, 'Due'), h('span', null, 'Priority and status')),
      list.map(OF.rowEl));
  };

  /* ---------- CSV export ---------- */
  OF.exportCsv = function (list) {
    var cols = ['id', 'period', 'facility', 'priority', 'issue', 'action', 'owner', 'due', 'status', 'ceo_flag', 'response_status',
      'response_summary', 'evidence', 'resolution', 'ceo_decision', 'notes', 'closure_evidence', 'closed_source', 'updated_at', 'updated_by'];
    var esc = function (v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [cols.map(function (c) { return LABELS[c] || c; }).map(esc).join(',')];
    list.forEach(function (it) {
      lines.push(cols.map(function (c) {
        if (c === 'status') return esc(STATUS[it.status]);
        if (c === 'ceo_flag') return esc(CEO[it.ceo_flag]);
        if (c === 'due') return esc(fmt(it.due));
        if (c === 'updated_at') return esc(fmtStamp(it.updated_at));
        return esc(it[c]);
      }).join(','));
    });
    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = h('a', { href: URL.createObjectURL(blob), download: 'Rumbu_Ops_Followup_Register_' + S.today + '.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    OF.toast('CSV exported with ' + plural(lines.length - 1, 'item') + '.');
  };

  /* ---------- owner responses and files ---------- */
  OF.fileSize = function (b) { b = Number(b) || 0; return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; };
  // Files are private: open them through a link that works for 10 minutes.
  OF.openFile = function (path) {
    var win = window.open('', '_blank');
    sb.storage.from('ops-followup-files').createSignedUrl(path, 600).then(function (r) {
      if (r.error) throw r.error;
      if (win) win.location = r.data.signedUrl; else window.location = r.data.signedUrl;
    }).catch(function (e) { if (win) win.close(); OF.toast('The file could not be opened. ' + errMsg(e), true); });
  };
  // One response, as shown to editors (with review buttons) and owners.
  OF.responseEl = function (r, opts) {
    opts = opts || {};
    var box = h('div', { class: 'resp-card rs-' + r.review_status },
      h('div', { class: 'resp-top' },
        h('b', null, r.submitted_by || 'Owner'), h('span', null, fmtStamp(r.submitted_at)),
        h('span', { class: 'pill pg-' + r.progress }, PROGRESS[r.progress] || r.progress),
        h('span', { class: 'pill rv-' + r.review_status }, REVIEW[r.review_status] || r.review_status)),
      h('p', { class: 'resp-msg' }, r.message),
      (r.files || []).length ? h('div', { class: 'files' }, r.files.map(function (f) {
        return h('button', { class: 'file', type: 'button', title: 'Open ' + f.name, onclick: function () { OF.openFile(f.path); } },
          h('span', { class: 'fi' }, (f.name.split('.').pop() || 'file').slice(0, 4).toUpperCase()), h('span', null, f.name, h('small', null, OF.fileSize(f.size))));
      })) : null,
      r.review_status !== 'pending' ? h('p', { class: 'resp-review' },
        (r.review_status === 'accepted' ? 'Accepted' : 'More information requested') + ' by ' + (r.reviewed_by || 'editor') + ', ' + fmtStamp(r.reviewed_at) +
        (r.review_note ? '. ' + r.review_note : '.')) : null);
    if (opts.review && r.review_status === 'pending' && OF.canEdit()) {
      var note = h('textarea', { rows: '2', placeholder: 'Note to the owner (required when asking for more)', 'aria-label': 'Note to the owner' });
      var err = h('div', { class: 'err' });
      var go = function (decision, btn) {
        err.textContent = '';
        btn.disabled = true;
        OF.rpc('ops_fu_review_response', { p_response_id: r.id, p_decision: decision, p_note: note.value })
          .then(function (x) {
            OF.toast(decision === 'accepted' ? 'Response accepted into the record.' : 'The owner has been asked for more.');
            if (opts.onDone) opts.onDone(x);
          }).catch(function (e) { btn.disabled = false; OF.handleErr(e, err); });
      };
      var acc = h('button', { class: 'btn small ok', type: 'button' }, 'Accept into record');
      var more = h('button', { class: 'btn small', type: 'button' }, 'Ask for more');
      acc.addEventListener('click', function () { go('accepted', acc); });
      more.addEventListener('click', function () { go('more_info', more); });
      OF.add(box, h('div', { class: 'resp-act' }, note, err, h('div', { class: 'acts' }, acc, more)));
    }
    return box;
  };

  /* ---------- drawer (view, edit, create) ---------- */
  var drawer, sheetEl, lastFocus = null;
  function buildDrawer() {
    sheetEl = h('aside', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dtitle' });
    drawer = h('div', { class: 'drawer', hidden: true }, h('div', { class: 'scrim', 'data-close': '1' }), sheetEl);
    drawer.addEventListener('click', function (e) { if (e.target.dataset && e.target.dataset.close) closeDrawer(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !drawer.hidden) closeDrawer(); });
    document.body.appendChild(drawer);
  }
  function showDrawer(content) {
    lastFocus = document.activeElement;
    sheetEl.innerHTML = ''; sheetEl.appendChild(content);
    drawer.hidden = false; document.body.style.overflow = 'hidden';
    var f = sheetEl.querySelector('.body input:not([disabled]), .body select:not([disabled]), .body textarea:not([disabled]), .x');
    if (f) f.focus();
  }
  function closeDrawer() {
    drawer.hidden = true; document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  OF.openItem = function (id) {
    var it = S.items.filter(function (x) { return x.id === id; })[0];
    if (!it) { OF.toast('Item ' + id + ' is not in the register.', true); return; }
    showDrawer(editor(it, false));
  };
  OF.openNew = function () {
    showDrawer(editor({
      id: '', period: 'Week ' + isoWeek(S.today), facility_id: '', priority: 'High', issue: '', action: '', owner_id: '', due: '',
      response_status: 'No response received', response_summary: '', evidence: '', resolution: '', status: 'open', ceo_flag: 'no',
      ceo_decision: '', notes: '', closure_evidence: '', closed_source: '', updated_at: ''
    }, true));
  };

  function editor(it, isNew) {
    var ro = !OF.canEdit();
    var F = {};
    function inp(key, type, extra) {
      var e = h('input', Object.assign({ type: type || 'text', value: it[key] == null ? '' : it[key], disabled: ro, id: 'f-' + key }, extra || {}));
      F[key] = e; return e;
    }
    function sel(key, opts, extra) {
      var e = h('select', Object.assign({ disabled: ro, id: 'f-' + key }, extra || {}), opts.map(function (o) { return h('option', { value: o[0] }, o[1]); }));
      e.value = it[key] == null ? '' : String(it[key]); F[key] = e; return e;
    }
    function ta(key, rows, ph) {
      var e = h('textarea', { disabled: ro, rows: String(rows || 3), placeholder: ph || '', id: 'f-' + key });
      e.value = it[key] || ''; F[key] = e; return e;
    }
    function fld(key, ctl, hint) { return h('div', { class: 'field' }, h('label', { for: 'f-' + key }, LABELS[key]), ctl, hint ? h('span', { class: 'fh' }, hint) : null); }

    var facOpts = [['', 'Choose a facility']].concat(S.facilities.filter(function (f) { return f.active || String(f.id) === String(it.facility_id); })
      .map(function (f) { return [String(f.id), f.name]; }));
    var ownOpts = [['', 'Choose an owner']].concat(S.owners.filter(function (o) { return o.active || String(o.id) === String(it.owner_id); })
      .map(function (o) { return [String(o.id), o.name + (o.active ? '' : ' (inactive)')]; }));
    var err = h('div', { class: 'err', role: 'alert' });

    // Owner: job title, plus who that title goes to. Editors can set the
    // person here; a new title can be added on the spot.
    var ownerSel, goesBox, personIn, newTitleIn, personWrap, newWrap, changeMode = false;
    function ownerField() {
      ownerSel = sel('owner_id', ro ? ownOpts : ownOpts.concat([['__new', '+ New owner title...']]));
      goesBox = h('div', { class: 'goes' });
      personIn = h('input', { list: 'dl-people', placeholder: 'Start typing a name or username', 'aria-label': 'Person who holds this role', disabled: ro });
      newTitleIn = h('input', { placeholder: 'Job title, for example Head of Quality Control, Agbara', 'aria-label': 'New owner title', disabled: ro });
      personWrap = h('div', { class: 'goes-in', hidden: true }, h('label', null, 'Who holds this role?'), personIn,
        h('span', { class: 'fh' }, 'They get the item on their My Actions page. You only do this once per role.'));
      newWrap = h('div', { class: 'goes-in', hidden: true }, h('label', null, 'New owner title'), newTitleIn);
      ownerSel.addEventListener('change', function () { changeMode = false; drawGoes(); });
      drawGoes();
      if (!ro) OF.people().then(function (list) {
        if (sheetEl.querySelector('#dl-people')) return;
        sheetEl.appendChild(h('datalist', { id: 'dl-people' }, list.map(function (x) {
          return h('option', { value: x.full_name ? x.full_name + ' (' + x.username + ')' : x.username }, x.department || '');
        })));
      }).catch(function () {});
      return h('div', { class: 'field' }, h('label', { for: 'f-owner_id' }, LABELS.owner_id), ownerSel, goesBox, newWrap, personWrap);
    }
    function drawGoes() {
      var v = ownerSel.value, isNewTitle = v === '__new';
      var who = (!v || isNewTitle) ? '' : OF.goesTo(v);
      goesBox.innerHTML = '';
      newWrap.hidden = !isNewTitle;
      personWrap.hidden = ro || !(isNewTitle || (v && !who) || changeMode);
      if (!v) return;
      if (isNewTitle) return;
      if (who) {
        goesBox.appendChild(h('span', null, 'Goes to: ', h('b', null, who)));
        if (!ro && !changeMode) goesBox.appendChild(h('button', { type: 'button', class: 'linkbtn', onclick: function () { changeMode = true; drawGoes(); personIn.focus(); } }, 'Change person'));
      } else {
        goesBox.appendChild(h('span', { class: 'warn' }, 'No one is linked to this role yet, so nobody will see it on My Actions.'));
      }
    }
    // Runs before the item is saved: creates a new title and/or links a person.
    function settleOwner() {
      var v = ownerSel.value, user = OF.usernameFrom(personIn.value);
      if (ro) return Promise.resolve({ ownerId: v, note: '' });
      if (v === '__new') {
        if (!newTitleIn.value.trim()) return Promise.reject(new Error('Enter the new owner title.'));
        return OF.rpc('ops_fu_add_owner', { p_name: newTitleIn.value.trim(), p_username: user }).then(function (o) {
          S.owners.push(o);
          return OF.refreshOwnerPeople().then(function () {
            return { ownerId: String(o.id), note: user ? '' : ' Nobody is linked to the new owner yet.' };
          });
        });
      }
      if (!personWrap.hidden && user) {
        return OF.rpc('ops_fu_set_owner_person', { p_owner_id: Number(v), p_username: user }).then(function (m) {
          return OF.refreshOwnerPeople().then(function () { return { ownerId: v, note: '', linked: m }; });
        });
      }
      return Promise.resolve({ ownerId: v, note: v && !OF.goesTo(v) ? ' Nobody is linked to this owner yet, so no one will see it on My Actions.' : '' });
    }

    var sub = isNew ? 'The ID is assigned when the item is created.'
      : it.facility + ', ' + it.period + ', updated ' + (it.updated_at ? fmtStamp(it.updated_at) : '-') + (it.updated_by ? ' by ' + it.updated_by : '');
    var head = h('div', { class: 'sh' },
      h('div', null, h('h2', { id: 'dtitle' }, isNew ? 'New follow-up item' : it.id + ': ' + (STATUS[it.status] || '')), h('div', { class: 's' }, sub)),
      h('button', { class: 'x', type: 'button', onclick: closeDrawer }, 'Close'));

    var body = h('div', { class: 'body' },
      h('div', { class: 'group' }, h('h3', null, 'The issue'),
        h('div', { class: 'form-row' },
          fld('facility_id', sel('facility_id', facOpts, { disabled: ro || !isNew })),
          fld('period', inp('period', 'text', { disabled: ro || !isNew, placeholder: 'Week 42' }))),
        fld('issue', ta('issue', 3)),
        fld('action', ta('action', 3))),
      h('div', { class: 'group' }, h('h3', null, 'Ownership and status'),
        h('div', { class: 'form-row' },
          ownerField(),
          fld('due', inp('due', 'date')),
          fld('priority', sel('priority', PRIORITIES.map(function (p) { return [p, p]; }))),
          fld('status', sel('status', Object.keys(STATUS).map(function (k) { return [k, STATUS[k]]; }))),
          fld('ceo_flag', sel('ceo_flag', Object.keys(CEO).map(function (k) { return [k, CEO[k]]; }))),
          fld('response_status', sel('response_status', RESPONSES.map(function (r) { return [r, r]; }))))),
      h('div', { class: 'group' }, h('h3', null, 'Response, evidence and direction'),
        fld('response_summary', ta('response_summary', 3, 'What the owner reported, with figures')),
        fld('evidence', ta('evidence', 3, 'Your assessment: resolved, partial, worsened or unverified, and why')),
        fld('resolution', ta('resolution', 3, 'What the owner must do next, by when')),
        fld('notes', ta('notes', 3, 'Calls, site visits, reminders sent'))),
      h('div', { class: 'group' }, h('h3', null, 'Closure'),
        fld('closure_evidence', ta('closure_evidence', 3, 'The verifiable evidence that the issue is resolved')),
        fld('closed_source', inp('closed_source', 'text', { placeholder: 'Report, week and date the evidence comes from' }),
          'Both closure fields are required before an item can be marked Verified closed.')),
      it.ceo_decision ? h('div', { class: 'group' }, h('h3', null, 'CEO decision'), h('div', { class: 'decision', style: 'margin-bottom:12px' }, it.ceo_decision)) : null,
      isNew ? null : h('div', { class: 'group' }, h('h3', null, 'Owner responses'), h('div', { id: 'resp' }, h('p', { class: 'muted' }, 'Loading responses.'))),
      isNew ? null : h('div', { class: 'group' }, h('h3', null, 'Change history'), h('ul', { class: 'hist', id: 'hist' }, h('li', null, 'Loading history.'))));

    function collect() { var p = {}; Object.keys(F).forEach(function (k) { p[k] = F[k].value.trim(); }); return p; }
    function validate(p) {
      if (isNew) {
        var miss = ['facility_id', 'period', 'issue', 'action', 'owner_id', 'due'].filter(function (k) { return !p[k]; });
        if (miss.length) return 'Complete: ' + miss.map(function (k) { return LABELS[k].toLowerCase(); }).join(', ') + '.';
        if (!/^Week \d{1,2}$/.test(p.period)) return 'Write the review period as "Week 42".';
      }
      if (p.status === 'verified_closed' && (!p.closure_evidence || !p.closed_source)) return 'Add closure evidence and its source before marking the item Verified closed.';
      return '';
    }
    function save(extra) {
      err.textContent = '';
      var p = Object.assign(collect(), extra || {});
      if (p.owner_id === '__new') p.owner_id = 'new';
      var v = validate(p);
      if (v) { err.textContent = v; if (p.status === 'verified_closed' && F.closure_evidence) F.closure_evidence.focus(); return; }
      saveBtn.disabled = true;
      var note = '', linked = '';
      settleOwner().then(function (o) {
        note = o.note || ''; linked = o.linked || '';
        p.owner_id = o.ownerId;
        if (!isNew) {
          var patch = {};
          Object.keys(p).forEach(function (k) { if (String(it[k] == null ? '' : it[k]) !== p[k]) patch[k] = p[k]; });
          p = patch;
          if (!Object.keys(p).length) return { item: null, changed: [] };
        }
        return isNew ? OF.rpc('ops_fu_add_item', { p_item: p })
          : OF.rpc('ops_fu_save_item', { p_id: it.id, p_patch: p, p_expected_updated: it.updated_at || null });
      }).then(function (r) {
        if (r.item) OF.replaceItem(r.item);
        var msg = isNew ? 'Created ' + r.item.id + '.'
          : r.item ? 'Saved ' + r.item.id + ' (' + plural((r.changed || []).length, 'change') + ').'
          : linked ? linked : 'No changes to save.';
        if (isNew && linked) msg += ' ' + linked;
        OF.toast(msg + note);
        closeDrawer(); OF.render();
      }).catch(function (e) { saveBtn.disabled = false; OF.handleErr(e, err); });
    }
    var saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: function () { save(); } }, isNew ? 'Create item' : 'Save changes');
    var foot = h('div', { class: 'foot' }, err,
      h('button', { class: 'btn', type: 'button', onclick: closeDrawer }, ro ? 'Close' : 'Cancel'),
      (!ro && !isNew && it.status !== 'verified_closed') ? h('button', { class: 'btn ok', type: 'button', onclick: function () { F.status.value = 'verified_closed'; save(); } }, 'Mark verified closed') : null,
      ro ? null : saveBtn);

    if (!isNew) { loadHistory(it.id); loadResponses(it.id); }
    return h('div', { style: 'display:contents' }, head, body, foot);
  }

  function loadResponses(id) {
    OF.rpc('ops_fu_item_responses', { p_item: id }).then(function (list) {
      var box = sheetEl.querySelector('#resp'); if (!box) return;
      box.innerHTML = '';
      if (!list.length) { box.appendChild(h('p', { class: 'muted', style: 'margin:0 0 12px' }, 'The owner has not responded in the app yet.')); return; }
      list.forEach(function (r) {
        box.appendChild(OF.responseEl(r, { review: true, onDone: function (x) {
          if (x && x.item) OF.replaceItem(x.item);
          S.pending[id] = Math.max(0, (S.pending[id] || 1) - 1);
          OF.render(); OF.openItem(id);
        } }));
      });
    }).catch(function (e) {
      var box = sheetEl.querySelector('#resp'); if (box) box.innerHTML = '<p class="muted">Responses could not be loaded.</p>';
    });
  }

  function loadHistory(id) {
    sb.from('ops_followup_audit').select('at, actor, field, old_value, new_value, note')
      .eq('item_id', id).order('at', { ascending: false }).order('id', { ascending: false }).limit(60)
      .then(function (r) {
        var ul = sheetEl.querySelector('#hist'); if (!ul) return;
        ul.innerHTML = '';
        if (r.error) { ul.appendChild(h('li', null, 'History could not be loaded. ' + errMsg(r.error))); return; }
        if (!r.data.length) { ul.appendChild(h('li', null, 'No changes recorded yet.')); return; }
        var short = function (s) { s = s || 'blank'; return s.length > 140 ? s.slice(0, 140) + '...' : s; };
        var show = function (field, v) {
          if (field === 'status') return STATUS[v] || v;
          if (field === 'ceo_flag') return CEO[v] || v;
          if (field === 'due' || field === 'ceo_decision_date') return fmt(v) || v;
          return v;
        };
        r.data.forEach(function (x) {
          var text = x.field === 'owner_response' ? 'Owner response: "' + short(x.new_value) + '"'
            : x.field === 'created' ? 'Item created'
            : x.field === 'deleted' ? 'Item deleted'
            : (LABELS[x.field] || x.field) + ' changed from "' + short(show(x.field, x.old_value)) + '" to "' + short(show(x.field, x.new_value)) + '"';
          ul.appendChild(h('li', null, text, h('small', null, fmtStamp(x.at) + ', ' + (x.actor || 'unknown') + (x.note ? '. ' + x.note : ''))));
        });
      });
  }

  /* ---------- memo builder (port of buildMemo_) ---------- */
  OF.buildMemo = function (owner) {
    var today = S.today;
    var respondBy = addWorkingDays(today, Number(S.settings.memoResponseDays) || 3);
    var pool = S.items.filter(function (i) { return outstanding(i) && (!owner || i.owner === owner); }).sort(byAttention);
    var L = [];
    L.push('RUMBU INDUSTRIES GROUP'); L.push('Group Operations Office'); L.push('');
    L.push('To: ' + (owner || 'All plant and functional heads'));
    L.push('Date: ' + fmt(today));
    L.push('Subject: Outstanding operations follow-up actions'); L.push('');
    if (!pool.length) {
      L.push('There are no outstanding follow-up items' + (owner ? ' for ' + owner : '') + ' as at ' + fmt(today) + '.');
    } else {
      L.push('The ' + pool.length + ' item(s) below remain outstanding on the operations follow-up register as at ' + fmt(today) + '.');
      L.push('Provide a written response for each item by ' + fmt(respondBy) + '. Each response must state the action taken, the evidence attached, the responsible person and a dated completion target.');
      L.push('Items cannot be closed without verifiable closure evidence and its source.');
      L.push('Respond in the Rumbu app under Operations Follow-up > My Actions, and attach photographs or documents as evidence.');
      var groups = owner ? [[owner, pool]] : groupBy(pool, function (i) { return i.owner; });
      groups.forEach(function (g) {
        if (!owner) { L.push(''); L.push('OWNER: ' + g[0]); }
        var late = g[1].filter(isLate), rest = g[1].filter(function (i) { return !isLate(i); });
        if (late.length) { L.push(''); L.push('Overdue (' + late.length + ')'); late.forEach(function (i, n) { memoItem(L, i, n + 1); }); }
        if (rest.length) { L.push(''); L.push('Open and in progress (' + rest.length + ')'); rest.forEach(function (i, n) { memoItem(L, i, n + 1); }); }
      });
      L.push(''); L.push('Items marked "CEO escalation" are on the CEO review list. Treat them as first priority.');
    }
    L.push(''); L.push('Group Operations Office'); L.push('Rumbu Industries Group. Confidential, internal use only.');
    return {
      count: pool.length,
      subject: 'Operations follow-up: ' + pool.length + ' outstanding item(s)' + (owner ? ' for ' + owner : '') + ', ' + fmt(today),
      text: L.join('\n')
    };
  };
  function memoItem(L, i, n) {
    L.push(n + '. [' + i.id + '] ' + i.priority + ', ' + i.facility + ', ' + i.period + (i.ceo_flag !== 'no' ? ', CEO escalation' : ''));
    L.push('   Issue: ' + i.issue);
    L.push('   Required action: ' + i.action);
    L.push('   Due: ' + (i.due ? fmt(i.due) + ' (' + lateText(i).toLowerCase() + ')' : 'not set'));
    L.push('   Response on file: ' + (i.response_status || 'None'));
    if (i.resolution) L.push('   Direction: ' + i.resolution);
    if (i.ceo_decision) L.push('   CEO decision: ' + i.ceo_decision);
  }

  /* ---------- CEO digest builder (port of buildCeoDigest_) ---------- */
  OF.buildDigest = function () {
    var today = S.today, items = S.items;
    var since = addDays(today, -7);
    return sb.from('ops_followup_audit').select('item_id, at')
      .eq('field', 'status').eq('new_value', 'verified_closed').gte('at', since + 'T00:00:00+01:00')
      .then(function (r) {
        if (r.error) throw r.error;
        var closedWeek = uniq((r.data || []).map(function (x) { return x.item_id; }));
        var out = items.filter(outstanding), late = out.filter(isLate);
        var pending = out.filter(ceoPending).sort(byAttention);
        var emcrit = late.filter(function (i) { return pr(i.priority) <= 1; }).sort(byAttention);
        var closed = items.length - out.length;
        var L = [];
        L.push('RUMBU INDUSTRIES GROUP'); L.push('Weekly CEO digest: operations follow-up'); L.push('As at ' + fmt(today)); L.push('');
        L.push('Register: ' + items.length + ' items. Outstanding ' + out.length + '. Overdue ' + late.length + '. Verified closed ' + closed +
          ' (' + (items.length ? Math.round(closed / items.length * 100) : 0) + '%). Closed in the last 7 days: ' + closedWeek.length + '.');
        L.push(''); L.push('1. Awaiting your decision (' + pending.length + ')');
        if (!pending.length) L.push('   None.');
        pending.forEach(function (i) {
          L.push('   [' + i.id + '] ' + i.priority + ', ' + i.facility + ': ' + i.issue);
          if (i.resolution) L.push('      Recommended direction: ' + i.resolution);
        });
        L.push(''); L.push('2. Emergency and critical items past due (' + emcrit.length + ')');
        if (!emcrit.length) L.push('   None.');
        emcrit.slice(0, 20).forEach(function (i) { L.push('   [' + i.id + '] ' + i.priority + ', ' + lateText(i).toLowerCase() + ', ' + i.owner + ': ' + i.issue); });
        if (emcrit.length > 20) L.push('   Plus ' + (emcrit.length - 20) + ' more in the app.');
        L.push(''); L.push('3. Owners with the most overdue items');
        groupBy(late, function (i) { return i.owner; }).sort(function (a, b) { return b[1].length - a[1].length; }).slice(0, 8)
          .forEach(function (g) { L.push('   ' + g[0] + ': ' + g[1].length); });
        L.push(''); L.push('4. Verified closed in the last 7 days (' + closedWeek.length + ')');
        if (!closedWeek.length) L.push('   None.');
        closedWeek.forEach(function (id) { L.push('   ' + id); });
        L.push(''); L.push('Open the follow-up register in the Rumbu production app: Operations Follow-up > CEO Desk.');
        L.push('Group Operations Office. Confidential, internal use only.');
        return { subject: 'CEO digest: ' + pending.length + ' decision(s) pending, ' + late.length + ' overdue, ' + fmt(today), text: L.join('\n') };
      });
  };

  OF.copyText = function (ta) {
    ta.select();
    (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject())
      .then(function () { OF.toast('Copied.'); })
      .catch(function () {
        try { document.execCommand('copy'); OF.toast('Copied.'); } catch (e) { OF.toast('Select the text and copy it manually.', true); }
      });
  };
})();
