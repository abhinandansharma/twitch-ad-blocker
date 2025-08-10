// background.js (MV3 service worker) - togglable PAC + status API

const DEFAULT_ACTIVE = true; // change if you want default OFF
const PAC_SCRIPT = `
function FindProxyForURL(url, host) {
  // Best-effort block for common Twitch ad-related hosts/paths
  // We're conservative: match ttvnw/ttvnw edge hostnames and ad-like path fragments
  if (shExpMatch(host, "*.ttvnw.net") || shExpMatch(host, "usher.ttvnw.net") || shExpMatch(host, "*.ttv.edge")) {
    var u = url.toLowerCase();
    if (u.indexOf("ad") !== -1 || u.indexOf("ads") !== -1 || u.indexOf("preroll") !== -1 || u.indexOf("stitched") !== -1 || u.indexOf("midroll") !== -1) {
      // blackhole the request
      return "PROXY 0.0.0.0:0";
    }
  }
  return "DIRECT";
}
`;

console.log("Background service worker started.");

// Helper: enable PAC
function enablePac() {
    return new Promise((resolve) => {
        chrome.proxy.settings.set(
            {
                value: {
                    mode: "pac_script",
                    pacScript: { data: PAC_SCRIPT }
                },
                scope: "regular"
            },
            () => {
                if (chrome.runtime.lastError) {
                    console.error("Error setting PAC:", chrome.runtime.lastError);
                    resolve({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    console.log("PAC proxy set.");
                    chrome.storage.local.set({ adBlockActive: true }, () => resolve({ success: true }));
                }
            }
        );
    });
}

// Helper: disable PAC (clear)
function disablePac() {
    return new Promise((resolve) => {
        chrome.proxy.settings.clear({}, () => {
            if (chrome.runtime.lastError) {
                console.error("Error clearing PAC:", chrome.runtime.lastError);
                resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
                console.log("PAC proxy cleared.");
                chrome.storage.local.set({ adBlockActive: false }, () => resolve({ success: true }));
            }
        });
    });
}

// Initialize stored state on startup/worker spawn
async function init() {
    chrome.storage.local.get({ adBlockActive: DEFAULT_ACTIVE }, async (res) => {
        const active = !!res.adBlockActive;
        if (active) {
            const result = await enablePac();
            if (!result.success) {
                console.warn("Failed to enable PAC at startup:", result.error);
            }
        } else {
            // make sure PAC is cleared
            const result = await disablePac();
            if (!result.success) {
                console.warn("Failed to clear PAC at startup:", result.error);
            }
        }
    });
}

init();

// Message handler from popup/content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        try {
            if (!message || !message.action) {
                sendResponse({ success: false, error: "no_action" });
                return;
            }

            if (message.action === "getStatus") {
                chrome.storage.local.get({ adBlockActive: DEFAULT_ACTIVE }, (res) => {
                    sendResponse({ success: true, status: res.adBlockActive ? "active" : "inactive" });
                });
                return; // will call sendResponse asynchronously
            }

            if (message.action === "toggleRules") {
                chrome.storage.local.get({ adBlockActive: DEFAULT_ACTIVE }, async (res) => {
                    const newState = !res.adBlockActive;
                    if (newState) {
                        const r = await enablePac();
                        sendResponse({ success: r.success, status: r.success ? "active" : "inactive", error: r.error || null });
                    } else {
                        const r = await disablePac();
                        sendResponse({ success: r.success, status: r.success ? "inactive" : "active", error: r.error || null });
                    }
                });
                return; // asynchronous
            }

            if (message.action === "enable") {
                const r = await enablePac();
                sendResponse({ success: r.success, status: r.success ? "active" : "inactive", error: r.error || null });
                return;
            }
            if (message.action === "disable") {
                const r = await disablePac();
                sendResponse({ success: r.success, status: r.success ? "inactive" : "active", error: r.error || null });
                return;
            }

            sendResponse({ success: false, error: "unknown_action" });
        } catch (err) {
            console.error("Message handler error:", err);
            sendResponse({ success: false, error: err && err.message });
        }
    })();

    // keep the message channel open for async response
    return true;
});
