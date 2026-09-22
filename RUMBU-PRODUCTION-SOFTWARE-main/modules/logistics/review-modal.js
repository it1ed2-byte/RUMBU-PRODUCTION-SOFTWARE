// ============================================================
// PET module — shared Review Modal
//
// One consistent, professional review popup used in two ways across
// the module:
//   1. "Review before submit" — a filler reviews everything they typed
//      before it actually goes to the next stage (catches mistakes).
//   2. "Review before approve/reject" — an approver must open the full
//      record and read it before a decision is possible; there is no
//      way to Approve/Reject without opening this modal first.
//
// Include with: <script src="review-modal.js"></script>
// ============================================================
(function(){
  const css = `
    .rm-overlay{position:fixed;inset:0;background:rgba(15,23,42,.6);display:flex;
      align-items:flex-start;justify-content:center;z-index:9999;padding:40px 16px;
      overflow-y:auto;}
    .rm-modal{background:var(--card);border-radius:14px;max-width:680px;width:100%;
      box-shadow:0 24px 64px rgba(0,0,0,.35);animation:rmIn .15s ease-out;}
    @keyframes rmIn{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:translateY(0);}}
    .rm-header{background:var(--heading);color:#fff;padding:16px 22px;border-radius:14px 14px 0 0;
      display:flex;align-items:center;justify-content:space-between;gap:10px;}
    .rm-header h3{margin:0;font-size:15px;font-weight:700;}
    .rm-header p{margin:2px 0 0;font-size:12px;opacity:.85;}
    .rm-close{background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;
      line-height:1;padding:0 4px;opacity:.85;}
    .rm-close:hover{opacity:1;}
    .rm-body{padding:18px 22px;max-height:60vh;overflow-y:auto;}
    .rm-section{font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;
      color:var(--heading);margin:16px 0 8px;padding-bottom:4px;border-bottom:2px solid var(--line);}
    .rm-section:first-child{margin-top:0;}
    .rm-row{display:flex;justify-content:space-between;gap:16px;padding:8px 0;
      border-bottom:1px solid var(--line);font-size:13px;}
    .rm-row:last-child{border-bottom:none;}
    .rm-row .rm-label{color:var(--muted);font-weight:600;flex-shrink:0;}
    .rm-row .rm-value{text-align:right;font-weight:600;color:var(--text);word-break:break-word;}
    .rm-row .rm-value a{color:var(--accent);}
    .rm-footer{padding:16px 22px;border-top:1px solid var(--line);}
    .rm-footer .rm-btns{display:flex;gap:10px;flex-wrap:wrap;}
    .rm-footer input{width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:8px;
      font-size:13px;margin-bottom:8px;font-family:inherit;background:var(--card);color:var(--text);}
    .rm-note-label{font-size:11px;color:var(--muted);margin-bottom:4px;display:block;}
  `;
  const styleTag = document.createElement("style");
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  function esc(v){
    if(v === null || v === undefined || v === "") return "—";
    return String(v);
  }
  function fileLink(url, label){
    if(!url) return "—";
    return `<a href="${url}" target="_blank" rel="noopener">${label || "View file"}</a>`;
  }

  function buildBodyHtml(sections){
    let html = "";
    sections.forEach(sec=>{
      if(sec.heading) html += `<div class="rm-section">${sec.heading}</div>`;
      (sec.rows||[]).forEach(row=>{
        const [label, value] = row;
        html += `<div class="rm-row"><span class="rm-label">${label}</span><span class="rm-value">${esc(value)}</span></div>`;
      });
    });
    return html;
  }

  function closeModal(overlay){
    if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  // mode: "submit" (Confirm & Submit / Go Back) or "decide" (Approve / Reject)
  window.showReviewModal = function(opts){
    const { title, subtitle, sections, mode } = opts;
    const overlay = document.createElement("div");
    overlay.className = "rm-overlay";

    let footerHtml = "";
    if(mode === "decide"){
      footerHtml = `
        <label class="rm-note-label">Rejection reason (required only if rejecting)</label>
        <input type="text" id="rmNote" placeholder="Explain what needs correcting...">
        <div class="rm-btns">
          <button id="rmApprove" style="background:var(--ok);">✔ Approve</button>
          <button id="rmReject" style="background:var(--bad);">✘ Reject</button>
          <button id="rmCancel" class="btn-ghost">Cancel</button>
        </div>`;
    } else {
      footerHtml = `
        <div class="rm-btns">
          <button id="rmConfirm" style="background:var(--ok);">✔ Confirm &amp; Submit</button>
          <button id="rmCancel" class="btn-ghost">← Go Back &amp; Edit</button>
        </div>`;
    }

    overlay.innerHTML = `
      <div class="rm-modal">
        <div class="rm-header">
          <div><h3>${title}</h3>${subtitle ? `<p>${subtitle}</p>` : ""}</div>
          <button class="rm-close" id="rmX">&times;</button>
        </div>
        <div class="rm-body">${buildBodyHtml(sections)}</div>
        <div class="rm-footer">${footerHtml}</div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector("#rmX").onclick = ()=>closeModal(overlay);
    overlay.querySelector("#rmCancel").onclick = ()=>closeModal(overlay);
    overlay.addEventListener("click", e=>{ if(e.target===overlay) closeModal(overlay); });

    if(mode === "decide"){
      overlay.querySelector("#rmApprove").onclick = ()=>{
        closeModal(overlay);
        if(opts.onApprove) opts.onApprove();
      };
      overlay.querySelector("#rmReject").onclick = ()=>{
        const note = overlay.querySelector("#rmNote").value.trim();
        if(!note){ alert("Rejection reason is required."); return; }
        closeModal(overlay);
        if(opts.onReject) opts.onReject(note);
      };
    } else {
      overlay.querySelector("#rmConfirm").onclick = ()=>{
        closeModal(overlay);
        if(opts.onConfirm) opts.onConfirm();
      };
    }
  };

  window.reviewModalFileLink = fileLink;
})();
