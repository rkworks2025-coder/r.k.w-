(() => {
  // ===== 設定 =====
  const SHEETS_URL = window.SHEETS_URL || '';
  const SHEETS_KEY = window.SHEETS_KEY || '';

  // ===== 要素 =====
  const form = document.getElementById('form');
  // submitBtn handles final submit to show result; sendBtn is not used in v7f
  const submitBtn = document.getElementById('submitBtn');
  const unlockBtn = document.getElementById('unlockBtn');
  const lockBtn   = document.getElementById('lockBtn');
  const unlockTimeEl = document.getElementById('unlockTime');
  const lockTimeEl   = document.getElementById('lockTime');
  const toast = document.getElementById('toast');

  // result card elements (for result view)
  const resultCard = document.getElementById('resultCard');
  const resHeader  = document.getElementById('res_header');
  const resTimes   = document.getElementById('res_times');
  const resLines   = document.getElementById('res_lines');
  const backBtn    = document.getElementById('backBtn');

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
    return `v7h:${encodeURIComponent(st)}|${encodeURIComponent(pf)}|${encodeURIComponent(md)}`;
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
    // return placeholder strings without decimal or spaces for compact display
    if(id.startsWith('tread')) return '--';
    if(id.startsWith('pre'))   return '---';
    return '----';
  }
  function showPrevPlaceholders(){
    // show placeholders as (xx) without spaces or "前回" to minimize width
    document.querySelectorAll('.prev-val').forEach(span=>{
      const id = span.getAttribute('data-for');
      span.textContent = `(${fallbackFor(id)})`;
    });
  }
  function applyPrev(prev){
    // apply previous values; display as (value) without spaces or "前回" to keep label one-line
    FIELDS.forEach(id => {
      const span = document.querySelector(`.prev-val[data-for="${id}"]`);
      if(!span) return;
      let v = '';
      // determine the raw value if present and non-empty
      let raw = null;
      if(prev && prev[id] != null && String(prev[id]).trim() !== ''){
        raw = prev[id];
      }
      if(raw === null){
        // fallback placeholder
        v = fallbackFor(id);
      } else {
        if(id.startsWith('tread')){
          // tread depth: ensure one decimal place (5 -> 5.0)
          const num = parseFloat(raw);
          if(!isNaN(num)){
            v = num.toFixed(1);
          }else{
            v = String(raw).trim();
          }
        }else if(id.startsWith('dot')){
          // DOT (manufacture week): pad to 4 digits with leading zeros
          const s = String(raw).trim();
          v = s.padStart(4, '0');
        }else{
          // other values (pressure): use as is
          v = String(raw).trim();
        }
      }
      span.textContent = `(${v})`;
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
    // sendBtn is unused in v7f; form submission handles sending
  }

  // ===== オートアドバンス =====
  // sequence of elements to focus in order, including standard pressure, tires and the unlock button
  const AUTO_SEQUENCE = [
    'std_f','std_r',
    'tread_rf','pre_rf','dot_rf',
    'tread_lf','pre_lf','dot_lf',
    'tread_lr','pre_lr','dot_lr',
    'tread_rr','pre_rr','dot_rr',
    'unlockBtn'
  ];

  // rules defining the expected length of input for each field; decimal:true indicates 0.1 precision (two digits)
  const FIELD_RULES = {
    std_f: {len:3},
    std_r: {len:3},
    tread_rf: {len:2, decimal:true},
    pre_rf: {len:3},
    dot_rf: {len:4},
    tread_lf: {len:2, decimal:true},
    pre_lf: {len:3},
    dot_lf: {len:4},
    tread_lr: {len:2, decimal:true},
    pre_lr: {len:3},
    dot_lr: {len:4},
    tread_rr: {len:2, decimal:true},
    pre_rr: {len:3},
    dot_rr: {len:4}
  };

  // convert two-digit tread input into a decimal with one decimal place
  function formatTread(raw){
    const num = parseInt(raw, 10);
    if(isNaN(num)) return '';
    return (num / 10).toFixed(1);
  }

  // current date/time in JST (MM/DD HH:mm)
  function nowJST(){
    const d = new Date();
    // convert to JST by adding timezone offset (9 hours)
    const utc  = d.getTime() + d.getTimezoneOffset() * 60000;
    const jst  = new Date(utc + 9 * 60 * 60000);
    const mm   = String(jst.getMonth() + 1).padStart(2, '0');
    const dd   = String(jst.getDate()).padStart(2, '0');
    const HH   = String(jst.getHours()).padStart(2, '0');
    const MM   = String(jst.getMinutes()).padStart(2, '0');
    return mm + '/' + dd + ' ' + HH + ':' + MM;
  }

  // focus the next element in the sequence after the given id
  function focusNext(currentId){
    const idx = AUTO_SEQUENCE.indexOf(currentId);
    if(idx < 0) return;
    const nextId = AUTO_SEQUENCE[idx + 1];
    if(!nextId) return;
    if(nextId === 'unlockBtn'){
      const btn = document.getElementById('unlockBtn');
      if(btn) btn.focus();
      return;
    }
    const nextEl = document.getElementById(nextId) || document.querySelector(`[name="${nextId}"]`);
    if(nextEl) nextEl.focus();
  }

  // setup auto-advance listeners on each relevant input
  function setupAutoAdvance(){
    AUTO_SEQUENCE.forEach(id => {
      if(id === 'unlockBtn') return;
      const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
      if(!el) return;
      // handle input event for length-based advance
      el.addEventListener('input', ev => {
        const rule = FIELD_RULES[id];
        if(!rule) return;
        let raw = ev.target.value;
        const digits = raw.replace(/\D/g, '');
        if(rule.decimal){
          // for tread fields, only convert if decimal not already set and we have required digits
          if(!raw.includes('.') && digits.length >= rule.len){
            const truncated = digits.slice(0, rule.len);
            const formatted = formatTread(truncated);
            ev.target.value = formatted;
            focusNext(id);
          }
        }else{
          if(digits.length >= rule.len){
            const truncated = digits.slice(0, rule.len);
            ev.target.value = truncated;
            focusNext(id);
          }
        }
      });
      // allow enter key to advance
      el.addEventListener('keydown', ev => {
        if(ev.key === 'Enter'){
          ev.preventDefault();
          focusNext(id);
        }
      });
    });
  }

  function init(){
    applyUrl();
    showPrevPlaceholders();
    loadTimes();          // 同一車両なら復元、切替なら空へ
    fetchSheetData();     // 規定圧＆前回値取得
    wire();
    // initialize auto-advance for inputs
    setupAutoAdvance();

    // handle form submission: build result view and send data
    if(form){
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const p = collectPayload();
        // update result header (station optional)
        let header = '';
        if(p.station) header += p.station + '\n';
        header += p.plate_full + '\n' + p.model;
        if(resHeader) resHeader.textContent = header;
        // update times display
        if(resTimes) resTimes.innerHTML = `解錠　${p.unlock || '--:--'}<br>施錠　${p.lock || '--:--'}`;
        // build result lines (normative row placed between times and RF)
        const lines = [];
        if(p.std_f && p.std_r) lines.push(`${p.std_f}-${p.std_r}`);
        lines.push(`${p.tread_rf || ''} ${p.pre_rf || ''} ${p.dot_rf || ''}   RF`);
        lines.push(`${p.tread_lf || ''} ${p.pre_lf || ''} ${p.dot_lf || ''}   LF`);
        lines.push(`${p.tread_lr || ''} ${p.pre_lr || ''} ${p.dot_lr || ''}   LR`);
        lines.push(`${p.tread_rr || ''} ${p.pre_rr || ''} ${p.dot_rr || ''}   RR`);
        lines.push('');
        lines.push(nowJST());
        if(resLines) resLines.textContent = lines.join('\n');
        // toggle views
        if(form) form.style.display = 'none';
        if(resultCard) resultCard.style.display = 'block';
        window.scrollTo({top:0, behavior:'smooth'});
        // send data to GAS
        await postToSheet();
      });
    }
    // handle back button: return to input form
    if(backBtn){
      backBtn.addEventListener('click', () => {
        if(resultCard) resultCard.style.display = 'none';
        if(form) form.style.display = 'block';
        window.scrollTo({top:0, behavior:'smooth'});
      });
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
