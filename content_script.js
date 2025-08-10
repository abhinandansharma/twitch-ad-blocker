// content_script.js
// Robust Twitch ad helper: early fetch/XHR interception, DOM/watchdog, m3u8 cleaning,
// iframe & shadowRoot observation, last-good-playlist rollback, auto-skip when ad overlay detected.

// CONFIG
const AD_KEYWORDS = ["stitched", "preroll", "midroll", "ad_segment", "dmc-ad", "/ads/", "/ad/"];
const OVERLAY_TEXT_KEYWORDS = ["ad", "advert", "sponsored", "commercial"];
const M3U8_DEBOUNCE_MS = 500;
const OVERLAY_SKIP_SECS = 30;
const FETCH_CLEAN_TIMEOUT_MS = 3000;

// State
let adBlockEnabled = true; // default — popup can toggle this via message
let lastGoodM3u8 = null;
let lastCleanBlobUrl = null;
let lastM3u8AttemptAt = 0;

// Utility: quick logger with prefix
const log = (...args) => console.debug("[TwitchAdHelper]", ...args);

// Simple keyword test for ad playlist URLs
function isLikelyAdPlaylist(url) {
    if (!url) return false;
    const u = url.toLowerCase();
    return AD_KEYWORDS.some(k => u.includes(k));
}

// Parse playlist text and remove lines likely pointing to ad segments
function stripAdSegmentsFromM3U8(text) {
    const lines = text.split(/\r?\n/);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const low = line.toLowerCase();
        // If line is a URI and contains ad keywords, skip it and the preceding #EXTINF if present
        if (!line.startsWith("#") && AD_KEYWORDS.some(k => low.includes(k))) {
            // remove previous EXTINF entry (if present)
            if (out.length && out[out.length - 1].startsWith("#EXTINF")) out.pop();
            continue;
        }
        // Also drop EXT-X-DATERANGE tags that often mark ad ranges
        if (line.startsWith("#EXT-X-DATERANGE") && low.includes("class=\"ad\"")) continue;
        out.push(line);
    }
    return out.join("\n");
}

// Safe fetch with timeout
async function fetchWithTimeout(url, opts = {}, timeout = FETCH_CLEAN_TIMEOUT_MS) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, { ...opts, signal: controller.signal });
        clearTimeout(id);
        return res;
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
}

// Try to fetch and return a cleaned playlist Blob URL (or null)
async function fetchAndCleanM3U8(url) {
    try {
        log("Trying to fetch and clean m3u8:", url);
        const resp = await fetchWithTimeout(url, { credentials: "include", mode: "cors" });
        if (!resp || !resp.ok) throw new Error("fetch failed " + (resp && resp.status));
        const text = await resp.text();
        if (!text || !text.includes("#EXTM3U")) {
            throw new Error("not a playlist");
        }
        // quick check if it contains ad keywords
        if (!AD_KEYWORDS.some(k => text.toLowerCase().includes(k))) {
            log("Playlist appears clean already.");
            // create blob and return
            const blob = new Blob([text], { type: "application/vnd.apple.mpegurl" });
            if (lastCleanBlobUrl) URL.revokeObjectURL(lastCleanBlobUrl);
            lastCleanBlobUrl = URL.createObjectURL(blob);
            return lastCleanBlobUrl;
        }

        const cleaned = stripAdSegmentsFromM3U8(text);
        if (!cleaned || cleaned.trim().length === 0) throw new Error("cleaned playlist empty");
        const blob = new Blob([cleaned], { type: "application/vnd.apple.mpegurl" });
        if (lastCleanBlobUrl) URL.revokeObjectURL(lastCleanBlobUrl);
        lastCleanBlobUrl = URL.createObjectURL(blob);
        log("Created cleaned playlist blob URL.");
        return lastCleanBlobUrl;
    } catch (err) {
        log("fetchAndCleanM3U8 failed:", err && err.message);
        return null;
    }
}

// Replace the video src safely with fallback logic (clean blob > last good url)
async function replaceVideoSrc(videoEl, candidateUrl) {
    try {
        if (!videoEl) return false;
        // If candidate is ad playlist, try to fetch & clean
        if (isLikelyAdPlaylist(candidateUrl)) {
            const now = Date.now();
            if (now - lastM3u8AttemptAt < M3U8_DEBOUNCE_MS) {
                // too soon
                return false;
            }
            lastM3u8AttemptAt = now;

            const cleanedBlob = await fetchAndCleanM3U8(candidateUrl);
            if (cleanedBlob) {
                log("Swapping to cleaned blob playlist.");
                videoEl.pause();
                videoEl.src = cleanedBlob;
                videoEl.load();
                setTimeout(() => videoEl.play().catch(() => { }), 250);
                return true;
            } else if (lastGoodM3u8) {
                log("Cleaning failed; rolling back to last good playlist.");
                videoEl.pause();
                videoEl.src = lastGoodM3u8;
                videoEl.load();
                setTimeout(() => videoEl.play().catch(() => { }), 250);
                return true;
            }
        } else {
            // non-ad playlist -> update last good
            lastGoodM3u8 = candidateUrl;
        }
    } catch (err) {
        log("replaceVideoSrc error:", err);
    }
    return false;
}

// Auto-skip ahead a bit when overlay detected
function autoSkipVideo(videoEl) {
    try {
        if (!videoEl) return;
        const dur = videoEl.duration || 0;
        const skip = Math.min(OVERLAY_SKIP_SECS, Math.max(5, Math.floor((dur || 60) * 0.15)));
        const target = Math.min((videoEl.currentTime || 0) + skip, dur - 1);
        log("Auto-skipping ad by", skip, "seconds to", target);
        videoEl.currentTime = target;
    } catch (e) {
        log("autoSkip error:", e);
    }
}

/* ----------------------------
   Page-injection: override fetch/XHR early
   We must inject into page context to override window.fetch & XHR because
   content script runs in isolated world.
   The injected script will postMessage to window so content script can see intercepted URLs.
   ---------------------------- */
(function injectOverrideScript() {
    const script = document.createElement("script");
    script.textContent = `
    (function() {
      try {
        const AD_KEYWORDS = ${JSON.stringify(AD_KEYWORDS)};
        function isLikely(url) {
          if (!url) return false;
          const u = String(url).toLowerCase();
          return AD_KEYWORDS.some(k => u.includes(k) || u.includes('/ad'));
        }
        // Hook fetch
        const origFetch = window.fetch;
        window.fetch = function(input, init) {
          try {
            const url = typeof input === 'string' ? input : input && input.url;
            if (isLikely(url)) {
              window.postMessage({ __twitch_ad_helper: true, type: 'fetch', url: String(url) }, '*');
            } else if (url && url.includes('.m3u8')) {
              window.postMessage({ __twitch_ad_helper: true, type: 'fetch', url: String(url) }, '*');
            }
          } catch(e){}
          return origFetch.apply(this, arguments);
        };
        // Hook XHR.open
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url) {
          try {
            if (typeof url === 'string' && (url.includes('.m3u8') || isLikely(url))) {
              window.postMessage({ __twitch_ad_helper: true, type: 'xhr', url: String(url) }, '*');
            }
          } catch(e){}
          return origOpen.apply(this, arguments);
        };
      } catch(e) {
        // swallow
      }
    })();
  `;
    // inject as early as possible
    (document.documentElement || document.head || document.body).prepend(script);
})();

// Listen to messages from injected script
window.addEventListener("message", (ev) => {
    try {
        const d = ev.data;
        if (!d || !d.__twitch_ad_helper) return;
        if (!adBlockEnabled) return;
        if (d.type === "fetch" || d.type === "xhr") {
            const url = d.url;
            if (!url) return;
            // If it's an m3u8, attempt preemptive cleaning or save last good
            if (url.includes(".m3u8")) {
                // schedule a job to handle this m3u8 soon
                handleM3u8Detected(url);
            } else if (isLikelyAdPlaylist(url)) {
                log("Injected script observed ad-related request:", url);
                // optional: future enhancements to block specific ad resource requests
            }
        }
    } catch (e) { }
});

// Debounced handler for m3u8 detection
let m3u8Timer = null;
function handleM3u8Detected(url) {
    if (!adBlockEnabled) return;
    if (m3u8Timer) clearTimeout(m3u8Timer);
    m3u8Timer = setTimeout(async () => {
        log("m3u8 detected (debounced):", url);
        // If ad-like, try to pre-fetch and clean and broadcast replacement to video elements
        if (isLikelyAdPlaylist(url)) {
            const cleaned = await fetchAndCleanM3U8(url);
            if (cleaned) {
                // Replace all attached videos with cleaned URL
                const vids = Array.from(document.getElementsByTagName("video"));
                for (const v of vids) {
                    try {
                        log("Replacing video src with cleaned blob (preemptive).");
                        v.pause();
                        v.src = cleaned;
                        v.load();
                        setTimeout(() => v.play().catch(() => { }), 200);
                    } catch (e) { }
                }
            } else {
                log("Could not pre-clean; relying on lastGoodM3u8 fallback.");
            }
        } else {
            // non-ad m3u8 -> update last good
            lastGoodM3u8 = url;
            log("Updated lastGoodM3u8:", lastGoodM3u8);
        }
    }, M3U8_DEBOUNCE_MS);
}

/* ----------------------------
   MutationObserver: overlays, iframes, shadow roots
   ---------------------------- */

// helper: recursively check node and shadow roots for ad overlays
function checkNodeForAdOverlay(node) {
    try {
        if (!node) return false;
        // Check element text
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = /** @type {HTMLElement} */(node);
            const txt = (el.innerText || "").toLowerCase();
            if (OVERLAY_TEXT_KEYWORDS.some(k => txt.includes(k))) return true;
            // class / id heuristics
            const cls = (el.className || "").toString().toLowerCase();
            if (cls.includes("ad") && !cls.includes("container")) return true;
            if (cls.includes("commercial") || cls.includes("promo")) return true;
        }
        // check children
        for (const child of node.childNodes || []) {
            if (checkNodeForAdOverlay(child)) return true;
        }
        // shadow root
        if (node.shadowRoot) {
            if (checkNodeForAdOverlay(node.shadowRoot)) return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

// Observe main document + iframes
const mainObserver = new MutationObserver((mutations) => {
    if (!adBlockEnabled) return;
    for (const m of mutations) {
        for (const node of (m.addedNodes || [])) {
            // quick check
            if (checkNodeForAdOverlay(node)) {
                log("Ad overlay node detected via DOM mutation.");
                onAdOverlayDetected();
                return;
            }
            // If iframe added, observe its content if accessible
            if (node.tagName === "IFRAME") {
                tryObserveIframe(node);
            }
        }
    }
});
mainObserver.observe(document, { childList: true, subtree: true });

// also scan existing iframes at start
function tryObserveIframe(iframe) {
    try {
        const doc = iframe.contentDocument;
        if (doc) {
            const obs = new MutationObserver((muts) => {
                for (const mm of muts) {
                    for (const n of mm.addedNodes || []) {
                        if (checkNodeForAdOverlay(n)) {
                            log("Ad overlay detected inside iframe.");
                            onAdOverlayDetected();
                            return;
                        }
                    }
                }
            });
            obs.observe(doc, { childList: true, subtree: true });
        }
    } catch (e) {
        // cross-origin iframe — cannot access
    }
}

// Heuristic: when overlay detected, try cleaning/replacing playlist OR autoseek
async function onAdOverlayDetected() {
    try {
        if (!adBlockEnabled) return;
        log("onAdOverlayDetected -> attempting mitigation");

        const video = document.querySelector("video");
        if (video) {
            // Try to aggressively detect current playlist src and swap
            const src = video.currentSrc || video.src || "";
            if (src && src.includes(".m3u8")) {
                log("Video is using m3u8:", src);
                // try to replace
                const replaced = await replaceVideoSrc(video, src);
                if (replaced) return;
            }
            // If replace didn't work, auto-skip
            autoSkipVideo(video);
        }
    } catch (e) {
        log("onAdOverlayDetected error:", e);
    }
}

// Also run a periodic scan to catch overlays that MutationObserver missed
setInterval(() => {
    if (!adBlockEnabled) return;
    try {
        // look for known ad overlay selectors
        const overlay = document.querySelector(".ad-banner, .video-player__ad-overlay, .tw-overlay, .player-ad");
        if (overlay && checkNodeForAdOverlay(overlay)) {
            log("Periodic scan found overlay -> mitigating");
            onAdOverlayDetected();
        }
    } catch (e) { }
}, 1500);

/* ----------------------------
   Video element watcher (fallback/check)
   ---------------------------- */

function watchVideo(videoEl) {
    if (!videoEl) return;
    let lastSrc = videoEl.currentSrc || videoEl.src || "";
    // poll for source changes (m3u8 swaps)
    const poll = setInterval(async () => {
        if (!document.contains(videoEl)) {
            clearInterval(poll);
            return;
        }
        const cur = videoEl.currentSrc || videoEl.src || "";
        if (cur && cur !== lastSrc) {
            lastSrc = cur;
            log("Video src changed:", cur);
            if (isLikelyAdPlaylist(cur)) {
                // try to handle ad playlist
                await replaceVideoSrc(videoEl, cur);
            } else {
                lastGoodM3u8 = cur;
            }
        }
    }, 700);
}

// Find existing video(s) and watch them
function initVideoWatchers() {
    const vids = Array.from(document.getElementsByTagName("video"));
    for (const v of vids) watchVideo(v);
}

// Start watchers ASAP
initVideoWatchers();
// Monitor for dynamic video element insertions
const videoInsertionObserver = new MutationObserver((muts) => {
    for (const m of muts) {
        for (const n of (m.addedNodes || [])) {
            if (n.tagName === "VIDEO") {
                watchVideo(n);
            } else {
                // search inside
                const inner = (n.querySelectorAll && n.querySelectorAll("video")) || [];
                for (const v of inner) watchVideo(v);
            }
        }
    }
});
videoInsertionObserver.observe(document, { childList: true, subtree: true });

/* ----------------------------
    Messaging: listen to popup/background toggles
   ---------------------------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
        if (msg && msg.action === "getStatus") {
            sendResponse({ success: true, status: adBlockEnabled ? "active" : "inactive" });
            return;
        }
        if (msg && msg.action === "toggleRules") {
            adBlockEnabled = !adBlockEnabled;
            log("Ad block toggled ->", adBlockEnabled);
            sendResponse({ success: true, status: adBlockEnabled ? "active" : "inactive" });
            return;
        }
        if (msg && msg.action === "enable") {
            adBlockEnabled = true;
            sendResponse({ success: true, status: "active" });
            return;
        }
        if (msg && msg.action === "disable") {
            adBlockEnabled = false;
            sendResponse({ success: true, status: "inactive" });
            return;
        }
    } catch (e) { }
    // indicate async not used
    return false;
});

// expose a small API on window for debugging if needed
window.__twitchAdHelperDebug = {
    getState: () => ({ adBlockEnabled, lastGoodM3u8, lastCleanBlobUrl }),
    disable: () => { adBlockEnabled = false; },
    enable: () => { adBlockEnabled = true; }
};

log("Robust content script initialized. AdBlockEnabled:", adBlockEnabled);
