/**
 * IT Inventory: branches, departments and units
 * ------------------------------------------------------------
 * IT Inventory reads the SAME lists HR and Admin maintain:
 *     branches     app_sections
 *     departments  departments  (each belongs to a branch)
 *     units        units        (each belongs to a department)
 * so anything HR adds, renames or removes there shows up here straight away.
 * The old IT-only copies (it_ref_departments / it_ref_units) are no longer used. They are left in the
 * database untouched, and the devices keep the department / unit names they were saved with.
 *
 * loadOrgLists(sb) returns the shapes the pages already used, so their dropdown code did not need to change:
 *     { branches: [name],
 *       depts:    [{ id, branch, name }],
 *       units:    [{ id, branch, department, name }] }
 */

// Supabase returns at most 1000 rows per request, so read a table page by page.
async function itOrgFetchAll(sb, table, cols, orderCol){
  const PAGE = 1000;
  let all = [];
  for(let from = 0; ; from += PAGE){
    const { data, error } = await sb.from(table).select(cols).order(orderCol).range(from, from + PAGE - 1);
    if(error) throw new Error(table + ": " + error.message);
    all = all.concat(data || []);
    if(!data || data.length < PAGE) break;
  }
  return all;
}

function itOrgDedupe(list, keyFn){
  const seen = {};
  return list.filter(x => { const k = keyFn(x); if(seen[k]) return false; seen[k] = true; return true; });
}

async function loadOrgLists(sb){
  const [sec, depRows, unitRows] = await Promise.all([
    itOrgFetchAll(sb, "app_sections", "name", "name"),
    itOrgFetchAll(sb, "departments", "id,name,section", "name"),
    itOrgFetchAll(sb, "units", "id,name,department_id", "name")
  ]);
  const branches = sec.map(s => s.name);

  const deptAll = depRows.filter(d => d.section && d.name)
                         .map(d => ({ id: d.id, branch: d.section, name: String(d.name).trim() }));
  const deptById = {}; deptAll.forEach(d => { deptById[d.id] = d; });

  const unitAll = unitRows.filter(u => deptById[u.department_id] && u.name).map(u => {
    const d = deptById[u.department_id];
    return { id: u.id, branch: d.branch, department: d.name, name: String(u.name).trim() };
  });

  // the same name listed twice in the same place is shown once
  return {
    branches,
    depts: itOrgDedupe(deptAll, d => d.branch + "|" + d.name.toLowerCase()),
    units: itOrgDedupe(unitAll, u => u.branch + "|" + u.department.toLowerCase() + "|" + u.name.toLowerCase())
  };
}

/**
 * Selects a saved value in a dropdown WITHOUT ever losing it.
 * If the value is in the list (same spelling, or the same apart from capitals / extra spaces) that entry is
 * selected. If it is not in the list (for example a department that was only ever in the old IT list), it is
 * added as a "(not in HR list)" entry and selected, so editing the record can never silently erase it.
 */
function selectKeepingValue(sel, value){
  const v = (value == null ? "" : String(value)).trim();
  if(!v){ sel.value = ""; return; }
  const opts = Array.from(sel.options);
  const opt = opts.find(o => o.value === v) ||
              opts.find(o => o.value.trim().toLowerCase() === v.toLowerCase());
  if(opt){ sel.value = opt.value; return; }
  const legacy = new Option(v + "   (not in HR list)", v);
  sel.add(legacy);
  sel.value = v;
}
