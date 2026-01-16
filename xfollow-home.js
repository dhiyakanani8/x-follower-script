// ==UserScript==
// @name         𝕏-Follow-Automator-Pro-V4
// @namespace    https://dhiya000.netlify.app/
// @version      4.0.0
// @author       @dhiya_000
// @match        https://x.com/home
// @match        https://x.com/explore
// @match        https://x.com/*/status/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- Persistent Config & State ---
    const getSet = (k, def) => {
        const val = localStorage.getItem(k);
        return val ? JSON.parse(val) : def;
    };

    const config = {
        paused: true,
        pLimit: getSet('xf_pLimit', 2),
        hLimit: getSet('xf_hLimit', 50),
        minDelay: getSet('xf_minDelay', 5),
        maxDelay: getSet('xf_maxDelay', 15),
        followProfileOwner: getSet('xf_followOwner', false),
        uiVisible: true
    };

    let state = {
        busy: false,
        tweetIndex: 0,
        lastHandle: null,
        tabId: Date.now() + '-' + Math.random(),
        hCount: 0,
        cooldownUntil: getSet('xf_cooldown', 0) // Persist rate limit cooldown
    };

    function log(msg) { console.log(`[𝕏-Bot] ${msg}`); }

    const save = () => {
        localStorage.setItem('xf_pLimit', config.pLimit);
        localStorage.setItem('xf_hLimit', config.hLimit);
        localStorage.setItem('xf_minDelay', config.minDelay);
        localStorage.setItem('xf_maxDelay', config.maxDelay);
        localStorage.setItem('xf_followOwner', config.followProfileOwner);
        localStorage.setItem('xf_cooldown', state.cooldownUntil);
    };

    // --- UI ELEMENTS ---
    const pill = document.createElement('div');
    const panel = document.createElement('div');

    const setupUI = () => {
        pill.style.cssText = `
            position:fixed; top:10px; right:10px; z-index:10001;
            background:#1DA1F2; color:#fff; padding:8px 15px;
            border-radius:20px; font-family:sans-serif; font-size:12px;
            font-weight:bold; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.2);
            display:flex; align-items:center; gap:8px; border:2px solid #fff;
            user-select:none; transition: all 0.2s;
        `;
        pill.innerHTML = `<span>🤖</span> <span id="pill-status">Bot Paused</span>`;
        pill.onclick = () => {
            config.uiVisible = !config.uiVisible;
            panel.style.display = config.uiVisible ? 'block' : 'none';
        };

        panel.style.cssText = `
            position:fixed; top:55px; right:10px; z-index:10000;
            background:#fff; padding:15px; border:1px solid #1DA1F2;
            border-radius:12px; font-family:sans-serif; width:260px;
            box-shadow:0 10px 25px rgba(0,0,0,0.1); color:#000;
            display: ${config.uiVisible ? 'block' : 'none'};
        `;

        renderPanel();
        document.body.appendChild(pill);
        document.body.appendChild(panel);
    };

    const renderPanel = () => {
        panel.innerHTML = `
            <div style="font-weight:bold; margin-bottom:12px; border-bottom:1px solid #eee; padding-bottom:5px; display:flex; justify-content:space-between;">
                <span>Settings</span>
                <span id="panel-status-label" style="color:${config.paused ? 'red' : 'green'}">${config.paused ? 'Stopped' : 'Running'}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; font-size:11px;">
                <label>Profile Limit: <input type="number" id="inp-pLimit" value="${config.pLimit}" style="width:50px;float:right;"></label>
                <label>Hourly Limit: <input type="number" id="inp-hLimit" value="${config.hLimit}" style="width:50px;float:right;"></label>
                <label>Min Delay (s): <input type="number" id="inp-minD" value="${config.minDelay}" style="width:50px;float:right;"></label>
                <label>Max Delay (s): <input type="number" id="inp-maxD" value="${config.maxDelay}" style="width:50px;float:right;"></label>
                <label><input type="checkbox" id="inp-owner" ${config.followProfileOwner ? 'checked' : ''}> Follow Profile Owner</label>
                <button id="main-toggle-btn" style="margin-top:10px; padding:10px; background:${config.paused ? '#1DA1F2' : '#ff4b4b'}; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">
                    ${config.paused ? 'START BOT' : 'STOP BOT'}
                </button>
            </div>
        `;

        panel.querySelector('#inp-pLimit').onchange = (e) => { config.pLimit = parseInt(e.target.value); save(); };
        panel.querySelector('#inp-hLimit').onchange = (e) => { config.hLimit = parseInt(e.target.value); save(); };
        panel.querySelector('#inp-minD').onchange = (e) => { config.minDelay = parseInt(e.target.value); save(); };
        panel.querySelector('#inp-maxD').onchange = (e) => { config.maxDelay = parseInt(e.target.value); save(); };
        panel.querySelector('#inp-owner').onchange = (e) => { config.followProfileOwner = e.target.checked; save(); };
        
        panel.querySelector('#main-toggle-btn').onclick = () => {
            config.paused = !config.paused;
            // If user manually starts, clear any existing cooldown
            if (!config.paused) state.cooldownUntil = 0; save();
            updatePillStatus(config.paused ? "Bot Stopped" : "Starting...");
            renderPanel();
            if (!config.paused && !state.busy) scanFollow();
        };
    };

    const updatePillStatus = (msg) => {
        const stat = pill.querySelector('#pill-status');
        if (stat) stat.innerText = msg;
    };

    // --- RATE LIMIT CHECKER ---
    async function checkRateLimit() {
        await delay(1200); // Wait for potential toast to appear
        const toast = document.querySelector('[data-testid="toast"]');
        if (toast) {
            const text = toast.textContent.toLowerCase();
            if (text.includes('rate limited') || text.includes('unable to follow')) {
                log('Limit detected! Pausing for 1 hour.');
                state.cooldownUntil = Date.now() + (60 * 60 * 1000); // 1 hour
                save();
                return true;
            }
        }
        return false;
    }

    // --- LOGIC UTILITIES ---
    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    const randomWait = async () => {
        const sec = Math.floor(Math.random() * (config.maxDelay - config.minDelay + 1)) + config.minDelay;
        for (let i = sec; i > 0; i--) {
            if (config.paused || Date.now() < state.cooldownUntil) break;
            updatePillStatus(`Wait: ${i}s | Follows: ${state.hCount}`);
            await delay(1000);
        }
    };

    const isAd = (tweet) => {
        const spans = Array.from(tweet.querySelectorAll('span'));
        return spans.some(s => s.textContent === 'Promoted' || s.textContent === 'Ad') || !!tweet.querySelector('[data-testid="placementTracking"]');
    };

    const getValidTweets = () => {
        const cells = Array.from(document.querySelectorAll('div[data-testid="cellInnerDiv"]'));
        return cells.map(c => c.querySelector('article[data-testid="tweet"]')).filter(t => t && !isAd(t));
    };

    const goBack = async () => {
        const btn = document.querySelector('button[data-testid="app-bar-back"]');
        if (btn) { btn.click(); await delay(2000); return true; }
        return false;
    };

    // --- MAIN LOOP ---
    async function scanFollow() {
        if (config.paused || state.busy) return;
        state.busy = true;

        try {
            // 1. Check Cooldown / Rate Limit State
            if (state.cooldownUntil > Date.now()) {
                const diff = state.cooldownUntil - Date.now();
                const mins = Math.ceil(diff / 1000 / 60);
                updatePillStatus(`Limit: Resuming in ${mins}m`);
                state.busy = false;
                setTimeout(scanFollow, 30000); // Re-check every 30 seconds
                return;
            }

            // 2. Check Hourly Limit
            if (state.hCount >= config.hLimit) {
                updatePillStatus("Hourly Limit Reached");
                config.paused = true;
                renderPanel();
                state.busy = false;
                return;
            }

            // 3. Logic for Followers Page
            if (window.location.pathname.includes('/verified_followers')) {
                const cells = Array.from(document.querySelectorAll('div[data-testid="cellInnerDiv"]'));
                let followedInProfile = 0;

                for (let cell of cells) {
                    if (config.paused || followedInProfile >= config.pLimit || state.cooldownUntil > Date.now()) break;
                    
                    const followBtn = cell.querySelector('button[data-testid*="-follow"]');
                    const isFollowing = cell.querySelector('button[data-testid*="-unfollow"]');
                    const isProtected = cell.querySelector('svg[aria-label="Protected account"]');

                    if (followBtn && !isFollowing && !isProtected) {
                        cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await delay(500);
                        followBtn.click();
                        
                        // Check for rate limit immediately after clicking
                        if (await checkRateLimit()) break;

                        state.hCount++;
                        followedInProfile++;
                        await randomWait();
                    }
                }
                
                await goBack(); // Back to Profile
                await delay(1000);
                await goBack(); // Back to Home
                state.tweetIndex++;
            } 
            
            // 4. Logic for Homepage
            else {
                updatePillStatus("Scanning Feed...");
                const tweets = getValidTweets();

                if (state.tweetIndex >= tweets.length) {
                    window.scrollBy(0, 800);
                    await delay(2000);
                    state.tweetIndex = 0;
                } else {
                    const tweet = tweets[state.tweetIndex];
                    const handle = tweet.querySelector('div[data-testid="User-Name"] a')?.href.split('/').pop();

                    if (handle === state.lastHandle) {
                        state.tweetIndex++;
                        state.busy = false;
                        return scanFollow();
                    }

                    tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await delay(1000);

                    const profileLink = tweet.querySelector('div[data-testid="User-Name"] a');
                    if (profileLink) {
                        state.lastHandle = handle;
                        profileLink.click();
                        await delay(2000);

                        if (config.followProfileOwner) {
                            const ownerFollow = document.querySelector('div[data-testid="placementTracking"] button[data-testid*="-follow"]');
                            if (ownerFollow) {
                                ownerFollow.click();
                                if (await checkRateLimit()) { state.busy = false; return scanFollow(); }
                                await randomWait();
                            }
                        }

                        const followerBtn = document.querySelector('a[href*="/verified_followers"]');
                        if (followerBtn) {
                            followerBtn.click();
                            await delay(2000);
                        } else {
                            await goBack();
                            state.tweetIndex++;
                        }
                    } else {
                        state.tweetIndex++;
                    }
                }
            }
        } catch (e) {
            log("Error: " + e.message);
        }

        state.busy = false;
        if (!config.paused) setTimeout(scanFollow, 1000);
    }

    // --- LOCK & INIT ---
    function acquireLock() {
        const active = localStorage.getItem('xf_active_tab');
        if (active && active !== state.tabId) return false;
        localStorage.setItem('xf_active_tab', state.tabId);
        return true;
    }

    window.onbeforeunload = () => localStorage.removeItem('xf_active_tab');

    if (acquireLock()) {
        setTimeout(() => {
            setupUI();
            log("Bot Ready");
            if (!config.paused) scanFollow();
        }, 2000);
    }

})();
