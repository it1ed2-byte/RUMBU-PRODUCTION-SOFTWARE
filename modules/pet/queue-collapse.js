// queue-collapse.js
// Shared collapsible-queue behavior for PET Collection's Fill/Approval
// queues across the QC, Payment, and Production stages. A long queue used
// to sit fully expanded taking up the whole page; now it starts collapsed
// behind its title, with a count badge showing how many items are waiting
// — click the title to open it.
(function(){
  const style = document.createElement("style");
  style.textContent = `
    .panel-title.collapsible{cursor:pointer;display:flex;align-items:center;justify-content:space-between;user-select:none;}
    .panel-title.collapsible .queue-count{background:var(--accent);color:#fff;border-radius:20px;padding:2px 10px;font-size:12px;font-weight:800;margin-left:8px;}
    .panel-title.collapsible .queue-count.zero{background:var(--muted);}
    .panel-title.collapsible .queue-chev{transition:transform .15s;font-size:13px;color:var(--muted);}
    .panel-title.collapsible.open .queue-chev{transform:rotate(90deg);}
  `;
  document.head.appendChild(style);
})();

// Call this every time a queue's content is re-rendered (after loading, or
// after an approve/reject/submit refreshes it) — it resets the count badge
// but leaves the queue's current open/closed state alone so re-rendering
// doesn't force it shut on someone mid-review.
function setupCollapsibleQueue(titleElId, contentElId, count, labelText){
  const titleEl = document.getElementById(titleElId);
  const contentEl = document.getElementById(contentElId);
  if(!titleEl || !contentEl) return;

  const alreadyWired = titleEl.classList.contains("collapsible");
  const wasOpen = alreadyWired && contentEl.style.display !== "none";

  titleEl.classList.add("collapsible");
  const countClass = count > 0 ? "queue-count" : "queue-count zero";
  titleEl.innerHTML = `<span>${labelText} <span class="${countClass}">${count}</span></span><span class="queue-chev">&#9656;</span>`;

  if(!alreadyWired){
    contentEl.style.display = "none";
    titleEl.onclick = function(){
      const isOpen = contentEl.style.display !== "none";
      contentEl.style.display = isOpen ? "none" : "block";
      titleEl.classList.toggle("open", !isOpen);
    };
  } else {
    contentEl.style.display = wasOpen ? "block" : "none";
    titleEl.classList.toggle("open", wasOpen);
  }
}
