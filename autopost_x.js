(function() {
    // 1. Create the UI Overlay
    const container = document.createElement('div');
    container.id = 'buffer-value-poster';
    container.style = `
        position: fixed; top: 10px; right: 10px; z-index: 2147483647;
        background: #f8f9fa; border: 2px solid #343a40; border-radius: 10px;
        padding: 20px; width: 380px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;

    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="margin:0; font-size: 16px; color: #212529;">Buffer Post Manager</h3>
            <button id="close-ui" style="background:none; border:none; cursor:pointer; font-size:18px; color:#999;">✕</button>
        </div>
        
        <p style="font-size: 12px; margin-bottom: 8px; color: #6c757d;">
            Update JSON (Key name must be <b>"value"</b>):
        </p>
        
        <textarea id="json-input" style="width:100%; height:220px; font-family:monospace; font-size:12px; border: 1px solid #ced4da; border-radius:5px; padding:8px; box-sizing: border-box;">[
  { "value": "First Post Content\\nWith a New Line" },
  { "value": "Second Post Content\\nGoes Here" },
  { "value": "Third Post Content\\nAutomated" }
]</textarea>

        <div style="margin-top: 15px;">
            <button id="start-btn" style="width:100%; background: #007bff; color: white; border: none; padding: 12px; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 14px; transition: 0.2s;">
                🚀 Start Saving Drafts
            </button>
        </div>

        <div id="status-display" style="margin-top: 15px; padding: 10px; background: #e9ecef; border-radius: 5px; font-size: 12px; color: #495057; min-height: 20px;">
            Status: <b>Waiting for input...</b>
        </div>
    `;

    document.body.appendChild(container);

    // Helper functions
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function logStatus(msg, isError = false) {
        const display = document.getElementById('status-display');
        display.innerHTML = `Status: <span style="color:${isError ? '#dc3545' : '#007bff'}">${msg}</span>`;
    }

    async function wakeUpEditor(target) {
        const opts = { bubbles: true, cancelable: true, view: window };
        target.dispatchEvent(new MouseEvent('mousedown', opts));
        await sleep(50);
        target.dispatchEvent(new MouseEvent('mouseup', opts));
        await sleep(50);
        target.dispatchEvent(new MouseEvent('click', opts));
    }

    function injectTextViaPaste(target, text) {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', text);
        const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true
        });
        target.dispatchEvent(pasteEvent);
    }

    // --- Main Logic ---
    async function startAutomation() {
        let items;
        try {
            items = JSON.parse(document.getElementById('json-input').value);
        } catch (e) {
            alert("JSON Error: Make sure you use double quotes and proper brackets.");
            return;
        }

        const startBtn = document.getElementById('start-btn');
        startBtn.disabled = true;
        startBtn.style.background = "#6c757d";

        // Find all "Add Post" cells in the current row
        const cells = document.querySelectorAll('tr[data-testid^="weekly-row"] td.publish_hour_cnWKE');

        for (let i = 0; i < cells.length; i++) {
            if (!items[i]) {
                logStatus("Finished: No more values in JSON.", false);
                break;
            }

            const cell = cells[i];
            const currentContent = items[i].value; // Changed from .quote to .value

            logStatus(`Processing Slot ${i + 1}...`);

            // 1. Move to cell and Hover
            cell.scrollIntoView({ block: 'center', behavior: 'smooth' });
            cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            await sleep(1000);

            // 2. Click Add Button
            const openBtn = cell.querySelector('button[aria-haspopup="dialog"]');
            if (!openBtn) {
                logStatus(`Skipping Slot ${i+1}: Button not found`, true);
                continue;
            }
            openBtn.click();

            // 3. Wait for Slate Editor (Twitter/Composer)
            let editor = null;
            for (let attempt = 0; attempt < 30; attempt++) {
                editor = document.querySelector('div[data-slate-editor="true"]');
                if (editor) break;
                await sleep(300);
            }

            if (editor) {
                // 4. Focus and Activate
                editor.focus();
                await wakeUpEditor(editor);
                await sleep(600);

                // 5. Inject the "value" from JSON
                injectTextViaPaste(editor, currentContent);
                logStatus(`Injected text for Slot ${i+1}...`);
                await sleep(2000); // Wait for React to sync

                // 6. Click Save Draft
                const buttons = Array.from(document.querySelectorAll('button'));
                const saveBtn = buttons.find(b => b.textContent.includes('Save Draft'));

                if (saveBtn && !saveBtn.disabled) {
                    saveBtn.click();
                    logStatus(`✅ Slot ${i+1} saved successfully!`);
                    await sleep(4000); // Wait for modal to close fully
                } else {
                    logStatus(`❌ Save button disabled for Slot ${i+1}`, true);
                    break; 
                }
            } else {
                logStatus(`❌ Editor not found for Slot ${i+1}`, true);
                break;
            }
        }

        startBtn.disabled = false;
        startBtn.style.background = "#007bff";
        logStatus("Automation Finished.");
    }

    // Event Listeners
    document.getElementById('start-btn').addEventListener('click', startAutomation);
    document.getElementById('close-ui').addEventListener('click', () => container.remove());

})();
