// ==UserScript==
// @name         𝕏-followers-Manager-Pro
// @namespace    http://https://dhiya000.netlify.app/
// @version      4.0
// @author       Dhiya_000
// @description  Follow/Followback on Followers, Following, and Retweet pages
// @match        https://x.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // --- DATA & STATE ---
  let SKIP_DEFAULT_PIC = localStorage.getItem('um_skip_default_pic') !== 'false';
  let SKIP_NO_BIO = localStorage.getItem('um_skip_no_bio') !== 'false';
  let SKIP_KEY_WORDS = localStorage.getItem('um_skip_key_words') !== 'false';
  let KEY_WORDS = JSON.parse(localStorage.getItem('um_key_words')) || ['elon', 'musk', 'crypto', 'web3', 'promote', 'bot'].map(w => w.toLowerCase());
  let WHITELIST = JSON.parse(localStorage.getItem('um_whitelist')) || ['Dhiya_000', 'Dhiya__000'];

  let scPauseCount = parseInt(localStorage.getItem('um_sc_pause_count')) || 150;
  let scPauseSeconds = parseInt(localStorage.getItem('um_sc_pause_seconds')) || 30;
  let fbMaxPerPeriod = parseInt(localStorage.getItem('um_fb_max_per_period')) || 50;
  let fbScanMax = parseInt(localStorage.getItem('um_fb_scan_max')) || 10000;

  const UF_MAX_PER_PERIOD = 150;
  const ACTION_CD = 15 * 60 * 1000;
  const SCROLL_POSITION = 107;
  const BATCH_SIZE = 6;

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
    const bio = cell.querySelector('[dir="auto"][class*="r-1h8ys4a"]')?.innerText.toLowerCase() || "";
    const text = cell.innerText.toLowerCase();
    const hasKeyword = SKIP_KEY_WORDS && KEY_WORDS.some(k => text.includes(k));
    return { isBotLike: (SKIP_DEFAULT_PIC && hasDefaultPic) || (SKIP_NO_BIO && bio.trim() === '') || hasKeyword };
  };

  // --- UI STYLING ---
  const style = document.createElement('style');
  style.textContent = `
    #dk-root {
        position: fixed; top: 15px; right: 15px; z-index: 9999;
        background: rgba(10, 15, 20, 0.98); backdrop-filter: blur(25px);
        color: #fff; width: 330px; border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.1); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto;
        box-shadow: 0 10px 50px rgba(0,0,0,0.8); display: flex; flex-direction: column; overflow: hidden;
    }
    .dk-header { padding: 18px; background: rgba(29, 155, 240, 0.15); cursor: move; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .dk-tabs { display: flex; background: rgba(0,0,0,0.4); border-bottom: 1px solid rgba(255,255,255,0.05); }
    .dk-tab { flex: 1; padding: 14px; text-align: center; font-size: 11px; font-weight: 800; cursor: pointer; color: #71767b; transition: 0.2s; text-transform: uppercase; }
    .dk-tab.active { color: #1D9BF0; border-bottom: 2px solid #1D9BF0; background: rgba(29, 155, 240, 0.05); }
    .dk-page { padding: 16px; display: none; flex-direction: column; gap: 12px; max-height: 500px; overflow-y: auto; }
    .dk-page.active { display: flex; }
    .dk-btn { padding: 12px; border-radius: 999px; border: none; font-weight: 800; cursor: pointer; font-size: 14px; transition: 0.2s; width: 100%; text-align: center; }
    .dk-btn-primary { background: #1D9BF0; color: white; }
    .dk-btn-secondary { background: #eff3f4; color: #0f1419; margin-top: 6px; }
    .dk-btn-danger { background: rgba(244, 67, 54, 0.1); color: #f44336; border: 1px solid #f44336; font-size: 11px; margin-top: 10px; }
    .dk-card { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 12px; border: 1px solid rgba(255,255,255,0.05); }
    .dk-label { font-size: 10px; color: #71767b; font-weight: 800; text-transform: uppercase; margin-bottom: 4px; }
    .dk-input { background: #000; border: 1px solid #333; color: #fff; padding: 10px; border-radius: 10px; font-size: 13px; margin-top: 5px; width: 100%; box-sizing: border-box; }
    .dk-toggle { display: flex; align-items: center; gap: 10px; font-size: 13px; cursor: pointer; padding: 4px 0; }
    .dk-item { display: flex; justify-content: space-between; align-items: center; background: #111; padding: 8px 12px; border-radius: 8px; font-size: 12px; margin-bottom: 6px; }
    .dk-remove { color: #f44336; cursor: pointer; font-weight: bold; font-size: 16px; }
  `;
  document.head.appendChild(style);

  const ui = document.createElement('div');
  ui.id = 'dk-root';
  ui.innerHTML = `
    <div class="dk-header"><b style="color:#1D9BF0">𝕏</b> Mutual Manager Pro <small style="float:right; opacity:0.5">v4.0</small></div>
    <div class="dk-tabs">
        <div class="dk-tab active" data-page="main">Main</div>
        <div class="dk-tab" data-page="filters">Bot Filters</div>
        <div class="dk-tab" data-page="settings">Advanced</div>
    </div>
    
    <div id="p-main" class="dk-page active">
        <button id="dk-start" class="dk-btn dk-btn-primary">START AUTOMATION</button>
        <div class="dk-card">
            <div class="dk-label">Current Active Mode</div>
            <div id="dk-mode-label" style="font-weight:800; color:#1D9BF0; font-size:13px">${displayMode}</div>
        </div>
        <div class="dk-card">
            <div class="dk-label">Actions (Session)</div>
            <div style="display:flex; justify-content:space-between; align-items:center">
                <span id="dk-act-count" style="font-size:22px; font-weight:900">0 / 0</span>
                <span id="dk-timer" style="font-size:10px; padding:3px 10px; border-radius:6px; background:#4CAF50; font-weight:800">READY</span>
            </div>
        </div>
        <div class="dk-card">
            <div class="dk-label">Scan History</div>
            <div id="dk-scan-count" style="font-size:16px; font-weight:700">0 / 0</div>
            <div id="dk-scan-timer" style="font-size:11px; color:#71767b; margin-top:4px">Status: Idle</div>
        </div>
    </div>

    <div id="p-filters" class="dk-page">
        <div class="dk-card">
            <label class="dk-toggle"><input type="checkbox" id="c-pic"> Skip No Profile Pic</label>
            <label class="dk-toggle"><input type="checkbox" id="c-bio"> Skip No Bio</label>
            <label class="dk-toggle"><input type="checkbox" id="c-key"> Skip Keywords</label>
        </div>
        <div>
            <div class="dk-label">Block Keywords</div>
            <div id="dk-kw-list"></div>
            <div style="display:flex; gap:6px; margin-top:5px"><input id="in-kw" class="dk-input" style="margin:0" placeholder="Add word..."><button id="add-kw" class="dk-btn-primary" style="width:50px; border-radius:10px">+</button></div>
        </div>
        <div>
            <div class="dk-label">Whitelist Users</div>
            <div id="dk-wl-list"></div>
            <div style="display:flex; gap:6px; margin-top:5px"><input id="in-wl" class="dk-input" style="margin:0" placeholder="@user..."><button id="add-wl" class="dk-btn-primary" style="width:50px; border-radius:10px">+</button></div>
        </div>
    </div>

    <div id="p-settings" class="dk-page">
        <div class="dk-card">
            <div class="dk-label">Pause Interval (Every X Users)</div>
            <input type="number" id="s-p-count" class="dk-input">
            <div class="dk-label" style="margin-top:12px">Pause Time (Seconds)</div>
            <input type="number" id="s-p-sec" class="dk-input">
        </div>
        <div class="dk-card">
            <div class="dk-label">Max Follows Per Period</div>
            <input type="number" id="s-fb-max" class="dk-input">
        </div>
        <button id="dk-reset" class="dk-btn dk-btn-danger">RESET SETTINGS</button>
    </div>
  `;
  document.body.appendChild(ui);

  // --- UI LOGIC ---
  const tabs = ui.querySelectorAll('.dk-tab');
  tabs.forEach(t => t.onclick = () => {
    tabs.forEach(x => x.classList.remove('active'));
    ui.querySelectorAll('.dk-page').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    ui.querySelector(`#p-${t.dataset.page}`).classList.add('active');
  });

  const renderLists = () => {
    ui.querySelector('#dk-kw-list').innerHTML = KEY_WORDS.map((k,i) => `<div class="dk-item">${k}<span class="dk-remove" data-idx="${i}" data-type="kw">×</span></div>`).join('');
    ui.querySelector('#dk-wl-list').innerHTML = WHITELIST.map((w,i) => `<div class="dk-item">${w}<span class="dk-remove" data-idx="${i}" data-type="wl">×</span></div>`).join('');
  };

  ui.onclick = (e) => {
    if(e.target.classList.contains('dk-remove')){
        const {idx, type} = e.target.dataset;
        if(type==='kw') KEY_WORDS.splice(idx,1); else WHITELIST.splice(idx,1);
        localStorage.setItem(`um_${type==='kw'?'key_words':'whitelist'}`, JSON.stringify(type==='kw'?KEY_WORDS:WHITELIST));
        renderLists();
    }
  };

  ui.querySelector('#add-kw').onclick = () => { const v = ui.querySelector('#in-kw').value.trim().toLowerCase(); if(v){ KEY_WORDS.push(v); localStorage.setItem('um_key_words', JSON.stringify(KEY_WORDS)); renderLists(); ui.querySelector('#in-kw').value=''; }};
  ui.querySelector('#add-wl').onclick = () => { const v = ui.querySelector('#in-wl').value.trim(); if(v){ WHITELIST.push(v); localStorage.setItem('um_whitelist', JSON.stringify(WHITELIST)); renderLists(); ui.querySelector('#in-wl').value=''; }};
  ui.querySelector('#c-pic').checked = SKIP_DEFAULT_PIC;
  ui.querySelector('#c-pic').onchange = (e) => localStorage.setItem('um_skip_default_pic', SKIP_DEFAULT_PIC = e.target.checked);
  ui.querySelector('#s-p-count').value = scPauseCount;
  ui.querySelector('#s-p-sec').value = scPauseSeconds;
  ui.querySelector('#s-fb-max').value = fbMaxPerPeriod;
  ui.querySelector('#dk-reset').onclick = () => { localStorage.clear(); location.reload(); };

  renderLists();

  // Drag logic
  let isDragging = false, offset = [0,0];
  ui.querySelector('.dk-header').onmousedown = (e) => { isDragging = true; offset = [ui.offsetLeft - e.clientX, ui.offsetTop - e.clientY]; };
  document.onmousemove = (e) => { if(isDragging){ ui.style.left = (e.clientX + offset[0])+'px'; ui.style.top = (e.clientY + offset[1])+'px'; ui.style.right = 'auto'; }};
  document.onmouseup = () => isDragging = false;

  // --- AUTOMATION ENGINE ---
  let running = false, paused = true;
  const startBtn = ui.querySelector('#dk-start');
  const actCountLabel = ui.querySelector('#dk-act-count');
  const timerBadge = ui.querySelector('#dk-timer');
  const scanCountLabel = ui.querySelector('#dk-scan-count');
  const scanTimerLabel = ui.querySelector('#dk-scan-timer');

  let processed = new Set(), total = 0, actioned = 0, remaining = 0, timerInt = null;

  const updateStats = () => {
    const limit = mode === 'unfollow' ? UF_MAX_PER_PERIOD : fbMaxPerPeriod;
    actCountLabel.textContent = `${actioned} / ${limit}`;
    scanCountLabel.textContent = `${total} / ${mode === 'unfollow' ? '30000' : fbScanMax}`;
    if(remaining > 0) {
        const m = Math.floor(remaining/60), s = remaining%60;
        timerBadge.textContent = `${m}:${String(s).padStart(2,'0')}`;
        timerBadge.style.background = '#f44336';
    } else { timerBadge.textContent = 'READY'; timerBadge.style.background = '#4CAF50'; }
  };

  async function processBatch() {
    let cells = getCells().filter(c => !processed.has(getUsername(c))).slice(0, BATCH_SIZE);
    if(!cells.length) return 0;
    window.scrollBy({top: cells[0].getBoundingClientRect().top - SCROLL_POSITION});
    await new Promise(r => setTimeout(r, 600));

    for(let cell of cells){
        const limit = mode === 'unfollow' ? UF_MAX_PER_PERIOD : fbMaxPerPeriod;
        if(paused || actioned >= limit) break;
        
        const user = getUsername(cell); processed.add(user); total++; updateStats();
        cell.style.border = '2px solid yellow';
        await new Promise(r => setTimeout(r, 400));

        if(WHITELIST.includes(user)) { cell.style.border = '2px solid orange'; continue; }

        if(mode === 'unfollow'){
            const isMutual = !!cell.querySelector('[data-testid="userFollowIndicator"]');
            if(!isMutual || getBotInfo(cell).isBotLike){
                const btn = cell.querySelector('button[aria-label^="Following @"], button[data-testid$="-unfollow"]');
                if(btn){
                    btn.click(); await new Promise(r => setTimeout(r, 500));
                    const confirm = Array.from(document.querySelectorAll('button[data-testid="confirmationSheetConfirm"]')).find(b => b.innerText.toLowerCase().includes('unfollow'));
                    if(confirm) { confirm.click(); actioned++; cell.style.border = '2px solid red'; }
                }
            } else { cell.style.border = '2px solid green'; }
        } else {
            // Mode: Follow Back / Retweet Follow
            if(getBotInfo(cell).isBotLike || cell.querySelector('button[aria-label^="Following @"]')) {
                cell.style.border = '2px solid purple';
                continue;
            }
            // Logic: Catch both "Follow" and "Follow back"
            const followBtn = Array.from(cell.querySelectorAll('button')).find(b => 
                b.ariaLabel && (b.ariaLabel.includes('Follow back @') || b.ariaLabel.includes('Follow @')) && !b.ariaLabel.includes('Following @')
            );
            if(followBtn){
                followBtn.click(); actioned++; cell.style.border = '2px solid blue';
            }
        }
        await new Promise(r => setTimeout(r, 600));
    }
    return cells.length;
  }

  startBtn.onclick = async () => {
    paused = !paused; startBtn.textContent = paused ? 'RESUME AUTOMATION' : 'PAUSE AUTOMATION';
    if(!running){
        running = true;
        let scanPauseCount = 0;
        while(running){
            if(paused) { await new Promise(r => setTimeout(r, 500)); continue; }
            const proc = await processBatch(); scanPauseCount += proc;
            if(scanPauseCount >= scPauseCount){
                for(let i=scPauseSeconds; i>0; i--){ if(paused) break; scanTimerLabel.textContent = `Pausing: ${i}s`; await new Promise(r => setTimeout(r, 1000)); }
                scanPauseCount = 0;
            }
            scanTimerLabel.textContent = `Scanning...`;
            window.scrollBy({top: 800}); await new Promise(r => setTimeout(r, 2000));
        }
    }
  };

  setTimeout(() => { if (startBtn.textContent === 'START AUTOMATION') startBtn.click(); }, 10000);
})();
