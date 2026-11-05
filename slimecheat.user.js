// ==UserScript==
// @name         SlimeCheat
// @namespace    https://github.com/Proudkiller0015/slimecheat
// @version      2.0.1
// @description  A hack panel inside SlimeBeep for Bondage Club: room music and background uploads, dice with the result you pick, and cheats on yourself. Needs SlimeBeep. Always runs the newest version.
// @author       Proudkiller0015
// @icon         https://raw.githubusercontent.com/Proudkiller0015/slimecheat/main/icon-64.png
// @homepageURL  https://github.com/Proudkiller0015/slimecheat
// @downloadURL  https://raw.githubusercontent.com/Proudkiller0015/slimecheat/main/slimecheat.user.js
// @updateURL    https://raw.githubusercontent.com/Proudkiller0015/slimecheat/main/slimecheat.user.js
// @match        https://www.bondageprojects.elementfx.com/*
// @match        https://bondageprojects.elementfx.com/*
// @match        https://bondageprojects.com/*
// @match        https://www.bondageprojects.com/*
// @match        https://www.bondage-europe.com/*
// @match        https://bondage-europe.com/*
// @match        https://www.bondage-asia.com/*
// @match        http://localhost:8130/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

/*
 * The SlimeCheat loader, like SlimeBeep's. It never needs updating: on every game load it fetches the
 * newest SlimeCheat from GitHub (slimecheat.js) and runs it, so an update reaches everybody the next time
 * they reload or log in.
 */
(function () {
	'use strict';

	const SOURCE = 'https://raw.githubusercontent.com/Proudkiller0015/slimecheat/main/slimecheat.js';
	// GitHub may hand out a copy up to five minutes old, so an update lands within about five minutes.
	fetch(`${SOURCE}?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store' })
		.then((res) => {
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return res.text();
		})
		.then((code) => {
			const script = document.createElement('script');
			script.textContent = `${code}
//# sourceURL=slimecheat.js`;
			document.head.appendChild(script);
			script.remove();
		})
		.catch((err) => console.warn('[SlimeCheat] could not load:', err.message));
})();
