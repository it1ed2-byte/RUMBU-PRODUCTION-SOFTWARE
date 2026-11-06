/* ====================================================================
   FLAKES EXPORT FORM: shared helpers (steps, rules, dates, logging, uploads, PDFs)
   Used by forms.html, step-owners.html and activity-log.html.
   ==================================================================== */

/* ---------- the five steps, in order ---------- */
const FEF_STEPS = [
  { key:"details",          no:1, label:"Details",          alt:"Start" },
  { key:"delivery_details", no:2, label:"Delivery Details", alt:"Agbara Delivery Logistics" },
  { key:"shipping_info",    no:3, label:"Shipping Info" },
  { key:"weight_issue",     no:4, label:"Weight Issue",     conditional:true },
  { key:"completed",        no:5, label:"Completed" }
];
/* attachment limits (change here if needed) */
const FEF_MAX_FILE_MB = 25, FEF_MAX_FILES = 20;
const FEF_ACTIONS = {
  created:"Created form", saved:"Saved draft", submitted:"Submitted step", edited:"Edited step", completed:"Marked complete",
  commented:"Added comment", owner_added:"Owner added", owner_removed:"Owner removed", numbering_changed:"Form numbering changed"
};
function fefStepLabel(k){ const s = FEF_STEPS.find(x => x.key === k); return s ? s.label : (k || ""); }

/* ---------- small utilities ---------- */
function fefEsc(v){ return String(v == null ? "" : v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
const FEF_MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fefPad2(n){ return String(n).padStart(2,"0"); }
/* West Africa Time parts, whatever time zone the device is set to */
function fefWat(d){
  const o = {};
  new Intl.DateTimeFormat("en-GB", { timeZone:"Africa/Lagos", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23" })
    .formatToParts(d).forEach(p => { o[p.type] = p.value; });
  return { y:+o.year, m:+o.month, d:+o.day, hh:o.hour, mm:o.minute };
}
function fefFmtDT(iso){ if(!iso) return ""; const d0 = new Date(iso); if(isNaN(d0.getTime())) return String(iso); const p = fefWat(d0); return fefPad2(p.d) + " " + FEF_MON[p.m-1] + " " + p.y + ", " + p.hh + ":" + p.mm; }
function fefFmtDate(v){
  if(!v) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  if(m) return m[3] + " " + FEF_MON[+m[2]-1] + " " + m[1];
  return fefFmtDT(v).split(",")[0];
}
function fefStamp(){ return fefFmtDT(new Date().toISOString()) + " WAT"; }
function fefTodayYMD(){ const p = fefWat(new Date()); return p.y + "-" + fefPad2(p.m) + "-" + fefPad2(p.d); }
/* a calendar day in WAT, as UTC instants, for date range filters */
function fefDayStartISO(ymd){ return new Date(ymd + "T00:00:00+01:00").toISOString(); }
function fefDayEndISO(ymd){ return new Date(ymd + "T23:59:59.999+01:00").toISOString(); }
function fefNum(v){ if(v == null || v === "") return ""; const n = Number(v); return isNaN(n) ? String(v) : n.toLocaleString("en-GB", { maximumFractionDigits:2 }); }
function fefSize(b){ b = Number(b) || 0; return b >= 1048576 ? (b/1048576).toFixed(2) + " MB" : (Math.max(1, Math.round(b/1024))) + " KB"; }

/* ---------- weight rule ---------- */
/* Difference = Rumbu weighbridge weight minus delivery slip weight (net), to 2 decimals. */
function fefDiff(slip, wb){
  if(slip === "" || slip == null || wb === "" || wb == null) return null;
  const a = Number(slip), b = Number(wb);
  if(!isFinite(a) || !isFinite(b)) return null;
  return Math.round((b - a) * 100) / 100;
}
function fefWeightsDiffer(diff){ return diff !== null && diff !== undefined && Math.abs(diff) >= 0.005; }

/* ---------- step order and progress ---------- */
function fefNextStep(form){
  switch(form.current_step){
    case "details": return "delivery_details";
    case "delivery_details": return "shipping_info";
    case "shipping_info": return form.weight_issue_required ? "weight_issue" : "completed";
    case "weight_issue": return "completed";
    default: return null;
  }
}
/* The step just before the current one (null for the first), used for the "correct the last step" rule. */
function fefPrevStep(form){
  switch(form.current_step){
    case "delivery_details": return "details";
    case "shipping_info": return "delivery_details";
    case "weight_issue": return "shipping_info";
    case "completed": return form.weight_issue_required ? "weight_issue" : "shipping_info";
    default: return null;
  }
}
function fefApplicableSteps(form){
  return ["details","delivery_details","shipping_info"].concat(form.weight_issue_required ? ["weight_issue"] : []).concat(["completed"]);
}
function fefStepStatus(form, key){
  const done = form.steps_done || {};
  if(done[key]) return "completed";
  if(key === "weight_issue" && form.weight_issue_required === false) return "not_required";
  if(form.status === "in_progress" && form.current_step === key) return "in_progress";
  if(key === "weight_issue" && form.weight_issue_required == null) return "conditional";
  return "not_started";
}
function fefProgress(form){
  const steps = fefApplicableSteps(form), done = form.steps_done || {};
  const n = steps.filter(k => done[k]).length;
  const pct = Math.round(n / steps.length * 10000) / 100;
  return { done:n, total:steps.length, pct, text:pct.toFixed(2) + "%" };
}
function fefStatusLabel(s){ return { completed:"Completed", in_progress:"In progress", not_started:"Not started", not_required:"Not required", conditional:"Only if weights differ" }[s] || s; }

/* ---------- who may do what ---------- */
/* A "writer" super admin is itops3 or a full-access Super Admin. Viewers are read only. */
function fefIsWriterSuper(ME){ return !!ME && ME.role === "super_admin" && !ME.readOnly; }
function fefIsAdminLike(ME){ return !!ME && !ME.readOnly && (ME.role === "admin" || ME.role === "super_admin"); }
/* ctx = { ME, mySteps:Set }.  Returns { ok, reason } for editing/submitting a step of an existing form. */
function fefCanEdit(ctx, form, key){
  const ME = ctx.ME;
  if(ME.readOnly) return { ok:false, reason:"Your account is view only." };
  if(form.status === "completed") return { ok:false, reason:"This form is completed." };
  const isOwner = fefIsWriterSuper(ME) || ctx.mySteps.has(key);
  if(!isOwner) return { ok:false, reason:"You are not an owner of this step." };
  if(key === form.current_step) return { ok:true };
  if(key === fefPrevStep(form) && (form.steps_done || {})[key]) return { ok:true, correction:true };   // last step stays correctable until the next one is submitted
  const idx = FEF_STEPS.findIndex(s => s.key === key), cur = FEF_STEPS.findIndex(s => s.key === form.current_step);
  return { ok:false, reason: idx > cur ? "This step is not open yet." : "This step is closed. Only the previous step can still be corrected." };
}
function fefCanCreate(ctx){
  if(ctx.ME.readOnly) return { ok:false, reason:"Your account is view only." };
  return (fefIsWriterSuper(ctx.ME) || ctx.mySteps.has("details")) ? { ok:true } : { ok:false, reason:"You are not an owner of the Details step." };
}
function fefCanComment(ctx){ return !ctx.ME.readOnly && (fefIsAdminLike(ctx.ME) || ctx.mySteps.size > 0); }

/* ---------- activity log ---------- */
/* Never throws: a failed log line must not undo real work, but the caller is told. */
async function fefLog(sbc, ME, actorName, form, step, action, detail){
  try{
    const { error } = await sbc.from("fef_activity_log").insert({
      form_id: form ? form.id : null, form_no: form ? form.form_no : null, step: step || null, action,
      detail: detail ? String(detail).slice(0, 500) : null, actor_profile_id: ME.id, actor_name: actorName || ME.username
    });
    return error ? error.message : null;
  }catch(e){ return String(e.message || e); }
}

/* ---------- file uploads (existing pet-attachments bucket) ---------- */
async function fefUploadFiles(sbc, files, folder){
  const out = [];
  for(const f of files){
    const ext = (f.name.split(".").pop() || "bin").replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "bin";
    const path = "flakes-export/" + folder + "/" + Date.now() + "-" + Math.random().toString(36).slice(2) + "." + ext;
    const { error } = await sbc.storage.from("pet-attachments").upload(path, f);
    if(error) throw new Error("Upload failed for " + f.name + ": " + error.message);
    const { data } = sbc.storage.from("pet-attachments").getPublicUrl(path);
    out.push({ name:f.name, url:data.publicUrl, size:f.size || 0, type:f.type || "" });
  }
  return out;
}

/* ---------- PDF helpers ---------- */
const FEF_NAVY = [31,56,100], FEF_BLUE = [46,117,182];
function fefPdfSafe(v){
  if(v == null) return "";
  const repl = { "–":"-", "—":"-", "‘":"'", "’":"'", "“":'"', "”":'"', "…":"...", "›":">", "₦":"NGN ",
                 "Ɓ":"B", "ɓ":"b", "Ɗ":"D", "ɗ":"d", "Ƙ":"K", "ƙ":"k", "Ƴ":"Y", "ƴ":"y" };
  let out = "";
  for(const ch of String(v).normalize("NFC")){
    const c = ch.codePointAt(0);
    if((c >= 32 && c <= 126) || (c >= 160 && c <= 255)){ out += ch; continue; }
    if(c === 9 || c === 10 || c === 13){ out += " "; continue; }
    if(repl[ch] !== undefined){ out += repl[ch]; continue; }
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    out += (base && base !== ch && base.codePointAt(0) <= 255) ? base : "?";
  }
  return out;
}
function fefPdfLines(v){ return v == null ? "" : String(v).split("\n").map(fefPdfSafe).join("\n"); }   // like fefPdfSafe, but keeps line breaks
function fefFileName(parts){ return parts.filter(Boolean).map(p => String(p).replace(/[^A-Za-z0-9]+/g, " ").trim().split(" ").filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("_")).join("_") + ".pdf"; }
/* ====================================================================
   RUMBU LETTERHEAD for the PDFs: the same look as the Gate Pass and the Overtime documents
   (gradient band, rounded white logo box, company name and email, document badge, number strip),
   with the Step 6 style of tables (blue section titles, navy headers, bold totals).
   Change the three constants below to change the letterhead text everywhere.
   ==================================================================== */
const FEF_COMPANY = "Rumbu Industries Limited", FEF_EMAIL = "info@rumbuindustries.com", FEF_ADDRESS = "";
const FEF_LOGO_PATHS = ["../../icon-512.png", "../../icon-192.png"];       // the Rumbu logo files at the site root
const FEF_GREY = [209,213,219], FEF_PALE = [248,250,252], FEF_STRIPE = [240,244,250];
let FEF_LOGO_CACHE = null;
/* The logo is fetched from the site while the PDF is made. If it cannot be loaded the letterhead shows a plain "R" mark instead. */
async function fefLogoData(){
  if(FEF_LOGO_CACHE) return FEF_LOGO_CACHE;
  for(const p of FEF_LOGO_PATHS){
    try{
      const res = await fetch(p); if(!res.ok) continue;
      const blob = await res.blob();
      const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsDataURL(blob); });
      if(/^data:image\/png/.test(data)){ FEF_LOGO_CACHE = data; return data; }
    }catch(e){ /* try the next path */ }
  }
  return null;
}
function fefLogoBox(doc, logo, x, y, s, r){
  doc.setFillColor(255,255,255); doc.roundedRect(x, y, s, s, r, r, "F");
  let drawn = false;
  if(logo){ try{ const pad = Math.max(2, s * 0.06); doc.addImage(logo, "PNG", x + pad, y + pad, s - pad*2, s - pad*2); drawn = true; }catch(e){ drawn = false; } }
  if(!drawn){ doc.setFont("helvetica","bold"); doc.setFontSize(s * 0.62); doc.setTextColor(...FEF_NAVY); doc.text("R", x + s/2, y + s * 0.72, { align:"center" }); }
}
function fefGradient(doc, x, y, w, h, c1, c2){
  const n = 72;
  for(let i = 0; i < n; i++){
    const t = i / (n - 1), col = c1.map((v, k) => Math.round(v + (c2[k] - v) * t));
    doc.setFillColor(col[0], col[1], col[2]); doc.rect(x + w * i / n, y, w / n + 0.8, h, "F");
  }
}
/* The header band. Returns the y where it ends. */
function fefBand(doc, o){
  const S = fefPdfSafe, W = doc.internal.pageSize.getWidth(), BH = 88, MX = 36;
  fefGradient(doc, 0, 0, W, BH, FEF_NAVY, FEF_BLUE);
  fefLogoBox(doc, o.logo, MX, 17, 54, 7);
  const tx = MX + 54 + 16;
  doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(17); doc.text(S(FEF_COMPANY), tx, 38);
  doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor(214,224,240); doc.text(S(FEF_EMAIL), tx, 51);
  doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(255,255,255); doc.text(S(String(o.subtitle || "").toUpperCase()), tx, FEF_ADDRESS ? 63 : 66, { charSpace:0.8 });
  if(FEF_ADDRESS){ doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(214,224,240); doc.text(S(FEF_ADDRESS), tx, 76); }
  // the document badge and number, on the right
  const label = S(String(o.badge || "").toUpperCase()); doc.setFont("helvetica","bold"); doc.setFontSize(10);
  const bw = doc.getTextWidth(label) + label.length * 1.2 + 26, bx = W - MX - bw;
  doc.setFillColor(77,138,193); doc.setDrawColor(119,165,208); doc.setLineWidth(0.8); doc.roundedRect(bx, 24, bw, 24, 5, 5, "FD");
  doc.setTextColor(255,255,255); doc.text(label, bx + 13, 40, { charSpace:1.2 });
  if(o.docNo){ doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(225,233,245); doc.text(S(o.docNo), W - MX, 64, { align:"right" }); }
  return BH;
}
/* The number strip under the band. Returns the y where it ends. */
function fefStrip(doc, y, left, right){
  const S = fefPdfSafe, W = doc.internal.pageSize.getWidth(), MX = 36, h = 26;
  doc.setFillColor(...FEF_STRIPE); doc.rect(0, y, W, h, "F");
  doc.setDrawColor(...FEF_BLUE); doc.setLineWidth(2); doc.line(0, y + h, W, y + h);
  doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(...FEF_NAVY); doc.text(S(left), MX, y + 17);
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(85,85,85); doc.text(S(right), W - MX, y + 17, { align:"right" });
  return y + h + 1;
}
/* A section title in the house style: small blue capitals over a blue rule. Returns the y to continue from. */
function fefSection(doc, y, text){
  const W = doc.internal.pageSize.getWidth(), MX = 36;
  doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...FEF_BLUE); doc.text(fefPdfSafe(String(text).toUpperCase()), MX, y, { charSpace:0.8 });
  doc.setDrawColor(...FEF_BLUE); doc.setLineWidth(1.2); doc.line(MX, y + 5, W - MX, y + 5);
  return y + 13;
}
/* The pale fact box (like the Form No / Branch / Date box on the Step 6 page). Returns the y below it. */
function fefInfoBox(doc, y, items){
  const W = doc.internal.pageSize.getWidth(), MX = 36, CW = W - MX * 2, pad = 10, lh = 15, maxW = CW - pad * 2, S = fefPdfSafe;
  doc.setFontSize(9);
  const toks = items.filter(it => it[1] !== undefined && it[1] !== null && String(it[1]) !== "").map(it => ({ l:S(it[0]) + ": ", v:S(it[1]) }));
  doc.setFont("helvetica","normal"); const sep = doc.getTextWidth("   |   ");
  const lines = [[]]; let cur = 0;
  toks.forEach(t => {
    doc.setFont("helvetica","bold"); const wl = doc.getTextWidth(t.l); doc.setFont("helvetica","normal"); const w = wl + doc.getTextWidth(t.v);
    if(cur && cur + sep + w > maxW){ lines.push([]); cur = 0; }
    const x = cur ? cur + sep : 0; lines[lines.length - 1].push({ t, x, wl, sepX:cur ? cur : null }); cur = x + w;
  });
  const h = lines.length * lh + 10;
  doc.setFillColor(...FEF_PALE); doc.setDrawColor(...FEF_GREY); doc.setLineWidth(0.6); doc.roundedRect(MX, y, CW, h, 5, 5, "FD");
  lines.forEach((ln, i) => ln.forEach(p => {
    const ty = y + 8 + lh * i + 8;
    if(p.sepX !== null){ doc.setFont("helvetica","normal"); doc.setTextColor(150,150,150); doc.text("|", MX + pad + p.sepX + sep/2 - 1, ty); }
    doc.setFont("helvetica","bold"); doc.setTextColor(...FEF_NAVY); doc.text(p.t.l, MX + pad + p.x, ty);
    doc.setFont("helvetica","normal"); doc.setTextColor(30,30,30); doc.text(p.t.v, MX + pad + p.x + p.wl, ty);
  }));
  return y + h;
}
/* Shared table look: navy header, pale stripes, grey grid. */
function fefTableBase(extra){
  return Object.assign({ theme:"grid",
    styles:{ font:"helvetica", fontSize:9, cellPadding:{ top:5, bottom:5, left:7, right:7 }, textColor:[30,30,30], lineColor:FEF_GREY, lineWidth:0.5, overflow:"linebreak", valign:"top" },
    headStyles:{ fillColor:FEF_NAVY, textColor:[255,255,255], fontStyle:"bold", fontSize:8.5, lineColor:FEF_NAVY },
    footStyles:{ fillColor:FEF_STRIPE, textColor:FEF_NAVY, fontStyle:"bold", fontSize:9.5 },
    alternateRowStyles:{ fillColor:FEF_PALE }, rowPageBreak:"avoid", showFoot:"lastPage" }, extra);
}
/* Key / value table (like the Gate Pass "Pass Details"): a pale key column with a blue edge. rows: [k,v] full width, or [k1,v1,k2,v2]. */
function fefKvTable(doc, y, rows, TOP){
  const S = fefPdfSafe, W = doc.internal.pageSize.getWidth(), MX = 36, CW = W - MX * 2;
  const key = t => ({ content:S(t), key:true, styles:{ fontStyle:"bold", textColor:FEF_NAVY, fillColor:FEF_PALE } });
  const L = fefPdfLines;
  const body = rows.map(r => r.length === 2 ? [key(r[0]), { content:L(r[1] === "" || r[1] == null ? "-" : r[1]), colSpan:3 }]
                                            : [key(r[0]), { content:L(r[1] === "" || r[1] == null ? "-" : r[1]) }, key(r[2]), { content:L(r[3] === "" || r[3] == null ? "-" : r[3]) }]);
  doc.autoTable(fefTableBase({ startY:y, body, theme:"grid", alternateRowStyles:{ fillColor:[255,255,255] },
    columnStyles:{ 0:{ cellWidth:CW * 0.19 }, 1:{ cellWidth:CW * 0.31 }, 2:{ cellWidth:CW * 0.19 }, 3:{ cellWidth:CW * 0.31 } },
    margin:{ top:TOP, left:MX, right:MX, bottom:48 },
    didDrawCell:d => { if(d.section === "body" && d.cell.raw && d.cell.raw.key){ doc.setDrawColor(...FEF_BLUE); doc.setLineWidth(1.6); doc.line(d.cell.x + d.cell.width, d.cell.y, d.cell.x + d.cell.width, d.cell.y + d.cell.height); } } }));
  return doc.lastAutoTable.finalY;
}
/* The slim header on pages after the first, and the footer on every page. */
function fefFrame(doc, o){
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), MX = 36, S = fefPdfSafe, pages = doc.internal.getNumberOfPages();
  for(let i = 1; i <= pages; i++){
    doc.setPage(i);
    if(i > 1){
      fefGradient(doc, 0, 0, W, 30, FEF_NAVY, FEF_BLUE);
      fefLogoBox(doc, o.logo, MX, 5, 20, 3);
      doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(9.5); doc.text(S(FEF_COMPANY), MX + 28, 19);
      doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor(225,233,245); doc.text(S(o.title), W - MX, 19, { align:"right" });
    }
    doc.setDrawColor(200,208,220); doc.setLineWidth(0.5); doc.line(MX, H - 34, W - MX, H - 34);
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(110,110,110);
    doc.text("CONFIDENTIAL", MX, H - 22); doc.text(S(o.title), W / 2, H - 22, { align:"center" }); doc.text("Page " + i + " of " + pages, W - MX, H - 22, { align:"right" });
  }
}

async function fefShrinkImage(dataUrl, maxPx){
  try{
    if(typeof document === "undefined" || typeof Image === "undefined") return dataUrl;
    const probe = document.createElement("canvas"); if(!probe.getContext || !probe.getContext("2d")) return dataUrl;
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = dataUrl; });
    const big = Math.max(img.naturalWidth, img.naturalHeight), scale = Math.min(1, (maxPx || 1600) / big);
    // every JPEG goes through the canvas (the browser straightens phone photos stored sideways); only a small PNG is kept exactly as it is
    if(!/^data:image\/jpe?g/i.test(dataUrl) && scale >= 1 && dataUrl.length < 1200000) return dataUrl;
    const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(img.naturalWidth * scale)); cv.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const g = cv.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", 0.85);
  }catch(e){ return dataUrl; }
}
async function fefImageData(url){
  try{
    const ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), 12000) : null;
    const res = await fetch(url, ctl ? { signal:ctl.signal } : undefined);
    if(t) clearTimeout(t);
    if(!res.ok) return null;
    const blob = await res.blob();
    const raw = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsDataURL(blob); });
    return await fefShrinkImage(raw, 1600);
  }catch(e){ return null; }
}
/* only JPEG and PNG can be placed inside the PDF; every other file is listed with its link */
function fefIsImage(f){ return /^image\/(jpeg|png)$/.test(f.type || "") || (!f.type && /\.(jpe?g|png)$/i.test(f.name || "")); }

/* ---- the whole process: letterhead, fact box, key/value sections, the weight reconciliation (Step 6 style), progress, comments, attachments ---- */
/* ctx = { form, owners:{step:[names]}, comments:[{author_name,created_at,comment,step}] } */
async function fefBuildFormPdf(ctx){
  const { jsPDF } = window.jspdf, S = fefPdfSafe, form = ctx.form;
  const doc = new jsPDF({ orientation:"portrait", unit:"pt", format:"a4", compress:true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), MX = 36, CW = W - MX * 2, TOP = 46, BOTTOM = H - 48;
  const logo = await fefLogoData();
  const completed = form.status === "completed", prog = fefProgress(form);
  const starter = form.created_by_name || (form.steps_done && form.steps_done.details && form.steps_done.details.by) || "";
  let y = fefBand(doc, { logo, subtitle:"Flakes Export Form", badge:"Export Form", docNo:form.form_no });
  y = fefStrip(doc, y, form.form_no, "Form date: " + fefFmtDate(form.form_date) + "      Status: " + (completed ? "Completed" : "In progress"));
  y = fefInfoBox(doc, y + 12, [["Client", form.client_name], ["Picking slip", form.picking_slip_no], ["Vehicle", form.vehicle_number], ["Container", form.container_number],
    ["Current step", completed ? "Completed" : fefStepLabel(form.current_step)], ["Progress", prog.text], ["Started by", starter], ["Printed", fefStamp()]]) + 16;
  const need = h => { if(y + h > BOTTOM){ doc.addPage(); y = TOP; } };
  const section = t => { need(96); y = fefSection(doc, y, t); };
  const after = () => { y = doc.lastAutoTable.finalY + 16; };
  const files = arr => (arr && arr.length) ? arr.map(f => f.name + " (" + fefSize(f.size) + ")").join("\n") : "-";

  section("Details");
  y = fefKvTable(doc, y, [["Date", fefFmtDate(form.form_date), "Form No", form.form_no], ["Client Name", form.client_name, "Picking Slip No", form.picking_slip_no],
    ["Odoo Delivery, Picking & Packages Slip", files(form.odoo_slips)]], TOP) + 16;

  section("Delivery Details");
  y = fefKvTable(doc, y, [["Vehicle Number", form.vehicle_number, "Container Number", form.container_number], ["Bag(s) Quantity", fefNum(form.bags_quantity), "Weighbridge Attachment", files(form.weighbridge_attachments)]], TOP) + 16;

  // the breakdown table, laid out like "Cost by Department & Unit" on Step 6, with a bold total underneath
  section("Weight Reconciliation");
  const diff = form.weight_diff != null ? form.weight_diff : fefDiff(form.delivery_slip_weight_net, form.rumbu_weighbridge_weight);
  const differs = fefWeightsDiffer(diff), tone = diff == null ? FEF_NAVY : (differs ? [153,27,27] : [30,122,52]);
  doc.autoTable(fefTableBase({ startY:y,
    head:[["Item", "Source", "Weight / Quantity"]],
    body:[["Delivery slip weight (net)", "Odoo delivery slip", fefNum(form.delivery_slip_weight_net) === "" ? "-" : fefNum(form.delivery_slip_weight_net) + " kg"],
          ["Rumbu weighbridge weight", "Weighbridge ticket", fefNum(form.rumbu_weighbridge_weight) === "" ? "-" : fefNum(form.rumbu_weighbridge_weight) + " kg"],
          ["Bag(s)", "Delivery details", fefNum(form.bags_quantity) === "" ? "-" : fefNum(form.bags_quantity)]].map(r => r.map(S)),
    foot:[[{ content:"DIFFERENCE", colSpan:2, styles:{ halign:"right" } }, { content:diff == null ? "-" : (diff > 0 ? "+" : "") + fefNum(diff) + " kg", styles:{ halign:"right", textColor:tone } }]],
    columnStyles:{ 0:{ cellWidth:CW * 0.42 }, 1:{ cellWidth:CW * 0.33 }, 2:{ cellWidth:CW * 0.25, halign:"right" } },
    margin:{ top:TOP, left:MX, right:MX, bottom:48 },
    didDrawCell:d => { if(d.section === "foot"){ doc.setDrawColor(...FEF_BLUE); doc.setLineWidth(1.6); doc.line(d.cell.x, d.cell.y, d.cell.x + d.cell.width, d.cell.y); } } }));
  y = doc.lastAutoTable.finalY;
  doc.setFont("helvetica","italic"); doc.setFontSize(8); doc.setTextColor(110,110,110);
  doc.text(S("Difference = Rumbu weighbridge weight minus delivery slip weight (net). " + (diff == null ? "Not yet known." : (differs ? "The weights differ, so the Weight Issue step applies." : "The weights match."))), MX, y + 11);
  y += 28;

  section("Shipping Info");
  y = fefKvTable(doc, y, [["Bill of Lading Number", form.bill_of_lading_number, "Shipping Line Name", form.shipping_line_name], ["Shipping Documents", files(form.shipping_attachments)]], TOP) + 16;

  if(form.weight_issue_required){
    section("Weight Issue");
    y = fefKvTable(doc, y, [["Remark", form.weight_issue_remark], ["Attachments", files(form.weight_issue_attachments)]], TOP) + 16;
  }else if(form.weight_issue_required === false){
    section("Weight Issue");
    y = fefKvTable(doc, y, [["Result", "Not required. The delivery slip weight and the Rumbu weighbridge weight match."]], TOP) + 16;
  }

  need(190); y = fefSection(doc, y, "Progress");
  doc.autoTable(fefTableBase({ startY:y, head:[["Step", "Person", "Date and time", "Status"]],
    body:FEF_STEPS.map(s => { const st = fefStepStatus(form, s.key), d = (form.steps_done || {})[s.key];
      return [s.label, d ? d.by : ((ctx.owners && ctx.owners[s.key] && ctx.owners[s.key].length) ? ctx.owners[s.key].join(", ") : "Not assigned"), d ? fefFmtDT(d.at) : "", fefStatusLabel(st)].map(S); }),
    columnStyles:{ 0:{ cellWidth:CW * 0.2, fontStyle:"bold", textColor:FEF_NAVY }, 1:{ cellWidth:CW * 0.34 }, 2:{ cellWidth:CW * 0.24 }, 3:{ cellWidth:CW * 0.22 } },
    margin:{ top:TOP, left:MX, right:MX, bottom:48 } }));
  after();

  const comments = ctx.comments || [];
  need(80); y = fefSection(doc, y, "Comments");
  if(!comments.length){ doc.setFont("helvetica","italic"); doc.setFontSize(9.5); doc.setTextColor(110,110,110); doc.text("No comments", MX, y + 6); y += 26; }
  else{
    doc.autoTable(fefTableBase({ startY:y, head:[["From", "Date and time", "Step", "Comment"]],
      body:comments.map(c => [S(c.author_name || ""), S(fefFmtDT(c.created_at)), S(c.step ? fefStepLabel(c.step) : ""), fefPdfLines(c.comment || "")]),
      columnStyles:{ 0:{ cellWidth:CW * 0.2 }, 1:{ cellWidth:CW * 0.19 }, 2:{ cellWidth:CW * 0.14 }, 3:{ cellWidth:CW * 0.47 } }, margin:{ top:TOP, left:MX, right:MX, bottom:48 } }));
    after();
  }

  // attachments: pictures (JPEG, PNG) are embedded; every file is listed with its link
  const att = [];
  [["Odoo slip", form.odoo_slips], ["Weighbridge", form.weighbridge_attachments], ["Shipping", form.shipping_attachments], ["Weight issue", form.weight_issue_attachments]].forEach(([label, arr]) => (arr || []).forEach(f => att.push({ label, f })));
  if(att.length){
    need(120); y = fefSection(doc, y, "Attachments");
    for(const a of att){
      need(36);
      doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...FEF_NAVY); doc.text(S(a.label + ": " + a.f.name), MX, y + 4); y += 15;
      doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...FEF_BLUE); doc.textWithLink(S(a.f.url), MX, y, { url:a.f.url }); y += 12;
      if(fefIsImage(a.f)){
        const data = await fefImageData(a.f.url);
        if(data){
          try{
            const fmt = /^data:image\/png/.test(data) ? "PNG" : "JPEG", p = doc.getImageProperties(data);
            let w = Math.min(CW, 360), h = w * p.height / p.width; if(h > 330){ h = 330; w = h * p.width / p.height; }
            need(h + 14); doc.setDrawColor(...FEF_GREY); doc.setLineWidth(0.6); doc.rect(MX - 2, y - 2, w + 4, h + 4, "S"); doc.addImage(data, fmt, MX, y, w, h); y += h + 18; continue;
          }catch(e){ /* fall through to the note below */ }
        }
        doc.setFontSize(8); doc.setTextColor(150,60,60); doc.text("Image could not be embedded. Open the link above to view it.", MX, y); y += 14;
      }
      y += 6;
    }
  }
  fefFrame(doc, { logo, title:"Flakes Export Form: " + form.form_no });
  return doc;
}

/* ---- activity log report: letterhead, fact box, "Activity by Person and Step" with a grand total, then every action ---- */
/* opts = { title, periodText, filtersText, rows:[[date,form,step,action,detail,person]], records:[{person,step,at}], generatedBy } */
async function fefBuildActivityPdf(opts){
  const { jsPDF } = window.jspdf, S = fefPdfSafe;
  const doc = new jsPDF({ orientation:"landscape", unit:"pt", format:"a4", compress:true });
  const W = doc.internal.pageSize.getWidth(), MX = 36, CW = W - MX * 2, TOP = 46, n = opts.rows.length;
  const logo = await fefLogoData();
  let y = fefBand(doc, { logo, subtitle:"Flakes Export Form", badge:"Activity Log", docNo:opts.periodText });
  y = fefStrip(doc, y, opts.title.replace(/^Flakes Export Form:\s*/, ""), "Generated " + fefStamp() + (opts.generatedBy ? " by " + opts.generatedBy : "") + "      " + n + " record(s)");
  y = fefInfoBox(doc, y + 12, (opts.filters || []).concat([])) + 16;
  if(!n){
    doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(30,30,30); doc.text("No activity matches these filters.", MX, y + 8);
  }else{
    // breakdown: who did how much, at which step (like Department & Unit on Step 6)
    const order = {}; FEF_STEPS.forEach((s, i) => { order[s.label] = i; });
    const groups = {};
    (opts.records || []).forEach(r => { const k = (r.person || "") + "||" + (r.step || "-"); const g = groups[k] || (groups[k] = { person:r.person || "", step:r.step || "-", count:0, last:null }); g.count++; if(!g.last || new Date(r.at) > new Date(g.last)) g.last = r.at; });
    const list = Object.values(groups).sort((a, b) => a.person.localeCompare(b.person) || ((order[a.step] === undefined ? 99 : order[a.step]) - (order[b.step] === undefined ? 99 : order[b.step])));
    y = fefSection(doc, y, "Activity by Person and Step");
    doc.autoTable(fefTableBase({ startY:y, head:[["Person", "Step", "Actions", "Last activity"]],
      body:list.map(g => [g.person, g.step, String(g.count), fefFmtDT(g.last)].map(S)),
      foot:[[{ content:"GRAND TOTAL", colSpan:2, styles:{ halign:"right" } }, { content:String(list.reduce((t, g) => t + g.count, 0)), styles:{ halign:"right" } }, ""]],
      columnStyles:{ 0:{ cellWidth:CW * 0.34 }, 1:{ cellWidth:CW * 0.26 }, 2:{ cellWidth:CW * 0.12, halign:"right" }, 3:{ cellWidth:CW * 0.28 } },
      margin:{ top:TOP, left:MX, right:MX, bottom:48 },
      didDrawCell:d => { if(d.section === "foot"){ doc.setDrawColor(...FEF_BLUE); doc.setLineWidth(1.6); doc.line(d.cell.x, d.cell.y, d.cell.x + d.cell.width, d.cell.y); } } }));
    y = doc.lastAutoTable.finalY + 20;
    if(y > doc.internal.pageSize.getHeight() - 120){ doc.addPage(); y = TOP; }
    y = fefSection(doc, y, "Activity Detail");
    doc.autoTable(fefTableBase({ startY:y, head:[["Date and time", "Form", "Step", "Action", "Detail", "Person"]], body:opts.rows.map(r => r.map(S)), showHead:"everyPage",
      columnStyles:{ 0:{ cellWidth:94 }, 1:{ cellWidth:76 }, 2:{ cellWidth:94 }, 3:{ cellWidth:92 }, 5:{ cellWidth:140 } },
      margin:{ top:TOP, left:MX, right:MX, bottom:48 } }));
  }
  fefFrame(doc, { logo, title:opts.title });
  return doc;
}
