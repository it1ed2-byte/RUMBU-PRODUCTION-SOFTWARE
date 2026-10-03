// Shared read-only viewer for the overtime list (photo / PDF) that the Step 2
// filler attaches. Used by Steps 3 to 6. Needs auth.js (for `sb`) loaded first.
//   renderOvertimeAttachments("containerId", [{ id: <department entry id>, department: "Name" }, ...])
(function(){
  var BUCKET = "overtime-attachments";
  var REG = [];                       // paths of the files currently listed, by index

  function esc(s){
    return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }
  function fmtSize(b){ b = Number(b) || 0; return b >= 1048576 ? (b/1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b/1024)) + " KB"; }

  window.renderOvertimeAttachments = async function(containerId, entries){
    var wrap = document.getElementById(containerId);
    if(!wrap) return;
    var list = (entries || []).filter(function(e){ return e && e.id !== null && e.id !== undefined; });
    if(!list.length){ wrap.innerHTML = "<p class='empty'>No file attached.</p>"; return; }
    wrap.innerHTML = "<p class='loading'>Loading…</p>";
    try{
      var res = await sb.from("overtime_attachments").select("*")
        .in("department_entry_id", list.map(function(e){ return e.id; })).order("created_at");
      if(res.error) throw res.error;
      var rows = res.data || [];
      if(!rows.length){ wrap.innerHTML = "<p class='empty'>No file attached.</p>"; return; }
      var deptBy = {}; list.forEach(function(e){ deptBy[e.id] = e.department || ""; });
      var showDept = list.length > 1;
      var html = "<table><thead><tr>" + (showDept ? "<th>Department</th>" : "") + "<th>File</th><th>Size</th><th>Uploaded by</th><th></th></tr></thead><tbody>";
      rows.forEach(function(a){
        var idx = REG.push(a.file_path) - 1;
        html += "<tr>" + (showDept ? "<td>" + esc(deptBy[a.department_entry_id]) + "</td>" : "") +
          "<td>" + esc(a.file_name) + "</td><td>" + fmtSize(a.size_bytes) + "</td><td>" + esc(a.uploaded_by_username || "") + "</td>" +
          "<td><button class=\"mini\" onclick=\"event.stopPropagation();openOvertimeAttachment(" + idx + ")\">View</button></td></tr>";
      });
      html += "</tbody></table>";
      wrap.innerHTML = html;
    }catch(err){
      wrap.innerHTML = "<p class='status err'>❌ Could not load the attached list (" + esc(err.message || err) + ").</p>";
    }
  };

  window.openOvertimeAttachment = async function(idx){
    var path = REG[idx]; if(!path) return;
    var w = window.open("", "_blank");   // open first so pop-up blockers allow it
    var res = await sb.storage.from(BUCKET).createSignedUrl(path, 300);
    if(res.error || !res.data){ if(w) w.close(); alert("Could not open the file: " + (res.error ? res.error.message : "no link returned")); return; }
    if(w) w.location.href = res.data.signedUrl; else window.location.href = res.data.signedUrl;
  };
})();
