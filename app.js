(() => {
  // ===== 設定 =====
  const SHEETS_URL = window.SHEETS_URL || '';
  const SHEETS_KEY = window.SHEETS_KEY || '';

  // ===== 要素 =====
  const form = document.getElementById('form');
  const sendBtn = document.getElementById('sendBtn');
  const unlockBtn = document.getElementById('unlockBtn');
  const lockBtn   = document.getElementById('lockBtn');
  const unlockTimeEl = document.getElementById('unlockTime');
  const lockTimeEl   = document.getElementById('lockTime');
  const toast = document.getElementById('toast');

  // ===== ユーティリティ =====
  const qs = (s, root=document) => root.querySelector(s);
  const gv = (sel) => { const el = typeof sel==='string'? qs(sel): sel; return (el && el.value||'').trim(); };
  const showToast = (msg) => { toast.textContent = msg; toast.hidden = false; setTimeout(()=>toast.hidden=true, 1600); };

  // ===== 車両キー（station|plate_full|model 単位で分離保存） =====
  function vehicleKey(){
    const st = gv('[name="station"]');
    const pf = gv('[name="plate_full"]');
    const md = gv('[name="model"]');
    // include version to avoid cross-version storage collisions
    return `v7d:${encodeURIComponent(st)}|${encodeURIComponent(pf)}|${encodeURIComponent(md)}`;
  }

  // ===== 解錠/施錠 時刻 永続化（車両単位） =====
  function loadTimes(){
    const key = vehicleKey();
    try{
      const raw = localStorage.getItem(key+':times');
      if(raw){
        const t = JSON.parse(raw);
        unlockTimeEl.textContent = t.unlock||'--:--';
        lockTimeEl.textContent   = t.lock||'--:--';
      }else{
        unlockTimeEl.textContent='--:--';
        lockTimeEl.textContent='--:--';
      }
    }catch{
      unlockTimeEl.textContent='--:--';
      lockTimeEl.textContent='--:--';
    }
  }
  function saveTimes(){
    const key = vehicleKey();
    try{
      localStorage.setItem(key+':times', JSON.stringify({
        unlock: unlockTimeEl.textContent, lock: lockTimeEl.textContent
      }));
    }catch{}
  }
  function stampNow(target){
    const now = new Date();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    target.textContent = `${hh}:${mm}`;
    saveTimes();
  }

  // ===== 前回値表示（無い時はプレースホルダ） =====
  const FIELDS = [
    'tread_rf','pre_rf','dot_rf',
    'tread_lf','pre_lf','dot_lf',
    'tread_lr','pre_lr','dot_lr',
    'tread_rr','pre_rr','dot_rr'
  ];
  function fallbackFor(id){
    if(id.startsWith('tread')) return '-.-';
    if(id.startsWith('pre'))   return '---';
    return '----';
  }
  function showPrevPlaceholders(){
    document.querySelectorAll('.prev-val').forEach(span=>{
      const id = span.getAttribute('data-for');
      span.textContent = `(前回 ${fallbackFor(id)})`;
    });
  }
  function applyPrev(prev){
    FIELDS.forEach(id => {
      const span = document.querySelector(`.prev-val[data-for="${id}"]`);
      if(!span) return;
      const v = (prev && prev[id] != null && String(prev[id]).trim()!=='' ) ? prev[id] : fallbackFor(id);
      span.textContent = `(前回 ${v})`;
    });
  }

  // ===== 取得（GET / doGet） =====
  async function fetchSheetData(){
    const st = gv('[name="station"]');
    const md = gv('[name="model"]');
    const pf = gv('[name="plate_full"]');
    if(!(st||md||pf)) return; // 何も無ければ問い合わせない
    if(!SHEETS_URL) return;

    const u = new URL(SHEETS_URL);
    u.searchParams.set('key', SHEETS_KEY);
    u.searchParams.set('op','read');          // GAS側は実質未使用でも害なし
    u.searchParams.set('sheet','Tirelog');    // 同上
    if(st) u.searchParams.set('station', st);
    if(md) u.searchParams.set('model', md);
    if(pf) u.searchParams.set('plate_full', pf);
    u.searchParams.set('ts', Date.now());     // キャッシュ回避

    try{
      const res = await fetch(u.toString(), { cache:'no-store' });
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();

      // 規定圧（未入力時だけ上書き）
      const f = qs('[name="std_f"]'); const r = qs('[name="std_r"]');
      if(data.std_f && f && !f.value) f.value = data.std_f;
      if(data.std_r && r && !r.value) r.value = data.std_r;

      applyPrev(data.prev || {});
    }catch(err){
      console.warn('fetchSheetData failed', err);
      // 失敗時はプレースホルダのまま
    }
  }

  // ===== 送信（POST / doPost, x-www-form-urlencoded） =====
  async function postToSheet(){
    if(!SHEETS_URL){ showToast('送信先未設定'); return; }
    const payload = collectPayload();
    try{
      const body = new URLSearchParams();
      body.set('key', SHEETS_KEY);
      body.set('json', JSON.stringify(payload));

      const res = await fetch(SHEETS_URL, {
        method:'POST',
        headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
        body
      });
      if(!res.ok) throw new Error('HTTP '+res.status);

      const j = await res.json().catch(()=>({ok:true}));
      if(j && j.ok) showToast('送信完了'); else showToast('送信エラー');
    }catch(err){
      console.error(err);
      showToast('送信失敗');
    }
  }

  function collectPayload(){
    const obj = {
      station: gv('[name="station"]'),
      plate_full: gv('[name="plate_full"]'),
      model: gv('[name="model"]'),
      std_f: gv('[name="std_f"]'),
      std_r: gv('[name="std_r"]'),
      tread_rf: gv('#tread_rf'), pre_rf: gv('#pre_rf'), dot_rf: gv('#dot_rf'),
      tread_lf: gv('#tread_lf'), pre_lf: gv('#pre_lf'), dot_lf: gv('#dot_lf'),
      tread_lr: gv('#tread_lr'), pre_lr: gv('#pre_lr'), dot_lr: gv('#dot_lr'),
      tread_rr: gv('#tread_rr'), pre_rr: gv('#pre_rr'), dot_rr: gv('#dot_rr'),
      unlock: unlockTimeEl.textContent||'',
      lock:   lockTimeEl.textContent||'',
      operator: ''
    };
    return obj;
  }

  // URLに station/plate_full/model が含まれていたら自動セット
  function applyUrl(){
    const p = new URLSearchParams(location.search);
    const set = (name) => { const v = p.get(name); if(v){ const el = qs(`[name="${name}"]`); if(el){ el.value = v; } } };
    ['station','plate_full','model'].forEach(set);
  }

  // 変更監視：車両切替→時刻キーも切替、取得も即時
  function wire(){
    ['station','plate_full','model'].forEach(name =>{
      document.querySelectorAll(`[name="${name}"]`).forEach(el=>{
        const h = ()=>{ loadTimes(); fetchSheetData(); };
        el.addEventListener('change', h, {passive:true});
        el.addEventListener('input',  h, {passive:true});
      });
    });
    unlockBtn?.addEventListener('click', ()=> stampNow(unlockTimeEl));
    lockBtn?.addEventListener('click',   ()=> stampNow(lockTimeEl));
    sendBtn?.addEventListener('click',   postToSheet);
  }

  function init(){
    applyUrl();
    showPrevPlaceholders();
    loadTimes();          // 同一車両なら復元、切替なら空へ
    fetchSheetData();     // 規定圧＆前回値取得
    wire();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
