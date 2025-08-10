🎯 Twitch Ad Blocker (Ultra Robust)
Ads on Twitch? Not anymore.
A highly robust Twitch ad blocker that bypasses ad segments in real-time, delivering uninterrupted streams.
Unlike most Chrome Store extensions, this actually works.

🚀 Features
Ad-free streaming – Removes mid-roll and pre-roll ads from Twitch.

Robust filtering – Uses m3u8 playlist manipulation and DOM observation to block ads at multiple levels.

Active by default – Works as soon as you install it, with a toggle to disable if needed.

Lightweight – No bloat, minimal performance impact.

⚙️ How It Works
Intercepts Twitch's .m3u8 playlist requests and replaces ad segments with clean video chunks.

Uses MutationObserver to detect and remove ad containers injected into the DOM.

Continuously monitors stream state to ensure no ads sneak in.

📦 Installation
Clone this repository:

bash
Copy
Edit
git clone https://github.com/yourusername/twitch-ad-blocker.git
Open Chrome/Brave/Edge and go to:

arduino
Copy
Edit
chrome://extensions/
Enable Developer mode (top right).

Click Load unpacked and select the cloned project folder.

Done! Ads are gone. 🎉

🖥 Usage
The extension is ON by default.

Click the extension icon to toggle ad blocking on/off.

🔧 Tech Stack
Manifest V3 (Chrome Extensions API)

JavaScript (ES6+)

MutationObserver for DOM manipulation

Fetch API Interception for playlist modification

📜 License
MIT License – free to use and modify.