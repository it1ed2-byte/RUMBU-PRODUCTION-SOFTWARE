// ============================================================
// Naslina Express — shared Attachments Preview Modal
// Lists every uploaded file for a request (grouped by which upload
// slot it came from) with a "Preview" button per file. Preview opens
// a popup showing the actual file (image or PDF inline; anything else
// falls back to a download link inside the popup) — never a new tab.
// Closes on: the X button, clicking outside the popup, or Escape.
//
// Include with: <script src="attachments-modal.js"></script>
// Usage:
//   showAttachmentsModal(title, attachmentsArray)   // list + preview
//   previewFileDirect(url, name)                    // single-file popup,
//     for local/staged files not yet uploaded (blob: URLs work fine)
// ============================================================
(function(){
  const FIELD_LABELS = {
    request_form: "Request Form",
    other_document: "Other Relevant Document",
    proforma_invoice: "Pre-former Invoice",
    proforma_invoice_2: "Pre-former Invoice2",
    payment_slip: "Payment Slip",
    invoice: "Invoice",
    invoice_2: "Invoice 2"
  };

  const css = `
    .am-overlay,.pv-overlay{position:fixed;inset:0;background:rgba(15,23,42,.6);display:flex;
      align-items:flex-start;justify-content:center;z-index:9999;padding:40px 16px;
      overflow-y:auto;}
    .am-modal{background:var(--card);border-radius:14px;max-width:560px;width:100%;
      box-shadow:0 24px 64px rgba(0,0,0,.35);}
    .pv-modal{background:var(--card);border-radius:14px;max-width:720px;width:100%;
      box-shadow:0 24px 64px rgba(0,0,0,.35);}
    .am-header,.pv-header{background:var(--heading,#12203c);color:#fff;padding:16px 22px;border-radius:14px 14px 0 0;
      display:flex;align-items:center;justify-content:space-between;gap:10px;}
    .am-header h3,.pv-header h3{margin:0;font-size:15px;font-weight:700;word-break:break-word;}
    .am-close,.pv-close{background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;
      line-height:1;padding:0 4px;opacity:.85;flex:0 0 auto;}
    .am-close:hover,.pv-close:hover{opacity:1;}
    .am-body{padding:14px 22px 20px;max-height:65vh;overflow-y:auto;}
    .pv-body{padding:16px 22px 22px;max-height:75vh;overflow:auto;text-align:center;}
    .pv-body img{max-width:100%;max-height:65vh;border-radius:8px;}
    .pv-body iframe{width:100%;height:65vh;border:1px solid var(--line,#e2e7f0);border-radius:8px;background:#fff;}
    .pv-fallback{padding:30px 10px;color:var(--muted,#7286a3);font-size:13px;}
    .pv-fallback a{color:var(--accent,#2E75B6);font-weight:700;}
    .am-group{font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;
      color:var(--muted,#7286a3);margin:14px 0 6px;}
    .am-group:first-child{margin-top:0;}
    .am-file{display:flex;align-items:center;justify-content:space-between;gap:10px;
      background:var(--bg,#eef1f6);border:1px solid var(--line,#e2e7f0);border-radius:8px;
      padding:8px 12px;margin-bottom:6px;font-size:13px;}
    .am-file button{background:none;border:none;color:var(--accent,#2E75B6);font-weight:600;
      cursor:pointer;font-size:13px;padding:0;font-family:inherit;}
    .am-file button:hover{text-decoration:underline;}
    .am-empty{color:var(--muted,#7286a3);font-size:13px;padding:10px 0;}
  `;
  const styleTag = document.createElement("style");
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  window._naslinaPreviewRegistry = [];

  function closeOnKey(e, overlay){
    if(e.key === "Escape") closeModal(overlay);
  }

  function closeModal(overlay){
    if(!overlay) return;
    if(overlay._escHandler) document.removeEventListener("keydown", overlay._escHandler);
    if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  function attachCloseBehaviors(overlay, closeBtn){
    const handler = (e) => closeOnKey(e, overlay);
    overlay._escHandler = handler;
    document.addEventListener("keydown", handler);
    closeBtn.onclick = () => closeModal(overlay);
    overlay.addEventListener("click", e => { if(e.target === overlay) closeModal(overlay); });
  }

  function isImage(name){ return /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(name || ""); }
  function isPdf(name){ return /\.pdf$/i.test(name || ""); }

  function buildPreviewBody(url, name){
    if(isImage(name)) return `<img src="${url}" alt="${name || "preview"}">`;
    if(isPdf(name)) return `<iframe src="${url}"></iframe>`;
    return `<div class="pv-fallback">This file type can't be shown inline.<br><a href="${url}" download="${name || ""}">Download ${name || "file"}</a></div>`;
  }

  window.previewFileDirect = function(url, name){
    const overlay = document.createElement("div");
    overlay.className = "pv-overlay";
    overlay.innerHTML = `
      <div class="pv-modal">
        <div class="pv-header"><h3>${name || "Preview"}</h3><button class="pv-close">&times;</button></div>
        <div class="pv-body">${buildPreviewBody(url, name)}</div>
      </div>`;
    document.body.appendChild(overlay);
    attachCloseBehaviors(overlay, overlay.querySelector(".pv-close"));
  };

  window.previewFileByIndex = function(idx){
    const f = window._naslinaPreviewRegistry[idx];
    if(!f) return;
    window.previewFileDirect(f.url, f.name);
  };

  window.showAttachmentsModal = function(title, attachments, fieldKeyFilter){
    const rows = (attachments || []).filter(a => !fieldKeyFilter || fieldKeyFilter.includes(a.field_key));
    const byField = {};
    rows.forEach(a => {
      if(!byField[a.field_key]) byField[a.field_key] = [];
      byField[a.field_key].push(a);
    });

    let bodyHtml = "";
    const orderedKeys = Object.keys(FIELD_LABELS).filter(k => byField[k] && byField[k].length);
    if(!orderedKeys.length){
      bodyHtml = `<div class="am-empty">No files uploaded yet.</div>`;
    } else {
      orderedKeys.forEach(key => {
        bodyHtml += `<div class="am-group">${FIELD_LABELS[key] || key}</div>`;
        byField[key].forEach(f => {
          const idx = window._naslinaPreviewRegistry.push({ url: f.file_url, name: f.file_name }) - 1;
          bodyHtml += `<div class="am-file"><span>${f.file_name}</span><button onclick="previewFileByIndex(${idx})">Preview</button></div>`;
        });
      });
    }

    const overlay = document.createElement("div");
    overlay.className = "am-overlay";
    overlay.innerHTML = `
      <div class="am-modal">
        <div class="am-header"><h3>${title || "Attachments"}</h3><button class="am-close">&times;</button></div>
        <div class="am-body">${bodyHtml}</div>
      </div>`;
    document.body.appendChild(overlay);
    attachCloseBehaviors(overlay, overlay.querySelector(".am-close"));
  };
})();
