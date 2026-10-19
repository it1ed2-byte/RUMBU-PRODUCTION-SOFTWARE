// ─────────────────────────────────────────────────────────────────────
//  store-access.js — shared store rules for the Requests module.
//  Each page must already define SUPABASE_URL and authHeaders().
//
//  Who can REQUEST from a store:
//    • Super Admin: every active store
//    • Everyone else: active stores linked to any of their branches
//      (Store Setup → Branches), plus stores they were granted
//      as an extra requester
//
//  Who can PROCESS a store's requests:
//    • Super Admin: every store
//    • Everyone else: stores that list them as an approver
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
// Each store gets via: "branch" (linked to their branch) or "granted".
async function rsRequestableStores(ME){
  if(rsIsSuper(ME)){
    return rsGet("request_stores?select=id,name&is_active=eq.true&order=name");
  }
  const via = {};
  const branches = ME.sectionNames || [];
  if(branches.length){
    const links = await rsGet("request_store_branches?select=store_id&branch=in." + encodeURIComponent(rsInList(branches)));
    links.forEach(l => via[l.store_id] = "branch");
  }
  const extra = await rsGet("request_store_extra_requesters?select=store_id&profile_id=eq." + ME.id);
  extra.forEach(x => { if(!via[x.store_id]) via[x.store_id] = "granted"; });
  const ids = Object.keys(via);
  if(!ids.length) return [];
  const stores = await rsGet("request_stores?select=id,name&is_active=eq.true&id=in.(" + ids.join(",") + ")&order=name");
  return stores.map(s => Object.assign(s, { via: via[s.id] }));
}

// Store ids this user approves. Returns null for Super Admin, meaning "all".
async function rsApproverStoreIds(ME){
  if(rsIsSuper(ME)) return null;
  const rows = await rsGet("request_store_approvers?select=store_id&profile_id=eq." + ME.id);
  return [...new Set(rows.map(r => r.store_id))];
}

// PostgREST filter fragment limiting requests to the stores this user approves.
// Returns "" for Super Admin, or null when the user approves no store.
function rsApproverFilter(storeIds){
  if(storeIds === null) return "";
  if(!storeIds.length) return null;
  return "&store_id=in.(" + storeIds.join(",") + ")";
}

function rsCanProcess(storeIds, request){
  if(storeIds === null) return true;
  return request && request.store_id != null && storeIds.indexOf(request.store_id) !== -1;
}
