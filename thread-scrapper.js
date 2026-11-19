// ==UserScript==
// @name         Threads Scraper (Text Only Default + Toggle)
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Scrapes Threads. Text-only by default with checkbox for media. Features auto-scroll toggle and Excel/CSV/JSON.
// @author       dhiya__000
// @match        https://www.threads.com/*
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// ==/UserScript==

(function() {
    'use strict';

    const scrapedUrls = new Set();
    const allData = [];
    let scrollInterval = null;
    let isScrolling = false;

    // --- UI SETUP ---
    const menu = document.createElement('div');
    menu.style = "position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:9999;background:#fff;padding:15px;border:2px solid #000;border-radius:10px;display:flex;flex-direction:column;gap:10px;box-shadow:0 4px 15px rgba(0,0,0,0.3);font-family:sans-serif;font-size:13px;min-width:300px;";
    menu.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <b style="font-size:16px;">Threads Scraper</b>
            <span style="background:#eee; padding:2px 8px; border-radius:10px;">Count: <span id="p-count">0</span></span>
        </div>

        <div style="display:flex; gap:10px; align-items:center; background:#f9f9f9; padding:8px; border-radius:5px;">
            <button id="btn-toggle-scroll" style="flex:1; background:green; color:#fff; border:none; padding:8px; cursor:pointer; border-radius:5px; font-weight:bold;">Scroll: OFF</button>
            <label style="cursor:pointer; display:flex; align-items:center; gap:5px; font-weight:bold;">
                <input type="checkbox" id="chk-allow-media"> Include Media
            </label>
        </div>

        <div style="display:flex; gap:5px;">
            <button id="btn-xlsx" style="flex:1; background:#000; color:#fff; border:none; padding:8px; cursor:pointer; border-radius:5px;">Excel</button>
            <button id="btn-csv" style="flex:1; background:#000; color:#fff; border:none; padding:8px; cursor:pointer; border-radius:5px;">CSV</button>
            <button id="btn-json" style="flex:1; background:#000; color:#fff; border:none; padding:8px; cursor:pointer; border-radius:5px;">JSON</button>
        </div>
    `;
    document.body.appendChild(menu);

    // --- DATA EXTRACTION ---
    function scrape() {
        const posts = document.querySelectorAll('div[data-pressable-container="true"]');
        const allowMedia = document.getElementById('chk-allow-media').checked;

        posts.forEach(post => {
            try {
                // 1. Skip if it's a reply (Threads UI markers)
                const isReply = post.closest('.x1n2onr6')?.querySelector('.x10l6tqk.x1so62im');
                if (isReply) return;

                // 2. Media Filter Logic
                const imgEl = post.querySelector('img[class*="xl1xv1r"]:not([alt*="profile picture"])');
                const videoEl = post.querySelector('video');
                const hasMedia = imgEl || videoEl;

                // If checkbox is OFF and media is found, skip this post
                if (!allowMedia && hasMedia) return;

                const tweetURL = post.querySelector('a[href*="/post/"]')?.href || "";

                if (tweetURL && !scrapedUrls.has(tweetURL)) {
                    scrapedUrls.add(tweetURL);

                    const userLink = post.querySelector('a[href*="/@"]');
                    const username = userLink?.innerText || "";
                    const userID = userLink?.getAttribute('href')?.split('?')[0]?.replace('/', '')?.replace('@', '') || "";

                    // Content Cleaning (Preserve \n, remove "Translate" button text)
                    let contentElement = post.querySelector('div.x1a6qonq.x6ikm8r.x10wlt62.xj0a0fe.x126k92a.x6prxxf.x7r5mf7');
                    let content = contentElement ? contentElement.innerText : "";
                    content = content.replace(/\s*Translate$/i, "");

                    const statSpans = post.querySelectorAll('span.x1o0tod');
                    const likes = statSpans[0]?.innerText || "0";

                    const datetime = post.querySelector('time')?.getAttribute('datetime') || "";
                    const timestamp = new Date().toLocaleString();

                    const item = {
                        username: username,
                        userID: userID,
                        content: content,
                        imageURL: imgEl ? imgEl.src : "",
                        timestamp: timestamp,
                        likes: likes,
                        reposts: "",
                        bookmarks: "",
                        views: "",
                        tweetURL: tweetURL,
                        types: hasMedia ? (videoEl ? "video" : "image") : "text",
                        datetime: datetime
                    };

                    allData.push(item);
                    document.getElementById('p-count').innerText = allData.length;
                }
            } catch (e) { }
        });
    }

    // --- SCROLL TOGGLE LOGIC ---
    const toggleBtn = document.getElementById('btn-toggle-scroll');

    function startScrolling() {
        isScrolling = true;
        toggleBtn.innerText = "Scroll: ON";
        toggleBtn.style.background = "red";
        scrollInterval = setInterval(() => {
            window.scrollBy(0, 800);
            scrape();
        }, 3000);
    }

    function stopScrolling() {
        isScrolling = false;
        toggleBtn.innerText = "Scroll: OFF";
        toggleBtn.style.background = "green";
        clearInterval(scrollInterval);
    }

    toggleBtn.onclick = () => {
        if (isScrolling) stopScrolling();
        else startScrolling();
    };

    // --- DOWNLOAD ACTIONS ---
    document.getElementById('btn-json').onclick = () => {
        downloadFile(JSON.stringify(allData, null, 2), 'threads_export.json', 'application/json');
    };

    document.getElementById('btn-csv').onclick = () => {
        if (allData.length === 0) return;
        const headers = Object.keys(allData[0]).join(",");
        const rows = allData.map(obj => {
            return Object.values(obj).map(val => {
                let cleanVal = val.toString().replace(/"/g, '""'); // Escape quotes
                return `"${cleanVal}"`; // Wrap in quotes for CSV safety
            }).join(",");
        }).join("\n");
        downloadFile(headers + "\n" + rows, 'threads_export.csv', 'text/csv;charset=utf-8;');
    };

    document.getElementById('btn-xlsx').onclick = () => {
        if (allData.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(allData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Threads");
        XLSX.writeFile(workbook, "threads_export.xlsx");
    };

    function downloadFile(content, fileName, contentType) {
        const a = document.createElement("a");
        const file = new Blob([content], { type: contentType });
        a.href = URL.createObjectURL(file);
        a.download = fileName;
        a.click();
    }

})();
