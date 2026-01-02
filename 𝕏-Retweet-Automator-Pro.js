// ==UserScript==
// @name         𝕏-Retweet-Automator-Pro
// @namespace    https://dhiya000.netlify.app/
// @version      1.2
// @author       @dhiya_000
// @match        https://x.com/home
// @match        https://x.com/explore
// @match        https://x.com/*/status/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // --- Persistent Settings (Local Storage) ---
    const getSet = (k, def) => {
        const val = localStorage.getItem(k);
        return val ? JSON.parse(val) : def;
    };

    let cfg = {
        minDelay: getSet('rt_minDelay', 5),
        maxDelay: getSet('rt_maxDelay', 15),
        maxPosts: getSet('rt_maxPosts', 10),
        breakMin: getSet('rt_breakMin', 30),
        exclude: getSet('rt_exclude', ['ads', 'promoted']),
        include: getSet('rt_include', []),
    };

    let state = {
        running: false,
        count: getSet('rt_state_count', 0),
        cooldownEnd: getSet('rt_state_cooldown', 0),
        processed: new Set(),
        uiVisible: true
    };

    // --- UI Elements ---
    const ui = document.createElement('div');
    const togglePill = document.createElement('div');

    // Style for the Toggle Pill (The small live button)
    togglePill.style.cssText = `
        position:fixed; top:10px; right:10px; z-index:10000;
        background:#1DA1F2; color:#fff; padding:8px 15px;
        border-radius:20px; font-family:sans-serif; font-size:12px;
        font-weight:bold; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.15);
        display:flex; align-items:center; gap:8px; transition: all 0.2s;
        user-select: none; border: 2px solid #fff;
    `;
    
    // Style for the Main Settings Box
    ui.style.cssText = `
        position:fixed; top:55px; right:10px; z-index:9999;
        background:#fff; padding:15px; border:2px solid #1DA1F2;
        border-radius:12px; font-family:sans-serif; width:280px;
        box-shadow:0 10px 25px rgba(0,0,0,0.2); color:#000;
        display: block;
    `;

    document.body.appendChild(togglePill);
    document.body.appendChild(ui);

    const renderUI = () => {
        ui.innerHTML = `
            <div style="font-weight:bold;margin-bottom:10px;display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding-bottom:5px;">
                <span>𝕏 Bot Settings</span>
                <span id="bot-status-label" style="color:${state.cooldownEnd > Date.now() ? 'orange' : (state.running ? 'green' : 'red')}">
                    ${state.cooldownEnd > Date.now() ? 'Cooldown' : (state.running ? 'Running' : 'Stopped')}
                </span>
            </div>
            <div id="timer-display" style="font-size:12px;margin-bottom:10px;background:#f0f8ff;padding:5px;border-radius:5px;text-align:center;font-weight:bold;">
                Ready
            </div>
            
            <div style="display:flex;flex-direction:column;gap:5px;font-size:11px;">
                <label>Delay (Min-Max sec):</label>
                <div style="display:flex;gap:5px;">
                    <input type="number" id="cfg-min" value="${cfg.minDelay}" style="width:50%;padding:3px;border:1px solid #ccc;border-radius:4px;">
                    <input type="number" id="cfg-max" value="${cfg.maxDelay}" style="width:50%;padding:3px;border:1px solid #ccc;border-radius:4px;">
                </div>
                <label>Max Posts per Session:</label>
                <input type="number" id="cfg-limit" value="${cfg.maxPosts}" style="padding:3px;border:1px solid #ccc;border-radius:4px;">
                <label>Session Break (Minutes):</label>
                <input type="number" id="cfg-break" value="${cfg.breakMin}" style="padding:3px;border:1px solid #ccc;border-radius:4px;">
                
                <button id="start-btn" style="margin-top:10px;padding:10px;background:${state.running ? '#ff4b4b' : '#1DA1F2'};color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:bold;text-transform:uppercase;">
                    ${state.running ? 'STOP BOT' : 'START BOT'}
                </button>
                <div style="font-size:9px; color:#777; margin-top:5px; text-align:center;">Click the top blue pill to hide this menu</div>
            </div>
        `;

        document.getElementById('start-btn').onclick = toggleBot;
        
        // Settings auto-save
        ui.querySelectorAll('input').forEach(input => {
            input.onchange = () => {
                cfg.minDelay = parseInt(document.getElementById('cfg-min').value);
                cfg.maxDelay = parseInt(document.getElementById('cfg-max').value);
                cfg.maxPosts = parseInt(document.getElementById('cfg-limit').value);
                cfg.breakMin = parseInt(document.getElementById('cfg-break').value);
                localStorage.setItem('rt_minDelay', cfg.minDelay);
                localStorage.setItem('rt_maxDelay', cfg.maxDelay);
                localStorage.setItem('rt_maxPosts', cfg.maxPosts);
                localStorage.setItem('rt_breakMin', cfg.breakMin);
            };
        });
    };

    // --- Update Logic for Both UI and Toggle Pill ---
    const updateStatus = (msg) => {
        const timerDisp = document.getElementById('timer-display');
        const statusLabel = document.getElementById('bot-status-label');
        
        // Update the Floating Pill (Live Countdown)
        togglePill.innerHTML = `<span>🤖</span> <span>${msg}</span>`;
        
        // Update Main Panel if open
        if (timerDisp) timerDisp.innerText = msg;
        if (statusLabel) {
            statusLabel.innerText = state.cooldownEnd > Date.now() ? 'Cooldown' : (state.running ? 'Running' : 'Stopped');
            statusLabel.style.color = state.cooldownEnd > Date.now() ? 'orange' : (state.running ? 'green' : 'red');
        }
    };

    // Toggle Main Settings Visibility
    togglePill.onclick = () => {
        state.uiVisible = !state.uiVisible;
        ui.style.display = state.uiVisible ? 'block' : 'none';
        togglePill.style.background = state.uiVisible ? '#1DA1F2' : '#000';
    };

    // --- Bot Logic ---
    async function toggleBot() {
        state.running = !state.running;
        if (!state.running) {
            state.cooldownEnd = 0;
            updateStatus("Bot Stopped");
        }
        renderUI();
        if (state.running) runLoop();
    }

    const getAuthor = (tweet) => {
        const link = tweet.querySelector('a[href^="/"][role="link"]');
        return link ? link.getAttribute('href').replace('/', '').split('/')[0].toLowerCase() : '';
    };

    async function runLoop() {
        while (state.running) {
            // 1. Session Break logic
            if (state.cooldownEnd > Date.now()) {
                const remaining = Math.ceil((state.cooldownEnd - Date.now()) / 1000);
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                updateStatus(`Break: ${mins}m ${secs}s`);
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

            // 2. Reset session if cooldown finished
            if (state.cooldownEnd !== 0 && state.cooldownEnd <= Date.now()) {
                state.cooldownEnd = 0;
                state.count = 0;
                localStorage.setItem('rt_state_count', 0);
                localStorage.setItem('rt_state_cooldown', 0);
            }

            // 3. Limit check
            if (state.count >= cfg.maxPosts) {
                state.cooldownEnd = Date.now() + (cfg.breakMin * 60 * 1000);
                localStorage.setItem('rt_state_cooldown', state.cooldownEnd);
                continue;
            }

            // 4. Action logic
            const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
            let actionTaken = false;

            for (const tweet of tweets) {
                const author = getAuthor(tweet);
                const tweetId = tweet.innerText.substring(0, 100);

                if (state.processed.has(tweetId)) continue;
                state.processed.add(tweetId);

                if (cfg.exclude.includes(author)) continue;
                if (cfg.include.length > 0 && !cfg.include.includes(author)) continue;

                if (tweet.querySelector('[data-testid="unretweet"]')) continue;

                const rtBtn = tweet.querySelector('[data-testid="retweet"]');
                if (rtBtn) {
                    rtBtn.click();
                    await new Promise(r => setTimeout(r, 800));
                    const confirm = document.querySelector('[data-testid="retweetConfirm"]');
                    if (confirm) {
                        confirm.click();
                        state.count++;
                        localStorage.setItem('rt_state_count', state.count);
                        tweet.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
                        
                        const waitTime = Math.floor(Math.random() * (cfg.maxDelay - cfg.minDelay + 1) + cfg.minDelay);
                        for(let i = waitTime; i > 0; i--) {
                            if (!state.running) return;
                            updateStatus(`Wait: ${i}s | Done: ${state.count}`);
                            await new Promise(r => setTimeout(r, 1000));
                        }
                        actionTaken = true;
                        break; 
                    }
                }
            }

            if (!actionTaken) {
                updateStatus(`Scanning... (${state.count}/${cfg.maxPosts})`);
                window.scrollBy(0, 400);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }

    // Init
    renderUI();
    updateStatus(state.running ? "Resuming..." : "Bot Paused");

    if (getSet('rt_state_running', false)) {
        state.running = true;
        renderUI();
        runLoop();
    }

    window.onbeforeunload = () => {
        localStorage.setItem('rt_state_running', state.running);
    };

})();
