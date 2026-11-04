// RumbuApp: Password Requests, shared by the HR Console and Manage Accounts.
// Lists "Forgot password?" requests from the login page and lets HR Console accounts (ordinary staff)
// and the Head of IT (anyone) approve or decline them. Approving goes through the swift-handler edge
// function, which sets the temporary password and forces a new one at the next sign-in.
//
// Usage: RumbuResetRequests.mount(document.getElementById("someDiv"), { me: ME, onCount: n => {...} });
// Needs the page to have loaded auth.js (sb, SUPABASE_URL, SUPABASE_ANON_KEY).
(function () {
  "use strict";
  var TEMP = "12345678";
  var esc = function (t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  var CSS = "" +
    ".rr-wrap{font-family:var(--sans,Inter,'Segoe UI',Arial,sans-serif);}" +
    ".rr-note{font-size:13px;color:var(--muted);line-height:1.6;margin:0 0 14px;}" +
    ".rr-note b{color:var(--heading);}" +
    ".rr-empty{border:1px dashed var(--line-2,var(--line));border-radius:12px;padding:26px 16px;text-align:center;color:var(--muted);font-size:13.5px;}" +
    ".rr-list{display:flex;flex-direction:column;gap:10px;}" +
    ".rr-item{display:flex;flex-wrap:wrap;align-items:center;gap:12px;border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--card);}" +
    ".rr-item .who{flex:1 1 260px;min-width:0;}" +
    ".rr-item .who b{display:block;color:var(--heading);font-size:14px;}" +
    ".rr-item .who small{display:block;color:var(--muted);font-size:12px;margin-top:2px;}" +
    ".rr-item .when{font-size:12px;color:var(--muted);white-space:nowrap;}" +
    ".rr-item .acts{display:flex;gap:6px;}" +
    ".rr-btn{width:auto;margin:0;min-height:34px;padding:5px 12px;border-radius:9px;border:1px solid var(--line-2,var(--line));background:var(--card);color:var(--heading);font:700 12.5px var(--sans,Arial);cursor:pointer;}" +
    ".rr-btn.ok{background:var(--heading);border-color:var(--heading);color:var(--card);}" +
    ".rr-btn.bad{color:var(--bad,#c0392b);}" +
    ".rr-btn[disabled]{opacity:.45;cursor:not-allowed;}" +
    ".rr-pill{display:inline-block;padding:2px 9px;border-radius:10px;font-size:11.5px;font-weight:700;}" +
    ".rr-pill.p{background:color-mix(in srgb,var(--warn,#b45309) 14%,transparent);color:var(--warn,#b45309);}" +
    ".rr-pill.a{background:color-mix(in srgb,var(--ok,#1d8a4e) 14%,transparent);color:var(--ok,#1d8a4e);}" +
    ".rr-pill.r{background:color-mix(in srgb,var(--bad,#c0392b) 12%,transparent);color:var(--bad,#c0392b);}" +
    ".rr-h{margin:22px 0 10px;font-size:12px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);}" +
    ".rr-msg{margin:0 0 12px;padding:10px 12px;border-radius:10px;font-size:13px;}" +
    ".rr-msg.ok{background:color-mix(in srgb,var(--ok,#1d8a4e) 12%,transparent);color:var(--ok,#1d8a4e);}" +
    ".rr-msg.err{background:color-mix(in srgb,var(--bad,#c0392b) 10%,transparent);color:var(--bad,#c0392b);}";

  function ago(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  async function callEdge(body) {
    var sess = await sb.auth.getSession();
    var token = sess && sess.data && sess.data.session ? sess.data.session.access_token : "";
    var res = await fetch(SUPABASE_URL + "/functions/v1/swift-handler", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token, "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify(body)
    });
    var out = {}; try { out = await res.json(); } catch (e) {}
    if (!res.ok || out.error) throw new Error(out.error || ("The server answered " + res.status));
    return out;
  }

  function mount(el, opts) {
    opts = opts || {};
    var me = opts.me || {};
    var canAll = !!me.isHeadOfIt;
    if (!document.getElementById("rr-style")) {
      var st = document.createElement("style"); st.id = "rr-style"; st.textContent = CSS; document.head.appendChild(st);
    }
    var state = { rows: [], people: {}, msg: null };

    async function load() {
      el.innerHTML = '<div class="rr-wrap"><p class="rr-note">Loading…</p></div>';
      var since = new Date(Date.now() - 14 * 864e5).toISOString();
      var q = await sb.from("password_reset_requests")
        .select("id, profile_id, login, contact, status, requested_at, handled_at, note, handled_by")
        .or("status.eq.pending,requested_at.gte." + since)
        .order("requested_at", { ascending: false }).limit(200);
      if (q.error) {
        el.innerHTML = '<div class="rr-wrap"><div class="rr-msg err">Could not load the requests: ' + esc(q.error.message) +
          '. If this is new, ask IT to run devdesk_and_password_requests.sql.</div></div>';
        return;
      }
      state.rows = q.data || [];
      var ids = Array.from(new Set(state.rows.map(function (r) { return r.profile_id; }).concat(state.rows.map(function (r) { return r.handled_by; })).filter(Boolean)));
      state.people = {};
      if (ids.length) {
        var pr = await sb.from("profiles").select("id, username, role").in("id", ids);
        (pr.data || []).forEach(function (p) { state.people[p.id] = { username: p.username, role: p.role }; });
        var em = await sb.from("employees").select("linked_profile_id, full_name, branch, department").in("linked_profile_id", ids);
        (em.data || []).forEach(function (e) { var p = state.people[e.linked_profile_id] || (state.people[e.linked_profile_id] = {}); p.name = e.full_name; p.branch = e.branch; p.dept = e.department; });
      }
      render();
    }

    function canHandle(r) {
      var p = state.people[r.profile_id] || {};
      if (canAll) return true;
      return p.role !== "super_admin" && p.role !== "hr_console";
    }

    function render() {
      var pending = state.rows.filter(function (r) { return r.status === "pending"; });
      var done = state.rows.filter(function (r) { return r.status !== "pending"; }).slice(0, 30);
      if (opts.onCount) try { opts.onCount(pending.filter(canHandle).length); } catch (e) {}
      var line = function (r, open) {
        var p = state.people[r.profile_id] || {};
        var name = p.name || p.username || r.login;
        var sub = [p.username ? "Login " + p.username : null, p.branch, p.dept, r.contact ? "Reach on: " + r.contact : null].filter(Boolean).map(esc).join(" · ");
        var pill = r.status === "pending" ? '<span class="rr-pill p">Waiting</span>' : r.status === "approved" ? '<span class="rr-pill a">Reset</span>' : '<span class="rr-pill r">Declined</span>';
        var by = !open && r.handled_by ? (state.people[r.handled_by] || {}).name || (state.people[r.handled_by] || {}).username || "" : "";
        var acts = "";
        if (open) {
          acts = canHandle(r)
            ? '<div class="acts"><button class="rr-btn ok" data-ro="allow" data-act="approve" data-id="' + r.id + '">Approve reset</button>' +
              '<button class="rr-btn bad" data-ro="allow" data-act="reject" data-id="' + r.id + '">Decline</button></div>'
            : '<div class="acts"><button class="rr-btn" data-ro="allow" disabled title="Requests from Super Admin and HR Console accounts are handled by the Head of IT">Head of IT handles this</button></div>';
        }
        return '<div class="rr-item"><div class="who"><b>' + esc(name) + "</b><small>" + sub + "</small>" +
          (!open && (by || r.note) ? "<small>" + (by ? "By " + esc(by) : "") + (r.note ? (by ? " · " : "") + esc(r.note) : "") + "</small>" : "") +
          "</div>" + pill + '<span class="when" title="' + esc(new Date(r.requested_at).toLocaleString("en-GB")) + '">' + esc(ago(r.requested_at)) + "</span>" + acts + "</div>";
      };
      el.innerHTML = '<div class="rr-wrap">' +
        (state.msg ? '<div class="rr-msg ' + state.msg.cls + '">' + esc(state.msg.text) + "</div>" : "") +
        '<p class="rr-note">People who press <b>Forgot password?</b> on the login page appear here. ' +
        "<b>Before approving, confirm it is really them</b>, by phone or in person: approving sets their password to the temporary password <b>" + TEMP +
        "</b>, and they must choose a new one when they sign in." + (canAll ? "" : " Requests from Super Admin and HR Console accounts go to the Head of IT.") + "</p>" +
        (pending.length ? '<div class="rr-list">' + pending.map(function (r) { return line(r, true); }).join("") + "</div>"
                        : '<div class="rr-empty">No requests waiting.</div>') +
        (done.length ? '<div class="rr-h">Handled in the last 14 days</div><div class="rr-list">' + done.map(function (r) { return line(r, false); }).join("") + "</div>" : "") +
        "</div>";
      el.querySelectorAll("button[data-act]").forEach(function (b) {
        b.addEventListener("click", function () { act(b.getAttribute("data-act"), Number(b.getAttribute("data-id")), b); });
      });
    }

    async function act(kind, id, btn) {
      var r = state.rows.find(function (x) { return x.id === id; }); if (!r) return;
      var p = state.people[r.profile_id] || {}; var name = p.name || p.username || r.login;
      var note = null;
      if (kind === "approve") {
        if (!confirm("Reset the password for " + name + "?\n\nHave you confirmed this request really came from them (phone call or in person)?\n\nTheir password becomes " + TEMP + " and they must set a new one when they sign in.")) return;
      } else {
        note = prompt("Decline the request from " + name + "? You can add a short reason (optional):", "");
        if (note === null) return;
      }
      btn.disabled = true; btn.textContent = kind === "approve" ? "Resetting…" : "Declining…";
      try {
        var out = await callEdge({ action: kind === "approve" ? "approve_reset_request" : "reject_reset_request", request_id: id, note: note });
        state.msg = { cls: "ok", text: out.message || "Done." };
      } catch (e) {
        state.msg = { cls: "err", text: e.message };
      }
      await load();
    }

    load();
    return { reload: load };
  }

  window.RumbuResetRequests = { mount: mount };
})();
