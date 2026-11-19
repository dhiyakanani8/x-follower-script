// ==UserScript==
// @name         𝕏-Automator-Pro-V4.1
// @namespace    https://dhiya000.netlify.app/
// @version      4.1.0
// @description  Dual-Engine Automator with Multi-Tier Error Detection (Daily Limit, Hourly Limit, API Limit, Glitches), Accurate Bio & Ratio checks.
// @author       @dhiya_000
// @match        https://x.com/*/following
// @match        https://x.com/*/followers
// @match        https://x.com/*/verified_followers
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    /**
     * --- DATE & PERSISTENT STORAGE ---
     */
    const getTodayKey = () => new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

    const getSet = (k, def) => {
        const val = localStorage.getItem(k);
        if (!val) return def;
        try { return JSON.parse(val); } catch (e) { return val; }
    };

    const getDailyMetric = (key) => {
        const storedDate = localStorage.getItem('xa_todayDate');
        const today = getTodayKey();
        if (storedDate !== today) {
            localStorage.setItem('xa_todayDate', today);
            localStorage.setItem('xa_todayUnfollowed', '0');
            localStorage.setItem('xa_todayFollowed', '0');
            return 0;
        }
        return parseInt(localStorage.getItem(key) || '0', 10);
    };

    const isFollowingPage = () => window.location.pathname.endsWith('/following');
    const isFollowersPage = () => window.location.pathname.endsWith('/followers') || window.location.pathname.endsWith('/verified_followers');

    const config = {
        paused: true,
        // --- UNFOLLOW RULES (/following) ---
        unfSkipInitialCount: getSet('xa_unfSkipInitial', 100),
        unfNotFollowBack: getSet('xa_unfNotFollowBack', true),
        unfNoAvatar: getSet('xa_unfNoAvatar', true),
        unfNoBio: getSet('xa_unfNoBio', false),
        unfUseMinFers: getSet('xa_unfUseMinFers', true),
        unfMinFers: getSet('xa_unfMinFers', 100),
        unfUseMaxRatio: getSet('xa_unfUseMaxRatio', true),
        unfMaxRatio: getSet('xa_unfMaxRatio', 2.0),

        // --- FOLLOW BACK RULES (/followers & /verified_followers) ---
        fbSkipInitialCount: getSet('xa_fbSkipInitial', 0),
        fbSkipNoAvatar: getSet('xa_fbSkipNoAvatar', true),      // Don't follow if No DP
        fbSkipNoBio: getSet('xa_fbSkipNoBio', true),            // Don't follow if No Bio
        fbUseMinFollowers: getSet('xa_fbUseMinFers', true),    // Min Followers > 200
        fbMinFollowers: getSet('xa_fbMinFers', 200),
        fbUseMaxRatio: getSet('xa_fbUseMaxRatio', true),        // Ratio < 1.5
        fbMaxRatio: getSet('xa_fbMaxRatio', 1.5),

        // --- COMMON LIMITS & DELAYS ---
        breakLimit: getSet('xa_breakLimit', 15),
        breakDuration: getSet('xa_breakDuration', 5),
        minDelay: getSet('xa_minDelay', 3),
        maxDelay: getSet('xa_maxDelay', 7),
        skipList: getSet('xa_skipList', "elonmusk, grok, x, twitter"),

        // UI
        uiVisible: true,
        activeTab: isFollowersPage() ? 'followback' : 'unfollow'
    };

    let state = {
        busy: false,
        totalScanned: 0,
        totalSkipped: 0,
        sessionCount: 0,
        todayUnfollowed: getDailyMetric('xa_todayUnfollowed'),
        todayFollowed: getDailyMetric('xa_todayFollowed'),
        currentDate: getTodayKey(),
        breakUntil: 0,
        cooldownUntil: getSet('xa_cooldown', 0),
        cooldownReason: getSet('xa_cooldownReason', ''),
        processedHandles: new Set(),
        logs: []
    };

    const checkMidnightRollover = () => {
        const today = getTodayKey();
        if (state.currentDate !== today) {
            state.currentDate = today;
            state.todayUnfollowed = 0;
            state.todayFollowed = 0;
            localStorage.setItem('xa_todayDate', today);
            localStorage.setItem('xa_todayUnfollowed', '0');
            localStorage.setItem('xa_todayFollowed', '0');
            addLog("Midnight passed: Daily counters reset to 0.", "info");
            updateLiveTelemetry();
        }
    };

    const incrementActionCount = (isUnfollow = true) => {
        checkMidnightRollover();
        state.sessionCount++;
        if (isUnfollow) {
            state.todayUnfollowed++;
            localStorage.setItem('xa_todayUnfollowed', state.todayUnfollowed.toString());
        } else {
            state.todayFollowed++;
            localStorage.setItem('xa_todayFollowed', state.todayFollowed.toString());
        }
        updateLiveTelemetry();
    };

    const save = () => {
        localStorage.setItem('xa_unfSkipInitial', JSON.stringify(config.unfSkipInitialCount));
        localStorage.setItem('xa_unfNotFollowBack', JSON.stringify(config.unfNotFollowBack));
        localStorage.setItem('xa_unfNoAvatar', JSON.stringify(config.unfNoAvatar));
        localStorage.setItem('xa_unfNoBio', JSON.stringify(config.unfNoBio));
        localStorage.setItem('xa_unfUseMinFers', JSON.stringify(config.unfUseMinFers));
        localStorage.setItem('xa_unfMinFers', JSON.stringify(config.unfMinFers));
        localStorage.setItem('xa_unfUseMaxRatio', JSON.stringify(config.unfUseMaxRatio));
        localStorage.setItem('xa_unfMaxRatio', JSON.stringify(config.unfMaxRatio));

        localStorage.setItem('xa_fbSkipInitial', JSON.stringify(config.fbSkipInitialCount));
        localStorage.setItem('xa_fbSkipNoAvatar', JSON.stringify(config.fbSkipNoAvatar));
        localStorage.setItem('xa_fbSkipNoBio', JSON.stringify(config.fbSkipNoBio));
        localStorage.setItem('xa_fbUseMinFers', JSON.stringify(config.fbUseMinFollowers));
        localStorage.setItem('xa_fbMinFers', JSON.stringify(config.fbMinFollowers));
        localStorage.setItem('xa_fbUseMaxRatio', JSON.stringify(config.fbUseMaxRatio));
        localStorage.setItem('xa_fbMaxRatio', JSON.stringify(config.fbMaxRatio));

        localStorage.setItem('xa_breakLimit', JSON.stringify(config.breakLimit));
        localStorage.setItem('xa_breakDuration', JSON.stringify(config.breakDuration));
        localStorage.setItem('xa_minDelay', JSON.stringify(config.minDelay));
        localStorage.setItem('xa_maxDelay', JSON.stringify(config.maxDelay));
        localStorage.setItem('xa_skipList', JSON.stringify(config.skipList));
        localStorage.setItem('xa_cooldown', JSON.stringify(state.cooldownUntil));
        localStorage.setItem('xa_cooldownReason', JSON.stringify(state.cooldownReason));
    };

    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    const addLog = (msg, type = 'info') => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        state.logs.unshift({ time, msg, type });
        if (state.logs.length > 60) state.logs.pop();
        console.log(`[𝕏-Automator] ${msg}`);
        if (config.activeTab === 'log') renderPanel();
    };

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

    const isWhitelisted = (handle) => {
        if (!handle) return false;
        const list = config.skipList.split(',').map(i => i.trim().toLowerCase().replace('@', ''));
        return list.includes(handle.toLowerCase().replace('@', ''));
    };

    /**
     * --- MULTI-TIER ERROR & RATE LIMIT DETECTOR ---
     */
    const inspectAlertToasts = async () => {
        await delay(800);
        const toast = document.querySelector('[data-testid="toast"]');
        if (!toast) return false;

        const text = toast.textContent.toLowerCase();

        // 1. Hard Daily Follow Limit -> Pause until midnight tomorrow
        if (text.includes('daily follow limit') || text.includes('cannot follow any more people today') || text.includes('reached your daily limit')) {
            const midnight = new Date();
            midnight.setHours(24, 0, 0, 0); // Next 00:00:00
            const waitMs = midnight.getTime() - Date.now();
            const hoursLeft = Math.ceil(waitMs / (1000 * 60 * 60));

            state.cooldownUntil = midnight.getTime();
            state.cooldownReason = `Daily Limit Hit (${hoursLeft}h left)`;
            save();
            addLog(`CRITICAL: Daily Follow Limit Reached! Paused until midnight (~${hoursLeft}h).`, 'error');
            return true;
        }

        // 2. Hourly Velocity Limit -> Pause 60 Minutes
        if (text.includes('unable to follow more people') || text.includes('unable to follow')) {
            state.cooldownUntil = Date.now() + (60 * 60 * 1000); // 60 mins
            state.cooldownReason = 'Hourly Velocity Limit (60m)';
            save();
            addLog('ALERT: Hourly velocity limit reached. Pausing for 60 minutes.', 'error');
            return true;
        }

        // 3. General API Rate Limit -> Pause 20 Minutes
        if (text.includes('rate limit exceeded') || text.includes('rate limited') || text.includes('try again in a few moments')) {
            state.cooldownUntil = Date.now() + (20 * 60 * 1000); // 20 mins
            state.cooldownReason = 'API Rate Limit (20m)';
            save();
            addLog('ALERT: API Rate Limit exceeded. Pausing for 20 minutes.', 'error');
            return true;
        }

        // 4. Temporary Server Glitch -> Short wait 10s (Does NOT trigger long cooldown)
        if (text.includes('something went wrong') || text.includes('give it another shot') || text.includes('could not be completed')) {
            addLog('NOTICE: Server connection lag/glitch. Waiting 10s before retry...', 'info');
            updateLiveTelemetry('Glitch: Waiting 10s...');
            await delay(10000);
            return false; // Continues normal flow after brief pause
        }

        // 5. Bot Challenge / Captcha / Locked Account -> Emergency Stop
        if (text.includes('authenticate your account') || text.includes('unusual activity') || text.includes('challenge')) {
            config.paused = true;
            save();
            renderPanel();
            addLog('EMERGENCY: Captcha or Security Check detected! Bot stopped for manual solving.', 'error');
            alert('Twitter/X requested a security challenge or Captcha. Please solve it manually in your browser before restarting the bot.');
            return true;
        }

        return false;
    };

    /**
     * --- ACCURATE BIO CHECK ---
     */
    const detectBio = (cell, hoverCard) => {
        const userCell = cell.querySelector('[data-testid="UserCell"]') || cell;
        const nameBlock = userCell.querySelector('div[data-testid="User-Name"]');
        const textBlocks = Array.from(userCell.querySelectorAll('div[dir="auto"]'));

        for (const block of textBlocks) {
            if (nameBlock && nameBlock.contains(block)) continue;
            const txt = block.textContent.trim();
            if (
                txt.length > 0 &&
                txt !== 'Follows you' &&
                !txt.toLowerCase().includes('following') &&
                !txt.toLowerCase().includes('unfollow') &&
                !txt.toLowerCase().includes('blocked')
            ) {
                return true;
            }
        }

        if (hoverCard) {
            const desc = hoverCard.querySelector('[data-testid="UserDescription"]');
            if (desc && desc.textContent.trim().length > 0) return true;

            const hoverBlocks = Array.from(hoverCard.querySelectorAll('div[dir="auto"]'));
            const hoverName = hoverCard.querySelector('div[data-testid="User-Name"]');
            for (const b of hoverBlocks) {
                if (hoverName && hoverName.contains(b)) continue;
                const txt = b.textContent.trim();
                if (txt.length > 0 && !txt.includes('Followers') && !txt.includes('Following') && !txt.startsWith('@')) {
                    return true;
                }
            }
        }
        return false;
    };

    const getActionButton = (cell) => {
        if (isFollowingPage()) {
            let btn = cell.querySelector('button[data-testid*="-unfollow"]');
            if (btn) return { btn, isFollow: false };
            btn = cell.querySelector('button[aria-label*="Following"], button[aria-label*="Unfollow"]');
            if (btn) return { btn, isFollow: false };
            const allBtns = Array.from(cell.querySelectorAll('button, div[role="button"]'));
            for (const b of allBtns) {
                const txt = (b.textContent || '').trim().toLowerCase();
                const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                if (txt === 'following' || txt === 'unfollow' || aria.includes('following') || aria.includes('unfollow')) {
                    return { btn: b, isFollow: false };
                }
            }
            return { btn: null, isFollow: false };
        } else {
            let btn = cell.querySelector('button[data-testid$="-follow"]');
            if (btn && !cell.querySelector('button[data-testid$="-unfollow"]')) {
                return { btn, isFollow: true };
            }
            const allBtns = Array.from(cell.querySelectorAll('button, div[role="button"]'));
            for (const b of allBtns) {
                const txt = (b.textContent || '').trim().toLowerCase();
                if (txt === 'follow') {
                    return { btn: b, isFollow: true };
                }
            }
            return { btn: null, isFollow: false };
        }
    };

    const getUserInfo = (cell) => {
        const userNameDiv = cell.querySelector('div[data-testid="User-Name"]');
        let textLink = userNameDiv ? userNameDiv.querySelector('a[href^="/"]') : null;

        if (!textLink) {
            const links = Array.from(cell.querySelectorAll('a[role="link"]'));
            textLink = links.find(a => a.innerText && a.innerText.includes('@')) || links[0];
        }

        let handle = '';
        if (textLink && textLink.getAttribute('href')) {
            handle = textLink.getAttribute('href').replace('/', '').trim();
        }
        return { userLink: textLink, handle };
    };

    const highlightCell = (cell, colorType) => {
        if (!cell) return;
        cell.style.transition = 'outline 0.2s ease';
        if (colorType === 'scanning') {
            cell.style.outline = '3px solid #1DA1F2'; // Twitter Blue
            cell.style.outlineOffset = '-3px';
        } else if (colorType === 'unfollowed' || colorType === 'failed') {
            cell.style.outline = '3px solid #f4212e'; // Red
            cell.style.outlineOffset = '-3px';
        } else if (colorType === 'kept' || colorType === 'followed') {
            cell.style.outline = '3px solid #00ba7c'; // Green
            cell.style.outlineOffset = '-3px';
        } else if (colorType === 'skipped') {
            cell.style.outline = '2px dashed #71767b'; // Gray
            cell.style.outlineOffset = '-2px';
        } else {
            cell.style.outline = 'none';
        }
    };

    const getStatsFromHoverCard = async (userElement, cell) => {
        if (!userElement) return null;

        userElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        userElement.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

        let attempts = 0, hoverCard = null;
        while (attempts < 12) {
            hoverCard = document.querySelector('[data-testid="hoverCardParent"]');
            if (hoverCard) break;
            await delay(100);
            attempts++;
        }

        const links = hoverCard ? Array.from(hoverCard.querySelectorAll('a[role="link"]')) : [];
        let followers = 0, following = 0;
        links.forEach(l => {
            const txt = l.innerText.toLowerCase();
            const valSpan = l.querySelector('span');
            const val = parseTwitterNumber(valSpan ? valSpan.innerText : "0");
            if (txt.includes('follower')) followers = val;
            if (txt.includes('following')) following = val;
        });

        const hasBio = detectBio(cell, hoverCard);

        userElement.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
        await delay(150);

        return {
            ratio: following / (followers || 1),
            followers,
            following,
            hasBio
        };
    };

    const injectStatsLabel = (btn, stats, followsYou, isFollowBackMode = false) => {
        if (!btn || !stats) return;
        const parent = btn.parentElement;
        let label = parent.querySelector('.bot-ratio-ui');
        if (!label) {
            label = document.createElement('div');
            label.className = 'bot-ratio-ui';
            label.style.cssText = 'font-size:10px; font-weight:bold; margin-top:4px; text-align:center; display:block; width:100%; line-height:1.2; background: rgba(0,0,0,0.05); padding: 4px; border-radius: 4px;';
            parent.appendChild(label);
        }

        let ratioPass, followersPass, bioPass;
        if (isFollowBackMode) {
            ratioPass = !config.fbUseMaxRatio || stats.ratio <= config.fbMaxRatio; // < 1.5
            followersPass = !config.fbUseMinFollowers || stats.followers >= config.fbMinFollowers; // > 200
            bioPass = !config.fbSkipNoBio || stats.hasBio;
        } else {
            ratioPass = !config.unfUseMaxRatio || stats.ratio <= config.unfMaxRatio; // <= 2.0
            followersPass = !config.unfUseMinFers || stats.followers >= config.unfMinFers;
            bioPass = !config.unfNoBio || stats.hasBio;
        }

        const badgeStyle = (pass, color) => `
            display: flex; justify-content: space-between; align-items: center; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin: 2px 0; font-weight: 700;
            background: ${pass ? color + '15' : '#fee2e2'}; color: ${pass ? color : '#dc2626'}; border: 1px solid ${pass ? color + '30' : '#fecaca'};
        `;

        label.innerHTML = `
            <div style="${badgeStyle(followsYou, '#00ba7c')}"><span>Follows You</span> <span>${followsYou ? 'YES' : 'NO'}</span></div>
            <div style="${badgeStyle(ratioPass, '#00ba7c')}"><span>Ratio</span> <span>${stats.ratio.toFixed(2)}</span></div>
            <div style="${badgeStyle(followersPass, '#1d9bf0')}"><span>Follower</span> <span>${formatTwitterNumber(stats.followers)}</span></div>
            <div style="${badgeStyle(bioPass, '#8b5cf6')}"><span>Bio</span> <span>${stats.hasBio ? 'YES' : 'NO'}</span></div>
        `;
    };

    const performUnfollow = async (btn) => {
        try {
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await delay(300);
            btn.focus();
            btn.click();
            await delay(500);

            let confirmBtn = null;
            for (let i = 0; i < 15; i++) {
                confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]') ||
                             Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim().toLowerCase() === 'unfollow');
                if (confirmBtn) break;
                await delay(150);
            }

            if (confirmBtn) {
                confirmBtn.click();
                await delay(800);
                return true;
            } else {
                const txt = btn.textContent.toLowerCase();
                if (txt === 'follow' || btn.querySelector('[data-testid*="-follow"]')) return true;
            }
        } catch (e) {
            addLog("Click error: " + e.message, "error");
        }
        return false;
    };

    const performFollow = async (btn) => {
        try {
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await delay(300);
            btn.focus();
            btn.click();
            await delay(800);
            return true;
        } catch (e) {
            addLog("Follow click error: " + e.message, "error");
        }
        return false;
    };

    const scrollFollowingList = async (fast = false) => {
        const cells = document.querySelectorAll('div[data-testid="cellInnerDiv"]');
        if (cells.length > 0) {
            cells[cells.length - 1].scrollIntoView({ behavior: fast ? 'auto' : 'smooth', block: 'end' });
        }
        await delay(fast ? 300 : 800);
        window.scrollBy({ top: 1200, behavior: fast ? 'auto' : 'smooth' });
        await delay(fast ? 600 : 1800);
    };

    /**
     * --- LIVE TELEMETRY DISPLAY ---
     */
    const updateLiveTelemetry = (overrideText = null) => {
        checkMidnightRollover();

        const isUnf = isFollowingPage();
        const todayCount = isUnf ? state.todayUnfollowed : state.todayFollowed;
        const modeLabel = isUnf ? 'Unf' : 'Fol';

        // 1. Floating Pill
        const pillText = pill.querySelector('#pill-status');
        if (pillText) {
            if (overrideText) {
                pillText.innerHTML = overrideText;
            } else {
                pillText.innerHTML = `Scan: <span style="color:#1d9bf0;">${state.totalScanned}</span> | Today ${modeLabel}: <span style="color:#00ba7c;">${todayCount}</span> | Sess: ${state.sessionCount}/${config.breakLimit}`;
            }
        }

        // 2. Panel Header
        const statScan = panel.querySelector('#stat-scanned');
        const statSkip = panel.querySelector('#stat-skipped');
        const statToday = panel.querySelector('#stat-today');
        const statTodayLabel = panel.querySelector('#stat-today-label');
        const statSess = panel.querySelector('#stat-session');

        if (statScan) statScan.innerText = state.totalScanned;
        if (statSkip) statSkip.innerText = state.totalSkipped;
        if (statToday) statToday.innerText = todayCount;
        if (statTodayLabel) statTodayLabel.innerText = isUnf ? 'Today Unf' : 'Today Fol';
        if (statSess) statSess.innerText = `${state.sessionCount}/${config.breakLimit}`;
    };

    /**
     * --- UI SHELL ---
     */
    const pill = document.createElement('div');
    const panel = document.createElement('div');

    const setupUI = () => {
        pill.style.cssText = `position:fixed; top:10px; right:10px; z-index:10001; background:#000; color:#fff; padding:8px 16px; border-radius:30px; font-family:sans-serif; font-size:12px; font-weight:bold; cursor:pointer; box-shadow:0 4px 15px rgba(0,0,0,0.3); border:1px solid #333; display:flex; align-items:center; gap:8px;`;
        pill.innerHTML = `<span style="color:#1d9bf0; font-size:16px;">⚡</span> <span id="pill-status">Automator Ready</span>`;
        pill.onclick = () => { config.uiVisible = !config.uiVisible; panel.style.display = config.uiVisible ? 'flex' : 'none'; };

        panel.style.cssText = `position:fixed; top:60px; right:10px; z-index:10000; background:#fff; border:1px solid #eff3f4; border-radius:20px; font-family:sans-serif; width:350px; color:#000; display:${config.uiVisible ? 'flex' : 'none'}; box-shadow:0 15px 35px rgba(0,0,0,0.2); overflow:hidden; flex-direction:column;`;
        
        renderPanel();
        document.body.appendChild(pill);
        document.body.appendChild(panel);
    };

    const renderPanel = () => {
        const isUnf = isFollowingPage();
        const tab = config.activeTab;

        panel.innerHTML = `
            <!-- Live Real-Time Dashboard Header -->
            <div style="background:#0f1419; color:#fff; padding:10px 14px; display:grid; grid-template-columns: repeat(4, 1fr); text-align:center; font-size:11px; font-weight:600; border-bottom:1px solid #2f3336;">
                <div>Scanned<br><b id="stat-scanned" style="color:#1d9bf0; font-size:13px;">${state.totalScanned}</b></div>
                <div>Skipped<br><b id="stat-skipped" style="color:#f59e0b; font-size:13px;">${state.totalSkipped}</b></div>
                <div><span id="stat-today-label">${isUnf ? 'Today Unf' : 'Today Fol'}</span><br><b id="stat-today" style="color:#00ba7c; font-size:13px;">${isUnf ? state.todayUnfollowed : state.todayFollowed}</b></div>
                <div>Session<br><b id="stat-session" style="color:#f4212e; font-size:13px;">${state.sessionCount}/${config.breakLimit}</b></div>
            </div>

            <!-- Tab Switcher -->
            <div style="display:flex; background:#f7f9f9; border-bottom:1px solid #eff3f4; padding:4px; gap:2px;">
                <button id="tab-unfollow" style="flex:1; padding:8px 4px; border:none; background:${tab === 'unfollow' ? '#fff' : 'transparent'}; border-radius:12px; font-weight:700; cursor:pointer; font-size:11px; color:${tab === 'unfollow' ? '#f4212e' : '#536471'}; box-shadow:${tab === 'unfollow' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'};">UNFOLLOW</button>
                <button id="tab-followback" style="flex:1; padding:8px 4px; border:none; background:${tab === 'followback' ? '#fff' : 'transparent'}; border-radius:12px; font-weight:700; cursor:pointer; font-size:11px; color:${tab === 'followback' ? '#00ba7c' : '#536471'}; box-shadow:${tab === 'followback' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'};">FOLLOW BACK</button>
                <button id="tab-log" style="flex:1; padding:8px 4px; border:none; background:${tab === 'log' ? '#fff' : 'transparent'}; border-radius:12px; font-weight:700; cursor:pointer; font-size:11px; color:${tab === 'log' ? '#1d9bf0' : '#536471'}; box-shadow:${tab === 'log' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'};">LOG</button>
            </div>

            <!-- Content Area -->
            <div id="bot-content-area" style="padding:14px; max-height:420px; overflow-y:auto; background:#fff;">
                ${tab === 'unfollow' ? renderUnfollowSettings() : (tab === 'followback' ? renderFollowBackSettings() : renderLog())}
            </div>

            <!-- Main Control Footer -->
            <div style="padding:14px; border-top:1px solid #eff3f4; background:#fff;">
                <button id="main-toggle-btn" style="width:100%; padding:12px; background:${config.paused ? (isUnf ? '#f4212e' : '#00ba7c') : '#0f1419'}; color:#fff; border:none; border-radius:25px; cursor:pointer; font-weight:700; font-size:13px; transition:0.2s;">
                    ${config.paused ? (isUnf ? '▶ START UNFOLLOWING' : '▶ START FOLLOW BACK') : '⏸ STOP AUTOMATOR'}
                </button>
            </div>
        `;

        panel.querySelector('#tab-unfollow').onclick = () => { config.activeTab = 'unfollow'; renderPanel(); };
        panel.querySelector('#tab-followback').onclick = () => { config.activeTab = 'followback'; renderPanel(); };
        panel.querySelector('#tab-log').onclick = () => { config.activeTab = 'log'; renderPanel(); };

        if (tab === 'unfollow') {
            panel.querySelector('#inp-unfSkip').onchange = (e) => { config.unfSkipInitialCount = parseInt(e.target.value) || 0; save(); };
            panel.querySelector('#chk-unfNotBack').onchange = (e) => { config.unfNotFollowBack = e.target.checked; save(); };
            panel.querySelector('#chk-unfNoDP').onchange = (e) => { config.unfNoAvatar = e.target.checked; save(); };
            panel.querySelector('#chk-unfNoBio').onchange = (e) => { config.unfNoBio = e.target.checked; save(); };
            panel.querySelector('#chk-unfUseMinFers').onchange = (e) => { config.unfUseMinFers = e.target.checked; save(); renderPanel(); };
            panel.querySelector('#inp-unfMinFers').onchange = (e) => { config.unfMinFers = parseInt(e.target.value) || 0; save(); };
            panel.querySelector('#chk-unfUseMaxRatio').onchange = (e) => { config.unfUseMaxRatio = e.target.checked; save(); renderPanel(); };
            panel.querySelector('#inp-unfMaxRatio').onchange = (e) => { config.unfMaxRatio = parseFloat(e.target.value) || 0; save(); };
            attachCommonListeners();
        } else if (tab === 'followback') {
            panel.querySelector('#inp-fbSkip').onchange = (e) => { config.fbSkipInitialCount = parseInt(e.target.value) || 0; save(); };
            panel.querySelector('#chk-fbNoDP').onchange = (e) => { config.fbSkipNoAvatar = e.target.checked; save(); };
            panel.querySelector('#chk-fbNoBio').onchange = (e) => { config.fbSkipNoBio = e.target.checked; save(); };
            panel.querySelector('#chk-fbUseMinFers').onchange = (e) => { config.fbUseMinFollowers = e.target.checked; save(); renderPanel(); };
            panel.querySelector('#inp-fbMinFers').onchange = (e) => { config.fbMinFollowers = parseInt(e.target.value) || 0; save(); };
            panel.querySelector('#chk-fbUseMaxRatio').onchange = (e) => { config.fbUseMaxRatio = e.target.checked; save(); renderPanel(); };
            panel.querySelector('#inp-fbMaxRatio').onchange = (e) => { config.fbMaxRatio = parseFloat(e.target.value) || 0; save(); };
            attachCommonListeners();
        } else {
            const clearBtn = panel.querySelector('#clear-log-btn');
            if (clearBtn) clearBtn.onclick = () => { state.logs = []; renderPanel(); };
        }

        panel.querySelector('#main-toggle-btn').onclick = () => {
            if (!isFollowingPage() && !isFollowersPage()) {
                alert("Please navigate to your /following or /followers page to run the automator!");
                return;
            }
            config.paused = !config.paused;
            if (!config.paused) { state.cooldownUntil = 0; state.cooldownReason = ''; state.breakUntil = 0; }
            save(); renderPanel();
            if (!config.paused && !state.busy) runAutomator();
        };
    };

    const attachCommonListeners = () => {
        panel.querySelector('#inp-breakLimit').onchange = (e) => { config.breakLimit = parseInt(e.target.value) || 1; save(); renderPanel(); };
        panel.querySelector('#inp-breakDur').onchange = (e) => { config.breakDuration = parseInt(e.target.value) || 1; save(); };
        panel.querySelector('#inp-minD').onchange = (e) => { config.minDelay = parseInt(e.target.value) || 1; save(); };
        panel.querySelector('#inp-maxD').onchange = (e) => { config.maxDelay = parseInt(e.target.value) || 2; save(); };
        panel.querySelector('#inp-skip').onchange = (e) => { config.skipList = e.target.value; save(); };
    };

    const renderUnfollowSettings = () => `
        <div style="display:flex; flex-direction:column; gap:10px;">
            <div style="background:#fff7ed; padding:10px; border-radius:10px; border:1px solid #fed7aa;">
                <div style="font-size:10px; font-weight:800; color:#c2410c; margin-bottom:4px; text-transform:uppercase;">⚡ Fast Initial Skip</div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label style="font-size:12px; font-weight:600; color:#9a3412;">Skip First (users):</label>
                    <input type="number" id="inp-unfSkip" value="${config.unfSkipInitialCount}" style="width:65px; border:1px solid #fb923c; border-radius:6px; padding:3px; text-align:center; font-weight:bold;">
                </div>
            </div>

            <div style="background:#f7f9f9; padding:10px; border-radius:10px; border:1px solid #eff3f4;">
                <div style="font-size:10px; font-weight:800; color:#536471; margin-bottom:8px; text-transform:uppercase;">Unfollow If:</div>
                
                <label style="display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:6px; cursor:pointer;">
                    <input type="checkbox" id="chk-unfNotBack" ${config.unfNotFollowBack ? 'checked' : ''}> Doesn't follow you back
                </label>

                <label style="display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:6px; cursor:pointer;">
                    <input type="checkbox" id="chk-unfNoDP" ${config.unfNoAvatar ? 'checked' : ''}> No Profile Picture (Default DP)
                </label>

                <label style="display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:6px; cursor:pointer;">
                    <input type="checkbox" id="chk-unfNoBio" ${config.unfNoBio ? 'checked' : ''}> Has No Bio
                </label>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <label style="font-size:12px; font-weight:600; display:flex; align-items:center; gap:6px; cursor:pointer;">
                        <input type="checkbox" id="chk-unfUseMinFers" ${config.unfUseMinFers ? 'checked' : ''}> Followers count &lt;
                    </label>
                    <input type="number" id="inp-unfMinFers" value="${config.unfMinFers}" style="width:60px; border:1px solid #cfd9de; border-radius:6px; padding:3px; text-align:center; ${config.unfUseMinFers ? '' : 'opacity:0.4;'}" ${config.unfUseMinFers ? '' : 'disabled'}>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label style="font-size:12px; font-weight:600; display:flex; align-items:center; gap:6px; cursor:pointer;">
                        <input type="checkbox" id="chk-unfUseMaxRatio" ${config.unfUseMaxRatio ? 'checked' : ''}> Ratio &gt;
                    </label>
                    <input type="number" step="0.1" id="inp-unfMaxRatio" value="${config.unfMaxRatio}" style="width:60px; border:1px solid #cfd9de; border-radius:6px; padding:3px; text-align:center; ${config.unfUseMaxRatio ? '' : 'opacity:0.4;'}" ${config.unfUseMaxRatio ? '' : 'disabled'}>
                </div>
            </div>

            ${renderCommonSettings()}
        </div>
    `;

    const renderFollowBackSettings = () => `
        <div style="display:flex; flex-direction:column; gap:10px;">
            <div style="background:#f0fdf4; padding:10px; border-radius:10px; border:1px solid #bbf7d0;">
                <div style="font-size:10px; font-weight:800; color:#15803d; margin-bottom:4px; text-transform:uppercase;">⚡ Fast Initial Skip</div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label style="font-size:12px; font-weight:600; color:#166534;">Skip First (users):</label>
                    <input type="number" id="inp-fbSkip" value="${config.fbSkipInitialCount}" style="width:65px; border:1px solid #86efac; border-radius:6px; padding:3px; text-align:center; font-weight:bold;">
                </div>
            </div>

            <div style="background:#f7f9f9; padding:10px; border-radius:10px; border:1px solid #eff3f4;">
                <div style="font-size:10px; font-weight:800; color:#536471; margin-bottom:8px; text-transform:uppercase;">Follow Back Criteria:</div>

                <label style="display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:6px; cursor:pointer;">
                    <input type="checkbox" id="chk-fbNoDP" ${config.fbSkipNoAvatar ? 'checked' : ''}> <b>Don't follow</b> if No Profile Picture (Default DP)
                </label>

                <label style="display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:6px; cursor:pointer;">
                    <input type="checkbox" id="chk-fbNoBio" ${config.fbSkipNoBio ? 'checked' : ''}> <b>Don't follow</b> if Has No Bio
                </label>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <label style="font-size:12px; font-weight:600; display:flex; align-items:center; gap:6px; cursor:pointer;">
                        <input type="checkbox" id="chk-fbUseMinFers" ${config.fbUseMinFollowers ? 'checked' : ''}> Followers count &gt;
                    </label>
                    <input type="number" id="inp-fbMinFers" value="${config.fbMinFollowers}" style="width:60px; border:1px solid #cfd9de; border-radius:6px; padding:3px; text-align:center; ${config.fbUseMinFollowers ? '' : 'opacity:0.4;'}" ${config.fbUseMinFollowers ? '' : 'disabled'}>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label style="font-size:12px; font-weight:600; display:flex; align-items:center; gap:6px; cursor:pointer;">
                        <input type="checkbox" id="chk-fbUseMaxRatio" ${config.fbUseMaxRatio ? 'checked' : ''}> Ratio &lt;
                    </label>
                    <input type="number" step="0.1" id="inp-fbMaxRatio" value="${config.fbMaxRatio}" style="width:60px; border:1px solid #cfd9de; border-radius:6px; padding:3px; text-align:center; ${config.fbUseMaxRatio ? '' : 'opacity:0.4;'}" ${config.fbUseMaxRatio ? '' : 'disabled'}>
                </div>
            </div>

            ${renderCommonSettings()}
        </div>
    `;

    const renderCommonSettings = () => `
        <div style="background:#f7f9f9; padding:10px; border-radius:10px; border:1px solid #eff3f4;">
            <div style="font-size:10px; font-weight:800; color:#536471; margin-bottom:8px; text-transform:uppercase;">Session Controls</div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <label style="font-size:12px; font-weight:500;">Batch Limit / Break</label>
                <input type="number" id="inp-breakLimit" value="${config.breakLimit}" style="width:50px; border:1px solid #cfd9de; border-radius:6px; padding:3px; text-align:center;">
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <label style="font-size:12px; font-weight:500;">Break Duration (min)</label>
                <input type="number" id="inp-breakDur" value="${config.breakDuration}" style="width:50px; border:1px solid #cfd9de; border-radius:6px; padding:3px; text-align:center;">
            </div>
        </div>

        <div>
            <label style="font-size:10px; font-weight:800; color:#536471; display:block; margin-bottom:4px; text-transform:uppercase;">DELAY RANGE (SEC)</label>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <input type="number" id="inp-minD" value="${config.minDelay}" style="width:50px; flex:1; border:1px solid #cfd9de; border-radius:6px; padding:4px; text-align:center;">
                <span>-</span>
                <input type="number" id="inp-maxD" value="${config.maxDelay}" style="width:50px; flex:1; border:1px solid #cfd9de; border-radius:6px; padding:4px; text-align:center;">
            </div>

            <label style="font-size:10px; font-weight:800; color:#536471; display:block; margin-bottom:4px; text-transform:uppercase;">WHITELIST / SKIP LIST</label>
            <textarea id="inp-skip" style="width:100%; height:40px; border:1px solid #cfd9de; border-radius:8px; padding:6px; font-size:11px; font-family:monospace; resize:none; box-sizing:border-box;">${config.skipList}</textarea>
        </div>
    `;

    const renderLog = () => `
        <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="font-size:10px; font-weight:800; color:#536471; text-transform:uppercase;">Activity Log</span>
                <button id="clear-log-btn" style="background:none; border:none; color:#1d9bf0; font-size:10px; font-weight:700; cursor:pointer;">CLEAR</button>
            </div>
            ${state.logs.length === 0 ? '<div style="text-align:center; padding:20px; color:#536471; font-size:12px;">No activity yet.</div>' : ''}
            ${state.logs.map(l => `
                <div style="font-size:11px; line-height:1.4; padding:6px 8px; border-left:3px solid ${l.type === 'error' ? '#f4212e' : (l.type === 'success' ? '#00ba7c' : '#cfd9de')}; background:#f7f9f9; border-radius:4px;">
                    <span style="color:#536471; font-weight:700; margin-right:5px;">${l.time}</span>
                    <span style="color:#0f1419;">${l.msg}</span>
                </div>
            `).join('')}
        </div>
    `;

    const randomWait = async () => {
        const sec = Math.floor(Math.random() * (config.maxDelay - config.minDelay + 1)) + config.minDelay;
        for (let i = sec; i > 0; i--) {
            if (config.paused || state.cooldownUntil > Date.now()) break;
            const isUnf = isFollowingPage();
            const todayCount = isUnf ? state.todayUnfollowed : state.todayFollowed;
            updateLiveTelemetry(`Wait: ${i}s | Today: ${todayCount} | Sess: ${state.sessionCount}/${config.breakLimit}`);
            await delay(1000);
        }
        updateLiveTelemetry();
    };

    /**
     * --- MAIN AUTOMATOR LOOP ---
     */
    async function runAutomator() {
        if (config.paused || state.busy) return;
        state.busy = true;

        try {
            checkMidnightRollover();

            // Check if Cooldown is active
            if (state.cooldownUntil > Date.now()) {
                const diffMs = state.cooldownUntil - Date.now();
                const diffMins = Math.ceil(diffMs / 60000);
                const diffHrs = (diffMs / 3600000).toFixed(1);
                const displayTime = diffMins > 60 ? `${diffHrs}h` : `${diffMins}m`;

                updateLiveTelemetry(`⚠️ ${state.cooldownReason || 'Cooldown'}: ${displayTime} left`);
                state.busy = false;
                setTimeout(runAutomator, 10000);
                return;
            }

            // Check Session Break
            if (state.breakUntil > Date.now()) {
                const diff = Math.ceil((state.breakUntil - Date.now()) / 1000);
                updateLiveTelemetry(`Break: ${diff}s left`);
                state.busy = false; setTimeout(runAutomator, 2000); return;
            }

            if (state.sessionCount >= config.breakLimit) {
                addLog(`Batch limit hit (${config.breakLimit}). Starting ${config.breakDuration}m break.`);
                state.breakUntil = Date.now() + (config.breakDuration * 60 * 1000);
                state.sessionCount = 0;
                updateLiveTelemetry();
                state.busy = false; runAutomator(); return;
            }

            updateLiveTelemetry();

            const isUnf = isFollowingPage();
            const skipInitial = isUnf ? config.unfSkipInitialCount : config.fbSkipInitialCount;

            const cells = Array.from(document.querySelectorAll('div[data-testid="cellInnerDiv"]'));
            let processedInBatch = 0;

            for (let cell of cells) {
                if (config.paused || state.sessionCount >= config.breakLimit) break;

                const { userLink, handle } = getUserInfo(cell);
                const { btn: actionBtn, isFollow } = getActionButton(cell);

                if (!actionBtn || !handle || state.processedHandles.has(handle)) continue;

                state.processedHandles.add(handle);
                state.totalScanned++;
                processedInBatch++;
                updateLiveTelemetry();

                // 1. FAST INITIAL SKIP
                if (state.totalScanned <= skipInitial) {
                    state.totalSkipped++;
                    highlightCell(cell, 'skipped');
                    updateLiveTelemetry(`⚡ Fast-Skipping: ${state.totalScanned}/${skipInitial}`);
                    if (state.totalScanned % 25 === 0 || state.totalScanned === skipInitial) {
                        addLog(`Fast-skipped to ${state.totalScanned}/${skipInitial} accounts.`);
                    }
                    continue;
                }

                // 2. INSPECTION
                highlightCell(cell, 'scanning');
                cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await delay(300);

                if (isWhitelisted(handle)) {
                    state.totalSkipped++;
                    addLog(`Skipped @${handle} (Whitelisted)`);
                    highlightCell(cell, 'skipped');
                    updateLiveTelemetry();
                    continue;
                }

                const indicator = cell.querySelector('[data-testid="userFollowIndicator"]');
                const followsYou = !!indicator || cell.innerText.includes('Follows you');

                const avatarImg = cell.querySelector('img[src*="profile_images"]');
                const isDefaultAvatar = avatarImg && avatarImg.src.includes('default_profile_images');

                const stats = await getStatsFromHoverCard(userLink, cell);
                if (stats) {
                    injectStatsLabel(actionBtn, stats, followsYou, !isUnf);
                }

                // --- BRANCH A: UNFOLLOW ENGINE (/following) ---
                if (isUnf) {
                    let shouldUnfollow = false;
                    let reason = '';

                    if (config.unfNotFollowBack && !followsYou) {
                        shouldUnfollow = true;
                        reason = 'Does not follow back';
                    } else if (config.unfNoAvatar && isDefaultAvatar) {
                        shouldUnfollow = true;
                        reason = 'Default avatar (No DP)';
                    } else if (stats) {
                        if (config.unfNoBio && !stats.hasBio) {
                            shouldUnfollow = true;
                            reason = 'No bio';
                        } else if (config.unfUseMinFers && stats.followers < config.unfMinFers) {
                            shouldUnfollow = true;
                            reason = `Followers < ${config.unfMinFers}`;
                        } else if (config.unfUseMaxRatio && stats.ratio > config.unfMaxRatio) {
                            shouldUnfollow = true;
                            reason = `Ratio > ${config.unfMaxRatio} (${stats.ratio.toFixed(2)})`;
                        }
                    }

                    if (shouldUnfollow) {
                        addLog(`Unfollowing @${handle}: ${reason}`, 'error');
                        highlightCell(cell, 'unfollowed');

                        const ok = await performUnfollow(actionBtn);
                        if (ok) {
                            incrementActionCount(true);
                            addLog(`Successfully unfollowed @${handle}`, 'success');
                            if (await inspectAlertToasts()) break;
                            await randomWait();
                        } else {
                            addLog(`Failed to confirm unfollow for @${handle}`, 'error');
                        }
                    } else {
                        state.totalSkipped++;
                        addLog(`Kept @${handle} (Passed filters)`, 'success');
                        highlightCell(cell, 'kept');
                        updateLiveTelemetry();
                        await delay(300);
                    }
                }

                // --- BRANCH B: FOLLOW BACK ENGINE (/followers & /verified_followers) ---
                else {
                    let shouldFollow = true;
                    let skipReason = '';

                    if (config.fbSkipNoAvatar && isDefaultAvatar) {
                        shouldFollow = false;
                        skipReason = 'No Profile Picture (Default DP)';
                    } else if (stats) {
                        if (config.fbSkipNoBio && !stats.hasBio) {
                            shouldFollow = false;
                            skipReason = 'Has No Bio';
                        } else if (config.fbUseMinFollowers && stats.followers < config.fbMinFollowers) {
                            shouldFollow = false;
                            skipReason = `Followers < ${config.fbMinFollowers} (${formatTwitterNumber(stats.followers)})`;
                        } else if (config.fbUseMaxRatio && stats.ratio > config.fbMaxRatio) {
                            shouldFollow = false;
                            skipReason = `Ratio > ${config.fbMaxRatio} (${stats.ratio.toFixed(2)})`;
                        }
                    }

                    if (shouldFollow && actionBtn) {
                        addLog(`Following back @${handle}...`, 'success');
                        highlightCell(cell, 'followed');

                        const ok = await performFollow(actionBtn);
                        if (ok) {
                            incrementActionCount(false);
                            addLog(`Successfully followed back @${handle}`, 'success');
                            if (await inspectAlertToasts()) break;
                            await randomWait();
                        }
                    } else {
                        state.totalSkipped++;
                        addLog(`Skipped @${handle}: ${skipReason}`, 'info');
                        highlightCell(cell, 'failed');
                        updateLiveTelemetry();
                        await delay(300);
                    }
                }
            }

            if (processedInBatch === 0 || state.totalScanned <= skipInitial) {
                const isFast = state.totalScanned < skipInitial;
                await scrollFollowingList(isFast);
            }

        } catch (e) {
            addLog("Error: " + e.message, 'error');
        }

        state.busy = false;
        if (!config.paused) {
            const isUnf = isFollowingPage();
            const skipInitial = isUnf ? config.unfSkipInitialCount : config.fbSkipInitialCount;
            setTimeout(runAutomator, state.totalScanned < skipInitial ? 300 : 1000);
        }
    }

    setTimeout(() => {
        setupUI();
        addLog("𝕏-Automator V4.1 Ready.");
    }, 2000);

})();
