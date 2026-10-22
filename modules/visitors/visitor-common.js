// ─────────────────────────────────────────────────────────────────────
//  visitor-common.js: shared helpers and styles for the Visitor Attendance
//  pages (Enter Visitor, Manage Visitors, Visitor History).
//  Load it AFTER auth.js, which provides the `sb` database client.
// ─────────────────────────────────────────────────────────────────────

var VS_TZ = "Africa/Lagos";            // WAT (UTC+1, no daylight saving)
var VS_OVERSTAY_HOURS = 8;             // on-site longer than this is flagged
var VS_MAX_ROWS = 10000;               // safety cap when loading a list
var VS_PURPOSES = ["Official Meeting", "Delivery / Supply", "Inspection / Audit", "Interview",
  "Maintenance / Service", "Contractor / Site Work", "Training / Visit", "Personal / Family", "Other"];
var VS_ID_TYPES = ["National ID (NIN)", "Driver's Licence", "Voter's Card", "International Passport",
  "Company ID Card", "Other"];

/* ───────────── text and time ───────────── */
function vsEsc(s){
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
var VS_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];   // fixed 3-letter months (some browsers print "Sept")
var _vsFmtDate = new Intl.DateTimeFormat("en-GB", { timeZone: VS_TZ, day: "2-digit", month: "2-digit", year: "numeric" });
var _vsFmtTime = new Intl.DateTimeFormat("en-GB", { timeZone: VS_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
var _vsFmtDay  = new Intl.DateTimeFormat("en-CA", { timeZone: VS_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

function vsFmtDate(x){                                                              // 21 Oct 2026
  if(!x) return "-";
  var p = {};
  _vsFmtDate.formatToParts(new Date(x)).forEach(function(t){ p[t.type] = t.value; });
  return p.day + " " + VS_MONTHS[Number(p.month) - 1] + " " + p.year;
}
function vsFmtTime(x){ return x ? _vsFmtTime.format(new Date(x)) : "-"; }          // 14:05
function vsFmtDateTime(x){ return x ? vsFmtDate(x) + " " + vsFmtTime(x) : "-"; }   // 21 Oct 2026 14:05
function vsDay(x){ return _vsFmtDay.format(new Date(x)); }                          // 2026-10-21 (in WAT)
function vsToday(){ return vsDay(new Date()); }
function vsDayStartISO(d){ return new Date(d + "T00:00:00+01:00").toISOString(); }
function vsNextDayStartISO(d){ return new Date(new Date(d + "T00:00:00+01:00").getTime() + 86400000).toISOString(); }
function vsShiftDay(d, days){ return vsDay(new Date(new Date(d + "T12:00:00+01:00").getTime() + days * 86400000)); }

function vsMinutes(a, b){ return Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)); }
function vsFmtMinutes(m){
  m = Math.round(m);
  var d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if(d) return d + "d " + h + "h";
  if(h) return h + "h " + mm + "m";
  return mm + "m";
}
function vsDuration(a, b){ return vsFmtMinutes(vsMinutes(a, b)); }
function vsFileSafe(s){ return String(s).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }

/* ───────────── branches and data ───────────── */
// Super Admins see every branch; everyone else sees the branch(es) they are assigned to.
async function vsBranches(ME){
  if(ME.role === "super_admin"){
    var r = await sb.from("app_sections").select("name").order("name");
    if(r.error) throw r.error;
    return (r.data || []).map(function(x){ return x.name; });
  }
  return (ME.sectionNames || []).slice().sort();
}

// Loads every matching row in blocks of 1000. makeQuery must return a NEW query each call.
async function vsFetchAll(makeQuery, cap){
  cap = cap || VS_MAX_ROWS;
  var step = 1000, rows = [];
  for(var from = 0; from < cap; from += step){
    var r = await makeQuery().range(from, Math.min(from + step, cap) - 1);
    if(r.error) throw r.error;
    rows = rows.concat(r.data || []);
    if(!r.data || r.data.length < step) return { rows: rows, truncated: false };
  }
  return { rows: rows, truncated: true };
}

function vsDebounce(fn, ms){
  var t; return function(){ var a = arguments, c = this; clearTimeout(t); t = setTimeout(function(){ fn.apply(c, a); }, ms); };
}

/* ───────────── pager ───────────── */
function vsPager(cur, totalPages, start, end, total, goFn){
  if(totalPages <= 1) return "";
  var p = '<button onclick="' + goFn + '(' + (cur - 1) + ')" ' + (cur === 1 ? "disabled" : "") + '>‹ Prev</button>';
  var pages = new Set([1, totalPages]);
  for(var x = Math.max(1, cur - 2); x <= Math.min(totalPages, cur + 2); x++) pages.add(x);
  var prev = 0;
  Array.from(pages).sort(function(a, b){ return a - b; }).forEach(function(pg){
    if(prev && pg - prev > 1) p += '<span class="page-info">…</span>';
    p += '<button class="' + (pg === cur ? "active" : "") + '" onclick="' + goFn + '(' + pg + ')">' + pg + '</button>';
    prev = pg;
  });
  p += '<button onclick="' + goFn + '(' + (cur + 1) + ')" ' + (cur === totalPages ? "disabled" : "") + '>Next ›</button>';
  p += '<span class="page-info">Page ' + cur + ' of ' + totalPages + ' · ' + (start + 1) + ' to ' + end + ' of ' + total + '</span>';
  return p;
}

/* ───────────── CSV ───────────── */
// asText keeps leading zeros (phone numbers) when the file is opened in Excel.
function vsCsvCell(v, asText){
  var s = String(v == null ? "" : v);
  if(asText && s) return '="' + s.replace(/"/g, '""') + '"';
  if(/^[=@\t\r]/.test(s) || (/^[+\-]/.test(s) && !/^[+\-][\d\s]+$/.test(s))) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function vsDownload(filename, text, mime){
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime || "text/csv;charset=utf-8" }));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
}

/* ───────────── printing ───────────── */
// size: "A4 landscape", "A4 portrait" or "A5 portrait". The page footer (CONFIDENTIAL and
// page numbers) appears in browsers that support page margin boxes, and is simply skipped elsewhere.
function vsPrint(innerHtml, size, withFooter){
  var area = document.getElementById("printArea");
  if(!area){ area = document.createElement("div"); area.id = "printArea"; document.body.appendChild(area); }
  area.innerHTML = innerHtml;
  var st = document.getElementById("vsPageStyle");
  if(!st){ st = document.createElement("style"); st.id = "vsPageStyle"; document.head.appendChild(st); }
  var footer = withFooter === false ? "" :
    "@bottom-left{content:'CONFIDENTIAL';font:8pt Arial;color:#555}" +
    "@bottom-right{content:'Page ' counter(page) ' of ' counter(pages);font:8pt Arial;color:#555}";
  st.textContent = "@page{size:" + (size || "A4 portrait") + ";margin:14mm 12mm 16mm 12mm;" + footer + "}";
  window.print();
}
function vsPrintHead(title){
  return '<div class="pr-head"><span>RUMBU INDUSTRIES GROUP</span><span>' + vsEsc(title) + '</span></div>';
}
function vsNowLabel(){ return vsFmtDate(new Date()) + ", " + vsFmtTime(new Date()) + " WAT"; }

/* ───────────── small message at the top of the page ───────────── */
function vsFlash(text, type){
  var el = document.getElementById("vsFlash");
  if(!el){ el = document.createElement("div"); el.id = "vsFlash"; document.body.appendChild(el); }
  el.className = "flash " + (type || "ok");
  el.textContent = text;
  el.style.display = "block";
  clearTimeout(el._t);
  el._t = setTimeout(function(){ el.style.display = "none"; }, 6000);
}

/* ───────────── shared styles ───────────── */
(function(){
  var css = [
    "*{box-sizing:border-box}",
    "body{font-family:var(--sans);background:var(--bg);margin:0;padding:16px}",
    ".card{background:var(--card);width:100%;max-width:1150px;margin:0 auto 16px;padding:22px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.11)}",
    "h2{text-align:center;color:var(--heading);border-bottom:2px solid var(--heading);padding-bottom:10px;margin:0 0 16px;font-size:18px}",
    "h3{color:var(--heading);font-size:14px;margin:0 0 12px}",
    ".status-line{font-size:12px;text-align:center;color:#666;margin-bottom:12px}",
    ".grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 20px}",
    ".full{grid-column:1/-1}",
    "label{font-size:12px;font-weight:600;color:#555;margin-bottom:4px;display:block}",
    "input,select,textarea{width:100%;padding:9px 12px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);font-size:13px;outline:none;font-family:inherit}",
    "input:focus,select:focus,textarea:focus{border-color:var(--accent)}",
    "textarea{min-height:70px;resize:vertical}",
    "input[readonly]{background:var(--bg);color:#666}",
    ".req{color:#dc2626}",
    ".hint{font-size:11px;color:#888;margin-top:3px;min-height:14px}",
    ".sec-title{grid-column:1/-1;color:var(--heading);font-size:13px;font-weight:800;border-bottom:1px solid var(--line);padding-bottom:4px;margin-top:6px}",
    "button{padding:10px 18px;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;background:var(--heading);color:#fff;transition:opacity .2s}",
    "button:hover{opacity:.88}",
    "button:disabled{opacity:.5;cursor:not-allowed}",
    ".btn-primary{background:var(--heading)}",
    ".btn-accent{background:var(--accent)}",
    ".btn-ghost{background:var(--bg);color:var(--heading);border:1px solid var(--line)}",
    ".btn-sm{padding:6px 12px;font-size:12px}",
    ".btn-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}",
    ".msg{margin-top:10px;font-size:13px;font-weight:600;min-height:18px}",
    ".msg.ok{color:#15803d}.msg.err{color:#dc2626}",
    ".notice{background:#fffbeb;border:1px solid #fcd34d;color:#92400e;border-radius:8px;padding:12px 14px;font-size:13px;font-weight:600;margin-bottom:12px}",
    ".chips{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}",
    ".chip{padding:8px 14px;border-radius:10px;font-size:12px;font-weight:700}",
    ".chip b{font-size:16px;margin-left:4px}",
    ".c-blue{background:#e8f0fb;color:#1F3864}.c-green{background:#dcfce7;color:#15803d}",
    ".c-gray{background:#f3f4f6;color:#374151}.c-red{background:#fee2e2;color:#dc2626}.c-amber{background:#fff7ed;color:#c2410c}",
    ".toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px}",
    ".toolbar>div{min-width:130px}",
    ".toolbar .grow{flex:1;min-width:200px}",
    ".count-label{font-size:12px;color:#666;margin:0 0 8px}",
    ".table-wrap{overflow-x:auto}",
    "table{border-collapse:collapse;width:100%;font-size:12.5px}",
    "th{background:var(--heading);color:#fff;padding:9px 8px;text-align:left;white-space:nowrap}",
    "td{padding:8px;border-bottom:1px solid var(--line);vertical-align:middle}",
    ".num{text-align:right}",
    "tr:hover td{background:var(--bg)}",
    "tr.row-stale td{background:#fef2f2}",
    "tr.row-long td{background:#fff7ed}",
    ".badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap}",
    ".b-on{background:#fff7ed;color:#c2410c}.b-out{background:#dcfce7;color:#15803d}.b-stale{background:#fee2e2;color:#dc2626}",
    ".pagination{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:14px;flex-wrap:wrap}",
    ".pagination button{padding:6px 12px;font-size:12px;background:var(--bg);color:var(--heading);border:1px solid var(--line)}",
    ".pagination button.active{background:var(--heading);color:#fff;border-color:var(--heading)}",
    ".page-info{font-size:12px;color:#666}",
    ".empty{color:#888;font-size:13px;margin:6px 0}",
    ".modal-bg{display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);align-items:center;justify-content:center;padding:12px}",
    ".modal-bg.open{display:flex}",
    ".modal{background:var(--card);border-radius:14px;padding:24px;max-width:640px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.22)}",
    ".modal h3{font-size:16px;margin:0 0 14px}",
    ".kv{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;margin-bottom:14px}",
    ".kv .full{grid-column:1/-1}",
    ".kv label{font-size:11px;color:#888;font-weight:700;margin:0}",
    ".kv span{font-size:13px;font-weight:600;color:var(--text);word-break:break-word}",
    ".warn{background:#fef2f2;border:1px solid #fca5a5;color:#b91c1c;border-radius:8px;padding:10px 12px;font-size:12.5px;font-weight:600;margin-bottom:12px}",
    ".modal-btns{display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}",
    ".flash{display:none;position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:10000;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 4px 16px rgba(0,0,0,.2);max-width:92vw}",
    ".flash.ok{background:#dcfce7;color:#15803d}.flash.err{background:#fee2e2;color:#dc2626}",
    "@media(max-width:700px){.grid,.kv{grid-template-columns:1fr}.toolbar>div{min-width:100%}}",
    /* ---- printing ---- */
    "#printArea{display:none}",
    "@media print{",
    "html,body{background:#fff!important}",
    "body{padding:0!important;margin:0!important}",
    "body>*:not(#printArea){display:none!important}",
    "#printArea{display:block!important;font-family:Arial,Helvetica,sans-serif;color:#000;font-size:11pt}",
    ".pr-head{display:flex;justify-content:space-between;font-size:8pt;color:#1F3864;border-bottom:1px solid #1F3864;padding-bottom:3px;margin-bottom:12px}",
    ".pr-title{font-size:16pt;font-weight:bold;color:#1F3864;margin:0 0 4px}",
    ".pr-sub{font-size:13pt;font-weight:bold;color:#2E75B6;margin:0 0 8px}",
    ".pr-meta{font-size:9pt;margin:2px 0}",
    ".pr-table{width:100%;border-collapse:collapse;margin-top:10px}",
    ".pr-table th{background:#1F3864!important;color:#fff!important;font-size:8pt;text-align:left;padding:4px 5px;border:1px solid #1F3864;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
    ".pr-table td{font-size:9pt;padding:4px 5px;border:1px solid #bbb;vertical-align:top}",
    ".pr-table tr{page-break-inside:avoid}",
    ".pr-table thead{display:table-header-group}",
    ".pr-kv{width:100%;border-collapse:collapse;margin-top:8px}",
    ".pr-kv td{padding:6px 8px;border:1px solid #bbb;font-size:11pt;vertical-align:top}",
    ".pr-kv td.k{width:34%;background:#eef2f9;color:#1F3864;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
    ".pr-note{font-size:9pt;margin-top:14px}",
    ".pr-sign{display:flex;gap:24px;margin-top:38px}",
    ".pr-sign div{flex:1;border-top:1px solid #000;padding-top:4px;font-size:9pt;text-align:center}",
    ".pr-end{font-size:8pt;color:#555;margin-top:10px;text-align:center}",
    "}"
  ].join("\n");
  var st = document.createElement("style");
  st.id = "vsStyles";
  st.textContent = css;
  document.head.appendChild(st);
})();
