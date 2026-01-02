// ==UserScript==
// @name         𝕏-Followers-Manager-Pro
// @namespace    https://dhiya000.netlify.app/
// @version      4.2
// @author       Dhiya_000
// @description  Follow/Followback with Random Delays, Floating UI, and Keyword Filtering
// @match        https://x.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // --- DATA & STATE ---
  let cfg = {
      skipDefaultPic: localStorage.getItem('um_skip_default_pic') !== 'false',
      skipNoBio: localStorage.getItem('um_skip_no_bio') !== 'false',
      skipKeywords: localStorage.getItem('um_skip_key_words') !== 'false',
      minDelay: parseInt(localStorage.getItem('um_min_delay')) || 2,
      maxDelay: parseInt(localStorage.getItem('um_max_delay')) || 5,
      scPauseCount: parseInt(localStorage.getItem('um_sc_pause_count')) || 150,
      scPauseSeconds: parseInt(localStorage.getItem('um_sc_pause_seconds')) || 30,
      fbMaxPerPeriod: parseInt(localStorage.getItem('um_fb_max_per_period')) || 50,
      fbScanMax: parseInt(localStorage.getItem('um_fb_scan_max')) || 10000
  };

  // Keywords to skip (default + user added)
  let KEY_WORDS = JSON.parse(localStorage.getItem('um_key_words')) || ['bot', 'account', 'promote', 'crypto', 'web3', 'elon', 'musk', 'giveaway', 'scam', 'dm for'];
  let WHITELIST = JSON.parse(localStorage.getItem('um_whitelist')) || ['Dhiya_000', 'Dhiya__000'];

  const UF_MAX_PER_PERIOD = 150;
  const SCROLL_POSITION = 107;
  const BATCH_SIZE = 6;

  let state = {
      running: false,
      paused: true,
      uiVisible: true,
      processed: new Set(),
      total: 0,
      actioned: 0,
      countdown: 0
  };

  // --- PAGE DETECTION ---
  const path = window.location.pathname;
  const isFollowingPage = path.includes('/following');
  const isFollowersPage = path.includes('/followers') || path.includes('/verified_followers');
  const isRetweetPage = path.includes('/retweets') || path.includes('/quotes');

  if (!isFollowingPage && !isFollowersPage && !isRetweetPage) return;

  const mode = isFollowingPage ? 'unfollow' : 'follow_all';
  const displayMode = isFollowingPage ? 'UNFOLLOWING' : (isRetweetPage ? 'FOLLOWING RETWEETERS' : 'FOLLOWING BACK');

  // --- ENGINE UTILS ---
  const getCells = () => Array.from(document.querySelectorAll('[data-testid="UserCell"]'));
  const getUsername = (cell) => {
    const link = cell.querySelector('a[href^="/"][role="link"]');
    return link ? link.getAttribute('href').slice(1).split('/')[0] : '';
  };

  const getBotInfo = (cell) => {
    const img = cell.querySelector('img');
    const hasDefaultPic = img && img.src.includes('default_profile_normal.png');
    const bioElement = cell.querySelector('[dir="auto"][class*="r-1h8ys4a"]');
    const bio = bioElement ? bioElement.innerText.toLowerCase() : "";
    const nameAndHandle = cell.innerText.toLowerCase();
    
    // Live checking of current cfg values
    let reason = "";
    if (cfg.skipDefaultPic && hasDefaultPic) reason = "No Pic";
    else if (cfg.skipNoBio && bio.trim() === '') reason = "No Bio";
    else if (cfg.skipKeywords) {
        const found = KEY_WORDS.find(k => nameAndHandle.includes(k.toLowerCase()));
        if (found) reason = `KW: ${found}`;
    }

    return { isBotLike: reason !== "", reason: reason };
  };

  // --- UI STYLING ---
  const style = document.createElement('style');
  style.textContent = `
    #dk-root {
        position: fixed; top: 60px; right: 15px; z-index: 9999;
        background: rgba(10, 15, 20, 0.98); backdrop-filter: blur(25px);
        color: #fff; width: 330px; border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.1); font-family: sans-serif;
        box-shadow: 0 10px 50px rgba(0,0,0,0.8); display: flex; flex-direction: column; overflow: hidden;
    }
    #dk-pill {
        position: fixed; top: 15px; right: 15px; z-index: 10000;
        background: #1D9BF0; color: #fff; padding: 8px 15px; border-radius: 20px;
        font-family: sans-serif; font-size: 12px; font-weight: bold; cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 2px solid #fff; user-select: none; transition: 0.3s;
    }
    .dk-header { padding: 18px; background: rgba(29, 155, 240, 0.15); cursor: move; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .dk-tabs { display: flex; background: rgba(0,0,0,0.4); }
    .dk-tab { flex: 1; padding: 12px; text-align: center; font-size: 10px; font-weight: 800; cursor: pointer; color: #ffffff; text-transform: uppercase; }
    .dk-tab.active { color: #1D9BF0; border-bottom: 2px solid #1D9BF0; background: rgba(255,255,255,0.02); }
    .dk-page { padding: 16px; display: none; flex-direction: column; gap: 10px; max-height: 480px; overflow-y: auto; }
    .dk-page.active { display: flex; }
    .dk-btn { padding: 12px; border-radius: 999px; border: none; font-weight: 800; cursor: pointer; width: 100%; transition: 0.2s; }
    .dk-btn-primary { background: #1D9BF0; color: white; }
    .dk-btn-primary:hover { background: #1a8cd8; }
    .dk-card { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 10px; border: 1px solid rgba(255,255,255,0.05); }
    .dk-label { font-size: 10px; color: #ffffff; font-weight: 800; text-transform: uppercase; margin-bottom: 4px; }
    .dk-input { background: #000; border: 1px solid #333; color: #fff; padding: 8px; border-radius: 8px; font-size: 12px; width: 100%; box-sizing: border-box; }
    .dk-toggle { display: flex; align-items: center; gap: 10px; font-size: 12px; cursor: pointer; margin-bottom: 5px; }
    .dk-list-container { max-height: 100px; overflow-y: auto; margin-bottom: 5px; border-radius: 8px; background: rgba(0,0,0,0.2); padding: 5px; }
    .dk-item { display: flex; justify-content: space-between; background: #111; padding: 6px 10px; border-radius: 6px; font-size: 11px; margin-bottom: 4px; border: 1px solid #222; }
    .dk-remove { color: #f44336; cursor: pointer; font-weight: bold; width: 20px; text-align: right; }
  `;
  document.head.appendChild(style);

  // --- RENDER UI ---
  const pill = document.createElement('div');
  pill.id = 'dk-pill';
  pill.innerHTML = '🤖 Ready';
  document.body.appendChild(pill);

  const ui = document.createElement('div');
  ui.id = 'dk-root';
  ui.innerHTML = `
    <div class="dk-header"><b style="color:#1D9BF0">𝕏</b> Follow Manager <small style="float:right; opacity:0.5">v4.2</small></div>
    <div class="dk-tabs">
        <div class="dk-tab active" data-page="main">Main</div>
        <div class="dk-tab" data-page="filters">Filters</div>
        <div class="dk-tab" data-page="settings">Config</div>
    </div>
    
    <div id="p-main" class="dk-page active">
        <button id="dk-start" class="dk-btn dk-btn-primary">START AUTOMATION</button>
        <div class="dk-card">
            <div class="dk-label">Mode: <span id="dk-mode-label" style="color:#1D9BF0">${displayMode}</span></div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                <span id="dk-act-count" style="font-size:20px; font-weight:900">0 / 0</span>
                <span id="dk-timer" style="font-size:10px; padding:4px 10px; border-radius:6px; background:#4CAF50; font-weight:800">READY</span>
            </div>
        </div>
        <div class="dk-card">
            <div class="dk-label">Scan Progress</div>
            <div id="dk-scan-count" style="font-size:14px; font-weight:700">0 / 0</div>
            <div id="dk-scan-timer" style="font-size:11px; color:#ffffff;">Idle</div>
        </div>
    </div>

    <div id="p-filters" class="dk-page">
        <div class="dk-card">
            <label class="dk-toggle"><input type="checkbox" id="c-pic"> Skip No Profile Pic</label>
            <label class="dk-toggle"><input type="checkbox" id="c-bio"> Skip No Bio</label>
            <label class="dk-toggle"><input type="checkbox" id="c-key"> Skip Keywords</label>
        </div>
        
        <div>
            <div class="dk-label">Blocked Keywords</div>
            <div class="dk-list-container" id="dk-kw-list"></div>
            <div style="display:flex; gap:5px;"><input id="in-kw" class="dk-input" placeholder="e.g. crypto"><button id="add-kw" class="dk-btn-primary" style="width: 40px; text-align: -webkit-center; display: block;">+</button></div>
        </div>

        <div>
            <div class="dk-label">Whitelist (@user)</div>
            <div class="dk-list-container" id="dk-wl-list"></div>
            <div style="display:flex; gap:5px;"><input id="in-wl" class="dk-input" placeholder="e.g. elonmusk"><button id="add-wl" class="dk-btn-primary" style="width: 40px; text-align: -webkit-center; display: block;">+</button></div>
        </div>
    </div>

    <div id="p-settings" class="dk-page">
        <div class="dk-card">
            <div class="dk-label">Random Delay (Min - Max Sec)</div>
            <div style="display:flex; gap:5px;">
                <input type="number" id="s-min-delay" class="dk-input">
                <input type="number" id="s-max-delay" class="dk-input">
            </div>
        </div>
        <div class="dk-card">
            <div class="dk-label">Pause Every X Actions</div>
            <input type="number" id="s-p-count" class="dk-input">
            <div class="dk-label" style="margin-top:8px">Pause Duration (Sec)</div>
            <input type="number" id="s-p-sec" class="dk-input">
        </div>
        <button id="dk-reset" style="background:none; border:1px solid #444; color:#777; font-size:10px; cursor:pointer; padding:5px; margin-top:10px; border-radius:5px;">Full Reset</button>
    </div>
  `;
  document.body.appendChild(ui);

  // --- UI LOGIC ---
  pill.onclick = () => {
      state.uiVisible = !state.uiVisible;
      ui.style.display = state.uiVisible ? 'flex' : 'none';
      pill.style.background = state.uiVisible ? '#1D9BF0' : '#000';
  };

  const tabs = ui.querySelectorAll('.dk-tab');
  tabs.forEach(t => t.onclick = () => {
    tabs.forEach(x => x.classList.remove('active'));
    ui.querySelectorAll('.dk-page').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    ui.querySelector(`#p-${t.dataset.page}`).classList.add('active');
  });

  const bindInput = (id, key, isCheck = false) => {
      const el = ui.querySelector(`#${id}`);
      if(isCheck) {
          el.checked = cfg[key];
          el.onchange = () => { cfg[key] = el.checked; localStorage.setItem(`um_${id.replace('c-','skip_')}`, cfg[key]); };
      } else {
          el.value = cfg[key];
          el.onchange = () => { cfg[key] = parseInt(el.value); localStorage.setItem(`um_${id.replace('s-','')}`, cfg[key]); };
      }
  };

  bindInput('c-pic', 'skipDefaultPic', true);
  bindInput('c-bio', 'skipNoBio', true);
  bindInput('c-key', 'skipKeywords', true);
  bindInput('s-min-delay', 'minDelay');
  bindInput('s-max-delay', 'maxDelay');
  bindInput('s-p-count', 'scPauseCount');
  bindInput('s-p-sec', 'scPauseSeconds');

  const renderLists = () => {
    ui.querySelector('#dk-wl-list').innerHTML = WHITELIST.map((w,i) => `<div class="dk-item">${w}<span class="dk-remove" data-idx="${i}" data-type="wl">×</span></div>`).join('');
    ui.querySelector('#dk-kw-list').innerHTML = KEY_WORDS.map((k,i) => `<div class="dk-item">${k}<span class="dk-remove" data-idx="${i}" data-type="kw">×</span></div>`).join('');
  };

  ui.querySelector('#add-wl').onclick = () => { const v = ui.querySelector('#in-wl').value.trim().replace('@',''); if(v){ WHITELIST.push(v); localStorage.setItem('um_whitelist', JSON.stringify(WHITELIST)); renderLists(); ui.querySelector('#in-wl').value=''; }};
  ui.querySelector('#add-kw').onclick = () => { const v = ui.querySelector('#in-kw').value.trim().toLowerCase(); if(v){ KEY_WORDS.push(v); localStorage.setItem('um_key_words', JSON.stringify(KEY_WORDS)); renderLists(); ui.querySelector('#in-kw').value=''; }};
  
  ui.onclick = (e) => { 
      if(e.target.classList.contains('dk-remove')){ 
          const {idx, type} = e.target.dataset;
          if(type === 'wl') WHITELIST.splice(idx,1); else KEY_WORDS.splice(idx,1);
          localStorage.setItem(`um_${type==='wl'?'whitelist':'key_words'}`, JSON.stringify(type==='wl'?WHITELIST:KEY_WORDS)); 
          renderLists(); 
      }
  };

  ui.querySelector('#dk-reset').onclick = () => { if(confirm("Clear all settings?")){ localStorage.clear(); location.reload(); } };
  renderLists();

  // Drag logic
  let isDragging = false, offset = [0,0];
  ui.querySelector('.dk-header').onmousedown = (e) => { isDragging = true; offset = [ui.offsetLeft - e.clientX, ui.offsetTop - e.clientY]; };
  document.onmousemove = (e) => { if(isDragging){ ui.style.left = (e.clientX + offset[0])+'px'; ui.style.top = (e.clientY + offset[1])+'px'; ui.style.right = 'auto'; }};
  document.onmouseup = () => isDragging = false;

  // --- AUTOMATION ENGINE ---
  const updateStats = (msg = null) => {
    const limit = mode === 'unfollow' ? UF_MAX_PER_PERIOD : cfg.fbMaxPerPeriod;
    ui.querySelector('#dk-act-count').textContent = `${state.actioned} / ${limit}`;
    ui.querySelector('#dk-scan-count').textContent = `${state.total} / ${mode === 'unfollow' ? '30000' : cfg.fbScanMax}`;
    
    const statusMsg = msg || (state.paused ? 'PAUSED' : 'RUNNING');
    pill.innerHTML = `<span>🤖</span> ${statusMsg} (${state.actioned})`;
    
    const timerBadge = ui.querySelector('#dk-timer');
    if(state.countdown > 0) {
        timerBadge.textContent = `WAIT ${state.countdown}s`;
        timerBadge.style.background = '#f44336';
    } else {
        timerBadge.textContent = state.paused ? 'PAUSED' : 'READY';
        timerBadge.style.background = state.paused ? '#555' : '#4CAF50';
    }
  };

  async function wait(seconds) {
      for(let i = seconds; i > 0; i--) {
          if(state.paused) break;
          state.countdown = i;
          updateStats(`Wait: ${i}s`);
          await new Promise(r => setTimeout(r, 1000));
      }
      state.countdown = 0;
  }

  async function processBatch() {
    let cells = getCells().filter(c => !state.processed.has(getUsername(c))).slice(0, BATCH_SIZE);
    if(!cells.length) return 0;

    for(let cell of cells){
        const limit = mode === 'unfollow' ? UF_MAX_PER_PERIOD : cfg.fbMaxPerPeriod;
        if(state.paused || state.actioned >= limit) break;
        
        const user = getUsername(cell); 
        state.processed.add(user); 
        state.total++; 
        updateStats();

        if(WHITELIST.includes(user)) { cell.style.border = '2px solid orange'; continue; }

        const botCheck = getBotInfo(cell);
        let didAction = false;

        if(mode === 'unfollow'){
            const isMutual = !!cell.querySelector('[data-testid="userFollowIndicator"]');
            if(!isMutual || botCheck.isBotLike){
                const btn = cell.querySelector('button[aria-label^="Following @"], button[data-testid$="-unfollow"]');
                if(btn){
                    btn.click(); await new Promise(r => setTimeout(r, 600));
                    const confirm = Array.from(document.querySelectorAll('button[data-testid="confirmationSheetConfirm"]')).find(b => b.innerText.toLowerCase().includes('unfollow'));
                    if(confirm) { confirm.click(); state.actioned++; cell.style.border = '2px solid red'; didAction = true; }
                }
            }
        } else {
            if(!botCheck.isBotLike && !cell.querySelector('button[aria-label^="Following @"]')) {
                const followBtn = Array.from(cell.querySelectorAll('button')).find(b => 
                    b.ariaLabel && (b.ariaLabel.includes('Follow back @') || b.ariaLabel.includes('Follow @'))
                );
                if(followBtn){
                    followBtn.click(); state.actioned++; cell.style.border = '2px solid #1D9BF0'; didAction = true;
                }
            } else {
                cell.style.opacity = '0.8';
                if(botCheck.isBotLike) cell.style.border = '1px solid purple';
            }
        }

        if(didAction) {
            const delay = Math.floor(Math.random() * (cfg.maxDelay - cfg.minDelay + 1)) + cfg.minDelay;
            await wait(delay);
        } else {
            await new Promise(r => setTimeout(r, 200));
        }
    }
    return cells.length;
  }

  const startBtn = ui.querySelector('#dk-start');
  startBtn.onclick = async () => {
    state.paused = !state.paused; 
    startBtn.textContent = state.paused ? 'RESUME AUTOMATION' : 'PAUSE AUTOMATION';
    startBtn.style.background = state.paused ? '#1D9BF0' : '#f44336';
    
    if(!state.running){
        state.running = true;
        let scanPauseCount = 0;
        while(state.running){
            if(state.paused) { 
                updateStats();
                await new Promise(r => setTimeout(r, 1000)); 
                continue; 
            }
            
            const proc = await processBatch(); 
            scanPauseCount += proc;

            if(scanPauseCount >= cfg.scPauseCount){
                ui.querySelector('#dk-scan-timer').textContent = `Break...`;
                await wait(cfg.scPauseSeconds);
                scanPauseCount = 0;
            }
            
            ui.querySelector('#dk-scan-timer').textContent = `Scrolling...`;
            window.scrollBy(0, 600); 
            await new Promise(r => setTimeout(r, 2000));
        }
    }
  };

  // Initialize
  updateStats();
})();
