// ==UserScript==
// @name         X Post Deleter (Pro Control Center)
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Fully draggable HUD with Start/Stop, Minimize, and Dynamic Settings.
// @author       YanaHeat
// @match        https://x.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // === STATE & SETTINGS ===
    let settings = {
        deleteDelay: 1800,
        cooldownTime: 15,
        maxPerCycle: 200,
        viewThreshold: 10,
        actionDelay: 1000,
        scrollDelay: 3500
    };

    let stats = {
        successCount: 0,
        cycleCount: 0,
        cooldownEnd: 0,
        newCycle: true,
        user: null,
        isRunning: false,
        isMinimized: false
    };

    let hud = null;

    // --- Utility ---
    const parseViews = (text) => {
        if (!text) return 0;
        text = text.toLowerCase().replace(/,/g, '').trim();
        if (text.includes('k')) return parseFloat(text) * 1000;
        if (text.includes('m')) return parseFloat(text) * 1000000;
        return parseInt(text) || 0;
    };

    const getUsername = () => {
        const path = window.location.pathname;
        if (path.endsWith('/with_replies')) return path.split('/')[1];
        if (path.includes('/search')) {
            const params = new URLSearchParams(window.location.search);
            const q = params.get('q');
            if (q) {
                const match = q.match(/from[:%3A]([a-zA-Z0-9_]+)/i);
                if (match) return match[1];
            }
        }
        const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
        if (profileLink) return profileLink.getAttribute('href').replace('/', '');
        return null;
    };

    // --- HUD UI ---
    function createHUD() {
        if (hud) return;
        hud = document.createElement('div');
        Object.assign(hud.style, {
            position: 'fixed', top: '50px', right: '20px',
            background: '#000', color: '#fff',
            borderRadius: '12px', border: '1px solid #333',
            zIndex: '999999', width: '260px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.7)',
            fontFamily: 'system-ui, sans-serif', overflow: 'hidden'
        });

        hud.innerHTML = `
            <div id="hud-header" style="background:#1d9bf0; padding:10px; cursor:move; display:flex; justify-content:space-between; align-items:center; font-weight:bold; user-select:none;">
                <span>X Deleter Pro</span>
                <button id="btn-min" style="background:none; border:none; color:white; cursor:pointer; font-size:16px;">−</button>
            </div>

            <div id="hud-body" style="padding:15px;">
                <div style="background:#111; padding:10px; border-radius:8px; margin-bottom:12px; font-size:13px; border:1px solid #222;">
                    <div id="stat-deleted">Deleted: 0</div>
                    <div id="stat-cycle">Cycle: 0 / 200</div>
                    <div id="stat-timer" style="color:#ff9800; font-weight:bold;">Timer: 00:00</div>
                </div>

                <div style="display:flex; flex-direction:column; gap:8px; font-size:11px; color:#aaa;">
                    <label>VIEW LIMIT (DELETE IF LESS)<input type="number" id="in-view" value="${settings.viewThreshold}" style="width:100%; background:#222; color:#fff; border:1px solid #444; padding:3px;"></label>
                    <label>MAX PER CYCLE<input type="number" id="in-max" value="${settings.maxPerCycle}" style="width:100%; background:#222; color:#fff; border:1px solid #444; padding:3px;"></label>
                    <label>DELAY (MS)<input type="number" id="in-delay" value="${settings.deleteDelay}" style="width:100%; background:#222; color:#fff; border:1px solid #444; padding:3px;"></label>
                    <label>WAIT TIME (MIN)<input type="number" id="in-wait" value="${settings.cooldownTime}" style="width:100%; background:#222; color:#fff; border:1px solid #444; padding:3px;"></label>
                </div>

                <button id="btn-start" style="width:100%; margin-top:15px; padding:10px; border-radius:6px; border:none; background:#00ba7c; color:white; font-weight:bold; cursor:pointer;">START DELETING</button>
                <div style="text-align:center; font-size:10px; margin-top:8px; color:#555;">@${stats.user}</div>
            </div>
        `;
        document.body.appendChild(hud);

        // --- Event Listeners ---
        const body = hud.querySelector('#hud-body');
        const startBtn = hud.querySelector('#btn-start');

        // Dragging Logic
        const header = hud.querySelector('#hud-header');
        let isDragging = false, offsetX, offsetY;
        header.onmousedown = (e) => {
            isDragging = true;
            offsetX = hud.offsetLeft - e.clientX;
            offsetY = hud.offsetTop - e.clientY;
        };
        document.onmousemove = (e) => {
            if (isDragging) {
                hud.style.left = (e.clientX + offsetX) + 'px';
                hud.style.top = (e.clientY + offsetY) + 'px';
                hud.style.right = 'auto';
            }
        };
        document.onmouseup = () => isDragging = false;

        // Minimize Logic
        hud.querySelector('#btn-min').onclick = () => {
            stats.isMinimized = !stats.isMinimized;
            body.style.display = stats.isMinimized ? 'none' : 'block';
            hud.querySelector('#btn-min').textContent = stats.isMinimized ? '+' : '−';
            hud.style.width = stats.isMinimized ? '150px' : '260px';
        };

        // Start/Stop Logic
        startBtn.onclick = () => {
            stats.isRunning = !stats.isRunning;
            startBtn.textContent = stats.isRunning ? 'STOP DELETING' : 'START DELETING';
            startBtn.style.background = stats.isRunning ? '#f4212e' : '#00ba7c';
            if (stats.isRunning) mainLoop();
        };

        // Input Observers
        hud.querySelector('#in-view').oninput = (e) => settings.viewThreshold = parseInt(e.target.value) || 0;
        hud.querySelector('#in-max').oninput = (e) => settings.maxPerCycle = parseInt(e.target.value) || 200;
        hud.querySelector('#in-delay').oninput = (e) => settings.deleteDelay = parseInt(e.target.value) || 1000;
        hud.querySelector('#in-wait').oninput = (e) => settings.cooldownTime = parseInt(e.target.value) || 15;
    }

    function updateHUD() {
        if (!hud) return;
        hud.querySelector('#stat-deleted').textContent = `Deleted: ${stats.successCount}`;
        hud.querySelector('#stat-cycle').textContent = `Cycle: ${stats.cycleCount} / ${settings.maxPerCycle}`;

        let rem = Math.ceil((stats.cooldownEnd - Date.now()) / 1000);
        if (rem <= 0) rem = 0;
        const m = Math.floor(rem / 60), s = rem % 60;
        hud.querySelector('#stat-timer').textContent = `Timer: ${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }

    // --- CORE LOGIC ---
    function startCooldownTimer() {
        const timer = setInterval(() => {
            updateHUD();
            if (stats.cooldownEnd <= Date.now()) {
                clearInterval(timer);
                stats.cycleCount = 0;
                stats.newCycle = true;
                updateHUD();
                if (stats.isRunning) mainLoop();
            }
        }, 1000);
    }

    function findNext() {
        const tweets = document.querySelectorAll('article[data-testid="tweet"]');
        for (const t of tweets) {
            if (!t.querySelector(`[data-testid*="UserAvatar-Container-${stats.user}"]`)) continue;
            if (t.dataset.deleterChecked === "true") continue;

            const views = parseViews(t.querySelector('a[href*="/analytics"]')?.innerText);
            if (views < settings.viewThreshold) return t;

            t.dataset.deleterChecked = "true";
            t.style.opacity = "0.2";
        }
        return null;
    }

    function tryDelete(tweet) {
        if (!stats.isRunning) return;
        tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });

        setTimeout(() => {
            window.scrollBy(0, -120);
            const caret = tweet.querySelector('[data-testid="caret"]');
            if (!caret) { return mainLoop(); }
            caret.click();

            setTimeout(() => {
                const del = Array.from(document.querySelectorAll('[role="menuitem"]')).find(el => el.textContent.includes('Delete'));
                if (!del) {
                    document.body.click();
                    tweet.dataset.deleterChecked = "true";
                    return setTimeout(mainLoop, 1000);
                }
                del.click();

                setTimeout(() => {
                    const conf = document.querySelector('[data-testid="confirmationSheetConfirm"]');
                    if (conf) {
                        conf.click();
                        stats.successCount++;
                        stats.cycleCount++;
                        if (stats.newCycle) {
                            stats.cooldownEnd = Date.now() + (settings.cooldownTime * 60 * 1000);
                            stats.newCycle = false;
                            startCooldownTimer();
                        }
                        updateHUD();
                        if (stats.cycleCount >= settings.maxPerCycle) return;
                        setTimeout(mainLoop, settings.deleteDelay);
                    } else {
                        stats.cooldownEnd = Date.now() + (settings.cooldownTime * 60 * 1000);
                        startCooldownTimer();
                    }
                }, settings.actionDelay);
            }, settings.actionDelay);
        }, 800);
    }

    function mainLoop() {
        if (!stats.isRunning || (stats.cooldownEnd > Date.now() && stats.cycleCount >= settings.maxPerCycle)) return;

        const next = findNext();
        if (next) {
            tryDelete(next);
        } else {
            window.scrollTo(0, document.body.scrollHeight);
            setTimeout(mainLoop, settings.scrollDelay);
        }
    }

    // --- STARTUP ---
    const init = setInterval(() => {
        stats.user = getUsername();
        if (stats.user) {
            clearInterval(init);
            const search = window.location.pathname.includes('/search');
            const repl = window.location.pathname.endsWith('/with_replies');
            if (!search && !repl) {
                window.location.href = `https://x.com/${stats.user}/with_replies`;
                return;
            }
            createHUD();
            updateHUD();
        }
    }, 2000);
})();
