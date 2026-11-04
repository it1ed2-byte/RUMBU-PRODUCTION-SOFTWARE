// =====================================================================
//  br-common.js -- shared by the three Bottle Running Hours pages.
//  Each page loads the Supabase library and ../../auth.js first (they give us sb and requireAuth).
//  Times are shown and saved in Nigerian time (WAT, UTC+1, no daylight saving).
// =====================================================================
const BR_PAGES = { manage: "bottlehours/manage-assets", fill: "bottlehours/fill-runtime", view: "bottlehours/view-runtime" };
const BR_MAX_HOURS = 24;                       // one run can be at most this long (the database keeps the same rule)
const BR_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const BR_PDF_MSG = "The PDF library did not load -- check your connection and reopen this page.";

function brEsc(v){ return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function brPad(n){ return String(n).padStart(2, "0"); }
function brWat(d){ return new Date(d.getTime() + 3600000); }                       // read with the getUTC... methods
function brYmdOf(d){ const w = brWat(d); return w.getUTCFullYear() + "-" + brPad(w.getUTCMonth() + 1) + "-" + brPad(w.getUTCDate()); }
function brTodayWat(){ return brYmdOf(new Date()); }
function brAddDays(ymd, n){ return new Date(Date.parse(ymd + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10); }
function brFmtDate(ymd){ if(!ymd) return ""; const p = String(ymd).slice(0, 10).split("-"); return p.length === 3 ? p[2] + " " + (BR_MONTHS[Number(p[1]) - 1] || p[1]) + " " + p[0] : String(ymd); }
function brFmtDateTime(iso){ if(!iso) return ""; const d = new Date(iso); if(isNaN(d)) return String(iso); const w = brWat(d);
  return brPad(w.getUTCDate()) + " " + BR_MONTHS[w.getUTCMonth()] + " " + w.getUTCFullYear() + ", " + brPad(w.getUTCHours()) + ":" + brPad(w.getUTCMinutes()); }
function brToInput(iso){ if(!iso) return ""; const d = new Date(iso); if(isNaN(d)) return ""; const w = brWat(d);
  return w.getUTCFullYear() + "-" + brPad(w.getUTCMonth() + 1) + "-" + brPad(w.getUTCDate()) + "T" + brPad(w.getUTCHours()) + ":" + brPad(w.getUTCMinutes()); }
// "2026-11-02T19:30" typed as Nigerian time -> the exact moment as an ISO string (null if it is not a time)
function brFromInput(local){ if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(String(local || ""))) return null;
  const d = new Date(local + (local.length === 16 ? ":00" : "") + "+01:00"); return isNaN(d) ? null : d.toISOString(); }
// Running hours, worked out the same way the database does it (to 2 decimals)
function brHours(startIso, stopIso){ const a = new Date(startIso), b = new Date(stopIso); return (isNaN(a) || isNaN(b)) ? null : Math.round((b - a) / 36000) / 100; }
function brHoursText(h){ if(h == null || isNaN(h)) return "--"; const mins = Math.round(Number(h) * 60); return Number(h).toFixed(2) + " h (" + Math.floor(mins / 60) + " h " + brPad(mins % 60) + " min)"; }
function brSum2(list){ return list.reduce((s, x) => s + Math.round(Number(x || 0) * 100), 0) / 100; }
function brLike(v){ return String(v).replace(/[\\"(),*]/g, " ").replace(/[%_]+/g, "%").replace(/\s+/g, " ").trim(); }      // safe inside a PostgREST like / or filter; an underscore or % typed by a person matches anything

// ---------- who may open a page: the same rule as the menu ----------
// Super Admin: every page. Admin: the pages of their branch, and any ticked for them. Everyone else: the pages ticked for them.
async function brCanOpen(ME, path){
  if(ME.role === "super_admin") return true;
  const mine = await sb.from("assigned_pages").select("page_id, pages!inner(module_path)").eq("profile_id", ME.id).eq("pages.module_path", path).limit(1);
  if(mine.error) throw mine.error;
  if(mine.data && mine.data.length) return true;
  if(ME.role === "admin" && ME.sectionIds && ME.sectionIds.length){
    const sec = await sb.from("page_sections").select("page_id, pages!inner(module_path)").in("section_id", ME.sectionIds).eq("pages.module_path", path).limit(1);
    if(sec.error) throw sec.error;
    return !!(sec.data && sec.data.length);
  }
  return false;
}
// Shows the "no access" panel instead of the page when the person has not been given it. Returns true when they may continue.
async function brGate(ME, path){
  let ok = false;
  try{ ok = await brCanOpen(ME, path); }catch(e){ const el = document.getElementById("connStatus"); if(el){ el.style.color = "#dc2626"; el.textContent = "Could not check your access: " + e.message; } return false; }
  if(!ok){
    const app = document.getElementById("app"), na = document.getElementById("noAccess");
    if(app) app.style.display = "none"; if(na) na.style.display = "block";
  }
  return ok;
}
async function brLog(ME, actionType, description){
  try{
    const { error } = await sb.from("activity_log").insert({ actor_id: ME.id, actor_username: ME.username, actor_role: ME.role, section_id: ME.sectionId, action_type: actionType, description: description });
    if(error) console.warn("Activity log write failed (non-fatal):", error.message);
  }catch(e){ console.warn("Activity log write failed (non-fatal):", e); }
}
function brErr(e){ const m = (e && e.message) || String(e); if(e && e.code === "23505") return "An asset with this name already exists."; if(e && e.code === "42501" && /row-level/i.test(m)) return "You do not have access to do this."; return m; }

// ---------- pick a person from the employee directory ----------
// The directory is large, so it is searched on the server as you type (staff ID or name). Only people with a login can be chosen,
// because only they can open Fill Runtime.
function brPicker(host, onChange){
  host.innerHTML = '<input type="text" class="brp-input" placeholder="Type a staff ID or a name" autocomplete="off"><div class="brp-list" style="display:none;"></div><div class="brp-chosen" style="display:none;"></div>';
  const input = host.querySelector(".brp-input"), list = host.querySelector(".brp-list"), chip = host.querySelector(".brp-chosen");
  let chosen = null, timer = null, seq = 0;
  function render(){
    list.innerHTML = "";
    if(chosen){
      input.style.display = "none"; list.style.display = "none"; chip.style.display = "flex";
      chip.innerHTML = '<span><b>' + brEsc(chosen.full_name) + '</b> (' + brEsc(chosen.employee_id) + ')' + (chosen.branch || chosen.department ? ' <span class="brp-sub">' + brEsc([chosen.branch, chosen.department].filter(Boolean).join(" / ")) + '</span>' : '') + '</span><button type="button" class="brp-x" title="Choose someone else">Change</button>';
      chip.querySelector(".brp-x").onclick = () => { chosen = null; input.value = ""; render(); input.focus(); if(onChange) onChange(null); };
    } else { input.style.display = ""; chip.style.display = "none"; chip.innerHTML = ""; }
  }
  async function search(q){
    const my = ++seq; q = brLike(q);
    if(q.length < 2){ list.style.display = "none"; return; }
    list.style.display = "block"; list.innerHTML = '<div class="brp-note">Searching...</div>';
    const { data, error } = await sb.from("employees").select("id, employee_id, full_name, branch, department, unit, linked_profile_id")
      .or("employee_id.ilike.%" + q + "%,full_name.ilike.%" + q + "%").order("full_name").limit(15);
    if(my !== seq) return;                                                   // a newer search has taken over
    if(error){ list.innerHTML = '<div class="brp-note" style="color:#dc2626;">' + brEsc(error.message) + '</div>'; return; }
    const rows = (data || []).slice().sort((a, b) => (String(b.employee_id).toLowerCase() === q.toLowerCase()) - (String(a.employee_id).toLowerCase() === q.toLowerCase()));
    if(!rows.length){ list.innerHTML = '<div class="brp-note">Nobody found for "' + brEsc(q) + '".</div>'; return; }
    list.innerHTML = "";
    rows.forEach(r => {
      const d = document.createElement("div"); d.className = "brp-item" + (r.linked_profile_id ? "" : " brp-off");
      d.innerHTML = '<b>' + brEsc(r.full_name) + '</b> (' + brEsc(r.employee_id) + ') <span class="brp-sub">' + brEsc([r.branch, r.department, r.unit].filter(Boolean).join(" / ")) + '</span>' + (r.linked_profile_id ? "" : ' <span class="brp-warn">no login yet</span>');
      d.onmousedown = ev => { ev.preventDefault(); if(!r.linked_profile_id){ list.innerHTML = '<div class="brp-note" style="color:#b45309;">' + brEsc(r.full_name) + ' has no login yet, so cannot fill running hours. Ask HR to create the login first.</div>'; return; }
        chosen = r; list.style.display = "none"; render(); if(onChange) onChange(r); };
      list.appendChild(d);
    });
  }
  input.addEventListener("input", () => { clearTimeout(timer); seq++; list.innerHTML = ""; list.style.display = "none"; timer = setTimeout(() => search(input.value), 250); });
  input.addEventListener("blur", () => setTimeout(() => { list.style.display = "none"; }, 150));
  return { get: () => chosen, set: emp => { chosen = emp || null; render(); }, clear: () => { chosen = null; input.value = ""; render(); } };
}
const BR_PICKER_CSS = ".brp-input{width:100%;} .brp-list{border:1px solid var(--line);border-radius:8px;background:var(--card);margin-top:4px;max-height:240px;overflow:auto;position:absolute;z-index:20;min-width:320px;box-shadow:0 6px 18px rgba(0,0,0,.18);} .brp-item{padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--line);} .brp-item:hover{background:var(--bg);} .brp-off{opacity:.55;} .brp-sub{color:var(--muted);font-size:12px;} .brp-warn{color:#b45309;font-size:11px;font-weight:700;} .brp-note{padding:10px 12px;font-size:12px;color:var(--muted);} .brp-chosen{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid var(--line);border-radius:8px;padding:6px 10px;background:var(--bg);font-size:13px;} .brp-x{padding:4px 10px;font-size:11px;background:var(--card);color:var(--heading);border:1px solid var(--line);}";

// ---------- the PDF: Rumbu letterhead, details panel, table ----------
const BR_LOGO_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMwAAADwCAMAAAB7RHsWAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAAASFBMVEX////+/v79/f38/Pz7+/v6+vr5+fn39/fw8PDg4ODNzc22traampqEhIR2dnZjY2NTU1NKSkpEREQ+Pj46Ojo1NTUuLi4kJCTGv00gAAAjWElEQVR42u1diZasqLKV2SGdNfP///TGAAhqVmVVmqfPeetxb3dXRQkYEuyIHaAUxaeKtEVR3Yb7fZ2XdYEy3x99owsllCj+tXKujPs/oAwUVGYAZeQ/qYwTApV5ZMrYQsl/UBnltNkr09dCO6v/MWWEENIURXkwMwl/00r8S+oIZYxWMGfaCZQhXdYVlBlvFfzVOaP+HVWkwps1ZdX0Mw7JQmVe73N/q0tNl8h/ZHCUdWBiRdV0wzTvytDR4Kh/Y+YIfuSuqm/98njc07LeH48FBqdyiHZ//+AIYy3co6tv3bjAvR/KfRlBHTA1ba2WfzWG8cOGydIOqMm6t7IZB+c+tE1VoiJK/rW4BhhmcXaXTdtPNCxT16bl1nao432d+rYp4UqYXPJvHRbGsLrpxke45RpLVVU1l+bWTyur2dSl+lunjoRhIQy7dcO8PoIxOVc6eviuhJ9dYoBD1xCu2b8N1/yoRAzz09zyX6saRiFcukHD/JfimjQOb7wEVfhGAwDjoJS3fh7Iu2iTKwxOpxaEa0r+PcMidxgWTEiSgigcbjhFlCOl0Z0GU6yrUvw9uJZhGE3ukSe3sDA0tunva9/1y9ojfmnncCgQJCYanIBr7m/ANT8s9uz2BJhU06/3voE/wn9uOHMED06ienA68r8eHOmHpQ4YtvZoOHBvCG2i7ub72NalJWNbO2QAgGkqM8oJYQ9nlDX/IW3zGCZoSq9xSqMm+PQNTI3lzlOfGfTSN4QKjoxtg4sZapX2vx0cwDCXYVgAW0E3W7XjfQYkYO4iqxp+n9qaHD/5nu0hYDBd+8H5L6YOzBXsVqTmwhhmWJUaiBnfOwyE0zQ4rJ0mdV10sVSbnsN/hGsCnQOhbDvQRL6HiSzpNiueI+QUteHnjXYHcyhlm2YDjpEBonD2D+OaHxa0k3grLd9K8J4wQ7rGIhgb8O8CCBvq5REB1ZHIAbLHQfFP8aenTriPOjMSdH48LCUB8o3uDPDOSKk5JwDqwywBUCiJj+rMUO+Ea+UfxTWPYbI8Tt8Npe538pEmYcegFWKyQ5czsEWBre7CIAqmcTIp9UfiNeUxLCEtcGvOK0OmtIS7hRHBISQxBNWEa6QrxwPKzw+R41pFgGfVH5gshDhoGp60BJcHN4Z8eXMugFgGH7KumhtBGM4cy1Z49/EAjIA2JybrknTCBzHMqZB42UiLoNQyYS0DclNJQjFLIA2ITBAmAAwI1sq6RXxg2LacEsQgoZsjrqG3+ijT8RSfbGLO4BSMAtMYCsZrArSqEv+HN75yeCxIQfZCjHY0AgJjog3mHymuCfEhXAMMQwtXcbZuBqHyW7RsUh7YQNT28xpNT1M80ESfqgHV6JZlYrw+WkUXJT6IYQlpYcZltzFADx+Nh6JJBDZQDybSYwizhCcJRjsTxwPg9aWxeTD9SVxTxp10xsHhNq1XtvZC86zWAdgkR8241kQ4RZOE4oHBxwMwONID/o7hmYtxzWPYxqmiGaAePAb+bhlwtfZ36x1kESGMpsIuHijZ6eNDgXrywL1jPu5CDBO7xIvnmXbvCoMnCsBW+FQAhzg1hzikrkPvAhqWnAfwRC/NinQ00vIqXBMphi0ZdIIpSclBShOCFEpOSIYmP8MxQiZSnEIYwjY9hD4+BIzIdMC1+Nhu/NjwLsRVGOaOg48dhDFIzMXPIB81W+ZizsocwpyfCclkUuCF/OCog0GDdbybmY5tHxIvhpwdTlqdBvbpDAKT0nQhNZWYXrfFA5oyURtwQG25h5oRrqdFnTeDaY9hVZ54MZ5CabLkhHIh7CINc0nUzFM9UDZL0Q5rbtwJpBukC+r8Ado3Vtw8hlGcEUnL5soE3oksNzIMuikdw3wCNkvJC1sFMp0mOaSPB4rM2aLHJ1yDeiZLErAr/mXyE7kkOvyU2SZBBoyBn9NrH8KSwwwyNFeqtr/5556gRRIPqDQeYPPd4RqxDP1LXAvgkcTmHiYp/PPxQEggaZ7Q+NDkNoMEM/+ypnitriJJMAmOSzbMiOPYrEZquncHMXbCOxM/xTAtUgyjgY4OjMfATw0OUqQmfMKh8ikZScqAs1zmaV3Im5jIqnsPYcbHAxl1QJHgvQ86NXJ2OuZHuOYHWR/zdBxaEIilU0OCzw8oBnM5pJPYLaJycD+rHwpD08jHPrt4YAnmya5K7uCHfbX6Ga7F1eIQkVPihcARbxk6p6iDzKlmMsNGwbfIib5wg2RQVRW9iSZlRJ7y0N5ow9MxNF33uMZO5ye4lkyWyJUChuHwCo9Y0Spg2JUKwQnesQ0pWJ2kNFNvwhh3Eg+UaTygxJnLJo5uXsQ1xDC/WrzDMNZS5M4PtRMhFtu4v0ex2/gAiKJJLQjDA7vEO38eD3Q8gpwekDIDImYe4oWdBIHXwbgmVWsTIZFnk8hug3fCJIlluaHYg4Mzm3kTsxlhQmliPDDQZArxwLmLeGHFjXa8+EhiXOOgJs5KUYYlNRClFMcB5DubSiQoRvPH8q0zqe4CqbYxHgiRkH4SD8S+TZ4ksPyE5bPJQtMNMSxZLQ5pH0H2tIu70OcHG5q2pHhiLyq4SrNPd0gfD7CHrbJ4gOMjsxGZLaxKkwRf7CRIdrwkpEVvw8lJvDRbKaTO4gC7RzEOznScRe5gjCfxgI9cfVpEiZ2zGPc7CdSTrRVH0hJdFKNYyFZ6dxdkNAoiRTF/g4oWL8imJKcISRv2JifxQEii8UDzePGteTeeToEnOwnkfsdLEjzwODKKybRj7+x0gqfWx2IUe5bCKyNqjGUEj3ySvLVfxQN9Fg9sARaCU55RyXcSsEcvdokXkYR1gWwmXThF0BdWLYn78/oeo1hFJueZSedjnggNwVCfxgOi2YBe+UfvcW175Cc7pGBs9XmWJzgmoVw6+OSWpYoGEWIQvtVbRDG+LYjg7g+wwjJ4/7jgYYIyxZN4IKTfw4pNGv1uk0H5DEIcFnNMvMSpBdOcw/RkWmrOom3QKu22MJPOHwsR3DLP6+y9vyGN06UoFwPU9SQeCAsjAbSUOYMpiuTgCmVOdryEP4bcTA6YCNI2uEEfIqswvZP5g88ToPcx3Bq6Ve/99d7tcqyfxQNaHMZLpURe59uNyGJhQCUxwbBajMNmyB6QS4pAk0SVuTIlonvb0t95kiaEk6ALjhyo/fB+Nnr/6eHZttrigfC4EkIRuJ9Wweb304K4PDpCUAaTxywNEwoImLUGizah0YdnLrimsl+YkM6PAs58HChh/PwZcLYAwiJa++DGzxNyObydVnJ+IJFg2l3H8Zr9eBkZHq/P/e6SBNJTDl5p4bxBATpkwE0Z44XCv8L4AILYDGcwBWGM9IzShyYxiqaRS72/YSwMJIKzAdKyxMcD5Dt9ROfHy7LrJFdBiCf2+S8EG2zgkTKffSnhoc5+ItI40422kW7BtKP5AxM9zCltOReweh4qPWuIuWWiK7hVeEVIZm8SJPEas61ebeNFBWwDr9dxKfJBjq0AbkhUMnANHF9czoLrKXmHodrCLg0Tk9oorbGDaSUiTJNVKiJWfk7hLQiLA8XVJI6zYvX4CWhe4+Rsc1DYP6aaWmbO5wsMzsq7ok4K8VDErvHWFB2uGy1h116VFNqQWKNdUuvpX278REsvLP0iE9wmiEos3gorIUtfYBIZUhmdkPIbHTTY+DqxE5KUf6YhnrzBb7Yxz/2tOufFCNMLWlpXzLhTHzl+XTfNLS8t/B8BEEh89qd2gLogC8KGcg6AwCxp8C/gKWdotMFfQqlxdxMiySao6cKOeidJhYEdwMatjqXC3R4EQFmhx+2f7bSs4M2KO+5vByuDMoQyQpmmaZ7hn+V+B8Sm32OZV5TBdfDzSBfDVfBEuCaUAbcp3Odha5IK9gETdB0TQQ9PFa+MpaNrllTSdf2I1fCnQ2nbFv48LzAmBRIE3A3+eFbu83TYbX2Hx3D/+qr7OpMX3lecaGtzVpEBiAshLUm2jeqItBPyGHjw95OyTNg3PKKC2duZEmHP+wKGuKuOr12tO8m8E6zLctL1Wc1lPUqO1fiiZ0+c7L7AmAzmDZrUNI7RTMCEwiZxfGNsv3F8QePMBEfJXuCFuTQIFl/m8LJNlGCJojWWVFUYMgwU6sJBlHPj/eBbgWnbDStaysIvjOT3HTveieKvrB3f25JcTyofb3T5tvhrEKr6Y4HJ17Uc9ICrShCCsbaMr76dWMprsvX8uvVF2YkIlRkCEu6A16vi+St5SHC6WisNoUJQ5n7/fedvKbOezTYIBuvgyXbFFDFPmRddCFZmmcfjmM7L+IJsmJbpaBDjfLATvPAgW5aTy1DBvnqe61dnGzriG5Z3dM64+T0tt5F8XC6b5jaRNfwGQ5/XBYcIYMPuOXF9t2Emd9h82R5yyzsqU3+RwvS5v7TgRmocGai6jm3JMe9W6mG+heAxlGacbm6TGVpLnzp4ina7CDc7tgMT4RiLQHs9xIi4Nvq8PY2bvYEerJhtgNAQMyFcXJwgwb7ErihHIwPOlJUpdspMt70QOm90JgFlxu5gEkGZTOaV2beXh5W29srUQhip5KE8S9R6M2NlKqsdxtFY4KEY04AyFeCEVRReawWhND7JUiN4kMhqU6IytTVpXW1RGazs+EqAGmNpZEoDlZ6256g9rwwM1E8WznJlhHBSBApthCBl4EFokkp675o6F1IokkG4L0gZrKu28QbjRWUgug9SaYUgZQA/maen7Ym8vUQZ8VtlwGTCqGrM05Ay+NqCEixTbOMlmKvBK4V2FLWTmTkdzAClPDIopboSDRqU6YglftfeRcrEPaMiKIMT1mdtxda5l6lUmWj6KlXGS4X1AIC7nb5r7xplrIjglyjjN7XJtHOWYf2gjI1TWybKBGmqjPmuvc8oM/PS1ceVKT6hzN7MWJlPmZlMlPmAmW0AoKKZCWFJqhAUBHcOYEcyjO0OACATABBBGgGgDDJFy1eMZkXe3hXKCHhmEZq1h2ZBTZIoQiktrTHgbtAc6wowM4ZmqBzA/gSaKcPnRyZv7wplzOY0FXo7VKYEd2a8SFmtvJNT3hVuTjOvmzjNTcZOk5rhgn2M3EdoT+lrlDkNZ9xJOCMuDGewD5tJTP2mMiHQzHtqzmOzWxKOyk2ZpK7yc6akH2Paj5QR54Hr1p5u3ldmgui8yUs7AQX4Toa5w2NdTHANXVPnMqQA3/fRbhTgN8oQuZvHfZlOhCCb9qIZLhv2F87nF04vtbcubyqzTPuCOY4XZPNZ3fML17PKB9G7ypCZ5akDzMSCWRxl3V40zMOt2VfupzFP9YL9gJm1uezYR3Nrh7fMjAGgwpffk7yBw8lZuVRoSVYmMqerBn1hYdO6zjtNkVS23mnar/swl0UAOsOVA9OUB2Yot3BGp2mSI5ppH85YXs940gej44K5vjeVkakXB3JGHUFzwYkLTR67MeCv/TqdLiQro9K6VkgeGSnMFgHIEAEo+awPDJjKa5RJYlyOaP1TC9sd/MiQX/BRrnk5ajZJ1Cyf9eHbuyQ2Ey5ELkZvtFlySIIxjBCeNvuQxABBjrTZhHDGBNqctugoNoM5E2Rnffj2Loqak0DTPzWiAEztQ8jukO7IkN3ZKECW84kUIJhZSgHyPqrYx7UU4KhMsSkjPqWM/IAyBzND2BR/wMzUZ8xs26yRssDAZ+Q2MpF/JACQ8JltZOTJyKikj2DKaXtXKKPkpoyyUlJH2KfPm0nAWYRmi1kilhmpWBktNzOTTipWRsmgIsqYz0j6hFvoo/Z9+NycEfKykUmCc/EqnymPFEBuTlPsc81pOlucpYBdcwWfAcZeuq0UkuaMUjaRWTY94/yVpY7KJHXBbryZqSgtYw7AbFd6ANDShvbM22YWAs08LiSucUuWrpBsdPNedmuZptzyxUUONJtMxoFmJmsn5jhZe+/zmXcowPwSBZhOOvkEBUByNuF+Bs+PpkDO8IcgPMomqpPX9dJ5J5183Sibnrb3njJrMLMjpX2F5p7QZjCzcdhXPqXN46GPN2lzAIDNz6jgU2gboYfmNAFhXokAypMIwEY/Q30gmlVbe/YCNAvQ/FqqqXgx1XQ7SzWp71bnXH2JMlptiTzlFCf8KPsXkoAka5wyedJu7Gqj0iSgMgzNW4u4JhaSgLTPDcJWTDTSyEB4Yy5OAlYiNTOdJrXDSlcwMxkCzRjOiNzMtvTsZmYiD2dwdY4XgXFPrknbu8TMkkBTmRBUwn1sgSY5UpcGmmHO5IHmljjfAs0iDzRxRRQDTVBGf5bPpMsNIqEAwgea8goKoIwHABVkn1k5O1kIwq3EadT8xWKTSaPm4/qMDtw8UcZ8cOXsXBn5ojL2a2X8ypnI5sznlBGZMj6hoVJlfALCfZfQOFPGyqMyLJOfoM1SZcvaG5qFOSPMG3PGZWiGUXPo+VravCmzUeRAnFAW0IxBQaqUNh83NZDUz3bnV85KWlZkZSznzSoT1t3UdWhmrYv7vI2zhpQxxvDub/jBy3C3GskMVMD3/HDlzOLHQbjgh3ZYGWqGWwQZKxNlBq8jZRw07Wsa+6GVs+MmndfDmfL2JJz5drORumLl7HamzK34VhkByhwfBCnjXlFm3nd8gTIT7wX3e9iadGMb/8b/bg8yogBJXS/tRr+3fZMxBYiyBrfKhQ16SXu3C1bOpmFfxhPhiWycT+riN89PLpzHF9qb3mWaTF/nOTDX2dPX2f8SZLSHOcjCZVw34b28nJZU9jJeOZunOYgSGV/G7b25crZgrmFXunk5COklip1omIdD3bafxn1lYJVDt688Hfro3l85Q9TM3kMpK7DnW7WXTVMuw1dOAJp3dfFbZ/giTJnKcImtySuXEDXjV1/T9i6jABvBst7bQwAdyZkhp9kA2YnkTG4UICFntFva753JKABGANJEmY8AoF2TtnfNYpM+LPmZk2XAfCHvZBmQXsTrKZw5LAO6pDbLaBVApO1do4yJ+82w9d02XelltHvWx4p6UybWpVUyPzKbNFEmbiP1KVt6+zNt75LYTG7hjDaS4rASqTpHHxB0SNPAnHFSe5mFYA6mAsZmsS5LfWwmQ5BjQMZMU4YrDclwzjipYnvyo0wzLCzRBlHpcwAZ0+w5apZfRs3Oj0y5Y5r93FYQhv8RpuniFsZIm5MDjJhMsTJWZHzm9iI5Q2XsH2OaO2Wmq5WZ/l+Z981MwpyZ/hEzS7bPp0wzAQChCc3wzwkz7Jlpyoxp3gLTFEemGQCA9m0imoXaFzJNopJc8H1gzzSBGTovcsahMiX/jDIgohUqUyd1WYrhDLRYOpYBhzQMzfFKaoOUiTKs+UGm+b0MmWZ7wjT7l5gmyqprmSYqc0j4F/VLygDTHI4PwqEy7rsbJ9mBabZvhzPT4Y2sGiPkF2QYNR/qAv8c2p2Uoub9dcPhVTD8BMhbC7TPXqAbXpABqRxP3qg8vkDXT8cX8k5kwD7X9xdox+Oeyu8XaHl/6L5uWNPMZXjh7rqTfZtXMM2ha9vsHe+uh1HojrI+k4EIRmZXF6Q4MvmFLY3CUTZkMnyx/K2ROWRn6jw7k8jaaUpknJ3pT7Mzw9B9nZ0Jsm6TXZGd8X7G7V5VJT9zlDWZAD9MMXT1rq5jcpZJHTvN8htZ9aEF2peguURoftnPVPt3Afpp95EJewE0kzLq+/TslG0E8kyzPe6e9bRZ7zcC2aQX6WU6sll12dK5UmV8X9UYxeGMMv4tVocfAnboZ9wmK5WicKaSW12W3jCc2Vp0TkkOZ6LMsQzDGWCzsb3rAs3t1UYlfHYmvMWkTBpoxjeRtkAzebOJAs3hlkhVEmj6XsLuQA40k/YumjNm2wnmMzEufBMNaYGnAKaQXibMGQUQ1GpPX8iJ0uOa5sk6pzAX8plLlen/U2VeNLPGCnkws+LnZrbJPmFmUrqEfXBaqcTPNNoocz7VFPkHpoYIAGRgLixlZTYpJpFiqimTIQCAXm5r7+oXG0SAZl3EbKMI0Cw3mTezzET5ewB+zpiTjKY+edlBR8llu5rEL8hZcJp53TBnss2l+w2n3s9UOt/VdInTtC7dNOocAcCuUEIjvcpyOGPyupaVSVoEGc+ZvPZOhq/mNJcsA1a/IWf0MahD3YrJWZXL+gMRqw7krHqfnHkKkJd+nvsXZD2tIeWyGxCDqc+l+E3MfSdnsv6K3bMpR5oTIjbPR1mybMfkLF0G9NJ0eS97ge4L2XwROTuhzcsJbT77TswJQ4bhmsdXvjtzlIXvzlye0GjfSWh0h4TG3O0rn8jenDNPUk3n0DzuZe+mmvayS6D5tSTgdJIEPCdnw6tJwPr6JCBtBIp8Bv9HoYt1G59hWZPJLK82W5vyGZIO2OLGZ+JGoNiLl3WbDP99eaCJe305qATuokKgqZQwFDVH2Vd8BpU5CTTdQcabUPXlfCbuN8MlP0URclzyg//IghTUh2XA9rh5jpR5suE0l3Wb7CPLgLQWE5QRyfpMUGa3PtMmKzFhfcYrc7Y+k8vwnRov+8wezc8qU5woU1yuTAxpZVCGWGX4YLiXqU2WUIBk5cxuytjnW4Gpu6DMB2hztHBglTwKOGdMeFlOFpZHRknz0zmzLZ3H1TRlk8+3+Dlz2adadkxzxypxA6fEVFPjpEmYJkHzCdNEZb5mmu4gc1duaoibQ4hMBlYpN5kMScAsoTG0p9mZTHqy3YS2pXg0M9Fs3QdebXwaAWThjNiY5u7VRk+b5UlGM7su3xwk/Psz7zPNkFfkCEDT/LD4Xb6nMvwKekUjI7e6LGUzM9Hbl1r692eSCCDKTIgAjL5iVxOMdlXV8TvN+C/aKFdF6RMZR81JXZYi09y1yMuAX8q4vQuYJn6zOSWBzCpT4S3IctF4rIvbGqd9ZWaVt/ZL2a3t3maaYcNpLLzzc86Eye7SL0TzbsNpIluPnSx5J1dsOPWfpR6G+L1aWihdxiH8lsj6TMZbgbe6UXpocaA9wzvZlMq45nTNMmBe2hOmeZQBpzxnmgdp479wumOa/eVM837GNKexeUGGaHYgdgah+RWm2R0I2xXQfPIuwEvKOO80f8k0O4DRzL3Jy5hm2MxjU1ZpdzIbZTYwzbRukA5pizZ/5SSVdU0ZrrMfYZoaWCUHlQI3NEeZy2XEDG/92P6IadpU1qEyn2aasnA+3E+Z5k52AdPs+OAD90GmqYUP95G7+BfoUOZymXS/IWfZV4KCMte/QJcxzahMwjR3su+Zpv2KaSbK2Otpc8Y0TWSVmWxMZN9TgEAqzphmqowRH1jT9FaP65dhsks+lzjIxigTwk91DwBhzuQAcNyj6ag9uq5IAMDX/ADTBMQpc1Z5JgtMs/0J01RBhtexMuE6Vyr5iY+1FZi8YAcpnsv0ZmYm34Ry20nPtpsg0+xGMjN19XaT30UATzcC5dKwpql2TBNf8nQfWNPET/P5pUXcPUXzw22C0kVZ6dcq8SoyqHqrm0izFp0L65dl6KC0uqaRCYIL1zTr/Pv8p2ua7UGG5xG+HDVvazFNWOec+KyA5roNp2Fb4wnTjALchdiFNU1/JYmmfd1U2iUyYJV9m8iQiQ64J/KWdNHisVmXfRFo9m9YTvEolmnkFy/n002or34UNG4u9S3yUTELf78ndnD5miaeNjTMdAgIn2Czjih8vqZ5thX4RDoxc+W2Bj5f6M6HyMUOrl7TrKqKDuaMJ9ngqXw3PgaqfX1N82TO+E6qquYT8sIpJ3TsH3dw0ZrmRqUsKZMsk4+9PyfzBJrVOdNszskZo3VZcwdkVGhc1IG7cE0z5h/xWc/++B828QXTGPSt5d2apticpsilt4M0Zi9DB3NMy2Bn/vTY65ymM3So3UTzJBrZynMHT2Yr+ctz4dN6xD92zOU7PoPnPtM5xocOlg5P8rsknPFGgQfKPfhkrXCiFZ9wBdoMt/q4dF6e5wBOpGxmJfbHbd4fSQd4uhR0cE1Cg/dK47GNjweMfJidfJaTP5FsuLXTkG7SpjOf+qHLjyTy0jaV4vvOODLgJvnIs9DBmndQVW/mmu/b981a0oxOYcPT4hCk+wkPVgPDvsPYjMvYpp8so9O4+BN8X0vpM3ogavHsxYU7mLiDATtYqQPQ5pZ830z9XJnRv3KCOD/AHdNTW0f6fh/eBmV/SUPSOvczHXuUrv9WitHDOKB7nxGV1+HQAR6RN9ArJ8vvlVnp7Dk/5CsdoAeTsa78sYzoFej0SjS59VCW9IS1b8V0KN7CBxMnHQDo4Ml93AHewe+UwdPgwYr8eX++xXF3MmTd4sludKzbejg+cF1Pzr47k5IqPMJjm50aUKJ939mWoR+Amzse2Wl+ogwyc1d3OOX9RMdI6Y7Hw5ZZmpFOzXysPH7Hk8pOzipbn125zOsjnCu83UhZNTB1/WgiFExt9smkV5TRhcBt+3TYoY8q6bFVfOS4/+IAHn5COIGdRYtMz+47Naf7iemhg7z7s3Sd9Uc1WaPj0gq5UPQ5TSni9ocXtRGKTo+eOXBeaFz8Htft0C1ammWgoCj3dDJ8X7h9UNMvbSbHeuFv0AGaOx01ONIbEOJHutC3sfC47JYgckGNcOqJIj+tTlpF5/FiZyugePerQu9fzXi4aeMK5bIO6EiXbqX5AkB6o7yAKH5YsILBD3LUGGUgJnJqIztOjHZnuGYgoMCDvPcbbV8oFZ0HTDOySb6aFrThw5/BkkHZcFJ48fMSBhOj1XWhk9el3J8wJvAjH/Tk7o8vDrr7stQ9zjoCXWH37SuhSryDZeGRE079qhMR1lnWBzyX+YZvGu1b4u9ijPTkxqb8VT8QyED1+5xtn9gyNUKWMGvQNog8OPk7ZTTv3RvCrQpRiMM1+FnoqK5LX8x+oVhtbBVvtVLioAy+5GLRkBcECLjil8oUnFBt8bnfHwPmko/KKDp+gJXhVZaTY/ueFfyQpa5uE5lxj6B7PChPKG+INHaisKL4pTb0ScIJleEw4kwZTs+Bc17SD0i+VDDSMEGZ7hypBJ7f0FHiYe7ODPFyZRDvvDI/6Qxn3PfKFILAGSDvQmXElyOzkJn9XBn9vTLFJSMTqQDNGfPlnPmVMvjNn6/njOBNXKxM+74yEc3kiTKc7ycAwE9F/VgZXMlNgPcEzXC/bkSz4vcAwFSAoARv1eHa2HF6RnX9UW4/6aDgCAJZON7qKTTrTd3q134mriWu0f8ebpWcZocsEQ2xxLv7mTK6kFsEII4jA4ao/Zy89284TQYAS1g148YTuNd9U9IIG2OzWu5it9cggMIhfhj4XatduCRjbLbwku2v0UyjTTdjuFl61VTkExjgDpX1wGl/qkyAmBlvFgEkpcQUyOraK0ufb/uZGecPHqJWjWYwM5+Bpl3I8+AuYBdi2jCBrfyNIRNb5VlTOK1k6EA5Ymf4MGnknPgxlzngGXqamSegDeQtaAR3gmsF5P9/zAHpG87C1TdgRBPdrn+dUcQOlCfmMDjM/n+vC5kBP7mJtKmJMeEHZ7XeEp3zdGfoFurnY68kMyK834Hf4fQdSO6A8ja/HPn9rJEW3dqDs1e3uirjSrGjfAbnBum5/SjTuI0Njj3mf/hxVWX8nJ4ra8ykrhM8LHTJEFW/owydOmsxUcOpoAnzZsZbWH3rKBGEavZN+Tsj8JkgHHuAzPu4dSAr6GCkh7U8gPo5oeVbusStI5hDmygT2+JXRypcO237JeRswT60Fr9BGqikcOY9HpSUTzvAjOyDlHz4+OBNXfjk1BKsGkd7wcTj6HPN43z3yVPMZpmfpebSsTeYgqEOKNMbOhi4gwkTnSMfRyXeVUaECI1HAfORcVkTBaQLuqDfIg2MjTA1Zel8mhw7oIUTL+BkipHyXWUQvSDaq9DSKCe/JSQxPQhPDWwMdfm9PWOWzvGiCXVwTztYqYOfhrBf9cUrYWi7nBT0qTtOEvcI2PIdexaW33lYWIOsA4A5/lCFUlcow9krBC9cQ2Ej40Qr/oIvkTuKPN7pAMPtilaB0g4eoQNV/Djq+wqfcY0UF5sH3hfPKdW4GqzexRmh8UQD38Gy6wAXus1VutC84QwnwiXvoZgQc25NVToOP95+XlkHU+ygpg7UhbrgkR9W00Yp3xl3RQsQxll5weOyztCST9JByx3ol8flfzIV1KJzBTHLAAAAAElFTkSuQmCC";   // the Rumbu mark, background cleaned to white
const BR_NAVY = [31, 56, 100], BR_BLUE = [46, 117, 182], BR_INK = [33, 37, 41], BR_GREY = [107, 114, 128], BR_LINE = [210, 216, 226], BR_BAND = [243, 246, 251], BR_TINT = [221, 230, 243];
// The built-in PDF fonts cannot draw every character: swap the common ones and never let an odd character stop the file.
function brPdfSafe(v){
  let out = "";
  String(v == null ? "" : v).replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...").replace(/\u20A6/g, "NGN ").split("").forEach(ch => {
    const c = ch.charCodeAt(0);
    if((c >= 32 && c <= 126) || (c >= 160 && c <= 255)) out += ch;
    else if(c < 32) out += " ";
    else { const d = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); out += /^[\x20-\x7E]+$/.test(d) ? d : "?"; }
  });
  return out;
}
function brFit(doc, text, maxW, size, style){
  let t = brPdfSafe(text), sz = size; doc.setFont("helvetica", style || "normal"); doc.setFontSize(sz);
  while(doc.getTextWidth(t) > maxW && sz > 7){ sz -= 0.5; doc.setFontSize(sz); }
  if(doc.getTextWidth(t) > maxW){ while(t.length > 1 && doc.getTextWidth(t + "...") > maxW) t = t.slice(0, -1); t += "..."; }
  return t;
}
function brNow(){ const d = new Date(), w = brWat(d); return brPad(w.getUTCDate()) + " " + BR_MONTHS[w.getUTCMonth()] + " " + w.getUTCFullYear() + ", " + brPad(w.getUTCHours()) + ":" + brPad(w.getUTCMinutes()); }

// o = { me, title, subtitle, details: [[label, value], ...], tiles: [[label, value], ...], columns: [{ header, align, width }],
//       rows: [[text, ...], ...], total: [text, ...] | null, landscape, fileName, docTitle, emptyText }
// Draws page 1 with the full letterhead, later pages with a slim header, and "CONFIDENTIAL" and "Page X of Y" on every page.
// The last data row is drawn together with the TOTAL row, so a TOTAL row is never left alone on a page.
function brPdfReport(o){
  if(!(window.jspdf && window.jspdf.jsPDF)) return { error: BR_PDF_MSG };
  const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: o.landscape ? "landscape" : "portrait" });
  if(typeof doc.autoTable !== "function") return { error: BR_PDF_MSG };
  const W = o.landscape ? 297 : 210, H = o.landscape ? 210 : 297, MX = 14, CW = W - 2 * MX;
  const when = brNow(), who = brPdfSafe(o.me && o.me.username);
  const fill = c => doc.setFillColor(c[0], c[1], c[2]), ink = c => doc.setTextColor(c[0], c[1], c[2]), stroke = c => doc.setDrawColor(c[0], c[1], c[2]);
  const font = (st, sz) => { doc.setFont("helvetica", st); doc.setFontSize(sz); };

  // title
  font("bold", 16); ink(BR_NAVY); doc.text(brPdfSafe(o.title).toUpperCase(), MX, 45);
  if(o.subtitle){ font("normal", 9); ink(BR_GREY); doc.text(brPdfSafe(o.subtitle), MX, 50.5); }
  let y = 55;
  // details panel
  const items = (o.details || []).concat([["PREPARED BY", who], ["GENERATED", when]]);
  const cols = o.landscape ? 4 : 3, rowsN = Math.ceil(items.length / cols), ph = 6 + rowsN * 11 + 1, colW = (CW - 10) / cols;
  fill(BR_BAND); stroke(BR_LINE); doc.setLineWidth(0.25); doc.roundedRect(MX, y, CW, ph, 2, 2, "FD");
  items.forEach((it, i) => {
    const x = MX + 6 + (i % cols) * colW, yy = y + 6.5 + Math.floor(i / cols) * 11;
    font("bold", 7); ink(BR_BLUE); doc.text(brPdfSafe(it[0]).toUpperCase(), x, yy);
    const t = brFit(doc, it[1] === "" || it[1] == null ? "-" : it[1], colW - 5, 9.5, "bold"); ink(BR_INK); doc.text(t, x, yy + 5);
  });
  y += ph + 5;
  // summary tiles
  if(o.tiles && o.tiles.length){
    const n = o.tiles.length, gap = 4, w1 = n > 1 ? Math.min(70, CW * 0.3) : CW, w2 = n > 1 ? (CW - w1 - (n - 1) * gap) / (n - 1) : 0; let tx = MX;
    o.tiles.forEach((t, i) => {
      const w = i === 0 ? w1 : w2;
      if(i === 0){ fill(BR_NAVY); doc.roundedRect(tx, y, w, 17, 2, 2, "F"); } else { fill(BR_BAND); stroke(BR_LINE); doc.roundedRect(tx, y, w, 17, 2, 2, "FD"); }
      font("bold", 7); if(i === 0) doc.setTextColor(190, 208, 235); else ink(BR_GREY); doc.text(brPdfSafe(t[0]).toUpperCase(), tx + 5, y + 6.5);
      const v = brFit(doc, t[1], w - 10, 15, "bold"); if(i === 0) doc.setTextColor(255, 255, 255); else ink(BR_NAVY); doc.text(v, tx + 5, y + 13.5);
      tx += w + gap;
    });
    y += 17 + 7;
  } else y += 2;

  // table
  const rows = (o.rows || []).map(r => r.map(c => brPdfSafe(c)));
  const total = o.total ? o.total.map(c => brPdfSafe(c)) : null;
  if(!rows.length){
    font("normal", 10); ink(BR_GREY); doc.text(brPdfSafe(o.emptyText || "No records for these filters."), MX, y + 6);
  } else {
    const colStyles = {}; (o.columns || []).forEach((c, i) => { colStyles[i] = { halign: c.align || "left" }; if(c.width) colStyles[i].cellWidth = c.width; });
    const head = [(o.columns || []).map(c => ({ content: brPdfSafe(c.header).toUpperCase(), styles: { halign: c.align || "left" } }))];
    const WHITE = [255, 255, 255];
    const asBody = (r, i) => r.map((c, k) => ({ content: c, styles: { halign: (o.columns[k] || {}).align || "left", fillColor: i % 2 ? BR_BAND : WHITE, textColor: BR_INK, fontStyle: "normal" } }));
    let body, foot = null;
    if(total){ body = rows.slice(0, -1).map((r, i) => r); foot = [asBody(rows[rows.length - 1], rows.length - 1), total.map((c, k) => ({ content: c, styles: { halign: (o.columns[k] || {}).align || "left", fontStyle: "bold", fillColor: BR_TINT, textColor: BR_NAVY } }))]; }
    else body = rows;
    doc.autoTable({ theme: "plain", startY: y, head, body, foot: foot || undefined, showFoot: foot ? "lastPage" : "never", showHead: "everyPage", rowPageBreak: "avoid",
      margin: { left: MX, right: MX, top: 26, bottom: 22 }, columnStyles: colStyles,
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: { top: 2.3, bottom: 2.3, left: 2.6, right: 2.6 }, textColor: BR_INK, lineWidth: 0, overflow: "linebreak" },
      headStyles: { fillColor: BR_NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5, cellPadding: { top: 3, bottom: 3, left: 2.6, right: 2.6 } },
      alternateRowStyles: { fillColor: BR_BAND },
      didDrawCell: d => { if(d.section === "body" || (d.section === "foot" && d.row.index === 0)){ stroke(BR_LINE); doc.setLineWidth(0.2); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); } } });
  }

  // letterhead on page 1, slim header after, footer everywhere
  const pages = doc.internal.getNumberOfPages();
  for(let p = 1; p <= pages; p++){
    doc.setPage(p);
    if(p === 1){
      doc.addImage(BR_LOGO_PNG, "PNG", MX, 10, 17, 20);
      font("bold", 17); ink(BR_NAVY); doc.setCharSpace(0.5); doc.text("RUMBU INDUSTRIES GROUP", MX + 21, 19.5); doc.setCharSpace(0);
      font("normal", 8.5); ink(BR_GREY); doc.text("KM4, Hadejia Road, Kano State, Nigeria", MX + 21, 25.5);
      font("bold", 8); ink(BR_BLUE); doc.setCharSpace(0.4); doc.text("BOTTLE RUNNING HOURS", W - MX, 16, { align: "right" }); doc.setCharSpace(0);
      font("normal", 8.5); ink(BR_GREY); doc.text(brPdfSafe(o.docTitle || o.title), W - MX, 21.5, { align: "right" });
      fill(BR_NAVY); doc.rect(MX, 34, CW, 0.6, "F"); fill(BR_BLUE); doc.rect(MX, 33.6, 40, 1.4, "F");
    } else {
      font("bold", 9); ink(BR_NAVY); doc.text("RUMBU INDUSTRIES GROUP", MX, 13);
      font("normal", 8.5); ink(BR_GREY); doc.text("Bottle Running Hours  |  " + brPdfSafe(o.docTitle || o.title), W - MX, 13, { align: "right" });
      fill(BR_NAVY); doc.rect(MX, 16, CW, 0.4, "F"); fill(BR_BLUE); doc.rect(MX, 15.8, 24, 0.9, "F");
    }
    stroke(BR_LINE); doc.setLineWidth(0.25); doc.line(MX, H - 16, W - MX, H - 16);
    font("bold", 7.5); ink(BR_NAVY); doc.text("CONFIDENTIAL", MX, H - 10.5);
    font("normal", 7.5); ink(BR_GREY); doc.text("Rumbu Industries Group  |  Bottle Running Hours  |  " + when, W / 2, H - 10.5, { align: "center" });
    doc.text("Page " + p + " of " + pages, W - MX, H - 10.5, { align: "right" });
  }
  doc.setProperties({ title: brPdfSafe(o.docTitle || o.title), subject: "Bottle Running Hours", author: "Rumbu Industries Group", creator: "Rumbu Bottle Running Hours" });
  doc.save(o.fileName);
  return { doc };
}
function brFileName(parts){ return parts.filter(Boolean).map(p => String(p).trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")).filter(Boolean).join("_") + ".pdf"; }
