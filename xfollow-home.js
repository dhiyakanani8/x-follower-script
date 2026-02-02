// ==UserScript==
// @name         𝕏-Follow-Automator-Pro-V2.1
// @namespace    https://dhiya000.netlify.app/
// @version      2.1.0
// @description  Automated bot with Dual-Tab UI, Activity Log, Ratio Labels, and Min-Follower filter.
// @author       @dhiya_000
// @match        https://x.com/home
// @match        https://x.com/explore
// @match        https://x.com/*/status/*
// @match        https://x.com/*/verified_followers
// @match        https://x.com/*/followers
// @match        https://x.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    /**
     * --- PERSISTENT CONFIGURATION ---
     */
    const getSet = (k, def) => {
        const val = localStorage.getItem(k);
        if (!val) return def;
        try { return JSON.parse(val); } catch (e) { return val; }
    };

    const config = {
        paused: true,
        pLimit: getSet('xf_pLimit', 2),
        hLimit: getSet('xf_hLimit', 50),
        minRatio: getSet('xf_minRatio', 0.8),
        minDelay: getSet('xf_minDelay', 5),
        maxDelay: getSet('xf_maxDelay', 15),
        followProfileOwner: getSet('xf_followOwner', false),
        skipList: getSet('xf_skipList', "elonmusk, grok, x, twitter"),
        breakFollowLimit: getSet('xf_breakLimit', 15),
        breakDuration: getSet('xf_breakDuration', 5),
        useMinFollowers: getSet('xf_useMinFers', false),
        minFollowers: getSet('xf_minFollowers', 100),
        uiVisible: true,
        activeTab: 'settings' // 'settings' or 'log'
    };

    /**
     * --- INTERNAL STATE ---
     */
    let state = {
        busy: false,
        tweetIndex: 0,
        lastHandle: null,
        tabId: Date.now() + '-' + Math.random(),
        hCount: 0,
        sessionFollowCount: 0,
        processedInCycle: 0,
        cooldownUntil: getSet('xf_cooldown', 0),
        breakUntil: 0,
        logs: [] // Array of {time, msg, type}
    };

    const addLog = (msg, type = 'info') => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        state.logs.unshift({ time, msg, type });
        if (state.logs.length > 50) state.logs.pop(); // Keep last 50
        console.log(`[𝕏-Bot] ${msg}`);
        if (config.activeTab === 'log') renderPanel();
    };

    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    const save = () => {
        localStorage.setItem('xf_pLimit', JSON.stringify(config.pLimit));
        localStorage.setItem('xf_hLimit', JSON.stringify(config.hLimit));
        localStorage.setItem('xf_minRatio', JSON.stringify(config.minRatio));
        localStorage.setItem('xf_minDelay', JSON.stringify(config.minDelay));
        localStorage.setItem('xf_maxDelay', JSON.stringify(config.maxDelay));
        localStorage.setItem('xf_followOwner', JSON.stringify(config.followProfileOwner));
        localStorage.setItem('xf_skipList', JSON.stringify(config.skipList));
        localStorage.setItem('xf_cooldown', JSON.stringify(state.cooldownUntil));
        localStorage.setItem('xf_breakLimit', JSON.stringify(config.breakFollowLimit));
        localStorage.setItem('xf_breakDuration', JSON.stringify(config.breakDuration));
        localStorage.setItem('xf_useMinFers', JSON.stringify(config.useMinFollowers));
        localStorage.setItem('xf_minFollowers', JSON.stringify(config.minFollowers));
    };

    /**
     * --- UTILS ---
     */
    const parseTwitterNumber = (text) => {
        if (!text) return 0;
        const cleanText = text.replace(/,/g, '').split(' ')[0].trim().toUpperCase();
        const num = parseFloat(cleanText);
        if (cleanText.includes('K')) return num * 1000;
        if (cleanText.includes('M')) return num * 1000000;
        if (cleanText.includes('B')) return num * 1000000000;
        return num || 0;
    };

    const formatTwitterNumber = (num) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    };

    const isAd = (tweet) => {
        const spans = Array.from(tweet.querySelectorAll('span'));
        return spans.some(s => s.textContent === 'Promoted' || s.textContent === 'Ad') || !!tweet.querySelector('[data-testid="placementTracking"]');
    };

    const shouldSkipHandle = (handle) => {
        if (!handle) return false;
        const list = config.skipList.split(',').map(i => i.trim().toLowerCase());
        return list.includes(handle.toLowerCase().replace('@', ''));
    };

    const highlightElement = (el) => {
        document.querySelectorAll('.bot-active-cell').forEach(c => {
            c.style.outline = 'none';
            c.classList.remove('bot-active-cell');
        });
        if (el) {
            el.classList.add('bot-active-cell');
            el.style.outline = '3px solid #1DA1F2';
            el.style.outlineOffset = '-3px';
        }
    };

    const goBack = async () => {
        const btn = document.querySelector('button[data-testid="app-bar-back"]');
        if (btn) {
            btn.click();
            addLog("Navigating back...");
            await delay(2000);
            return true;
        }
        return false;
    };

    const checkNewPostsBanner = async () => {
        const banner = Array.from(document.querySelectorAll('div[role="button"]'))
            .find(el => {
                const txt = el.textContent.toLowerCase();
                return (txt.includes('new posts') || txt.includes('show')) && el.offsetHeight > 0;
            });

        if (banner) {
            addLog("Refreshing timeline for new posts...");
            banner.click();
            await delay(2500);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            state.tweetIndex = 0;
            return true;
        }
        return false;
    };

    const refreshHome = async () => {
        addLog("Forcing Home Refresh...");
        const logo = document.querySelector('a[aria-label="X"], a[href="/home"]');
        if (logo) {
            logo.click();
            await delay(3000);
            window.scrollTo(0, 0);
        } else {
            window.location.href = "https://x.com/home";
        }
    };

    async function checkRateLimit() {
        await delay(1200);
        const toast = document.querySelector('[data-testid="toast"]');
        if (toast) {
            const text = toast.textContent.toLowerCase();
            if (text.includes('rate limited') || text.includes('unable to follow')) {
                addLog('CRITICAL: Rate limited! Pausing 1 hour.', 'error');
                state.cooldownUntil = Date.now() + (60 * 60 * 1000);
                save();
                return true;
            }
        }
        return false;
    }

    const getStatsFromHoverCard = async (userElement) => {
        userElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        let attempts = 0, hoverCard = null;
        while (attempts < 25) {
            hoverCard = document.querySelector('[data-testid="hoverCardParent"]');
            if (hoverCard) break;
            await delay(200);
            attempts++;
        }
        if (!hoverCard) return null;

        const links = Array.from(hoverCard.querySelectorAll('a[role="link"]'));
        let followers = 0, following = 0;
        links.forEach(l => {
            const txt = l.innerText.toLowerCase();
            const valSpan = l.querySelector('span');
            const val = parseTwitterNumber(valSpan ? valSpan.innerText : "0");
            if (txt.includes('follower')) followers = val;
            if (txt.includes('following')) following = val;
        });

        userElement.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
        return { ratio: following / (followers || 1), followers, following };
    };

    const injectStatsLabel = (btn, stats) => {
        if (!btn || !stats) return;
        const parent = btn.parentElement;
        let label = parent.querySelector('.bot-ratio-ui');
        if (!label) {
            label = document.createElement('div');
            label.className = 'bot-ratio-ui';
            label.style.cssText = 'font-size:10px; font-weight:bold; margin-top:4px; text-align:center; display:block; width:100%; line-height:1.2; background: rgba(0,0,0,0.05); padding: 4px; border-radius: 4px;';
            parent.appendChild(label);
        }

        const ratioPass = stats.ratio >= config.minRatio;
        const followersPass = !config.useMinFollowers || stats.followers >= config.minFollowers;

        const badgeStyle = (pass, color) => `
            display: flex; justify-content: space-between; align-items: center; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin: 2px; font-weight: 700;
            background: ${pass ? color + '15' : '#fee2e2'}; color: ${pass ? color : '#dc2626'}; border: 1px solid ${pass ? color + '30' : '#fecaca'};
        `;

        label.innerHTML = `
            <div style="${badgeStyle(ratioPass, '#00ba7c')}"><span>Ratio</span> <span>${stats.ratio.toFixed(2)}</span></div>
            <div style="${badgeStyle(followersPass, '#1d9bf0')}"><span>Follower</span> <span>${formatTwitterNumber(stats.followers)}</span></div>
        `;
    };

    /**
     * --- UI DESIGN ---
     */
    const pill = document.createElement('div');
    const panel = document.createElement('div');

    const setupUI = () => {
        pill.style.cssText = `position:fixed; top:10px; right:10px; z-index:10001; background:#000; color:#fff; padding:8px 16px; border-radius:30px; font-family:sans-serif; font-size:12px; font-weight:bold; cursor:pointer; box-shadow:0 4px 15px rgba(0,0,0,0.3); border:1px solid #333; display:flex; align-items:center; gap:8px;`;
        pill.innerHTML = `<span style="color:#1DA1F2; font-size:16px;">⚡</span> <span id="pill-status">Bot Paused</span>`;
        pill.onclick = () => { config.uiVisible = !config.uiVisible; panel.style.display = config.uiVisible ? 'block' : 'none'; };

        panel.style.cssText = `position:fixed; top:60px; right:10px; z-index:10000; background:#fff; border:1px solid #eff3f4; border-radius:20px; font-family:sans-serif; width:340px; color:#000; display: ${config.uiVisible ? 'block' : 'none'}; box-shadow:0 15px 35px rgba(0,0,0,0.2); overflow:hidden; display: flex; flex-direction: column;`;
        renderPanel();
        document.body.appendChild(pill);
        document.body.appendChild(panel);
    };

    const renderPanel = () => {
        const isSettings = config.activeTab === 'settings';

        panel.innerHTML = `
            <!-- Tab Header -->
            <div style="display: flex; background: #f7f9f9; border-bottom: 1px solid #eff3f4; padding: 4px;">
                <button id="tab-settings" style="flex:1; padding: 10px; border:none; background:${isSettings ? '#fff' : 'transparent'}; border-radius:16px; font-weight:700; cursor:pointer; font-size:12px; color:${isSettings ? '#1d9bf0' : '#536471'}; box-shadow:${isSettings ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'};">SETTINGS</button>
                <button id="tab-log" style="flex:1; padding: 10px; border:none; background:${!isSettings ? '#fff' : 'transparent'}; border-radius:16px; font-weight:700; cursor:pointer; font-size:12px; color:${!isSettings ? '#1d9bf0' : '#536471'}; box-shadow:${!isSettings ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'};">ACTIVITY LOG</button>
            </div>

            <!-- Content Area -->
            <div id="bot-content-area" style="padding: 16px; max-height: 450px; overflow-y: auto; background: #fff;">
                ${isSettings ? renderSettings() : renderLog()}
            </div>

            <!-- Footer Action -->
            <div style="padding: 16px; border-top: 1px solid #eff3f4; background: #fff;">
                <button id="main-toggle-btn" style="width: 100%; padding: 12px; background: ${config.paused ? '#1d9bf0' : '#0f1419'}; color: #fff; border: none; border-radius: 25px; cursor: pointer; font-weight: 700; font-size: 14px; transition: 0.2s;">
                    ${config.paused ? '▶ START BOT' : '⏸ STOP BOT'}
                </button>
            </div>
        `;

        // Tab Listeners
        panel.querySelector('#tab-settings').onclick = () => { config.activeTab = 'settings'; renderPanel(); };
        panel.querySelector('#tab-log').onclick = () => { config.activeTab = 'log'; renderPanel(); };

        // Setting Listeners (only if on settings tab)
        if (isSettings) {
            panel.querySelector('#inp-breakLimit').onchange = (e) => { config.breakFollowLimit = parseInt(e.target.value); save(); };
            panel.querySelector('#inp-breakDur').onchange = (e) => { config.breakDuration = parseInt(e.target.value); save(); };
            panel.querySelector('#inp-pLimit').onchange = (e) => { config.pLimit = parseInt(e.target.value); save(); };
            panel.querySelector('#inp-minRatio').onchange = (e) => { config.minRatio = parseFloat(e.target.value); save(); };
            panel.querySelector('#inp-minD').onchange = (e) => { config.minDelay = parseInt(e.target.value); save(); };
            panel.querySelector('#inp-maxD').onchange = (e) => { config.maxDelay = parseInt(e.target.value); save(); };
            panel.querySelector('#inp-skip').onchange = (e) => { config.skipList = e.target.value; save(); };
            panel.querySelector('#inp-owner').onchange = (e) => { config.followProfileOwner = e.target.checked; save(); };
            panel.querySelector('#inp-useMinFers').onchange = (e) => { config.useMinFollowers = e.target.checked; save(); renderPanel(); };
            panel.querySelector('#inp-minFers').onchange = (e) => { config.minFollowers = parseInt(e.target.value); save(); };
        } else {
            const clearBtn = panel.querySelector('#clear-log-btn');
            if (clearBtn) clearBtn.onclick = () => { state.logs = []; renderPanel(); };
        }

        panel.querySelector('#main-toggle-btn').onclick = () => {
            config.paused = !config.paused;
            if (!config.paused) { state.cooldownUntil = 0; state.processedInCycle = 0; state.breakUntil = 0; }
            save(); renderPanel(); if (!config.paused && !state.busy) scanFollow();
        };
    };

    const renderSettings = () => `
        <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="background: #f7f9f9; padding: 12px; border-radius: 12px; border: 1px solid #eff3f4;">
                <div style="font-size: 10px; font-weight: 800; color: #536471; margin-bottom: 10px; text-transform: uppercase;">Session Control</div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="font-size: 12px; font-weight: 500;">Follow Limit / Break</label>
                    <input type="number" id="inp-breakLimit" value="${config.breakFollowLimit}" style="width: 50px; border: 1px solid #cfd9de; border-radius: 6px; padding: 4px; text-align: center;">
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 12px; font-weight: 500;">Break Duration (min)</label>
                    <input type="number" id="inp-breakDur" value="${config.breakDuration}" style="width: 50px; border: 1px solid #cfd9de; border-radius: 6px; padding: 4px; text-align: center;">
                </div>
            </div>

            <div style="background: #f7f9f9; padding: 12px; border-radius: 12px; border: 1px solid #eff3f4;">
                <div style="font-size: 10px; font-weight: 800; color: #536471; margin-bottom: 10px; text-transform: uppercase;">Targeting Logic</div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="font-size: 12px; font-weight: 500;">Minimum Ratio</label>
                    <input type="number" step="0.1" id="inp-minRatio" value="${config.minRatio}" style="width: 50px; border: 1px solid #cfd9de; border-radius: 6px; padding: 4px; text-align: center;">
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                        <input type="checkbox" id="inp-useMinFers" ${config.useMinFollowers ? 'checked' : ''}> Min Followers
                    </label>
                    <input type="number" id="inp-minFers" value="${config.minFollowers}" style="width: 60px; border: 1px solid #cfd9de; border-radius: 6px; padding: 4px; text-align: center; ${config.useMinFollowers ? '' : 'opacity: 0.4;'}" ${config.useMinFollowers ? '' : 'disabled'}>
                </div>
            </div>

            <div style="padding: 0 4px;">
                <label style="font-size: 11px; color: #536471; font-weight: 800; display: block; margin-bottom: 4px;">DELAY RANGE (SEC)</label>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                    <input type="number" id="inp-minD" value="${config.minDelay}" style="width: 60px; flex:1; border: 1px solid #cfd9de; border-radius: 6px; padding: 6px; text-align: center;">
                    <span style="color: #cfd9de;">-</span>
                    <input type="number" id="inp-maxD" value="${config.maxDelay}" style="width: 60px; flex:1; border: 1px solid #cfd9de; border-radius: 6px; padding: 6px; text-align: center;">
                </div>

                <label style="font-size: 11px; color: #536471; font-weight: 800; display: block; margin-bottom: 4px;">SKIP LIST</label>
                <textarea id="inp-skip" style="width: 100%; height: 50px; border: 1px solid #cfd9de; border-radius: 8px; padding: 8px; font-size: 11px; font-family: monospace; resize: none; box-sizing: border-box; margin-bottom: 10px;">${config.skipList}</textarea>

                <div style="display: flex; justify-content: space-between;">
                    <label style="font-size: 12px; color: #0f1419; font-weight: 500; display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="inp-owner" ${config.followProfileOwner ? 'checked' : ''}> Follow Profile Owner
                    </label>
                    <div style="font-size:12px; font-weight:500;">Per Profile: <input type="number" id="inp-pLimit" value="${config.pLimit}" style="width: 35px; border: 1px solid #cfd9de; border-radius: 4px; padding: 2px;"></div>
                </div>
            </div>
        </div>
    `;

    const renderLog = () => `
        <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-size: 10px; font-weight: 800; color: #536471; text-transform: uppercase;">Real-time Activity</span>
                <button id="clear-log-btn" style="background:none; border:none; color:#1d9bf0; font-size:10px; font-weight:700; cursor:pointer;">CLEAR</button>
            </div>
            ${state.logs.length === 0 ? '<div style="text-align:center; padding: 20px; color:#536471; font-size:12px;">No activity yet.</div>' : ''}
            ${state.logs.map(l => `
                <div style="font-size: 11px; line-height: 1.4; padding: 6px 8px; border-left: 3px solid ${l.type === 'error' ? '#f4212e' : (l.type === 'success' ? '#00ba7c' : '#cfd9de')}; background: #f7f9f9; border-radius: 4px;">
                    <span style="color: #536471; font-weight: 700; margin-right: 5px;">${l.time}</span>
                    <span style="color: #0f1419;">${l.msg}</span>
                </div>
            `).join('')}
        </div>
    `;

    const updatePillStatus = (msg) => {
        const stat = pill.querySelector('#pill-status');
        if (stat) stat.innerText = msg;
    };

    const randomWait = async () => {
        const sec = Math.floor(Math.random() * (config.maxDelay - config.minDelay + 1)) + config.minDelay;
        for (let i = sec; i > 0; i--) {
            if (config.paused || state.cooldownUntil > Date.now()) break;
            updatePillStatus(`Wait: ${i}s | Session: ${state.sessionFollowCount}/${config.breakFollowLimit}`);
            await delay(1000);
        }
    };

    /**
     * --- MAIN LOOP ---
     */
    async function scanFollow() {
        if (config.paused || state.busy) return;
        state.busy = true;

        try {
            if (state.cooldownUntil > Date.now()) {
                const diff = state.cooldownUntil - Date.now();
                updatePillStatus(`Limit: ${Math.ceil(diff/60000)}m left`);
                state.busy = false; setTimeout(scanFollow, 10000); return;
            }
            if (state.breakUntil > Date.now()) {
                const diff = state.breakUntil - Date.now();
                updatePillStatus(`Break: ${Math.ceil(diff/1000)}s left`);
                state.busy = false; setTimeout(scanFollow, 2000); return;
            }
            if (state.breakUntil !== 0 && state.breakUntil < Date.now()) {
                addLog("Break finished. Refreshing home...");
                state.breakUntil = 0; state.sessionFollowCount = 0; await refreshHome();
            }
            if (state.sessionFollowCount >= config.breakFollowLimit) {
                addLog(`Session limit reached (${config.breakFollowLimit}). Taking a break.`);
                state.breakUntil = Date.now() + (config.breakDuration * 60 * 1000);
                state.busy = false; scanFollow(); return;
            }

            // 1. FOLLOWER LIST SCANNER
            if (window.location.pathname.includes('/followers') || window.location.pathname.includes('/verified_followers')) {
                const cells = Array.from(document.querySelectorAll('div[data-testid="cellInnerDiv"]'));
                for (let cell of cells) {
                    if (config.paused || state.processedInCycle >= config.pLimit || state.sessionFollowCount >= config.breakFollowLimit) break;
                    
                    const followBtn = cell.querySelector('button[data-testid*="-follow"]');
                    const userLink = cell.querySelector('a[role="link"]');
                    const handle = userLink?.href.split('/').pop();

                    if (followBtn && !cell.querySelector('button[data-testid*="-unfollow"]') && !shouldSkipHandle(handle)) {
                        highlightElement(cell);
                        cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        const stats = await getStatsFromHoverCard(userLink);
                        
                        if (stats) {
                            injectStatsLabel(followBtn, stats);
                            const ratioMatch = stats.ratio >= config.minRatio;
                            const fersMatch = !config.useMinFollowers || stats.followers >= config.minFollowers;

                            if (ratioMatch && fersMatch) {
                                addLog(`Following @${handle} (Ratio: ${stats.ratio.toFixed(2)})`, 'success');
                                followBtn.click();
                                if (await checkRateLimit()) break;
                                state.hCount++; state.processedInCycle++; state.sessionFollowCount++;
                                await randomWait();
                            } else {
                                addLog(`Skipped @${handle}: Failed filters`);
                                await delay(800);
                            }
                        }
                    }
                }
                state.processedInCycle = 0;
                await goBack(); await goBack(); state.tweetIndex++;
            }
            
            // 2. PROFILE PAGE SCANNER
            else if (document.querySelector('[data-testid="UserProfileHeader_Items"]')) {
                const handle = window.location.pathname.split('/')[1];
                if (shouldSkipHandle(handle)) { 
                    addLog(`Skipped @${handle} (Skip List)`);
                    await goBack(); state.busy = false; return scanFollow(); 
                }

                if (config.followProfileOwner) {
                    const followBtn = document.querySelector('button[data-testid$="-follow"]');
                    if (followBtn && !document.querySelector('button[data-testid$="-unfollow"]')) {
                        const follLink = document.querySelector('a[href$="/following"] span span');
                        const fersLink = document.querySelector('a[href$="/followers"] span span') || document.querySelector('a[href$="/verified_followers"] span span');
                        if (follLink && fersLink) {
                            const fers = parseTwitterNumber(fersLink.innerText);
                            const fing = parseTwitterNumber(follLink.innerText);
                            const ratio = fing / (fers || 1);
                            
                            injectStatsLabel(followBtn, { ratio, followers: fers, following: fing });
                            if (ratio >= config.minRatio && (!config.useMinFollowers || fers >= config.minFollowers)) { 
                                addLog(`Following Profile Owner @${handle}`, 'success');
                                followBtn.click(); state.sessionFollowCount++;
                                if (!await checkRateLimit()) await randomWait();
                            }
                        }
                    }
                }
                const verifiedBtn = document.querySelector('a[href$="/verified_followers"]');
                const standardBtn = document.querySelector('a[href$="/followers"]');
                if (verifiedBtn || standardBtn) { 
                    addLog(`Opening followers list of @${handle}...`);
                    (verifiedBtn || standardBtn).click(); 
                    await delay(2000); 
                }
                else { await goBack(); state.tweetIndex++; }
            }
            
            // 3. MAIN FEED SCANNER
            else {
                updatePillStatus("Scanning Feed...");
                if (await checkNewPostsBanner()) { state.busy = false; setTimeout(scanFollow, 1000); return; }

                const cells = Array.from(document.querySelectorAll('div[data-testid="cellInnerDiv"]'));
                const tweets = cells.filter(c => c.querySelector('article[data-testid="tweet"]') && !isAd(c));

                if (state.tweetIndex >= tweets.length) {
                    window.scrollBy(0, 1000); await delay(2000); state.tweetIndex = 0;
                } else {
                    const cell = tweets[state.tweetIndex];
                    highlightElement(cell);
                    const profileLink = cell.querySelector('div[data-testid="User-Name"] a');
                    const handle = profileLink?.href.split('/').pop();

                    if (profileLink && !shouldSkipHandle(handle)) {
                        cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await delay(800);
                        const stats = await getStatsFromHoverCard(profileLink);
                        if (stats) {
                            addLog(`Visiting Profile @${handle}...`);
                            profileLink.click(); await delay(2000);
                        } else { state.tweetIndex++; }
                    } else { state.tweetIndex++; }
                }
            }
        } catch (e) { addLog("Error: " + e.message, 'error'); }

        state.busy = false;
        if (!config.paused) setTimeout(scanFollow, 1000);
    }

    setTimeout(() => { 
        setupUI(); 
        addLog("Bot Loaded V2.1.0 Ready."); 
    }, 2500);
})();
