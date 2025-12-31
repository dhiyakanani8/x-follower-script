// ==UserScript==
// @name         𝕏-Retweet-Automator-Pro
// @namespace    https://dhiya000.netlify.app/
// @version      1.1
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
        breakMin: getSet('rt_breakMin', 30), // Session break in minutes
        exclude: getSet('rt_exclude', ['ads', 'promoted']),
        include: getSet('rt_include', []), // If not empty, only these will be retweeted
    };

    let state = {
        running: false,
        count: getSet('rt_state_count', 0),
        cooldownEnd: getSet('rt_state_cooldown', 0),
        processed: new Set()
    };

    // --- UI Construction ---
    const ui = document.createElement('div');
    ui.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9999;background:#fff;padding:15px;border:2px solid #1DA1F2;border-radius:12px;font-family:sans-serif;width:280px;box-shadow:0 10px 25px rgba(0,0,0,0.2);color:#000;';
    document.body.appendChild(ui);

    const renderUI = () => {
        ui.innerHTML = `
            <div style="font-weight:bold;margin-bottom:10px;display:flex;justify-content:space-between;">
                <span>𝕏 Retweet Bot</span>
                <span id="bot-status" style="color:${state.cooldownEnd > Date.now() ? 'orange' : (state.running ? 'green' : 'red')}">
                    ${state.cooldownEnd > Date.now() ? 'Cooldown' : (state.running ? 'Running' : 'Stopped')}
                </span>
            </div>
            <div id="timer-display" style="font-size:12px;margin-bottom:10px;background:#f0f8ff;padding:5px;border-radius:5px;text-align:center;">
                Progress: ${state.count} / ${cfg.maxPosts}
            </div>
            
            <div style="display:flex;flex-direction:column;gap:5px;font-size:11px;">
                <label>Delay (Min-Max sec):</label>
                <div style="display:flex;gap:5px;">
                    <input type="number" id="cfg-min" value="${cfg.minDelay}" style="width:50%;">
                    <input type="number" id="cfg-max" value="${cfg.maxDelay}" style="width:50%;">
                </div>
                <label>Max Posts per Session:</label>
                <input type="number" id="cfg-limit" value="${cfg.maxPosts}">
                <label>Session Break (Minutes):</label>
                <input type="number" id="cfg-break" value="${cfg.breakMin}">
                
                <button id="start-btn" style="margin-top:10px;padding:8px;background:#1DA1F2;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:bold;">
                    ${state.running ? 'STOP BOT' : 'START BOT'}
                </button>
            </div>
        `;

        document.getElementById('start-btn').onclick = toggleBot;
        // Auto-save settings on change
        ui.querySelectorAll('input').forEach(input => {
            input.onchange = (e) => {
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

    const updateStatus = (msg) => {
        const timerDisp = document.getElementById('timer-display');
        if (timerDisp) timerDisp.innerText = msg;
    };

    // --- Bot Logic ---
    async function toggleBot() {
        state.running = !state.running;
        if (!state.running) state.cooldownEnd = 0; // Reset cooldown if manually stopped
        renderUI();
        if (state.running) runLoop();
    }

    const getAuthor = (tweet) => {
        const link = tweet.querySelector('a[href^="/"][role="link"]');
        return link ? link.getAttribute('href').replace('/', '').split('/')[0].toLowerCase() : '';
    };

    async function runLoop() {
        while (state.running) {
            // 1. Check if we are in a session break
            if (state.cooldownEnd > Date.now()) {
                const remaining = Math.ceil((state.cooldownEnd - Date.now()) / 1000);
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                updateStatus(`Cooldown: ${mins}m ${secs}s left`);
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

            // 2. Check if we just finished a session break
            if (state.cooldownEnd !== 0 && state.cooldownEnd <= Date.now()) {
                state.cooldownEnd = 0;
                state.count = 0;
                localStorage.setItem('rt_state_count', 0);
                localStorage.setItem('rt_state_cooldown', 0);
                updateStatus("Session Restoring...");
            }

            // 3. Check for session limit
            if (state.count >= cfg.maxPosts) {
                state.cooldownEnd = Date.now() + (cfg.breakMin * 60 * 1000);
                localStorage.setItem('rt_state_cooldown', state.cooldownEnd);
                continue;
            }

            // 4. Find Tweets
            const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
            let actionTaken = false;

            for (const tweet of tweets) {
                const author = getAuthor(tweet);
                const tweetId = tweet.innerText.substring(0, 100);

                if (state.processed.has(tweetId)) continue;
                state.processed.add(tweetId);

                // Exclusion / Inclusion Logic
                if (cfg.exclude.includes(author)) continue;
                if (cfg.include.length > 0 && !cfg.include.includes(author)) continue;

                // Color: Yellow (Processing)
                tweet.style.backgroundColor = 'rgba(255, 255, 0, 0.1)';
                
                // Skip if already retweeted
                if (tweet.querySelector('[data-testid="unretweet"]')) {
                    tweet.style.backgroundColor = 'rgba(0, 150, 255, 0.1)'; // Blue for skip
                    continue;
                }

                const rtBtn = tweet.querySelector('[data-testid="retweet"]');
                if (rtBtn) {
                    rtBtn.click();
                    await new Promise(r => setTimeout(r, 1200));
                    const confirm = document.querySelector('[data-testid="retweetConfirm"]');
                    if (confirm) {
                        confirm.click();
                        state.count++;
                        localStorage.setItem('rt_state_count', state.count);
                        tweet.style.backgroundColor = 'rgba(0, 255, 0, 0.1)'; // Green for success
                        
                        const waitTime = Math.floor(Math.random() * (cfg.maxDelay - cfg.minDelay + 1) + cfg.minDelay);
                        for(let i = waitTime; i > 0; i--) {
                            updateStatus(`Waiting ${i}s... | Total: ${state.count}`);
                            await new Promise(r => setTimeout(r, 1000));
                            if (!state.running) return;
                        }
                        actionTaken = true;
                        break; 
                    }
                }
            }

            if (!actionTaken) {
                window.scrollBy(0, 500);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }

    // Initialize UI
    renderUI();

    // Auto-start logic if coming back from refresh during a run
    if (getSet('rt_state_running', false)) {
        state.running = true;
        renderUI();
        runLoop();
    }

    // Save running state before unload
    window.onbeforeunload = () => {
        localStorage.setItem('rt_state_running', state.running);
    };

})();
