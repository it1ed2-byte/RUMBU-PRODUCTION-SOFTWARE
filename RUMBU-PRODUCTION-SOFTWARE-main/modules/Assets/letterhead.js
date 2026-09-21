/* Shared print letterhead for Rumbu reports.
   Injects a branded header that appears only when printing/saving to PDF.
   Auto-fills Branch, Title, date range and filters from the page's own
   fields at print time — no per-page wiring required. */
(function(){
  var BRANCH = { "Rumbu":"Rumbu Main Mat", "MamaSannu":"Mama Sannu", "Mama Sannu":"Mama Sannu",
                 "All":"All Branches", "":"All Branches" };

  function el(tag, cls, html){ var e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e; }

  function ensureHeader(){
    if(document.querySelector(".print-letterhead")) return;
    var lh = el("div","print-letterhead");
    lh.innerHTML =
      '<img class="pl-logo" src="../../assets/rumbu-logo.png" alt="">' +
      '<div class="pl-org"><div class="pl-name">RUMBU INDUSTRIES GROUP</div>' +
      '<div class="pl-addr">KM4, Hadejia Road, Kano State, Nigeria</div></div>' +
      '<div class="pl-meta"><div class="pl-branch" id="plBranch">Branch: —</div>' +
      '<div class="pl-date" id="plDate"></div></div>' +
      '<div class="pl-title" id="plTitle"></div>' +
      '<div class="pl-sub" id="plSub"></div>';
    document.body.insertBefore(lh, document.body.firstChild);
  }

  function val(id){ var e=document.getElementById(id); return e ? (e.value||"") : ""; }
  function labelFor(id){ var e=document.getElementById(id); if(!e) return ""; var o=e.options?e.options[e.selectedIndex]:null; return o?o.textContent.trim():(e.value||""); }

  function fill(){
    ensureHeader();
    // Title: prefer document.title, strip trailing " — ..." noise.
    var title = (document.title||"Report").replace(/\s*[—-]\s*Dashboard.*$/i,"").trim();
    var t=document.getElementById("plTitle"); if(t) t.textContent = title;

    // Branch: from #section / #workSection if present.
    var secRaw = val("section") || val("workSection");
    var b=document.getElementById("plBranch");
    if(b) b.textContent = "Branch: " + (BRANCH[secRaw] || secRaw || "All Branches");

    // Sub-line: date range + shift/group if those fields exist.
    var bits=[];
    var from=val("fromDate")||val("startDate")||val("workDate")||val("date");
    var to=val("toDate")||val("endDate");
    if(from && to) bits.push(from+" to "+to);
    else if(from) bits.push(from);
    var shift=labelFor("shift"); if(shift && shift!=="All") bits.push("Shift: "+shift);
    var grp=labelFor("group")||labelFor("groupName"); if(grp && grp!=="All") bits.push("Group: "+grp);
    var shed=labelFor("shed"); if(shed && shed!=="All") bits.push("Shed: "+shed);
    var s=document.getElementById("plSub"); if(s) s.textContent = bits.join("  \u00b7  ");

    // Date generated + by whom.
    var d=document.getElementById("plDate");
    if(d){
      var who = (typeof ME!=="undefined" && ME && (ME.username||ME.name)) ? (ME.username||ME.name) : "";
      d.innerHTML = "Generated: " + new Date().toLocaleString() + (who ? "<br>By: "+who : "");
    }
  }

  window.addEventListener("beforeprint", fill);
  // Safari/others: also fill on load so it's ready.
  window.addEventListener("load", function(){ setTimeout(ensureHeader, 300); });
})();
