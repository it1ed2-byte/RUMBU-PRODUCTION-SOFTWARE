// table-resolver.js
// -----------------------------------------------------------
// This table has been renamed twice already (matweaving -> Mat_Weaving ->
// mat_weaving), breaking every page that hardcoded the literal string. To
// stop that from happening a third time: every page that reads this table
// calls resolveWeavingTable() instead of hardcoding the name. It probes
// each name below (in order) with a cheap limit=1 read, remembers whichever
// one actually works for the rest of this browser tab's session, and only
// re-probes if that cached name ever stops working.
//
// If the table gets renamed again: add the new name to the TOP of this
// list, in this one file, and every page picks it up automatically —
// no more hunting through a dozen files under time pressure.
// -----------------------------------------------------------
const MW_TABLE_CANDIDATES = ["mat_weaving", "Mat_Weaving", "matweaving", "MAT_WEAVING", "Mat_weaving"];

async function resolveWeavingTable(){
  const cacheKey = "mw_table_name_v1";
  const cached = sessionStorage.getItem(cacheKey);
  if(cached){
    // Trust the cached name for this session, but verify it still works
    // before handing it out — cheap enough to check every call, and it
    // means a rename that happens WHILE someone has the page open still
    // self-heals on their next action instead of erroring until refresh.
    const ok = await probeTable(cached);
    if(ok) return cached;
    sessionStorage.removeItem(cacheKey);
  }
  for(const name of MW_TABLE_CANDIDATES){
    if(await probeTable(name)){
      sessionStorage.setItem(cacheKey, name);
      return name;
    }
  }
  throw new Error(
    "Could not find the Mat Weaving table under any known name (" +
    MW_TABLE_CANDIDATES.join(", ") +
    "). If it was renamed to something new, add that name to MW_TABLE_CANDIDATES at the top of table-resolver.js."
  );
}

async function probeTable(name){
  try{
    const res = await fetch(
      SUPABASE_URL + "/rest/v1/" + encodeURIComponent(name) + "?select=date_col&limit=1",
      { headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY } }
    );
    return res.ok;
  }catch(e){
    return false;
  }
}
