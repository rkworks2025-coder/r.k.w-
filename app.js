
// v5f — base from v4c with enhancements: persist stamp times and fetch presets/previous values from GAS
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbyo2U1_TBxvzhJL50GHY8S0NeT1k0kueWb4tI1q2Oaw87NuGXqwjO7PWyCDdqFNZTdz/exec';
const SHEETS_KEY = 'tl1';

// --- time helpers (JST) ---
function nowJST(){ 
  const d=new Date(); const utc=d.getTime()+d.getTimezoneOffset()*60000; const jst=new Date(utc+9*60*60000);
  const HH=String(jst.getHours()).padStart(2,'0'); const MM=String(jst.getMinutes()).padStart(2,'0');
  const mm=String(jst.getMonth()+1).padStart(2,'0'); const dd=String(jst.getDate()).padStart(2,'0');
  return mm+'/'+dd+' '+HH+':'+MM;
}
function nowHM(){ 
  const d=new Date(); const utc=d.getTime()+d.getTimezoneOffset()*60000; const jst=new Date(utc+9*60*60000);
  return String(jst.getHours()).padStart(2,'0')+':'+String(jst.getMinutes()).padStart(2,'0');
}

// --- query param prefill ---
document.addEventListener('DOMContentLoaded', ()=>{
  const usp = new URLSearchParams(location.search);
  const station = usp.get('station') || usp.get('s') || '';
  const model   = usp.get('model')   || usp.get('m') || '';
  const plate   = usp.get('plate')   || usp.get('p') || '';
  if (station) document.querySelector('[name="station"]').value = station;
  if (model)   document.querySelector('[name="model"]').value   = model;
  if (plate)   document.querySelector('[name="plate_full"]').value = plate;
});

// --- stamp buttons ---
const unlockBtn = document.getElementById('unlockBtn');
const lockBtn   = document.getElementById('lockBtn');
const unlockTimeEl = document.getElementById('unlockTime');
const lockTimeEl   = document.getElementById('lockTime');
const unlockNote   = document.getElementById('unlockNote');
const lockNote     = document.getElementById('lockNote');

function stamp(el, noteEl){
  const t = nowHM(); const prev = el.textContent;
  el.textContent = t;
  if (noteEl) {
    noteEl.textContent = (prev && prev!=='--:--') ? ('更新: '+t) : '記録しました';
    setTimeout(()=> noteEl.textContent='', 1200);
  }
}
if (unlockBtn) unlockBtn.addEventListener('click', ()=>{ stamp(unlockTimeEl, unlockNote); lockBtn?.focus(); });
if (lockBtn)   lockBtn.addEventListener('click',   ()=>{ stamp(lockTimeEl,   lockNote);   document.getElementById('tread_rf')?.focus(); });

// --- auto-format / auto-advance ---
const order = ['tread_rf','pre_rf','dot_rf','tread_lf','pre_lf','dot_lf','tread_lr','pre_lr','dot_lr','tread_rr','pre_rr','dot_rr'];
function focusNext(currId){
  const i = order.indexOf(currId);
  if (i>=0 && i<order.length-1) { const next = document.getElementById(order[i+1]); if(next){ next.focus(); next.select?.(); } }
  else if (i===order.length-1) { const btn = document.getElementById('submitBtn'); if(btn){ btn.classList?.add('focus-ring'); btn.focus(); setTimeout(()=>btn.classList?.remove('focus-ring'),1200); } }
}
function autoFormatTread(el){ // "55" → "5.5"
  let v = (el.value||'').replace(/[^0-9]/g,'');
  if (/^\d{2}$/.test(v)) { el.value = v[0]+'.'+v[1]; focusNext(el.id); }
  else { el.value = v; }
}
function autoAdvancePressure(el){ // >=3桁で次へ
  const v = (el.value||'').replace(/[^0-9]/g,''); el.value = v;
  if (v.length>=3) focusNext(el.id);
}
function autoAdvanceDOT(el){ // 4桁固定
  const v = (el.value||'').replace(/[^0-9]/g,'').slice(0,4); el.value = v;
  if (v.length===4) focusNext(el.id);
}
['rf','lf','lr','rr'].forEach(pos=>{
  document.getElementById('tread_'+pos)?.addEventListener('input', e=>autoFormatTread(e.target));
  document.getElementById('pre_'+pos)?.addEventListener('input',   e=>autoAdvancePressure(e.target));
  document.getElementById('dot_'+pos)?.addEventListener('input',   e=>autoAdvanceDOT(e.target));
});

// --- toast ---
function showToast(msg){
  const t = document.getElementById('toast'); if(!t) return;
  t.textContent = msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1400);
}

// --- send to GAS ---
async function postToSheet(payload){
  try{
    if(!SHEETS_URL){ showToast('送信しました'); return; }
    const body = new URLSearchParams();
    if (SHEETS_KEY) body.set('key', SHEETS_KEY);
    body.set('json', JSON.stringify(payload));
    await fetch(SHEETS_URL, { method:'POST', body });
  }catch(_){}
  showToast('送信しました');
}

// --- form submit / result view ---
const form = document.getElementById('form');
const resultCard = document.getElementById('resultCard');
const resHeader = document.getElementById('res_header');
const resTimes  = document.getElementById('res_times');
const resLines  = document.getElementById('res_lines');

function gv(sel){ return document.querySelector(sel)?.value || ''; }
function g(id)  { return document.getElementById(id)?.value || ''; }

function buildPayload(){
  return {
    station: gv('[name="station"]'),
    model:   gv('[name="model"]'),
    plate_full: gv('[name="plate_full"]'),
    std_f: gv('[name="std_f"]'),
    std_r: gv('[name="std_r"]'),
    unlock: unlockTimeEl?.textContent || '',
    lock:   lockTimeEl?.textContent   || '',
    tread_rf: g('tread_rf'), pre_rf: g('pre_rf'), dot_rf: g('dot_rf'),
    tread_lf: g('tread_lf'), pre_lf: g('pre_lf'), dot_lf: g('dot_lf'),
    tread_lr: g('tread_lr'), pre_lr: g('pre_lr'), dot_lr: g('dot_lr'),
    tread_rr: g('tread_rr'), pre_rr: g('pre_rr'), dot_rr: g('dot_rr'),
  };
}

if (form) form.addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  const p = buildPayload();
  const lines = [
    `${p.tread_rf} ${p.pre_rf} ${p.dot_rf}${(p.std_f&&p.std_r)?`    ${p.std_f}-${p.std_r}`:''}   RF`,
    `${p.tread_lf} ${p.pre_lf} ${p.dot_lf}   LF`,
    `${p.tread_lr} ${p.pre_lr} ${p.dot_lr}   LR`,
    `${p.tread_rr} ${p.pre_rr} ${p.dot_rr}   RR`,
    '',
    nowJST()
  ].join('\n');

  // 結果画面更新（stationも先頭に）
  resHeader.textContent = (p.station? (p.station+'\n') : '') + p.plate_full + '\n' + p.model;
  resTimes.innerHTML = `解錠　${p.unlock||'--:--'}<br>施錠　${p.lock||'--:--'}`;
  resLines.textContent = lines;

  form.style.display = 'none';
  resultCard.style.display = 'block';
  window.scrollTo({ top:0, behavior:'smooth' });

  await postToSheet(p);
});

document.getElementById('backBtn')?.addEventListener('click',()=>{
  resultCard.style.display='none';
  form.style.display='block';
  window.scrollTo({top:0,behavior:'smooth'});
});

// --- reload recovery module (1 block; Safari-safe, guarded) ---
(function(){
  let isRestoring = false;
  const dq = (s)=>document.querySelector(s);
  const getVal = (sel)=>{ const el=dq(sel); return el? (el.value||'').trim() : ''; };
  const enc = (s)=>encodeURIComponent(s);

  function getKey(){
    const station = getVal('[name="station"],#station');
    const plate   = getVal('[name="plate_full"],#plate_full');
    if(!station || !plate) return null;
    return 'tireapp:'+enc(station)+'|'+enc(plate);
  }
  function snapshot(){
    const data = {};
    document.querySelectorAll('input, textarea, select').forEach(el=>{
      const id = el.id || el.name;
      if(!id) return;
      data[id] = (el.type==='checkbox'||el.type==='radio') ? !!el.checked : el.value;
    });
    return data;
  }
  function applySnapshot(data){
    if(!data) return;
    isRestoring = true;
    try{
      Object.keys(data).forEach(k=>{
        const el = document.querySelector('#'+CSS.escape(k)+', [name="'+k+'"]');
        if(!el) return;
        if(el.type==='checkbox'||el.type==='radio'){
          el.checked = !!data[k];
        }else{
          const prev = el.value;
          el.value = data[k];
          const isStation = (k==='station' || k==='plate_full');
          if(!isStation && prev !== el.value){
            try { el.dispatchEvent(new Event('input', {bubbles:true})); } catch(_){}
            try { el.dispatchEvent(new Event('change', {bubbles:true})); } catch(_){}
          }
        }
      });
    } finally {
      isRestoring = false;
    }
  }
  function save(){
    if(isRestoring) return;
    const key = getKey();
    if(!key) return;
    try{ sessionStorage.setItem(key, JSON.stringify(snapshot())); }catch(e){}
  }
  function restoreIfAny(){
    if(isRestoring) return;
    const key = getKey();
    if(!key) return;
    try{
      const raw = sessionStorage.getItem(key);
      if(!raw) return;
      applySnapshot(JSON.parse(raw));
    }catch(e){}
  }

  // Save hooks
  document.querySelectorAll('input, textarea, select').forEach(el=>{
    el.addEventListener('input', save, {passive:true});
    el.addEventListener('change', save, {passive:true});
  });
  // Restore hooks
  const st = dq('[name="station"],#station');
  const pl = dq('[name="plate_full"],#plate_full');
  st && st.addEventListener('input', restoreIfAny, {passive:true});
  pl && pl.addEventListener('input', restoreIfAny, {passive:true});
  st && st.addEventListener('change', restoreIfAny, {passive:true});
  pl && pl.addEventListener('change', restoreIfAny, {passive:true});

  document.addEventListener('DOMContentLoaded', restoreIfAny);
})();
// --- end reload recovery module ---


// === tireapp reload-restore module (v3t-equivalent, isolated, enhanced time restore) ===
(function(){
  if (window.__tireAppReloadRestoreLoaded) return;
  window.__tireAppReloadRestoreLoaded = true;

  const TTL_MS = 24*60*60*1000; // 24h
  const NS = 'tireapp';
  const LAST_KEY = NS + ':lastKey'; // sessionStorage per-tab
  const TIME_IDS = ['unlockTime','lockTime'];

  function dq(sel){ return document.querySelector(sel); }
  function now(){ return Date.now(); }
  function enc(s){ return encodeURIComponent(s || ''); }
  function keyFor(st, pl){ return `${NS}:${enc(st)}|${enc(pl)}`; }

  function valOf(selector){
    const el = document.querySelector(selector);
    if (!el) return '';
    return (el.value || '').trim();
  }
  function getStation(){ return valOf('[name="station"],#station'); }
  function getPlate(){ return valOf('[name="plate_full"],#plate_full'); }

  function currentKey(){
    const st = getStation();
    const pl = getPlate();
    if (!st || !pl) return null;
    return keyFor(st, pl);
  }

  function snapshotForm(){
    const data = {};
    document.querySelectorAll('input, textarea, select').forEach(el=>{
      const id = el.id || el.name;
      if(!id) return;
      const v = (el.type === 'checkbox' || el.type === 'radio') ? !!el.checked : el.value;
      data[id] = v;
    });
    // capture display-only time texts (unlockTime, lockTime)
    TIME_IDS.forEach(id => {
      const el = document.getElementById(id);
      if(el) data[id] = (el.textContent || '').trim();
    });
    return { t: now(), data };
  }

  function saveDraft(){
    const k = currentKey();
    if (!k) return;
    try{
      const snap = snapshotForm();
      localStorage.setItem(k, JSON.stringify(snap));
      sessionStorage.setItem(LAST_KEY, k);
    }catch(e){ /* ignore quota/private mode */ }
  }

  function expired(ts){ return (now() - ts) > TTL_MS; }

  function applySnapshot(obj){
    if (!obj || !obj.data) return false;
    let applied = false;
    for (const k in obj.data){
      const selector = '#' + CSS.escape(k) + ', [name="'+k+'"]';
      const el = document.querySelector(selector);
      if (!el) continue;
      if (el.type === 'checkbox' || el.type === 'radio'){
        el.checked = !!obj.data[k];
      }else if ('value' in el){
        const prev = el.value;
        el.value = obj.data[k];
        if (k !== 'station' && k !== 'plate_full' && prev !== el.value){
          try{ el.dispatchEvent(new Event('input', {bubbles:true})); }catch(_){}
          try{ el.dispatchEvent(new Event('change', {bubbles:true})); }catch(_){}
        }
      }
      applied = true;
    }
    // restore display-only time texts if present (first pass)
    try{
      TIME_IDS.forEach(id =>{
        if(obj.data && obj.data[id] && String(obj.data[id]).length){
          const el = document.getElementById(id);
          if(el) el.textContent = obj.data[id];
        }
      });
    }catch(e){}
    // schedule second pass after potential initializers run
    setTimeout(()=>{
      try{
        TIME_IDS.forEach(id =>{
          if(obj.data && obj.data[id] && String(obj.data[id]).length){
            const el = document.getElementById(id);
            if(el && (!el.textContent || !el.textContent.trim())) el.textContent = obj.data[id];
          }
        });
      }catch(e){}
    }, 60);
    return applied;
  }

  function readDraftByKey(k){
    try{
      const raw = localStorage.getItem(k);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.t || expired(obj.t)) return null;
      return obj;
    }catch(e){ return null; }
  }

  function tryRestoreByKey(k){
    const obj = readDraftByKey(k);
    if (!obj) return false;
    return applySnapshot(obj);
  }

  function isReloadNav(){
    try{
      const navs = performance.getEntriesByType && performance.getEntriesByType('navigation');
      if (navs && navs[0] && navs[0].type) return navs[0].type === 'reload';
    }catch(e){}
    try{
      if (performance && performance.navigation) return performance.navigation.type === 1;
    }catch(e){}
    return false;
  }

  function restoreOnReload(){
    if (!isReloadNav()) return;
    const last = sessionStorage.getItem(LAST_KEY);
    if (!last) return;
    tryRestoreByKey(last);
    // extra pass on load to win against late initializers
    window.addEventListener('load', ()=>{
      const obj = readDraftByKey(last);
      if (obj) applySnapshot(obj);
    }, {once:true});
  }

  function restoreWhenKeyReady(){
    const k = currentKey();
    if (!k) return;
    tryRestoreByKey(k);
  }

  // watch time labels; when they change, save draft
  function observeTimeLabels(){
    TIME_IDS.forEach(id=>{
      const el = document.getElementById(id);
      if(!el) return;
      try{
        const mo = new MutationObserver(()=> saveDraft());
        mo.observe(el, {characterData:true, childList:true, subtree:true});
      }catch(e){}
    });
  }

  // attach lightweight listeners for save
  (function attach(){
    document.querySelectorAll('input, textarea, select').forEach(el=>{
      el.addEventListener('input', saveDraft, {passive:true});
      el.addEventListener('change', saveDraft, {passive:true});
    });
    window.addEventListener('pagehide', saveDraft, {passive:true});
    document.addEventListener('visibilitychange', ()=>{
      if (document.visibilityState === 'hidden') saveDraft();
    }, {passive:true});
  })();

  // bootstrap
  document.addEventListener('DOMContentLoaded', ()=>{
    observeTimeLabels();
    restoreOnReload();
    restoreWhenKeyReady();
    // one more microtask/frame to ensure times persist
    requestAnimationFrame(()=>{
      restoreWhenKeyReady();
    });
  }, {once:true});

  // react to key fields becoming available
  const stEl = dq('[name="station"],#station');
  const plEl = dq('[name="plate_full"],#plate_full');
  stEl && stEl.addEventListener('input', restoreWhenKeyReady, {passive:true});
  plEl && plEl.addEventListener('input', restoreWhenKeyReady, {passive:true});
  stEl && stEl.addEventListener('change', restoreWhenKeyReady, {passive:true});
  plEl && plEl.addEventListener('change', restoreWhenKeyReady, {passive:true});

})(); 
// === end reload-restore module ===

// ===== v5e: URL-forced identifiers + per-tab draft (sessionStorage) =====
(function(){
  var DKEY = 'tireapp_draft_v1';
  var SELS = {
    station: '#station, [name="station"]',
    model:   '#model, [name="model"]',
    plate:   '#plateFull, #fullNumber, #plate, [name="plate_full"], [name="plate"]',
  };

  function qs(sel){ return document.querySelector(sel); }
  function getVal(sel){
    var el = qs(sel); if (!el) return '';
    if ('value' in el) return el.value;
    return el.textContent || '';
  }
  function setVal(sel, v){
    var el = qs(sel); if (!el) return false;
    if ('value' in el){ el.value = v; try{ el.dispatchEvent(new Event('input', {bubbles:true})); }catch(e){}; return true; }
    el.textContent = v; return true;
  }

  function applyUrlIds(){
    var p = new URLSearchParams(location.search);
    var st = p.get('station') || '';
    var md = p.get('model')   || p.get('car_model') || '';
    var pf = p.get('plate_full') || p.get('plateFull') || p.get('full_plate') || p.get('plate') || p.get('p') || '';
    if (st) setVal(SELS.station, st);
    if (md) setVal(SELS.model,   md);
    if (pf) setVal(SELS.plate,   pf);
  }

  function anchor(){
    return {
      station: getVal(SELS.station),
      plate_full: getVal(SELS.plate)
    };
  }
  function sameAnchor(a,b){ return !!a && !!b && a.station===b.station && a.plate_full===b.plate_full; }

  function collectDraft(){
    var data = { ts: Date.now(), a: anchor(), fields:{} };
    var nodes = document.querySelectorAll('input, textarea, select');
    nodes.forEach(function(el){
      var id = el.id || el.name; if (!id) return;
      var idLower = id.toLowerCase();
      if (idLower.includes('station') || idLower.includes('plate') || idLower.includes('model')) return;
      if (el.type === 'checkbox' || el.type === 'radio'){
        data.fields[id] = el.checked ? '__checked__' : '__unchecked__';
      }else{
        data.fields[id] = el.value;
      }
    });
    var unlock = document.querySelector('#unlockTime, [data-role="unlockTime"]');
    var lock   = document.querySelector('#lockTime, [data-role="lockTime"]');
    if (unlock) data.fields.__unlockText = unlock.textContent || '';
    if (lock)   data.fields.__lockText   = lock.textContent   || '';
    return data;
  }

  function applyDraft(d){
    if (!d || !d.fields) return;
    Object.keys(d.fields).forEach(function(k){
      if (k === '__unlockText'){
        var u = document.querySelector('#unlockTime, [data-role="unlockTime"]');
        if (u) u.textContent = d.fields[k] || '';
        return;
      }
      if (k === '__lockText'){
        var l = document.querySelector('#lockTime, [data-role="lockTime"]');
        if (l) l.textContent = d.fields[k] || '';
        return;
      }
      var el = document.getElementById(k) || document.querySelector('[name="'+CSS.escape(k)+'"]');
      if (!el) return;
      if (el.type === 'checkbox' || el.type === 'radio'){
        el.checked = (d.fields[k] === '__checked__');
      }else{
        el.value = d.fields[k];
      }
      try{ el.dispatchEvent(new Event('input', {bubbles:true})); }catch(e){}
    });
  }

  function loadDraft(){
    try{
      var raw = sessionStorage.getItem(DKEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (!d || !d.a) return;
      if (!sameAnchor(d.a, anchor())){
        sessionStorage.removeItem(DKEY);
        return;
      }
      if (Date.now() - (d.ts||0) > 24*60*60*1000){
        sessionStorage.removeItem(DKEY);
        return;
      }
      applyDraft(d);
    }catch(e){}
  }

  function saveDraft(){
    try{
      var d = collectDraft();
      if (!d.a.station || !d.a.plate_full) return;
      sessionStorage.setItem(DKEY, JSON.stringify(d));
    }catch(e){}
  }

  function purgeDraft(){
    try{ sessionStorage.removeItem(DKEY); }catch(e){}
  }

  function wire(){
    document.addEventListener('input', function(){ saveDraft(); }, {passive:true});
    document.addEventListener('change', function(){ saveDraft(); }, {passive:true});
    window.addEventListener('pagehide', function(){ saveDraft(); });
    document.addEventListener('visibilitychange', function(){ if (document.visibilityState==='hidden') saveDraft(); });
    document.addEventListener('click', function(ev){
      var t = ev.target;
      if (!t) return;
      var txt = (t.textContent||'').trim();
      if (t.id && t.id.toLowerCase().includes('complete')) { purgeDraft(); }
      else if (t.dataset && (t.dataset.role==='complete' || t.dataset.action==='complete')) { purgeDraft(); }
      else if (txt === '完了' || txt === '結果表示' || txt.includes('完了')) { purgeDraft(); }
    }, true);
  }

  function init(){
    applyUrlIds();
    loadDraft();
    wire();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, {once:true});
  }else{
    init();
  }
  window.addEventListener('pageshow', function(ev){ if (ev.persisted){ init(); } });
})();
// ===== end v5e inject =====

// === v5f enhancements: persist unlock/lock times and fetch data from Google Sheets ===
(() => {
  // keys used for localStorage to persist unlock/lock times across reloads
  const UNLOCK_KEY = 'v5f_unlockTime';
  const LOCK_KEY   = 'v5f_lockTime';

  // on load, restore times if present
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const ut = localStorage.getItem(UNLOCK_KEY);
      if (ut && unlockTimeEl) unlockTimeEl.textContent = ut;
      const lt = localStorage.getItem(LOCK_KEY);
      if (lt && lockTimeEl)   lockTimeEl.textContent   = lt;
    } catch (e) {}
  }, { once: true });

  // helper to persist current times
  function persistTimes() {
    try {
      if (unlockTimeEl) localStorage.setItem(UNLOCK_KEY, unlockTimeEl.textContent || '');
      if (lockTimeEl)   localStorage.setItem(LOCK_KEY,   lockTimeEl.textContent   || '');
    } catch (e) {}
  }

  // attach persistence to stamp actions
  if (unlockBtn) unlockBtn.addEventListener('click', () => { persistTimes(); });
  if (lockBtn)   lockBtn.addEventListener('click',   () => { persistTimes(); });

  // debounced fetch timer
  let fetchTimer;

  // fetch predetermined pressures and previous values from GAS
  async function fetchSheetData() {
    // gather primary identifiers
    const station = gv('[name="station"]');
    const model   = gv('[name="model"]');
    const plate   = gv('[name="plate_full"]');
    // require at least one identifier
    if (!(station || model || plate)) return;
    try {
      const url = new URL(SHEETS_URL);
      if (SHEETS_KEY) url.searchParams.set('key', SHEETS_KEY);
      if (station) url.searchParams.set('station', station);
      if (model)   url.searchParams.set('model', model);
      if (plate)   url.searchParams.set('plate', plate);
      // explicit mode hint for GAS; gracefully ignored if unsupported
      url.searchParams.set('mode', 'fetch');
      const res = await fetch(url.toString());
      if (!res || !res.ok) return;
      let data;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!data || typeof data !== 'object') return;
      // populate standard pressures only if fields are empty
      if (data.std_f) {
        const el = document.querySelector('[name="std_f"]');
        if (el && !el.value) el.value = data.std_f;
      }
      if (data.std_r) {
        const el = document.querySelector('[name="std_r"]');
        if (el && !el.value) el.value = data.std_r;
      }
      // populate previous values for individual tires
      if (data.prev && typeof data.prev === 'object') {
        Object.keys(data.prev).forEach(key => {
          const val = data.prev[key];
          if (!val) return;
          const parts = key.split('_');
          if (parts.length !== 2) return;
          const field = parts[0];
          const pos   = parts[1];
          const inputId = `${field}_${pos}`;
          const inlineEl = document.getElementById(inputId)?.closest('.inline');
          if (!inlineEl) return;
          const capEl = inlineEl.querySelector('.cap');
          if (!capEl) return;
          // create or update the span for previous value
          let span = capEl.querySelector('.prev-val');
          if (!span) {
            span = document.createElement('span');
            span.className = 'prev-val';
            capEl.appendChild(span);
          }
          span.textContent = `(前回 ${val})`;
        });
      }
    } catch (e) {
      // ignore network or parsing errors silently
    }
  }

  // debounce wrapper to avoid excessive requests
  function debounceFetch() {
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(fetchSheetData, 350);
  }

  // attach listeners to fetch data when key fields change
  document.addEventListener('DOMContentLoaded', () => {
    ['station', 'model', 'plate_full'].forEach(name => {
      document.querySelectorAll(`[name="${name}"]`).forEach(el => {
        el.addEventListener('change', debounceFetch, { passive: true });
        el.addEventListener('input',  debounceFetch, { passive: true });
      });
    });
    // perform initial fetch in case URL params prefill fields
    debounceFetch();
  }, { once: true });
})();

