// ─────────────────────────────────────────────────────────────────────
//  store-access.js — shared store rules for the Requests module.
//  Each page must already define SUPABASE_URL and authHeaders().
//
//  Who can REQUEST from a store:
//    • Super Admin: every active store
//    • Everyone else: active stores serving their branch(es),
//      plus stores they were granted in Store Setup (extra requesters)
//
//  Who can PROCESS a request:
//    • Super Admin: every request
//    • Everyone else: requests whose store type lists them as an approver
// ─────────────────────────────────────────────────────────────────────

async function rsGet(path){
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, { headers: authHeaders() });
  if(!r.ok) throw new Error(path.split("?")[0] + ": HTTP " + r.status + " — " + await r.text());
  return r.json();
}

function rsInList(values){
  // PostgREST in.(...) list, quoting values that contain spaces or commas
  return "(" + values.map(v => '"' + String(v).replace(/"/g, '\\"') + '"').join(",") + ")";
}

function rsIsSuper(ME){ return ME && ME.role === "super_admin"; }

// Stores this user may send requests to, sorted by name.
async function rsRequestableStores(ME){
  if(rsIsSuper(ME)){
    return rsGet("request_stores?select=id,name,branch&is_active=eq.true&order=name");
  }
  const byId = {};
  const branches = ME.sectionNames || [];
  if(branches.length){
    const own = await rsGet("request_stores?select=id,name,branch&is_active=eq.true&branch=in." +
                            encodeURIComponent(rsInList(branches)));
    own.forEach(s => byId[s.id] = Object.assign(s, { via: "branch" }));
  }
  const extra = await rsGet("request_store_extra_requesters?select=store_id&profile_id=eq." + ME.id);
  const extraIds = extra.map(x => x.store_id).filter(id => !byId[id]);
  if(extraIds.length){
    const more = await rsGet("request_stores?select=id,name,branch&is_active=eq.true&id=in.(" + extraIds.join(",") + ")");
    more.forEach(s => byId[s.id] = Object.assign(s, { via: "granted" }));
  }
  return Object.values(byId).sort((a, b) => a.name.localeCompare(b.name));
}

async function rsStoreTypes(storeId){
  return rsGet("request_store_types?select=id,type_name&store_id=eq." + storeId + "&order=type_name");
}

// Type ids this user approves. Returns null for Super Admin, meaning "all".
async function rsApproverTypeIds(ME){
  if(rsIsSuper(ME)) return null;
  const rows = await rsGet("request_store_type_approvers?select=type_id&profile_id=eq." + ME.id);
  return [...new Set(rows.map(r => r.type_id))];
}

// PostgREST filter fragment limiting requests to what this user may process.
// Returns "" for Super Admin, or null when the user approves nothing.
function rsApproverFilter(typeIds){
  if(typeIds === null) return "";
  if(!typeIds.length) return null;
  return "&store_type_id=in.(" + typeIds.join(",") + ")";
}

function rsCanProcess(typeIds, request){
  if(typeIds === null) return true;
  return request && request.store_type_id != null && typeIds.indexOf(request.store_type_id) !== -1;
}
