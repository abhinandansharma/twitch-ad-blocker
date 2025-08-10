# Twitch Ad Blocker

```
████████╗██╗    ██╗██╗████████╗ ██████╗██╗  ██╗
╚══██╔══╝██║    ██║██║╚══██╔══╝██╔════╝██║  ██║
   ██║   ██║ █╗ ██║██║   ██║   ██║     ███████║
   ██║   ██║███╗██║██║   ██║   ██║     ██╔══██║
   ██║   ╚███╔███╔╝██║   ██║   ╚██████╗██║  ██║
   ╚═╝    ╚══╝╚══╝ ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝
```

> **Ads on Twitch? Not on my screen.**  
> A highly robust Twitch ad-blocker that works where most Chrome Store extensions fail — by requesting ad-free `.m3u8` stream playlists directly.

---

## 🎯 Features
- Blocks **all Twitch ads** without blank screens or delays.
- Works reliably compared to popular Chrome extensions.
- Lightweight and fast — no heavy background scripts.
- Easy to install, open-source, and free.

---

## 🛠 How It Works
Instead of trying to hide or skip ads after they appear, this extension bypasses them entirely by:
1. Intercepting Twitch `.m3u8` playlist requests.
2. Requesting **ad-free stream variants** directly from Twitch's CDN.
3. Replacing the ad-containing playlist with a clean version before the player loads it.

This method avoids the usual "purple screen" problem and works consistently.

---

## 📦 Installation
1. Download or clone this repository:
   ```bash
   git clone https://github.com/yourusername/twitch-ad-blocker.git
   ```
2. Open **Chrome** → go to `chrome://extensions/`
3. Enable **Developer Mode** (toggle in top-right).
4. Click **Load unpacked** and select this folder.
5. Refresh Twitch and enjoy ad-free streams.

---

## 📄 Manifest Info
```json
{
  "manifest_version": 3,
  "name": "Twitch Ad Blocker",
  "version": "1.0",
  "description": "An ad blocker for Twitch that works by requesting ad-free stream playlists."
}
```

---

## 🎨 Visuals

```
   ██████████
  ██░░░░░░░░██
 ██░░░░░░░░░░██
 ██░░██░░██░░██   🎮
 ██░░░░░░░░░░██
  ██░░░░░░░░██
   ██████████
```

Pixel art Twitch-style TV icon — because who doesn’t like retro pixels?

---

## ⚠️ Disclaimer
This extension is for **educational purposes only**.  
Using it may violate Twitch’s Terms of Service. Use at your own risk.

---

## 📜 License
MIT License — you can use, modify, and distribute freely, but attribution is appreciated.

---

💡 *If you like this project, consider starring ⭐ the repo on GitHub to support development!*
