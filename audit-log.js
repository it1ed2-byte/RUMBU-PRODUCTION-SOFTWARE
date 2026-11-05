// RumbuApp: System Audit Log viewer (Manage Accounts › System Audit Log).
// Reads public.audit_log, which the database fills for every account: sign-ins (and failed attempts),
// sign-outs, screens opened, and every row added, changed or deleted. Entries cannot be edited or deleted.
// Only the Head of IT and Super Admins with full access can read it (database rule).
//
// Usage: RumbuAuditLog.mount(document.getElementById("someDiv"));   needs auth.js (sb)
(function () {
  "use strict";
  var PAGE = 100;
  var esc = function (t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  var KINDS = { sign_in: "Signed in", sign_in_failed: "Failed sign-in", sign_out: "Signed out", page: "Opened a screen", change: "Changed data" };
  var OPS = { INSERT: "Added", UPDATE: "Changed", DELETE: "Deleted" };
  var CSS = "" +
    ".al-wrap{font-family:var(--sans,Inter,'Segoe UI',Arial,sans-serif);}" +
    ".al-note{font-size:13px;color:var(--muted);line-height:1.6;margin:0 0 14px;}" +
    ".al-tools{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-bottom:10px;}" +
    ".al-tools label{display:block;font-size:11.5px;font-weight:700;color:var(--text);margin:0 0 4px;}" +
    ".al-tools input,.al-tools select{width:100%;min-height:38px;padding:7px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);font-size:13px;}" +
    ".al-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:4px 0 12px;}" +
    ".al-bar .sp{flex:1;}" +
    ".al-btn{width:auto;margin:0;min-height:36px;padding:6px 14px;border-radius:10px;border:1px solid var(--line-2,var(--line));background:var(--card);color:var(--heading);font:700 12.5px var(--sans,Arial);cursor:pointer;}" +
    ".al-btn.pri{background:var(--heading);border-color:var(--heading);color:var(--card);}" +
    ".al-btn.q{min-height:30px;padding:4px 11px;border-radius:16px;font-size:12px;}" +
    ".al-btn[disabled]{opacity:.5;cursor:not-allowed;}" +
    ".al-count{font-size:13px;color:var(--muted);}" +
    ".al-tw{border:1px solid var(--line);border-radius:12px;overflow:auto;background:var(--card);}" +
    ".al-t{width:100%;border-collapse:collapse;font-size:13px;}" +
    ".al-t th{background:var(--bg);color:var(--muted);font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);white-space:nowrap;}" +
    ".al-t td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top;}" +
    ".al-t tr.r{cursor:pointer;}" +
    ".al-t tr.r:hover td{background:var(--bg);}" +
    ".al-t .w{white-space:nowrap;font-variant-numeric:tabular-nums;}" +
    ".al-t .s{display:block;font-size:11.5px;color:var(--muted);margin-top:2px;}" +
    ".al-k{display:inline-block;padding:2px 8px;border-radius:9px;font-size:11px;font-weight:700;margin-right:6px;}" +
    ".al-k.sign_in{background:color-mix(in srgb,var(--ok,#1d8a4e) 14%,transparent);color:var(--ok,#1d8a4e);}" +
    ".al-k.sign_in_failed{background:color-mix(in srgb,var(--bad,#c0392b) 13%,transparent);color:var(--bad,#c0392b);}" +
    ".al-k.sign_out{background:color-mix(in srgb,var(--muted) 15%,transparent);color:var(--muted);}" +
    ".al-k.page{background:color-mix(in srgb,var(--accent,#2E75B6) 13%,transparent);color:var(--accent,#2E75B6);}" +
    ".al-k.change{background:color-mix(in srgb,var(--warn,#b45309) 15%,transparent);color:var(--warn,#b45309);}" +
    ".al-det td{background:var(--bg);}" +
    ".al-dt{width:100%;border-collapse:collapse;font-size:12.5px;}" +
    ".al-dt td{padding:5px 8px;border-bottom:1px solid var(--line);vertical-align:top;word-break:break-word;}" +
    ".al-dt td:first-child{font-weight:700;color:var(--heading);white-space:nowrap;width:1%;}" +
    ".al-old{color:var(--bad,#c0392b);text-decoration:line-through;}" +
    ".al-new{color:var(--ok,#1d8a4e);}" +
    ".al-empty{padding:28px 16px;text-align:center;color:var(--muted);}" +
    ".al-err{margin:0 0 12px;padding:10px 12px;border-radius:10px;font-size:13px;background:color-mix(in srgb,var(--bad,#c0392b) 10%,transparent);color:var(--bad,#c0392b);}";

  function ymd(d) { var z = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); }
  function when(iso) { return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  function device(ua) {
    if (!ua) return "";
    var os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
    var br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
    return [br, os].filter(Boolean).join(" on ") || ua.slice(0, 40);
  }
  function show(v) {
    if (v === null || v === undefined) return '<span style="color:var(--muted)">empty</span>';
    if (typeof v === "object") return esc(JSON.stringify(v));
    return esc(v);
  }

  function mount(el) {
    if (!document.getElementById("al-style")) { var st = document.createElement("style"); st.id = "al-style"; st.textContent = CSS; document.head.appendChild(st); }
    var today = new Date(), week = new Date(Date.now() - 6 * 864e5);
    el.innerHTML = '<div class="al-wrap">' +
      '<p class="al-note">Everything every account does in RumbuApp: sign-ins (and failed attempts), sign-outs, screens opened, and every record added, changed or deleted, with the old and new values. The database records it on its own, and no one can edit or delete an entry. Click a row for the full detail.</p>' +
      '<div class="al-tools">' +
        '<div><label for="al_from">From</label><input type="date" id="al_from" value="' + ymd(week) + '"></div>' +
        '<div><label for="al_to">To</label><input type="date" id="al_to" value="' + ymd(today) + '"></div>' +
        '<div><label for="al_kind_filter">What</label><select id="al_kind_filter"><option value="">Everything</option>' +
          Object.keys(KINDS).map(function (k) { return '<option value="' + k + '">' + KINDS[k] + "</option>"; }).join("") + "</select></div>" +
        '<div><label for="al_who_search">Who (login)</label><input type="search" id="al_who_search" placeholder="e.g. RB311"></div>' +
        '<div><label for="al_table_search">Table</label><input type="search" id="al_table_search" placeholder="e.g. employees"></div>' +
        '<div><label for="al_text_search">Screen or IP</label><input type="search" id="al_text_search" placeholder="e.g. gatepass, 102.89"></div>' +
      "</div>" +
      '<div class="al-bar">' +
        '<button class="al-btn q" data-q="0">Today</button><button class="al-btn q" data-q="6">Last 7 days</button><button class="al-btn q" data-q="29">Last 30 days</button>' +
        '<span class="sp"></span><span class="al-count" id="al_count"></span>' +
        '<button class="al-btn pri" id="al_go">Show</button><button class="al-btn" id="al_csv">Download CSV</button>' +
      "</div>" +
      '<div id="al_err"></div>' +
      '<div class="al-tw"><table class="al-t"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Where from</th></tr></thead><tbody id="al_rows"><tr><td colspan="4" class="al-empty">Loading…</td></tr></tbody></table></div>' +
      '<div class="al-bar" style="justify-content:center;margin-top:12px"><button class="al-btn" id="al_more" hidden>Show more</button></div>' +
      "</div>";
    var $ = function (id) { return el.querySelector("#" + id); };
    var rows = [], names = {}, total = 0, open = {};

    function query(sel, opts) {
      var q = sb.from("audit_log").select(sel, opts || {});
      var f = $("al_from").value, t = $("al_to").value;
      if (f) q = q.gte("at", new Date(f + "T00:00:00").toISOString());
      if (t) q = q.lt("at", new Date(new Date(t + "T00:00:00").getTime() + 864e5).toISOString());
      var k = $("al_kind_filter").value; if (k) q = q.eq("kind", k);
      var who = $("al_who_search").value.trim(); if (who) q = q.ilike("actor_login", "%" + who + "%");
      var tb = $("al_table_search").value.trim(); if (tb) q = q.ilike("table_name", "%" + tb + "%");
      var tx = $("al_text_search").value.trim().replace(/[,()]/g, " ");
      if (tx) q = q.or("page.ilike.%" + tx + "%,ip.ilike.%" + tx + "%,table_name.ilike.%" + tx + "%");
      return q.order("at", { ascending: false });
    }

    async function names_for(list) {
      var ids = Array.from(new Set(list.map(function (r) { return r.actor; }).filter(function (id) { return id && !(id in names); })));
      if (!ids.length) return;
      ids.forEach(function (id) { names[id] = ""; });
      var e = await sb.from("employees").select("linked_profile_id, full_name").in("linked_profile_id", ids);
      (e.data || []).forEach(function (x) { if (x.full_name) names[x.linked_profile_id] = x.full_name; });
    }

    async function load(more) {
      $("al_err").innerHTML = "";
      if (!more) { rows = []; open = {}; $("al_rows").innerHTML = '<tr><td colspan="4" class="al-empty">Loading…</td></tr>'; }
      var from = rows.length;
      var r = await query("*", more ? {} : { count: "exact" }).range(from, from + PAGE - 1);
      if (r.error) {
        $("al_err").innerHTML = '<div class="al-err">Could not read the audit log: ' + esc(r.error.message) + ". If it is new, ask IT to run system_audit_log.sql.</div>";
        $("al_rows").innerHTML = ""; return;
      }
      if (!more) total = r.count || 0;
      await names_for(r.data || []);
      rows = rows.concat(r.data || []);
      $("al_count").textContent = total.toLocaleString("en-GB") + " entr" + (total === 1 ? "y" : "ies");
      $("al_more").hidden = rows.length >= total;
      render();
    }

    function what(r) {
      if (r.kind === "change") {
        var cols = r.op === "UPDATE" && r.changes ? Object.keys(r.changes) : [];
        return '<span class="al-k change">' + esc(OPS[r.op] || r.op) + "</span>" + esc(r.table_name) +
          (r.row_key ? " · " + esc(r.row_key) : "") +
          (cols.length ? '<span class="s">' + esc(cols.slice(0, 6).join(", ") + (cols.length > 6 ? " and " + (cols.length - 6) + " more" : "")) + "</span>" : "");
      }
      if (r.kind === "page") {
        var title = r.details && r.details.title ? r.details.title : "";
        return '<span class="al-k page">Opened</span>' + esc(title || r.page) + (title ? '<span class="s">' + esc(r.page) + "</span>" : "");
      }
      return '<span class="al-k ' + r.kind + '">' + KINDS[r.kind] + "</span>" + (r.details && r.details.reason ? esc(r.details.reason) : "");
    }

    function detail(r) {
      var c = r.changes || {}, keys = Object.keys(c);
      var body = "";
      if (r.kind === "change" && r.op === "UPDATE") {
        body = keys.map(function (k) { var v = c[k] || []; return "<tr><td>" + esc(k) + '</td><td><span class="al-old">' + show(v[0]) + '</span> → <span class="al-new">' + show(v[1]) + "</span></td></tr>"; }).join("");
      } else if (r.kind === "change") {
        body = keys.map(function (k) { return "<tr><td>" + esc(k) + "</td><td>" + show(c[k]) + "</td></tr>"; }).join("");
      }
      var info = [["Entry", "#" + r.id], ["Exact time", when(r.at)], ["Login", r.actor_login], ["Role", r.actor_role], ["IP address", r.ip], ["Device", r.user_agent]]
        .concat(r.details && Object.keys(r.details).length ? [["Details", JSON.stringify(r.details)]] : [])
        .filter(function (x) { return x[1]; })
        .map(function (x) { return "<tr><td>" + x[0] + "</td><td>" + esc(x[1]) + "</td></tr>"; }).join("");
      return '<tr class="al-det"><td colspan="4"><table class="al-dt">' + info +
        (body ? '<tr><td colspan="2" style="padding-top:10px;color:var(--muted);font-size:11px;letter-spacing:.5px;text-transform:uppercase">' +
                (r.op === "UPDATE" ? "What changed" : r.op === "DELETE" ? "The record that was deleted" : "The record that was added") + "</td></tr>" + body : "") +
        "</table></td></tr>";
    }

    function render() {
      if (!rows.length) { $("al_rows").innerHTML = '<tr><td colspan="4" class="al-empty">Nothing recorded for these filters.</td></tr>'; return; }
      $("al_rows").innerHTML = rows.map(function (r) {
        var nm = r.actor ? names[r.actor] : "";
        var line = '<tr class="r" data-id="' + r.id + '"><td class="w">' + esc(when(r.at)) + "</td>" +
          "<td>" + esc(nm || r.actor_login || "—") + '<span class="s">' + esc([nm ? r.actor_login : null, r.actor_role].filter(Boolean).join(" · ")) + "</span></td>" +
          "<td>" + what(r) + "</td>" +
          "<td>" + esc(r.ip || "—") + '<span class="s">' + esc(device(r.user_agent)) + "</span></td></tr>";
        return line + (open[r.id] ? detail(r) : "");
      }).join("");
    }

    async function csv() {
      var btn = $("al_csv"); btn.disabled = true; btn.textContent = "Preparing…";
      try {
        var all = [];
        for (var from = 0; from < 20000; from += 1000) {
          var r = await query("*").range(from, from + 999);
          if (r.error) throw r.error;
          all = all.concat(r.data || []);
          if (!r.data || r.data.length < 1000) break;
        }
        await names_for(all);
        var cell = function (v) { v = v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v)); return '"' + v.replace(/"/g, '""') + '"'; };
        var head = ["Entry", "When", "Login", "Name", "Role", "What", "Action", "Table", "Row", "Screen", "Changes", "IP address", "Device"];
        var lines = [head.map(cell).join(",")].concat(all.map(function (r) {
          return [r.id, when(r.at), r.actor_login, r.actor ? names[r.actor] : "", r.actor_role, KINDS[r.kind], r.op ? OPS[r.op] : "", r.table_name, r.row_key,
                  r.page || (r.details && r.details.title) || "", r.changes, r.ip, r.user_agent].map(cell).join(",");
        }));
        var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
        a.download = "RumbuApp_Audit_Log_" + ($("al_from").value || "start") + "_to_" + ($("al_to").value || ymd(new Date())) + ".csv";
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        if (all.length >= 20000) alert("The download holds the newest 20,000 entries. Narrow the dates or filters for the rest.");
      } catch (e) {
        $("al_err").innerHTML = '<div class="al-err">The download did not work: ' + esc(e.message || e) + "</div>";
      } finally { btn.disabled = false; btn.textContent = "Download CSV"; }
    }

    $("al_go").addEventListener("click", function () { load(false); });
    $("al_more").addEventListener("click", function () { load(true); });
    $("al_csv").addEventListener("click", csv);
    el.querySelectorAll("button[data-q]").forEach(function (b) {
      b.addEventListener("click", function () {
        $("al_from").value = ymd(new Date(Date.now() - Number(b.getAttribute("data-q")) * 864e5)); $("al_to").value = ymd(new Date()); load(false);
      });
    });
    ["al_who_search", "al_table_search", "al_text_search"].forEach(function (id) {
      $(id).addEventListener("keydown", function (e) { if (e.key === "Enter") load(false); });
    });
    ["al_kind_filter", "al_from", "al_to"].forEach(function (id) { $(id).addEventListener("change", function () { load(false); }); });
    $("al_rows").addEventListener("click", function (e) {
      var tr = e.target.closest("tr.r"); if (!tr) return;
      var id = Number(tr.getAttribute("data-id")); open[id] = !open[id]; render();
    });
    load(false);
    return { reload: function () { load(false); } };
  }

  window.RumbuAuditLog = { mount: mount };
})();
