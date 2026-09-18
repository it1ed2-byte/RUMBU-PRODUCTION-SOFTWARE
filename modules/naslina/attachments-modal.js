// ============================================================
// Naslina Express — shared Attachments Preview Modal
// Lists every uploaded file for a request (grouped by which upload
// slot it came from) with an "Open" link per file, so anyone with
// view rights can check what was uploaded before deciding whether a
// reupload is needed. Files open in a new tab — the browser handles
// preview natively for PDFs/images, and downloads anything else.
//
// Include with: <script src="attachments-modal.js"></script>
// Usage: showAttachmentsModal(title, attachmentsArray)
//   attachmentsArray: rows from naslina_request_attachments
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
    .am-overlay{position:fixed;inset:0;background:rgba(15,23,42,.6);display:flex;
      align-items:flex-start;justify-content:center;z-index:9999;padding:40px 16px;
      overflow-y:auto;}
    .am-modal{background:var(--card);border-radius:14px;max-width:560px;width:100%;
      box-shadow:0 24px 64px rgba(0,0,0,.35);}
    .am-header{background:var(--heading,#12203c);color:#fff;padding:16px 22px;border-radius:14px 14px 0 0;
      display:flex;align-items:center;justify-content:space-between;gap:10px;}
    .am-header h3{margin:0;font-size:15px;font-weight:700;}
    .am-close{background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;
      line-height:1;padding:0 4px;opacity:.85;}
    .am-close:hover{opacity:1;}
    .am-body{padding:14px 22px 20px;max-height:65vh;overflow-y:auto;}
    .am-group{font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;
      color:var(--muted,#7286a3);margin:14px 0 6px;}
    .am-group:first-child{margin-top:0;}
    .am-file{display:flex;align-items:center;justify-content:space-between;gap:10px;
      background:var(--bg,#eef1f6);border:1px solid var(--line,#e2e7f0);border-radius:8px;
      padding:8px 12px;margin-bottom:6px;font-size:13px;}
    .am-file a{color:var(--accent,#2E75B6);font-weight:600;text-decoration:none;}
    .am-file a:hover{text-decoration:underline;}
    .am-empty{color:var(--muted,#7286a3);font-size:13px;padding:10px 0;}
  `;
  const styleTag = document.createElement("style");
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  function closeModal(overlay){
    if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

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
          bodyHtml += `<div class="am-file"><span>${f.file_name}</span><a href="${f.file_url}" target="_blank" rel="noopener">Open &rarr;</a></div>`;
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
    overlay.querySelector(".am-close").onclick = () => closeModal(overlay);
    overlay.addEventListener("click", e => { if(e.target === overlay) closeModal(overlay); });
  };
})();
