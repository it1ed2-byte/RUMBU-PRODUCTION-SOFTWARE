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
function fefFileName(parts){ return parts.filter(Boolean).map(p => String(p).replace(/[^A-Za-z0-9]+/g, " ").trim().split(" ").filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("_")).join("_") + ".pdf"; }
function fefRunningFrame(doc, title){
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), MX = 40;
  const pages = doc.internal.getNumberOfPages();
  for(let i = 1; i <= pages; i++){
    doc.setPage(i);
    doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(...FEF_NAVY);
    doc.text("RUMBU INDUSTRIES GROUP", MX, 30);
    doc.setFont("helvetica","normal"); doc.text(fefPdfSafe(title), W - MX, 30, { align:"right" });
    doc.setDrawColor(...FEF_BLUE); doc.setLineWidth(1); doc.line(MX, 38, W - MX, 38);
    doc.setDrawColor(200,208,220); doc.setLineWidth(0.5); doc.line(MX, H - 34, W - MX, H - 34);
    doc.setFontSize(8); doc.setTextColor(110,110,110);
    doc.text("CONFIDENTIAL", MX, H - 22);
    doc.text("Page " + i + " of " + pages, W - MX, H - 22, { align:"right" });
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

/* ---- the whole process, in the layout of the KissFlow report ---- */
/* ctx = { form, owners:{step:[names]}, comments:[{author_name,created_at,comment,step}], printedBy } */
async function fefBuildFormPdf(ctx){
  const { jsPDF } = window.jspdf;
  const form = ctx.form, doc = new jsPDF({ orientation:"portrait", unit:"pt", format:"a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), MX = 40, CW = W - MX*2, TOP = 56, BOTTOM = H - 48;
  const S = fefPdfSafe;
  let y = TOP + 14;
  const need = h => { if(y + h > BOTTOM){ doc.addPage(); y = TOP + 14; } };
  const starter = form.created_by_name || (form.steps_done && form.steps_done.details && form.steps_done.details.by) || "";

  doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.setTextColor(...FEF_NAVY);
  doc.text(S("Flakes Export Form: " + form.form_no), MX, y); y += 18;
  doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(90,90,90);
  doc.text(S("Started by " + (starter || "-") + (form.created_at ? " on " + fefFmtDT(form.created_at) : "")), MX, y); y += 16;

  // summary strip
  const prog = fefProgress(form), completed = form.status === "completed";
  const stepNow = completed ? "Completed" : fefStepLabel(form.current_step);
  doc.setFillColor(242,246,251); doc.setDrawColor(200,208,220); doc.roundedRect(MX, y, CW, 44, 4, 4, "FD");
  const cells = [["CURRENT STEP", stepNow, null], ["STATUS", completed ? "Completed" : "In progress", completed ? [30,122,52] : [180,95,6]], ["PROGRESS", prog.text, null], ["PRINTED ON", fefStamp(), null]];
  cells.forEach((c, i) => {
    const x = MX + 12 + i * (CW / 4);
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(110,110,110); doc.text(c[0], x, y + 16);
    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(...(c[2] || [30,30,30])); doc.text(S(c[1]), x, y + 32);
  });
  y += 62;

  const section = (title) => {
    need(76); if(y > TOP + 20) y += 12;
    doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(...FEF_NAVY); doc.text(title, MX, y);
    doc.setDrawColor(...FEF_BLUE); doc.setLineWidth(0.8); doc.line(MX, y + 4, W - MX, y + 4); y += 20;
  };
  // label above value, two columns; items with wide:true take the full width
  const kv = (items) => {
    let col = 0, rowH = 0, rowY = y;
    const flush = () => { y = rowY + rowH + 12; col = 0; rowH = 0; rowY = y; };
    for(const it of items){
      const wide = !!it.wide, w = wide ? CW : CW/2 - 10;
      doc.setFont("helvetica","normal"); doc.setFontSize(10);
      const raw = (it.value === "" || it.value == null) ? "-" : String(it.value);
      const lines = raw.split("\n").reduce((acc, part) => acc.concat(doc.splitTextToSize(S(part), w)), []);
      const h = 12 + lines.length * 12.5;
      if(wide && col === 1) flush();
      if(rowY + h > BOTTOM){ doc.addPage(); y = TOP + 14; rowY = y; col = 0; rowH = 0; }
      const x = MX + (wide ? 0 : col * (CW/2 + 10));
      doc.setFontSize(7.5); doc.setTextColor(110,110,110); doc.text(S(it.label).toUpperCase(), x, rowY + 8);
      doc.setFontSize(10); doc.setTextColor(30,30,30); doc.setFont("helvetica", it.bold ? "bold" : "normal"); doc.text(lines, x, rowY + 21);
      rowH = Math.max(rowH, h);
      if(wide || col === 1) flush(); else col = 1;
    }
    if(col === 1) flush();
  };
  const files = arr => (arr && arr.length) ? arr.map(f => f.name + " (" + fefSize(f.size) + ")").join("\n") : "-";

  section("DETAILS");
  kv([{ label:"Date", value:fefFmtDate(form.form_date) }, { label:"Form No", value:form.form_no, bold:true },
      { label:"Client Name", value:form.client_name }, { label:"Picking Slip No", value:form.picking_slip_no },
      { label:"Odoo Delivery, Picking & Packages Slip", value:files(form.odoo_slips), wide:true }]);
  section("DELIVERY DETAILS");
  kv([{ label:"Delivery Slip Weight (Net), kg", value:fefNum(form.delivery_slip_weight_net) }, { label:"Bag(s) Quantity", value:fefNum(form.bags_quantity) },
      { label:"Vehicle Number", value:form.vehicle_number }, { label:"Container Number", value:form.container_number },
      { label:"Rumbu Weighbridge Weight, kg", value:fefNum(form.rumbu_weighbridge_weight) },
      { label:"Weighbridge Attachment", value:files(form.weighbridge_attachments) }]);
  section("SHIPPING INFO");
  const diffTxt = form.weight_diff == null ? "-" : fefNum(form.weight_diff) + " kg";
  kv([{ label:"Bill of Lading Number", value:form.bill_of_lading_number }, { label:"Shipping Line Name", value:form.shipping_line_name },
      { label:"Difference between delivery slip weight and Rumbu weighbridge weight", value:diffTxt, wide:true, bold:true },
      { label:"Shipping Documents", value:files(form.shipping_attachments), wide:true }]);
  if(form.weight_issue_required){
    section("WEIGHT ISSUE");
    kv([{ label:"Remark", value:form.weight_issue_remark, wide:true }, { label:"Attachments", value:files(form.weight_issue_attachments), wide:true }]);
  }else if(form.weight_issue_required === false){
    section("WEIGHT ISSUE");
    kv([{ label:"Result", value:"Not required. The delivery slip weight and the Rumbu weighbridge weight match.", wide:true }]);
  }

  // progress table, like the KissFlow report; heading and all five rows stay together
  need(175);
  section("PROGRESS");
  const rows = FEF_STEPS.map(s => {
    const st = fefStepStatus(form, s.key), d = (form.steps_done || {})[s.key];
    const person = d ? d.by : ((ctx.owners && ctx.owners[s.key] && ctx.owners[s.key].length) ? ctx.owners[s.key].join(", ") : "Not assigned");
    return [s.label, person, d ? fefFmtDT(d.at) : "", fefStatusLabel(st)];
  });
  doc.autoTable({ startY:y, head:[["Step","Person","Date and time","Status"]], body:rows.map(r => r.map(S)), theme:"grid",
    styles:{ font:"helvetica", fontSize:9, cellPadding:5, textColor:[30,30,30], lineColor:[200,208,220], lineWidth:0.4, overflow:"linebreak", valign:"top" },
    headStyles:{ fillColor:FEF_NAVY, textColor:[255,255,255], fontStyle:"bold" }, alternateRowStyles:{ fillColor:[242,246,251] },
    columnStyles:{ 0:{ cellWidth:110, fontStyle:"bold" }, 2:{ cellWidth:105 }, 3:{ cellWidth:90 } },
    margin:{ top:TOP, left:MX, right:MX, bottom:52 }, rowPageBreak:"avoid" });
  y = doc.lastAutoTable.finalY + 22;

  section("COMMENTS");
  const comments = ctx.comments || [];
  if(!comments.length){ doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(110,110,110); doc.text("No comments", MX, y); y += 16; }
  for(const c of comments){
    doc.setFont("helvetica","normal"); doc.setFontSize(10);
    const lines = doc.splitTextToSize(S(c.comment), CW);
    need(28 + lines.length * 12.5);
    doc.setFont("helvetica","bold"); doc.setFontSize(8.5); doc.setTextColor(...FEF_NAVY);
    doc.text(S((c.author_name || "") + "  |  " + fefFmtDT(c.created_at) + (c.step ? "  |  " + fefStepLabel(c.step) : "")), MX, y); y += 13;
    doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(30,30,30); doc.text(lines, MX, y); y += lines.length * 12.5 + 10;
  }

  // attachments: images are embedded when they can be fetched; every file is listed with its link
  const att = [];
  [["Odoo slip", form.odoo_slips], ["Weighbridge", form.weighbridge_attachments], ["Shipping", form.shipping_attachments], ["Weight issue", form.weight_issue_attachments]].forEach(([label, arr]) => (arr || []).forEach(f => att.push({ label, f })));
  if(att.length){
    section("ATTACHMENTS");
    for(const a of att){
      need(34);
      doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...FEF_NAVY); doc.text(S(a.label + ": " + a.f.name), MX, y); y += 12;
      doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...FEF_BLUE); doc.textWithLink(S(a.f.url), MX, y, { url:a.f.url }); y += 12;
      if(fefIsImage(a.f)){
        const data = await fefImageData(a.f.url);
        if(data){
          try{
            const fmt = /^data:image\/png/.test(data) ? "PNG" : "JPEG", p = doc.getImageProperties(data);
            let w = Math.min(CW, 360), h = w * p.height / p.width; if(h > 330){ h = 330; w = h * p.width / p.height; }
            need(h + 14); doc.addImage(data, fmt, MX, y, w, h); y += h + 14; continue;
          }catch(e){ /* fall through to the note below */ }
        }
        doc.setFontSize(8); doc.setTextColor(150,60,60); doc.text("Image could not be embedded. Open the link above to view it.", MX, y); y += 14;
      }
      y += 6;
    }
  }
  fefRunningFrame(doc, "Flakes Export Form: " + form.form_no);
  return doc;
}

/* ---- activity log report (landscape, same Rumbu style as the IT Inventory reports) ---- */
/* opts = { title, periodText, filtersText, rows:[[date,form,step,action,detail,person]], generatedBy } */
function fefBuildActivityPdf(opts){
  const { jsPDF } = window.jspdf, S = fefPdfSafe;
  const doc = new jsPDF({ orientation:"landscape", unit:"pt", format:"a4" });
  const W = doc.internal.pageSize.getWidth(), MX = 36, n = opts.rows.length;
  let y = 72;
  doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.setTextColor(...FEF_NAVY); doc.text(S(opts.title), MX, y);
  y += 19; doc.setFontSize(11); doc.setTextColor(...FEF_BLUE); doc.text(S(opts.periodText), MX, y);
  y += 15; doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(80,80,80); doc.text(S(opts.filtersText), MX, y);
  y += 12; doc.text(S("Generated " + fefStamp() + (opts.generatedBy ? " by " + opts.generatedBy : "") + "   |   " + n + " record(s)"), MX, y);
  if(n){
    doc.autoTable({ startY:y + 14, head:[["Date and time","Form","Step","Action","Detail","Person"]], body:opts.rows.map(r => r.map(S)), theme:"grid",
      styles:{ font:"helvetica", fontSize:9, cellPadding:4, textColor:[30,30,30], lineColor:[200,208,220], lineWidth:0.4, overflow:"linebreak", valign:"top" },
      headStyles:{ fillColor:FEF_NAVY, textColor:[255,255,255], fontStyle:"bold", lineColor:FEF_NAVY }, alternateRowStyles:{ fillColor:[242,246,251] },
      columnStyles:{ 0:{ cellWidth:92 }, 1:{ cellWidth:76 }, 2:{ cellWidth:92 }, 3:{ cellWidth:92 }, 5:{ cellWidth:140 } },
      margin:{ top:58, left:MX, right:MX, bottom:46 }, rowPageBreak:"avoid", showHead:"everyPage" });
  }else{
    doc.setFontSize(10); doc.setTextColor(30,30,30); doc.text("No activity matches these filters.", MX, y + 30);
  }
  fefRunningFrame(doc, opts.title);
  return doc;
}
